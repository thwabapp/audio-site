import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(e) {
    e.preventDefault();
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(`خطأ: ${error.message}`);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function uploadTrack(e) {
    e.preventDefault();
    setMsg("");

    if (!file) return setMsg("اختر ملف MP3 أولاً.");
    if (!title.trim()) return setMsg("اكتب عنوان المقطع.");

    const maxMB = 50;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxMB) return setMsg(`حجم الملف كبير (${sizeMB.toFixed(1)}MB). الحد ${maxMB}MB.`);

    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("audio")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: "audio/mpeg",
        });

      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("audio").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: insErr } = await supabase.from("tracks").insert({
        title: title.trim(),
        description: description.trim(),
        file_path: path,
        public_url: publicUrl,
        published: true,
      });

      if (insErr) throw insErr;

      setTitle("");
      setDescription("");
      setFile(null);
      setMsg("✅ تم رفع المقطع ونشره بنجاح.");
    } catch (err) {
      setMsg(`❌ فشل الرفع: ${err.message || String(err)}`);
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
            <button className="btn" onClick={logout}>تسجيل خروج</button>
          ) : null}
        </div>
      </div>

      {!session ? (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="title" style={{ margin: 0 }}>تسجيل دخول الأدمن</p>
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

          {msg ? <p className="small" style={{ marginTop: 10 }}>{msg}</p> : null}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="title" style={{ margin: 0 }}>رفع مقطع جديد</p>
          <p className="desc">MP3 فقط — وسيظهر فورًا في الصفحة الرئيسية</p>

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

            <button className="btn primary" disabled={busy} style={{ width: "fit-content" }}>
              {busy ? "جارِ الرفع…" : "رفع ونشر"}
            </button>
          </form>

          {msg ? <p className="small" style={{ marginTop: 10 }}>{msg}</p> : null}
        </div>
      )}
    </div>
  );
}