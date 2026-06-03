"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function WebmasterForm({
  siteId,
  currentValue,
}: {
  siteId: string;
  currentValue: string;
}) {
  const t = useTranslations("siteManage");
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function extractContent(input: string): string {
    const trimmed = input.trim();
    // If user pastes full meta tag, extract content value
    const match = trimmed.match(/content=["']([^"']+)["']/);
    if (match) return match[1];
    return trimmed;
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const contentValue = extractContent(value);
      setValue(contentValue);

      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleVerification: contentValue }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error || t("saveFailed"));
      } else {
        setMessage(t("savedMsg"));
      }
    } catch {
      setMessage(t("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 8 }}>
        {t("scContentLabel")}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("wmContentPlaceholder")}
          style={{
            flex: 1,
            padding: "10px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
            outline: "none",
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 24px",
            background: saving ? "#9ca3af" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
      {value && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{t("wmMetaTagPreview")}</div>
          <code style={{ fontSize: 13, color: "#374151" }}>
            {`<meta name="google-site-verification" content="${extractContent(value)}" />`}
          </code>
        </div>
      )}
      {message && (
        <div style={{ marginTop: 8, fontSize: 13, color: message === t("savedMsg") ? "#059669" : "#dc2626" }}>
          {message}
        </div>
      )}
    </div>
  );
}
