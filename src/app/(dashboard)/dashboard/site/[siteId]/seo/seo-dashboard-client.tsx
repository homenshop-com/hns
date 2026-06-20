"use client";

/**
 * SEO · AEO · GEO 통합 대시보드 — 탭 셸 (클라이언트).
 *
 * 각 탭의 콘텐츠는 서버 컴포넌트(page.tsx)에서 ReactNode 슬롯으로
 * 미리 렌더해 전달한다(slot 패턴). 이 컴포넌트는 탭 전환만 담당하므로
 * 기존 SEO 마크업(SeoAuditPanel, 아이콘 스프라이트, settings-v2 CSS)을
 * 그대로 재사용할 수 있고 CSS/스프라이트 충돌이 없다.
 *
 * 탭 구성:
 *   overview   — 통합 점수 + 지표 카드 + 우선 개선 항목 (개요)
 *   audit      — SeoAuditPanel (진단 · 최적화)  ← 기존 기능 이전
 *   visibility — AI 언급률 트래커 (#1, 준비 중)
 *   indexing   — Sitemap / robots / GA / GSC (색인 · 연동)  ← 기존 기능 이전
 */

import { useState, type ReactNode } from "react";

type TabKey = "overview" | "audit" | "visibility" | "indexing";

interface Props {
  overview: ReactNode;
  audit: ReactNode;
  visibility: ReactNode;
  indexing: ReactNode;
  initialTab?: TabKey;
}

const TABS: { key: TabKey; label: string; isNew?: boolean }[] = [
  { key: "overview", label: "개요" },
  { key: "audit", label: "진단 · 최적화" },
  { key: "visibility", label: "AI 언급률", isNew: true },
  { key: "indexing", label: "색인 · 연동" },
];

export default function SeoDashboardClient({
  overview,
  audit,
  visibility,
  indexing,
  initialTab = "overview",
}: Props) {
  const [tab, setTab] = useState<TabKey>(initialTab);

  return (
    <div className="seo-dash">
      <div className="seo-tabs" role="tablist" aria-label="SEO · AEO · GEO">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`seo-tab${tab === t.key ? " on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.isNew && <span className="seo-tab-new">NEW</span>}
          </button>
        ))}
      </div>

      <div className="seo-tabpanel" role="tabpanel">
        {tab === "overview" && overview}
        {tab === "audit" && audit}
        {tab === "visibility" && visibility}
        {tab === "indexing" && indexing}
      </div>
    </div>
  );
}
