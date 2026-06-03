"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface TempDomainSelectProps {
  siteId: string;
  shopId: string;
  defaultLanguage: string;
  options: string[];
  initialValue: string;
}

export default function TempDomainSelect({
  siteId,
  shopId,
  defaultLanguage,
  options,
  initialValue,
}: TempDomainSelectProps) {
  const t = useTranslations("siteSettings");
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [copied, setCopied] = useState(false);

  async function save(next: string) {
    setSaving(true);
    setStatus("idle");
    setErrMsg("");
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempDomain: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t("saveFailed"));
      }
      setValue(next);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("err");
      setErrMsg(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard 거부 — 무시 */
    }
  }

  const previewUrl = `https://${value}/${shopId}/${defaultLanguage}/`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        style={{
          padding: "10px 12px",
          fontSize: 14,
          fontWeight: 500,
          border: "1px solid var(--line-2, #d1d5db)",
          borderRadius: 8,
          background: "#fff",
          fontFamily: "inherit",
          color: "var(--ink-0)",
        }}
      >
        {options.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* 2026-05-17 사용자 요청: 커스텀 도메인 세팅용 URL을 키워서 가독성
          확보 + 복사 버튼 추가 (DNS 작업 시 URL 복사가 핵심 동작). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "#f7f8fa",
          border: "1px solid var(--line, #e5e8eb)",
          borderRadius: 8,
        }}
      >
        <i className="fa-solid fa-link" style={{ fontSize: 12, color: "var(--ink-3)" }} aria-hidden="true" />
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--accent, #3182f6)",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
          title={previewUrl}
        >
          {previewUrl}
        </a>
        <button
          type="button"
          onClick={copyUrl}
          style={{
            flexShrink: 0,
            height: 30,
            padding: "0 10px",
            background: copied ? "#ecfdf5" : "#fff",
            border: `1px solid ${copied ? "#10b981" : "var(--line, #e5e8eb)"}`,
            borderRadius: 6,
            fontSize: 12.5,
            fontWeight: 600,
            color: copied ? "#047857" : "var(--ink-1, #333d4b)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            transition: "all .15s",
          }}
          aria-label={t("copyUrl")}
        >
          <i className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"} aria-hidden="true" />
          {copied ? t("copied") : t("copy")}
        </button>
      </div>

      {saving && <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("saving")}</div>}
      {status === "ok" && <div style={{ fontSize: 13, color: "var(--ok, #16a34a)", fontWeight: 600 }}>✓ {t("saved")}</div>}
      {status === "err" && (
        <div style={{ fontSize: 13, color: "var(--err, #dc2626)", fontWeight: 600 }}>{errMsg}</div>
      )}
    </div>
  );
}
