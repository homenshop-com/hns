"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * SearchSettings — site-wide unified search toggles.
 *
 * Kept separate from ProductSettings because the search bar spans both
 * products and board posts and isn't conceptually a product-display
 * setting. Saved to the same productSettings JSON via the partial-merge
 * endpoint at /api/sites/[id]/product-settings, so two independent panels
 * can coexist without clobbering each other's fields.
 */

interface SearchSettingsData {
  searchEnabled: boolean;
  boardSearchEnabled: boolean;
}

interface SearchSettingsProps {
  siteId: string;
  initial: SearchSettingsData;
}

export default function SearchSettings({ siteId, initial }: SearchSettingsProps) {
  const t = useTranslations("siteManage");
  const savedMsg = t("saved");
  const [settings, setSettings] = useState<SearchSettingsData>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/sites/${siteId}/product-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Only send our two fields — endpoint merges with existing DB state.
        body: JSON.stringify({
          searchEnabled: settings.searchEnabled,
          boardSearchEnabled: settings.boardSearchEnabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("saveFailed"));
      }
      setMessage(savedMsg);
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dv2-panel" style={{ marginTop: 16, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: "-2px" }}>
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          {t("siteSearch")}
        </h2>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500 }}>
          {t("siteSearchSubtitle")}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "4px 0 14px", lineHeight: 1.5 }}>
        {t("siteSearchDesc")}
      </p>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 12px",
          marginBottom: 8,
          border: `1px solid ${settings.searchEnabled ? "#2563eb" : "#e5e7eb"}`,
          borderRadius: 6,
          background: settings.searchEnabled ? "#eff6ff" : "#fff",
          cursor: "pointer",
          wordBreak: "keep-all",
        }}
      >
        <input
          type="checkbox"
          checked={settings.searchEnabled}
          onChange={(e) => setSettings((s) => ({ ...s, searchEnabled: e.target.checked }))}
          style={{ width: 14, height: 14, marginTop: 3, accentColor: "#2563eb", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{t("showUnifiedSearch")}</div>
          <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 2 }}>
            {t("showUnifiedSearchDesc")}
          </div>
        </div>
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "8px 12px",
          marginLeft: 22,
          marginBottom: 14,
          borderLeft: "2px solid #e5e7eb",
          background: "transparent",
          cursor: settings.searchEnabled ? "pointer" : "not-allowed",
          opacity: settings.searchEnabled ? 1 : 0.5,
          wordBreak: "keep-all",
        }}
      >
        <input
          type="checkbox"
          disabled={!settings.searchEnabled}
          checked={settings.boardSearchEnabled}
          onChange={(e) => setSettings((s) => ({ ...s, boardSearchEnabled: e.target.checked }))}
          style={{ width: 14, height: 14, marginTop: 3, accentColor: "#2563eb", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>{t("includeBoards")}</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            {t("includeBoardsDesc")}
          </div>
        </div>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleSave} disabled={saving} className="mv2-form-submit" style={{ minWidth: 140 }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 3h10l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" />
            <path d="M6 3v5h8V3M6 17v-5h8v5" />
          </svg>
          {saving ? t("saving") : t("saveSearchSettings")}
        </button>
        {message && (
          <span
            style={{
              fontSize: 12,
              color: message === savedMsg ? "#0d7d45" : "#c93041",
              fontWeight: 500,
            }}
          >
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
