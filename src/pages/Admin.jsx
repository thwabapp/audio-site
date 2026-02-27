import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Admin() {
  const [session, setSession] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // list
  const [tracks, setTracks] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // edit mode
  const [editingId, setEditingId] = useState(null);
  const isEditing = useMemo(() => editingId !== null, [editingId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) fetchTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function fetchTracks() {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("tracks")
      .select("id,title,description,public_url,file_path,created_at,published")
      .order("created_at", { ascending: false });

    if (!error && data) setTracks(data);
    setLoadingList(false);
  }

  async function login(e) {
    e.preventDefault();
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(`خطأ: ${error.message}`);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setFile(null);
    setEditingId(null);
  }

  function startEdit(t) {
    setMsg("");
    setEditingId(t.id);
    setTitle(t.title || "");
    setDescription(t.description || "");
    setFile(null); // إذا المستخدم اختار ملف جديد فقط نبدّله
  }

  async function uploadToStorage(selectedFile) {
    const safeName = selectedFile.name.replace(/[^\w.-]+/g, "_");
    const path = `${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage.from("audio").upload(path, selectedFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: "audio/mpeg",
    });

    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("audio").getPublicUrl(path);
    return { path, publicUrl: pub.publicUrl };
  }

  async function uploadTrack(e) {
    e.preventDefault();
    setMsg("");

    // في الإضافة لازم ملف، في التعديل الملف اختياري
    if (!isEditing && !file) return setMsg("اختر ملف MP3 أولاً.");
    if (!title.trim()) return setMsg("اكتب عنوان المقطع.");

    const maxMB = 50;
    if (file) {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxMB) return setMsg(`حجم الملف كبير (${sizeMB.toFixed(1)}MB). الحد ${maxMB}MB.`);
    }

    setBusy(true);
    try {
      if (!isEditing) {
        // ADD
        const { path, publicUrl } = await uploadToStorage(file);

        const { error: insErr } = await supabase.from("tracks").insert({
          title: title.trim(),
          description: description.trim(),
          file_path: path,
          public_url: publicUrl,
          published: true,
        });

        if (insErr) throw insErr;

        resetForm();
        setMsg("✅ تم رفع المقطع ونشره بنجاح.");
        await fetchTracks();
        return;
      }

      // EDIT
      const currentTrack = tracks.find((x) => x.id === editingId);
      if (!currentTrack) throw new Error("لم يتم العثور على المقطع للتعديل.");

      let nextPublicUrl = currentTrack.public_url;
      let nextFilePath = currentTrack.file_path;

      // لو المستخدم اختار ملف جديد: نرفعه ونحدّث الحقول، ونحذف القديم
      if (file) {
        const uploaded = await uploadToStorage(file);
        nextPublicUrl = uploaded.publicUrl;
        nextFilePath = uploaded.path;
      }

      const { error: upErr } = await supabase
        .from("tracks")
        .update({
          title: title.trim(),
          description: description.trim(),
          public_url: nextPublicUrl,
          file_path: nextFilePath,
        })
        .eq("id", editingId);

      if (upErr) throw upErr;

      // حذف الملف القديم من Storage إذا تم رفع ملف جديد
      if (file && currentTrack.file_path) {
        await supabase.storage.from("audio").remove([currentTrack.file_path]);
      }

      resetForm();
      setMsg("✅ تم تعديل المقطع بنجاح.");
      await fetchTracks();
    } catch (err) {
      setMsg(`❌ فشل العملية: ${err.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTrack(t) {
    const ok = confirm(`هل تريد حذف المقطع: "${t.title}" ؟\n(سيتم حذف السجل والملف)`);
    if (!ok) return;

    setMsg("");
    setBusy(true);
    try {
      // 1) حذف السجل
      const { error: delErr } = await supabase.from("tracks").delete().eq("id", t.id);
      if (delErr) throw delErr;

      // 2) حذف الملف من Storage
      if (t.file_path) {
        const { error: rmErr } = await supabase.storage.from("audio").remove([t.file_path]);
        // إذا فشل حذف الملف لا نوقف العملية بالكامل، لكن نعرض تنبيه
        if (rmErr) {
          setMsg("⚠️ تم حذف السجل، لكن تعذر حذف الملف من التخزين.");
        }
      }

      // لو كنت تعدل نفس المقطع احنا نحذف وضع التعديل
      if (editingId === t.id) resetForm();

      await fetchTracks();
      setMsg((prev) => prev || "✅ تم حذف المقطع بنجاح.");
    } catch (err) {
      setMsg(`❌ فشل الحذف: ${err.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="container">
      <div className="topbar">
        <div className="brand">
          <h1>لوحة الإدارة</h1>
          <p>رفع المقاطع وإدارتها</p>
        </div>
        <div className="actions">
          <a className="btn" href="/" style={{ textDecoration: "none" }}>
            العودة للموقع
          </a>
          {session ? (
            <button className="btn" onClick={logout}>
              تسجيل خروج
            </button>
          ) : null}
        </div>
      </div>

      {!session ? (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="title" style={{ margin: 0 }}>
            تسجيل دخول الأدمن
          </p>
          <p className="desc">استخدم بيانات الأدمن المسجلة في Supabase</p>

          <form onSubmit={login} className="grid" style={{ marginTop: 12 }}>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              autoComplete="email"
            />
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              type="password"
              autoComplete="current-password"
            />
            <button className="btn primary" style={{ width: "fit-content" }}>
              تسجيل الدخول
            </button>
          </form>

          {msg ? (
            <p className="small" style={{ marginTop: 10 }}>
              {msg}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <p className="title" style={{ margin: 0 }}>
              {isEditing ? "تعديل المقطع" : "رفع مقطع جديد"}
            </p>
            <p className="desc">
              MP3 فقط — {isEditing ? "يمكنك تغيير العنوان/الوصف، ورفع ملف جديد (اختياري)" : "وسيظهر فورًا في الصفحة الرئيسية"}
            </p>

            <form onSubmit={uploadTrack} className="grid" style={{ marginTop: 12 }}>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المقطع" />
              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف مختصر (اختياري)"
                rows={4}
                style={{ resize: "vertical" }}
              />
              <input type="file" accept="audio/mpeg,.mp3" onChange={(e) => setFile(e.target.files?.[0] || null)} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy} style={{ width: "fit-content" }}>
                  {busy ? "جارِ التنفيذ…" : isEditing ? "حفظ التعديل" : "رفع ونشر"}
                </button>

                {isEditing ? (
                  <button className="btn ghost" type="button" onClick={resetForm} disabled={busy} style={{ width: "fit-content" }}>
                    إلغاء التعديل
                  </button>
                ) : null}
              </div>
            </form>

            {msg ? (
              <p className="small" style={{ marginTop: 10 }}>
                {msg}
              </p>
            ) : null}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="cardHead" style={{ justifyContent: "space-between" }}>
              <div>
                <p className="title" style={{ margin: 0 }}>
                  المقاطع
                </p>
                <p className="desc" style={{ margin: 0 }}>
                  تعديل أو حذف أي مقطع
                </p>
              </div>

              <button className="btn" onClick={fetchTracks} disabled={busy || loadingList} style={{ width: "fit-content" }}>
                {loadingList ? "تحديث…" : "تحديث القائمة"}
              </button>
            </div>

            {loadingList ? (
              <p className="small" style={{ marginTop: 10 }}>
                جارِ التحميل…
              </p>
            ) : tracks.length === 0 ? (
              <p className="small" style={{ marginTop: 10 }}>
                لا توجد مقاطع حتى الآن.
              </p>
            ) : (
              <div className="grid" style={{ marginTop: 12 }}>
                {tracks.map((t) => (
                  <div key={t.id} className="card" style={{ margin: 0 }}>
                    <div className="cardHead" style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="title" style={{ margin: 0 }}>
                          {t.title}
                        </p>
                        {t.description ? <p className="desc">{t.description}</p> : <p className="desc">—</p>}
                        <p className="small" style={{ marginTop: 8, opacity: 0.75, wordBreak: "break-all" }}>
                          {t.public_url}
                        </p>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="btn" onClick={() => startEdit(t)} disabled={busy} style={{ width: "fit-content" }}>
                          تعديل
                        </button>
                        <button className="btn ghost" onClick={() => deleteTrack(t)} disabled={busy} style={{ width: "fit-content" }}>
                          حذف
                        </button>
                      </div>
                    </div>

                    {t.public_url ? (
                      <audio controls preload="none" style={{ width: "100%", marginTop: 10 }}>
                        <source src={t.public_url} />
                      </audio>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}