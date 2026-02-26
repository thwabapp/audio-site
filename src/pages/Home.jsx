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
        .select("id,title,description,public_url,created_at")
        .order("created_at", { ascending: false });

      if (!error && data) setTracks(data);
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

  return (
    <div
      dir="rtl"
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 20,
        fontFamily: "system-ui",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>مكتبة الصوتيات</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            استمع للمقاطع مباشرة
          </p>
        </div>
        <a href="/admin" style={{ textDecoration: "none", opacity: 0.9 }}>
          لوحة الإدارة
        </a>
      </header>

      <hr style={{ margin: "18px 0" }} />

      {loading ? (
        <p>جارِ التحميل…</p>
      ) : tracks.length === 0 ? (
        <p>لا توجد مقاطع منشورة بعد.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {tracks.map((t) => (
            <div
              key={t.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{t.title}</div>
                  {t.description ? (
                    <div style={{ opacity: 0.8, marginTop: 6 }}>
                      {t.description}
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={() => playTrack(t)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    minWidth: 110,
                  }}
                >
                  {current?.id === t.id && isPlaying ? "إيقاف مؤقت" : "تشغيل"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* مشغل ثابت أسفل/أسفل الشاشة (Sticky) */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 18,
          paddingTop: 12,
          background: "white",
          borderTop: "1px solid #eee",
        }}
      >
        <audio ref={audioRef} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 240 }}>
            <div style={{ fontWeight: 700 }}>
              {current ? current.title : "اختر مقطعًا للتشغيل"}
            </div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>
              {current?.description || ""}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => jump(-10)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
              }}
              disabled={!current}
            >
              -10 ث
            </button>

            <button
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
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
                minWidth: 90,
              }}
              disabled={!current}
            >
              {isPlaying ? "إيقاف" : "تشغيل"}
            </button>

            <button
              onClick={() => jump(10)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
              }}
              disabled={!current}
            >
              +10 ث
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 260 }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatTime(pos)}
            </span>

            <input
              type="range"
              min="0"
              max={dur || 0}
              value={Math.min(pos, dur || 0)}
              onChange={(e) => seekTo(e.target.value)}
              style={{ width: "100%" }}
              disabled={!current}
            />

            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatTime(dur)}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ opacity: 0.75 }}>الصوت</span>
            <input
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