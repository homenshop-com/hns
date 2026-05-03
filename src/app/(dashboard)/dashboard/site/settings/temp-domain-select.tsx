"use client";

import { useState } from "react";

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
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");

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
        throw new Error(j.error || "저장 실패");
      }
      setValue(next);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("err");
      setErrMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const previewUrl = `https://${value}/${shopId}/${defaultLanguage}/`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        style={{
          padding: "8px 10px",
          fontSize: 13,
          border: "1px solid var(--line-2, #d1d5db)",
          borderRadius: 6,
          background: "#fff",
          fontFamily: "inherit",
        }}
      >
        {options.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "monospace" }}>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-3)" }}>
          {previewUrl}
        </a>
      </div>
      {saving && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>저장 중...</div>}
      {status === "ok" && <div style={{ fontSize: 11, color: "var(--ok, #16a34a)" }}>✓ 저장됨</div>}
      {status === "err" && (
        <div style={{ fontSize: 11, color: "var(--err, #dc2626)" }}>{errMsg}</div>
      )}
    </div>
  );
}
