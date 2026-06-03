"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";

interface QrCodeGeneratorProps {
  defaultUrl: string;
  alternateUrls?: { label: string; url: string }[];
  shopId: string;
}

type SizeKey = "S" | "M" | "L";
const SIZE_PX: Record<SizeKey, number> = { S: 160, M: 240, L: 360 };

const ECC_LEVELS = ["L", "M", "Q", "H"] as const;
type EccLevel = (typeof ECC_LEVELS)[number];

export default function QrCodeGenerator({
  defaultUrl,
  alternateUrls = [],
  shopId,
}: QrCodeGeneratorProps) {
  const t = useTranslations("siteSettings");
  const presets = useMemo(() => {
    const seen = new Set<string>();
    const out: { label: string; url: string }[] = [];
    const add = (label: string, url: string) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ label, url });
    };
    add(t("defaultUrl"), defaultUrl);
    for (const a of alternateUrls) add(a.label, a.url);
    return out;
  }, [defaultUrl, alternateUrls, t]);

  const [text, setText] = useState(defaultUrl);
  const [size, setSize] = useState<SizeKey>("M");
  const [ecc, setEcc] = useState<EccLevel>("M");
  const [fg, setFg] = useState("#111111");
  const [bg, setBg] = useState("#ffffff");
  const [dataUrl, setDataUrl] = useState<string>("");
  const [error, setError] = useState("");

  const trimmed = text.trim();
  const hasText = trimmed.length > 0;

  useEffect(() => {
    if (!hasText) return;
    let cancelled = false;
    QRCode.toDataURL(trimmed, {
      width: SIZE_PX[size] * 2,
      margin: 2,
      errorCorrectionLevel: ecc,
      color: { dark: fg, light: bg },
    })
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url);
        setError("");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDataUrl("");
        setError(e instanceof Error ? e.message : t("generationFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed, hasText, size, ecc, fg, bg]);

  function download(format: "png" | "svg") {
    const value = text.trim();
    if (!value) return;
    if (format === "png") {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${shopId}-qr.png`;
      a.click();
      return;
    }
    QRCode.toString(value, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: ecc,
      color: { dark: fg, light: bg },
    })
      .then((svg) => {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${shopId}-qr.svg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch(() => {});
  }

  function printQr() {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>QR · ${shopId}</title>
<style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,system-ui,sans-serif;background:#fff;color:#111}
img{max-width:90vmin;height:auto}
.url{margin-top:16px;font-size:13px;color:#555;word-break:break-all;text-align:center;max-width:480px}
</style></head><body>
<img src="${dataUrl}" alt="QR" />
<div class="url">${text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c)}</div>
<script>setTimeout(()=>window.print(),200)</script>
</body></html>`);
    w.document.close();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
        {t("qrDesc")}
      </p>

      {presets.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {presets.map((p) => {
            const active = p.url === text;
            return (
              <button
                key={p.url}
                type="button"
                onClick={() => setText(p.url)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  border: `1px solid ${active ? "#3182f6" : "var(--line, #e5e8eb)"}`,
                  background: active ? "#eff6ff" : "#fff",
                  color: active ? "#1d4ed8" : "var(--ink-1)",
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <div>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
          {t("urlOrText")}
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://..."
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            fontWeight: 500,
            border: "1px solid var(--line-2, #d1d5db)",
            borderRadius: 8,
            background: "#fff",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: "var(--ink-0)",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 12,
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
            {t("size")}
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            {(Object.keys(SIZE_PX) as SizeKey[]).map((s) => {
              const active = s === size;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    fontSize: 12.5,
                    fontWeight: 600,
                    border: `1px solid ${active ? "#3182f6" : "var(--line, #e5e8eb)"}`,
                    background: active ? "#eff6ff" : "#fff",
                    color: active ? "#1d4ed8" : "var(--ink-1)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {s} <span style={{ fontWeight: 400, color: active ? "#1d4ed8" : "var(--ink-3)" }}>{SIZE_PX[s]}px</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
            {t("eccLabel")}
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            {ECC_LEVELS.map((lv) => {
              const active = lv === ecc;
              return (
                <button
                  key={lv}
                  type="button"
                  onClick={() => setEcc(lv)}
                  title={t("eccRecovery", {
                    percent: lv === "L" ? 7 : lv === "M" ? 15 : lv === "Q" ? 25 : 30,
                  })}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    fontSize: 12.5,
                    fontWeight: 600,
                    border: `1px solid ${active ? "#3182f6" : "var(--line, #e5e8eb)"}`,
                    background: active ? "#eff6ff" : "#fff",
                    color: active ? "#1d4ed8" : "var(--ink-1)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {lv}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
          {t("foreground")}
          <input
            type="color"
            value={fg}
            onChange={(e) => setFg(e.target.value)}
            style={{ width: 32, height: 28, padding: 0, border: "1px solid var(--line, #e5e8eb)", borderRadius: 6, cursor: "pointer", background: "transparent" }}
          />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
          {t("background")}
          <input
            type="color"
            value={bg}
            onChange={(e) => setBg(e.target.value)}
            style={{ width: 32, height: 28, padding: 0, border: "1px solid var(--line, #e5e8eb)", borderRadius: 6, cursor: "pointer", background: "transparent" }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setFg("#111111");
            setBg("#ffffff");
          }}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            border: "1px solid var(--line, #e5e8eb)",
            background: "#fff",
            color: "var(--ink-2)",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {t("resetColors")}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: 20,
          background: "#f7f8fa",
          border: "1px solid var(--line, #e5e8eb)",
          borderRadius: 12,
        }}
      >
        {hasText && dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="QR Code"
            width={SIZE_PX[size]}
            height={SIZE_PX[size]}
            style={{
              width: SIZE_PX[size],
              height: SIZE_PX[size],
              background: bg,
              borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          />
        ) : (
          <div
            style={{
              width: SIZE_PX[size],
              height: SIZE_PX[size],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-3)",
              fontSize: 13,
              background: "#fff",
              border: "1px dashed var(--line-2, #d1d5db)",
              borderRadius: 8,
            }}
          >
            {error || t("enterUrl")}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => download("png")}
            disabled={!dataUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 14px",
              background: dataUrl ? "#3182f6" : "var(--line-2, #d1d5db)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              cursor: dataUrl ? "pointer" : "not-allowed",
            }}
          >
            <i className="fa-solid fa-download" aria-hidden="true" /> {t("downloadPng")}
          </button>
          <button
            type="button"
            onClick={() => download("svg")}
            disabled={!dataUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 14px",
              background: "#fff",
              color: "var(--ink-1)",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--line, #e5e8eb)",
              cursor: dataUrl ? "pointer" : "not-allowed",
              opacity: dataUrl ? 1 : 0.5,
            }}
          >
            <i className="fa-solid fa-file-code" aria-hidden="true" /> SVG
          </button>
          <button
            type="button"
            onClick={printQr}
            disabled={!dataUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 14px",
              background: "#fff",
              color: "var(--ink-1)",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--line, #e5e8eb)",
              cursor: dataUrl ? "pointer" : "not-allowed",
              opacity: dataUrl ? 1 : 0.5,
            }}
          >
            <i className="fa-solid fa-print" aria-hidden="true" /> {t("print")}
          </button>
        </div>
      </div>
    </div>
  );
}
