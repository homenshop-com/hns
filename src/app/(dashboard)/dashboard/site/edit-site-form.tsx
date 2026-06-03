"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface EditSiteFormProps {
  site: {
    id: string;
    name: string;
    description: string | null;
    defaultLanguage: string;
    availableLanguages?: string[];
  };
}

const LANG_LABELS: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-cn": "中文 (简体)",
  "zh-tw": "中文 (繁體)",
  es: "Español",
};

const DESC_TARGET = 160;

export default function EditSiteForm({ site }: EditSiteFormProps) {
  const router = useRouter();
  const t = useTranslations("siteCore");
  const [name, setName] = useState(site.name);
  const [description, setDescription] = useState(site.description || "");
  const [defaultLang, setDefaultLang] = useState(site.defaultLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const dirty =
    name !== site.name ||
    description !== (site.description || "") ||
    defaultLang !== site.defaultLanguage;

  const descLen = [...description].length;
  const descOver = descLen > DESC_TARGET;

  const availableLangs = site.availableLanguages && site.availableLanguages.length > 0
    ? site.availableLanguages
    : [site.defaultLanguage];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          defaultLanguage: defaultLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("updateFailed"));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || t("errorOccurred"));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setName(site.name);
    setDescription(site.description || "");
    setDefaultLang(site.defaultLanguage);
    setError("");
    setSuccess(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "contents" }}>
      <div className="sv2-card-body">
        <div className="sv2-field">
          <span className="lbl">
            {t("siteNameLabel")} <span className="req">*</span>
          </span>
          <input
            className="sv2-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
          <span className="hint">{t("siteNameHint")}</span>
        </div>

        <div className="sv2-field">
          <span className="lbl">{t("descMetaLabel")}</span>
          <textarea
            className="sv2-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={320}
          />
          <span className={`hint ${descOver ? "danger" : descLen > DESC_TARGET * 0.9 ? "warn" : ""}`}>
            {t.rich("descCounter", {
              count: descLen,
              target: DESC_TARGET,
              b: (c) => <b>{c}</b>,
            })}
          </span>
        </div>

        <div className="sv2-field">
          <span className="lbl">{t("defaultLanguage")}</span>
          <select
            className="sv2-select"
            value={defaultLang}
            onChange={(e) => setDefaultLang(e.target.value)}
          >
            {availableLangs.map((code) => (
              <option key={code} value={code}>
                {LANG_LABELS[code] || code} ({code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sv2-card-foot">
        {error ? (
          <span className="msg err">⚠️ {error}</span>
        ) : success ? (
          <span className="msg ok">✓ {t("saved")}</span>
        ) : dirty ? (
          <span className="msg" style={{ color: "var(--ink-3)" }}>{t("hasChanges")}</span>
        ) : null}
        <button
          type="button"
          onClick={handleReset}
          disabled={saving || !dirty}
          className="sv2-foot-btn"
        >
          {t("reset")}
        </button>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="sv2-foot-btn primary"
        >
          <svg width={13} height={13}><use href="#i-check" /></svg>
          {saving ? t("saving") : t("saveChanges")}
        </button>
      </div>
    </form>
  );
}
