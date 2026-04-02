"use client";

import { useState } from "react";

export default function AnalyticsForm({
  siteId,
  currentValue,
}: {
  siteId: string;
  currentValue: string;
}) {
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleAnalyticsId: value.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error || "저장에 실패했습니다.");
      } else {
        setMessage("저장되었습니다.");
      }
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 8 }}>
        Google Analytics 측정 ID
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="예: G-XXXXXXXXXX 또는 UA-XXXXXXXXX-X"
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
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
      {message && (
        <div style={{ marginTop: 8, fontSize: 13, color: message === "저장되었습니다." ? "#059669" : "#dc2626" }}>
          {message}
        </div>
      )}
    </div>
  );
}
