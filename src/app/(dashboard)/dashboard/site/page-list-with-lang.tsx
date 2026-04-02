"use client";

import { useState } from "react";
import Link from "next/link";

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
  const [selectedLang, setSelectedLang] = useState(defaultLanguage);

  const filteredPages = pages.filter((p) => p.lang === selectedLang);

  return (
    <div className="site-page-list">
      <div className="site-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3>페이지 목록</h3>
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
          새 페이지
        </Link>
      </div>

      {filteredPages.length === 0 ? (
        <div className="dash-empty">
          <div className="dash-empty-title">
            {langNames[selectedLang] || selectedLang} 페이지가 없습니다
          </div>
          <div className="dash-empty-desc">새 페이지를 추가해보세요.</div>
        </div>
      ) : (
        filteredPages.map((page) => (
          <div key={page.id} className="site-page-row">
            <div>
              <div className="site-page-title">
                {page.title}
                {page.isHome && <span className="site-home-badge">홈</span>}
              </div>
              <div className="site-page-slug">/{page.slug}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Link
                href={`/dashboard/site/pages/${page.id}/edit`}
                className="dash-manage-btn"
              >
                디자인 편집
              </Link>
              <Link
                href={`/preview/${page.id}`}
                className="dash-manage-btn"
                target="_blank"
              >
                미리보기
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
