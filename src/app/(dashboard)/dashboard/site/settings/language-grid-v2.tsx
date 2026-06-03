"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const ALL_LANGUAGES: { code: string; name: string }[] = [
  { code: "ko", name: "한국어" },
  { code: "en", name: "English" },
  { code: "ja", name: "日本語" },
  { code: "zh-cn", name: "中文 (简体)" },
  { code: "zh-tw", name: "中文 (繁體)" },
  { code: "es", name: "Español" },
];

interface Props {
  siteId: string;
  languages: string[];
  defaultLanguage: string;
}

export default function LanguageGridV2({ siteId, languages: initial, defaultLanguage: initialDefault }: Props) {
  const t = useTranslations("siteSettings");
  const [languages, setLanguages] = useState<string[]>(initial);
  const [defaultLang, setDefaultLang] = useState(initialDefault);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function save(newLangs: string[], newDefault: string) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages: newLangs, defaultLanguage: newDefault }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("saveFailed"));
      }
      setMsg({ type: "ok", text: t("saved") });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function toggle(code: string) {
    if (saving) return;
    let newLangs: string[];
    let newDefault = defaultLang;
    if (languages.includes(code)) {
      if (languages.length <= 1) return;
      newLangs = languages.filter((l) => l !== code);
      if (code === defaultLang) newDefault = newLangs[0];
    } else {
      newLangs = [...languages, code];
    }
    setLanguages(newLangs);
    setDefaultLang(newDefault);
    save(newLangs, newDefault);
  }

  function changeDefault(code: string) {
    setDefaultLang(code);
    save(languages, code);
  }

  return (
    <>
      <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
        {t("selectLanguages")}
      </div>

      <div className="sv2-lang-grid">
        {ALL_LANGUAGES.map((lang) => {
          const active = languages.includes(lang.code);
          const isDefault = active && defaultLang === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => toggle(lang.code)}
              disabled={saving || (active && languages.length <= 1)}
              className={`sv2-lang-opt${active ? " on" : ""}`}
              title={active && languages.length <= 1 ? t("keepAtLeastOne") : undefined}
            >
              <span className="chk">
                <svg width={12} height={12}><use href="#i-check" /></svg>
              </span>
              <span className="nm">{lang.name}</span>
              {isDefault && <span className="star">{t("defaultBadge")}</span>}
              <span className="f">{lang.code}</span>
            </button>
          );
        })}
      </div>

      {languages.length > 1 && (
        <div className="sv2-field" style={{ marginTop: 6 }}>
          <span className="lbl">{t("defaultLanguage")}</span>
          <select
            className="sv2-select"
            value={defaultLang}
            onChange={(e) => changeDefault(e.target.value)}
            disabled={saving}
          >
            {languages.map((code) => {
              const lang = ALL_LANGUAGES.find((l) => l.code === code);
              return (
                <option key={code} value={code}>
                  {lang?.name || code}
                </option>
              );
            })}
          </select>
          <span className="hint">
            {t("defaultLanguageHint")}
          </span>
        </div>
      )}

      {msg && (
        <div
          style={{
            fontSize: 11.5,
            color: msg.type === "ok" ? "var(--ok)" : "var(--danger)",
            marginTop: -4,
          }}
        >
          {msg.type === "ok" ? "✓" : "⚠️"} {msg.text}
        </div>
      )}
    </>
  );
}
