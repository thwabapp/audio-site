import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

function formatTime(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const audioRef = useRef(null);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tracks")
        .select("id,title,description,public_url,created_at,published")
        .order("created_at", { ascending: false });

      // لو عندك published وتبي تعرض المنشور فقط:
      if (!error && data) setTracks(data.filter((t) => t.published !== false));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => setPos(a.currentTime || 0);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd = () => setIsPlaying(false);

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);

    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const filtered = tracks.filter((t) => {
    const text = `${t.title || ""} ${t.description || ""}`.toLowerCase();
    return text.includes(q.trim().toLowerCase());
  });

  function playTrack(t) {
    const a = audioRef.current;
    if (!a) return;

    const same = current?.id === t.id;
    setCurrent(t);

    if (same) {
      if (a.paused) {
        a.play();
        setIsPlaying(true);
      } else {
        a.pause();
        setIsPlaying(false);
      }
      return;
    }

    a.src = t.public_url;
    a.volume = vol;
    a.currentTime = 0;
    a.play();
    setIsPlaying(true);
  }

  function seekTo(v) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Number(v);
    setPos(Number(v));
  }

  function changeVol(v) {
    const a = audioRef.current;
    const nv = Number(v);
    setVol(nv);
    if (a) a.volume = nv;
  }

  function jump(seconds) {
    const a = audioRef.current;
    if (!a) return;
    const next = Math.min(Math.max(0, a.currentTime + seconds), dur || Infinity);
    a.currentTime = next;
    setPos(next);
  }

  async function shareTrack(t) {
    if (!t?.public_url) return;

    const url = t.public_url;
    const text = `${t.title || "مقطع صوتي"}\n${url}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: t.title || "مقطع صوتي",
          text: t.title || "مقطع صوتي",
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        alert("✅ تم نسخ الرابط للمشاركة");
      } else {
        // fallback قديم
        window.prompt("انسخ الرابط للمشاركة:", text);
      }
    } catch (e) {
      // المستخدم قد يلغي المشاركة — نتجاهل بصمت
      console.log(e);
    }
  }

  return (
    <div dir="rtl" className="container">
      <div className="topbar">
        <div className="brand">
          <h1>مكتبة الصوتيات</h1>
          <p>واجهة هادئة وسريعة للبحث والاستماع</p>
        </div>

        <div className="actions">
          <span className="badge">{tracks.length} مقطع</span>
          {/* إذا تبي تخفي رابط الإدارة عن الزوار: احذف هذا الرابط */}
          <a className="btn" href="/admin" style={{ textDecoration: "none" }}>
            لوحة الإدارة
          </a>
        </div>
      </div>

      <div className="searchRow">
        <input className="input" placeholder="ابحث عن مقطع…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost" onClick={() => setQ("")}>
          مسح
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ marginTop: 12 }}>
          جارِ التحميل…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          لا توجد مقاطع مطابقة.
        </div>
      ) : (
        <div className="grid">
          {filtered.map((t) => (
            <div key={t.id} className="card">
              <div className="cardHead">
                <div style={{ minWidth: 0 }}>
                  <p className="title" style={{ margin: 0 }}>
                    {t.title}
                  </p>
                  {t.description ? <p className="desc">{t.description}</p> : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btn ghost" onClick={() => shareTrack(t)} style={{ minWidth: 110 }}>
                    مشاركة
                  </button>

                  <button className="btn primary" onClick={() => playTrack(t)} style={{ minWidth: 110 }}>
                    {current?.id === t.id && isPlaying ? "إيقاف مؤقت" : "تشغيل"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="playerWrap">
        <div className="player">
          <audio ref={audioRef} />

          <div className="playerTop">
            <div className="now">
              <p className="nowTitle">{current ? current.title : "اختر مقطعًا للتشغيل"}</p>
              <p className="nowDesc">{current?.description || "—"}</p>
            </div>

            <div className="controls" style={{ flexWrap: "wrap" }}>
              <button className="btn" onClick={() => jump(-10)} disabled={!current}>
                -10ث
              </button>

              <button
                className="btn primary"
                disabled={!current}
                onClick={() => {
                  const a = audioRef.current;
                  if (!a || !current) return;
                  if (a.paused) {
                    a.play();
                    setIsPlaying(true);
                  } else {
                    a.pause();
                    setIsPlaying(false);
                  }
                }}
              >
                {isPlaying ? "إيقاف" : "تشغيل"}
              </button>

              <button className="btn" onClick={() => jump(10)} disabled={!current}>
                +10ث
              </button>

              <button className="btn ghost" onClick={() => shareTrack(current)} disabled={!current}>
                مشاركة
              </button>
            </div>
          </div>

          <div className="seekRow">
            <span className="time">{formatTime(pos)}</span>
            <input
              className="range"
              type="range"
              min="0"
              max={dur || 0}
              value={Math.min(pos, dur || 0)}
              onChange={(e) => seekTo(e.target.value)}
              disabled={!current}
            />
            <span className="time">{formatTime(dur)}</span>
          </div>

          <div className="seekRow" style={{ marginTop: 8 }}>
            <span className="small">الصوت</span>
            <input
              className="range"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={vol}
              onChange={(e) => changeVol(e.target.value)}
              disabled={!current}
            />
          </div>
        </div>
      </div>
    </div>
  );
}