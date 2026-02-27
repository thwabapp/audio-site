import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const AUDIO_BUCKET = "audio";

// يحول file_path إلى key صحيح داخل البكت (سواء كان URL أو مسار)
function toStorageKey(filePathOrUrl) {
  if (!filePathOrUrl) return null;

  // لو URL: خذ الجزء بعد /object/public/<bucket>/
  if (String(filePathOrUrl).startsWith("http")) {
    try {
      const u = new URL(filePathOrUrl);
      const marker = `/storage/v1/object/public/${AUDIO_BUCKET}/`;
      const idx = u.pathname.indexOf(marker);
      if (idx !== -1) {
        const key = u.pathname.slice(idx + marker.length);
        return decodeURIComponent(key).replace(/^\/+/, "");
      }
      // fallback: آخر جزء من المسار
      return decodeURIComponent(u.pathname.split("/").pop() || "").replace(/^\/+/, "");
    } catch {
      return String(filePathOrUrl).replace(/^\/+/, "");
    }
  }

  // لو محفوظ بشكل audio/filename.mp3
  const prefix = `${AUDIO_BUCKET}/`;
  if (String(filePathOrUrl).startsWith(prefix)) {
    return String(filePathOrUrl).slice(prefix.length);
  }

  return String(filePathOrUrl).replace(/^\/+/, "");
}

export default function Admin() {
  const [session, setSession] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [tracks, setTracks] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

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
    setFile(null);
  }

  async function uploadToStorage(selectedFile) {
    const safeName = selectedFile.name.replace(/[^\w.-]+/g, "_");
    const path = `${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage.from(AUDIO_BUCKET).upload(path, selectedFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: "audio/mpeg",
    });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path);
    return { path, publicUrl: pub.publicUrl };
  }

  async function uploadTrack(e) {
    e.preventDefault();
    setMsg("");

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
        const { path, publicUrl } = await uploadToStorage(file);

        const { error: insErr } = await supabase.from("tracks").insert({
          title: title.trim(),
          description: description.trim(),
          file_path: path, // نخزن KEY (اسم الملف) وليس URL
          public_url: publicUrl,
          published: true,
        });
        if (insErr) throw insErr;

        resetForm();
        setMsg("✅ تم رفع المقطع ونشره بنجاح.");
        await fetchTracks();
        return;
      }

      const currentTrack = tracks.find((x) => x.id === editingId);
      if (!currentTrack) throw new Error("لم يتم العثور على المقطع للتعديل.");

      let nextPublicUrl = currentTrack.public_url;
      let nextFilePath = currentTrack.file_path;

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

      // حذف الملف القديم إذا تم رفع ملف جديد
      if (file && currentTrack.file_path) {
        const oldKey = toStorageKey(currentTrack.file_path);
        if (oldKey) {
          await supabase.storage.from(AUDIO_BUCKET).remove([oldKey]);
        }
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
    const ok = confirm(`هل تريد حذف المقطع: "${t.title}" ؟\n(سيتم حذف الملف ثم السجل)`);
    if (!ok) return;

    setMsg("");
    setBusy(true);

    try {
      // 1) حذف الملف من Storage باستخدام KEY الصحيح
      const key = toStorageKey(t.file_path);
      if (!key) throw new Error("لا يوجد file_path صالح لهذا المقطع.");

      const { data: rmData, error: rmErr } = await supabase.storage.from(AUDIO_BUCKET).remove([key]);
      if (rmErr) throw new Error(`تعذر حذف الملف من التخزين: ${rmErr.message}`);
      if (!rmData || rmData.length === 0) throw new Error("لم يتم حذف الملف فعليًا (تحقق من key داخل bucket).");

      // 2) حذف السجل من قاعدة البيانات
      const { error: delErr, count } = await supabase.from("tracks").delete({ count: "exact" }).eq("id", t.id);
      if (delErr) throw new Error(`تعذر حذف السجل من قاعدة البيانات: ${delErr.message}`);
      if (!count || count === 0) throw new Error("لم يتم حذف أي سجل (تحقق من سياسات RLS للحذف).");

      // 3) تحديث الواجهة
      setTracks((prev) => prev.filter((x) => x.id !== t.id));
      if (editingId === t.id) resetForm();

      setMsg("✅ تم حذف المقطع (الملف + السجل) بنجاح.");
      await fetchTracks();
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
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" />
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              type="password"
            />
            <button className="btn primary" style={{ width: "fit-content" }}>
              تسجيل الدخول
            </button>
          </form>

          {msg ? <p className="small" style={{ marginTop: 10 }}>{msg}</p> : null}
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <p className="title" style={{ margin: 0 }}>{isEditing ? "تعديل المقطع" : "رفع مقطع جديد"}</p>

            <form onSubmit={uploadTrack} className="grid" style={{ marginTop: 12 }}>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المقطع" />
              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف مختصر (اختياري)"
                rows={4}
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

            {msg ? <p className="small" style={{ marginTop: 10 }}>{msg}</p> : null}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="cardHead" style={{ justifyContent: "space-between" }}>
              <div>
                <p className="title" style={{ margin: 0 }}>المقاطع</p>
                <p className="desc" style={{ margin: 0 }}>تعديل أو حذف أي مقطع</p>
              </div>
              <button className="btn" onClick={fetchTracks} disabled={busy || loadingList} style={{ width: "fit-content" }}>
                {loadingList ? "تحديث…" : "تحديث القائمة"}
              </button>
            </div>

            {loadingList ? (
              <p className="small" style={{ marginTop: 10 }}>جارِ التحميل…</p>
            ) : tracks.length === 0 ? (
              <p className="small" style={{ marginTop: 10 }}>لا توجد مقاطع حتى الآن.</p>
            ) : (
              <div className="grid" style={{ marginTop: 12 }}>
                {tracks.map((t) => (
                  <div key={t.id} className="card" style={{ margin: 0 }}>
                    <div className="cardHead" style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="title" style={{ margin: 0 }}>{t.title}</p>
                        {t.description ? <p className="desc">{t.description}</p> : <p className="desc">—</p>}
                        <p className="small" style={{ marginTop: 8, opacity: 0.75, wordBreak: "break-all" }}>
                          {t.public_url}
                        </p>
                        <p className="small" style={{ marginTop: 4, opacity: 0.6, wordBreak: "break-all" }}>
                          file_path: {t.file_path}
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