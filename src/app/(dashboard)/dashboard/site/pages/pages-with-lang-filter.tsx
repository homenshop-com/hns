"use client";

import { useState } from "react";
import Link from "next/link";
import DeletePageButton from "./delete-page-button";

interface PageItem {
  id: string;
  title: string;
  slug: string;
  lang: string;
  isHome: boolean;
  sortOrder: number;
  updatedAt: string;
  parentId?: string | null;
  showInMenu?: boolean;
  externalUrl?: string | null;
}

interface Props {
  siteId: string;
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

export default function PagesWithLangFilter({
  siteId,
  pages,
  languages,
  defaultLanguage,
}: Props) {
  const [selectedLang, setSelectedLang] = useState(defaultLanguage);

  const filteredPages = pages.filter((p) => p.lang === selectedLang);

  // 트리 구조로 정렬: 부모 → 자식 순
  const topLevel = filteredPages
    .filter((p) => !p.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const getChildren = (parentId: string) =>
    filteredPages
      .filter((p) => p.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  // flat 리스트로 변환 (부모 아래에 자식)
  const orderedPages: (PageItem & { isChild: boolean })[] = [];
  for (const parent of topLevel) {
    orderedPages.push({ ...parent, isChild: false });
    for (const child of getChildren(parent.id)) {
      orderedPages.push({ ...child, isChild: true });
    }
  }

  return (
    <>
      {languages.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => setSelectedLang(lang)}
              className={`rounded-lg px-4 py-2 text-sm font-medium border ${
                selectedLang === lang
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
              }`}
            >
              {langNames[lang] || lang}
            </button>
          ))}
        </div>
      )}

      {orderedPages.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400 mb-4">
            {langNames[selectedLang] || selectedLang} 페이지가 없습니다.
          </p>
          <Link
            href="/dashboard/site/pages/new"
            className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            첫 페이지 만들기
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {orderedPages.map((page) => (
              <div
                key={page.id}
                className={`flex items-center justify-between px-6 py-4 ${
                  page.isChild ? "pl-12" : ""
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    {page.isChild && (
                      <span className="text-xs text-zinc-400">└</span>
                    )}
                    <span className={`font-medium ${page.showInMenu === false ? "text-zinc-400" : ""}`}>
                      {page.title}
                    </span>
                    {page.isHome && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        홈
                      </span>
                    )}
                    {page.externalUrl && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                        외부링크
                      </span>
                    )}
                    {page.showInMenu === false && (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        숨김
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-zinc-400">
                    {page.externalUrl || `/${page.slug}`}
                  </span>
                  <span className="ml-3 text-xs text-zinc-400">
                    순서: {page.sortOrder}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {!page.externalUrl && (
                    <Link
                      href={`/dashboard/site/pages/${page.id}/edit`}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      디자인 편집
                    </Link>
                  )}
                  <span className="text-xs text-zinc-400">
                    {new Date(page.updatedAt).toLocaleDateString("ko-KR")}
                  </span>
                  <DeletePageButton siteId={siteId} pageId={page.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
