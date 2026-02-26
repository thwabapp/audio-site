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

      // رفع الملف إلى Storage
      const { error: upErr } = await supabase.storage
        .from("audio")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: "audio/mpeg",
        });

      if (upErr) throw upErr;

      // الحصول على الرابط العام
      const { data: pub } = supabase.storage.from("audio").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // حفظ بيانات المقطع في جدول tracks
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

  if (!session) {
    return (
      <div dir="rtl" style={{ maxWidth: 520, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
        <h1>لوحة الإدارة</h1>
        <p style={{ opacity: 0.75 }}>تسجيل دخول الأدمن</p>

        <form onSubmit={login} style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="البريد الإلكتروني"
            autoComplete="email"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            type="password"
            autoComplete="current-password"
          />
          <button style={{ padding: 10, cursor: "pointer" }}>تسجيل الدخول</button>
        </form>

        {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
        <p style={{ marginTop: 18, opacity: 0.7 }}>
          <a href="/">العودة للموقع</a>
        </p>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ maxWidth: 720, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h1 style={{ margin: 0 }}>لوحة الإدارة</h1>
        <button onClick={logout} style={{ padding: "8px 10px", cursor: "pointer" }}>
          تسجيل خروج
        </button>
      </div>

      <p style={{ opacity: 0.75, marginTop: 8 }}>رفع ملف MP3 ونشره مباشرة</p>

      <form onSubmit={uploadTrack} style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المقطع" />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="وصف مختصر (اختياري)"
          rows={3}
        />
        <input type="file" accept="audio/mpeg,.mp3" onChange={(e) => setFile(e.target.files?.[0] || null)} />

        <button disabled={busy} style={{ padding: 10, cursor: "pointer" }}>
          {busy ? "جارِ الرفع…" : "رفع ونشر"}
        </button>
      </form>

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      <hr style={{ margin: "18px 0" }} />
      <p style={{ opacity: 0.8 }}>
        <a href="/">فتح الموقع</a>
      </p>
    </div>
  );
}