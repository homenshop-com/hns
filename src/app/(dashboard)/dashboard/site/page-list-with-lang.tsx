"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface PageItem {
  id: string;
  title: string;
  slug: string;
  lang: string;
  isHome: boolean;
  sortOrder: number;
}

interface PageListWithLangProps {
  pages: PageItem[];
  languages: string[];
  defaultLanguage: string;
}

const langNames: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-cn": "中文",
  es: "Español",
};

export default function PageListWithLang({
  pages,
  languages,
  defaultLanguage,
}: PageListWithLangProps) {
  const t = useTranslations("siteCore");
  const [selectedLang, setSelectedLang] = useState(defaultLanguage);

  const filteredPages = pages.filter((p) => p.lang === selectedLang);

  return (
    <div className="site-page-list">
      <div className="site-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3>{t("pageListTitle")}</h3>
          {languages.length > 1 && (
            <div style={{ display: "flex", gap: 4 }}>
              {languages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setSelectedLang(lang)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 13,
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: selectedLang === lang ? "#3b82f6" : "#d1d5db",
                    background: selectedLang === lang ? "#3b82f6" : "transparent",
                    color: selectedLang === lang ? "#fff" : "#6b7280",
                    cursor: "pointer",
                    fontWeight: selectedLang === lang ? 600 : 400,
                  }}
                >
                  {langNames[lang] || lang}
                </button>
              ))}
            </div>
          )}
        </div>
        <Link href="/dashboard/site/pages/new" className="dash-action-btn blue">
          {t("newPage")}
        </Link>
      </div>

      {filteredPages.length === 0 ? (
        <div className="dash-empty">
          <div className="dash-empty-title">
            {t("noPagesForLang", { lang: langNames[selectedLang] || selectedLang })}
          </div>
          <div className="dash-empty-desc">{t("addNewPagePrompt")}</div>
        </div>
      ) : (
        filteredPages.map((page) => (
          <div key={page.id} className="site-page-row">
            <div>
              <div className="site-page-title">
                {page.title}
                {page.isHome && <span className="site-home-badge">{t("homeBadge")}</span>}
              </div>
              <div className="site-page-slug">/{page.slug}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Link
                href={`/dashboard/site/pages/${page.id}/edit`}
                className="dash-manage-btn"
              >
                {t("editDesign")}
              </Link>
              <Link
                href={`/preview/${page.id}`}
                className="dash-manage-btn"
                target="_blank"
              >
                {t("preview")}
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
