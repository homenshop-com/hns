"use client";

import { useState } from "react";

const ALL_LANGUAGES: { code: string; name: string }[] = [
  { code: "ko", name: "한국어" },
  { code: "en", name: "English" },
  { code: "ja", name: "日本語" },
  { code: "zh-cn", name: "中文(简体)" },
  { code: "zh-tw", name: "中文(繁體)" },
  { code: "es", name: "Español" },
];

interface LanguageSettingsProps {
  siteId: string;
  languages: string[];
  defaultLanguage: string;
  variant?: "compact" | "full";
  onUpdate?: (languages: string[], defaultLanguage: string) => void;
}

export default function LanguageSettings({
  siteId,
  languages: initialLanguages,
  defaultLanguage: initialDefault,
  variant = "full",
  onUpdate,
}: LanguageSettingsProps) {
  const [languages, setLanguages] = useState<string[]>(initialLanguages);
  const [defaultLang, setDefaultLang] = useState(initialDefault);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const isCompact = variant === "compact";

  async function save(newLangs: string[], newDefault: string) {
    setSaving(true);
    setError("");
    setSaved(false);

    const res = await fetch(`/api/sites/${siteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        languages: newLangs,
        defaultLanguage: newDefault,
      }),
    });

    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate?.(newLangs, newDefault);
    } else {
      const data = await res.json();
      setError(data.error || "저장에 실패했습니다.");
    }
  }

  function toggleLanguage(code: string) {
    let newLangs: string[];
    if (languages.includes(code)) {
      if (languages.length <= 1) return;
      newLangs = languages.filter((l) => l !== code);
      const newDefault = code === defaultLang ? newLangs[0] : defaultLang;
      setLanguages(newLangs);
      setDefaultLang(newDefault);
      save(newLangs, newDefault);
    } else {
      newLangs = [...languages, code];
      setLanguages(newLangs);
      save(newLangs, defaultLang);
    }
  }

  function changeDefault(code: string) {
    setDefaultLang(code);
    save(languages, code);
  }

  if (isCompact) {
    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {ALL_LANGUAGES.map((lang) => {
            const active = languages.includes(lang.code);
            const isDefault = defaultLang === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => toggleLanguage(lang.code)}
                disabled={saving}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1px solid",
                  borderRadius: 20,
                  cursor: saving ? "default" : "pointer",
                  borderColor: active ? "#4a90d9" : "#e2e8f0",
                  background: active ? (isDefault ? "#4a90d9" : "#eef4fc") : "#f8f9fa",
                  color: active ? (isDefault ? "#fff" : "#4a90d9") : "#868e96",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {lang.name}
                {isDefault && <span style={{ marginLeft: 4, fontSize: 10 }}>기본</span>}
              </button>
            );
          })}
          {saving && <span style={{ fontSize: 11, color: "#868e96" }}>저장 중...</span>}
          {saved && <span style={{ fontSize: 11, color: "#22c55e" }}>저장됨</span>}
          {error && <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>}
        </div>
        {languages.length > 1 && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#868e96" }}>기본 언어:</span>
            <select
              value={defaultLang}
              onChange={(e) => changeDefault(e.target.value)}
              disabled={saving}
              style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, border: "1px solid #e2e8f0" }}
            >
              {languages.map((code) => {
                const lang = ALL_LANGUAGES.find((l) => l.code === code);
                return <option key={code} value={code}>{lang?.name || code}</option>;
              })}
            </select>
          </div>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div>
      <div style={{ fontSize: 12, color: "#868e96", marginBottom: 8 }}>
        사이트에서 지원할 언어를 선택하세요.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {ALL_LANGUAGES.map((lang) => {
          const active = languages.includes(lang.code);
          const isDefault = defaultLang === lang.code;
          return (
            <label
              key={lang.code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                border: `1.5px solid ${active ? "#4a90d9" : "#e2e8f0"}`,
                borderRadius: 6,
                cursor: "pointer",
                background: active ? "#eef4fc" : "#fff",
                transition: "all 0.15s",
              }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleLanguage(lang.code)}
                disabled={saving || (active && languages.length <= 1)}
                style={{ accentColor: "#4a90d9" }}
              />
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{lang.name}</span>
                <span style={{ fontSize: 11, color: "#868e96", marginLeft: 4 }}>{lang.code}</span>
                {isDefault && (
                  <span style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    background: "#4a90d9",
                    color: "#fff",
                    padding: "1px 6px",
                    borderRadius: 10,
                  }}>
                    기본
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {languages.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#868e96", marginBottom: 4 }}>기본 언어</div>
          <select
            value={defaultLang}
            onChange={(e) => changeDefault(e.target.value)}
            disabled={saving}
          >
            {languages.map((code) => {
              const lang = ALL_LANGUAGES.find((l) => l.code === code);
              return <option key={code} value={code}>{lang?.name || code}</option>;
            })}
          </select>
        </div>
      )}

      {saving && <p style={{ fontSize: 11, color: "#868e96", marginTop: 8 }}>저장 중...</p>}
      {saved && <p style={{ fontSize: 11, color: "#22c55e", marginTop: 8 }}>저장되었습니다.</p>}
      {error && <p style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
