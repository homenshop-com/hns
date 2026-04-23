"use client";

import { useState } from "react";

interface Submission {
  target: string;
  ok: boolean;
  status: number;
  error?: string;
}

interface SitemapRefreshResult {
  ok: boolean;
  urlCount: number;
  lastModified: string | null;
  sitemapUrl: string;
  activeDomain: string | null;
  indexNowConfigured: boolean;
  submissions: Submission[];
  gscSubmitUrl: string | null;
}

interface Props {
  siteId: string;
  initialUrlCount: number;
  initialLastModified: string | null;
  hasCustomDomain: boolean;
}

function formatTimestamp(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SitemapRefreshButton({
  siteId,
  initialUrlCount,
  initialLastModified,
  hasCustomDomain,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SitemapRefreshResult | null>(null);
  const [error, setError] = useState<string>("");
  const [spinning, setSpinning] = useState(false);

  const urlCount = result?.urlCount ?? initialUrlCount;
  const lastMod = result?.lastModified ?? initialLastModified;

  async function handleRefresh() {
    setLoading(true);
    setError("");
    setSpinning(true);
    setTimeout(() => setSpinning(false), 700);
    try {
      const res = await fetch(`/api/sitemap/${siteId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "새로고침 실패");
      setResult(data as SitemapRefreshResult);
    } catch (e) {
      setError((e as Error).message || "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="foot">
      <svg width={14} height={14} style={{ color: "var(--ink-3)" }}>
        <use href="#i-sitemap" />
      </svg>
      <span>
        <span className="count">{urlCount.toLocaleString()}개</span> URL 등록됨
      </span>
      <span className="t">최종 수정 {formatTimestamp(lastMod)}</span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        className={`refresh${spinning ? " spinning" : ""}`}
      >
        <svg width={13} height={13}>
          <use href="#i-refresh" />
        </svg>
        {loading ? "확인 중…" : "사이트맵 새로고침"}
      </button>

      {result && result.submissions.length > 0 && (
        <div className="submissions" style={{ flexBasis: "100%" }}>
          {result.submissions.map((s) => (
            <span key={s.target} className={s.ok ? "sub-ok" : "sub-ng"}>
              {s.ok ? "✓" : "✗"} {s.target}
            </span>
          ))}
        </div>
      )}

      {result && hasCustomDomain && !result.indexNowConfigured && (
        <div className="hint-line" style={{ flexBasis: "100%" }}>
          💡 검색엔진 자동 통지(IndexNow) 미설정 — 서버 관리자에게 INDEXNOW_KEY 설정 요청하세요.
        </div>
      )}
      {result && !hasCustomDomain && (
        <div className="hint-line" style={{ flexBasis: "100%" }}>
          💡 커스텀 도메인 연결 후에는 Bing·Yandex·Naver에도 자동 통지됩니다.
        </div>
      )}
      {error && (
        <div className="err" style={{ flexBasis: "100%" }}>
          ⚠️ {error}
        </div>
      )}
      {result && result.gscSubmitUrl && (
        <a
          href={result.gscSubmitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="gsc-link"
          style={{ flexBasis: "100%" }}
        >
          🔗 Google Search Console에서 사이트맵 제출하기 →
        </a>
      )}
    </div>
  );
}
