"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function SearchConsoleForm({
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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 13,
    border: "1px solid #e2e8f0", borderRadius: 6, boxSizing: "border-box",
    fontFamily: "monospace",
  };

  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
        {t("scContentLabel")}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("scContentPlaceholder")}
          style={inputStyle}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            background: saving ? "#aaa" : "#4a90d9", color: "#fff",
            border: "none", borderRadius: 6, cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
      {value && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8f9fa", borderRadius: 6, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, color: "#868e96", marginBottom: 2 }}>{t("scMetaTagPreview")}</div>
          <code style={{ fontSize: 12, color: "#495057" }}>
            {`<meta name="google-site-verification" content="${extractContent(value)}" />`}
          </code>
        </div>
      )}
      {message && (
        <div style={{ marginTop: 8, fontSize: 13, color: message === t("savedMsg") ? "#2f9e44" : "#e03131" }}>
          {message}
        </div>
      )}
    </div>
  );
}
