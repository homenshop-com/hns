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
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
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

  const urlCount = result?.urlCount ?? initialUrlCount;
  const lastMod = result?.lastModified ?? initialLastModified;

  async function handleRefresh() {
    setLoading(true);
    setError("");
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
    <div style={{ marginTop: 10, padding: "10px 12px", background: "#f8f9fa", border: "1px solid #e2e8f0", borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#495057", lineHeight: 1.7 }}>
          <div>
            📄 <strong>{urlCount}</strong>개 URL 등록됨
            <span style={{ marginLeft: 10, color: "#868e96" }}>
              최종 수정 {formatTimestamp(lastMod)}
            </span>
          </div>
          {result && result.submissions.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 11 }}>
              {result.submissions.map((s) => (
                <span
                  key={s.target}
                  style={{
                    marginRight: 8,
                    color: s.ok ? "#16a34a" : "#dc2626",
                    fontFamily: "monospace",
                  }}
                >
                  {s.ok ? "✓" : "✗"} {s.target}
                </span>
              ))}
            </div>
          )}
          {result && hasCustomDomain && !result.indexNowConfigured && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#ca8a04" }}>
              💡 검색엔진 자동 통지(IndexNow) 미설정 — 서버 관리자에게 INDEXNOW_KEY 설정 요청하세요.
            </div>
          )}
          {result && !hasCustomDomain && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
              💡 커스텀 도메인 연결 후에는 Bing·Yandex·Naver에도 자동 통지됩니다.
            </div>
          )}
          {error && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#dc2626" }}>⚠️ {error}</div>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            background: loading ? "#aaa" : "#4a90d9",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "확인 중..." : "🔄 사이트맵 새로고침"}
        </button>
      </div>
      {result && result.gscSubmitUrl && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e2e8f0" }}>
          <a
            href={result.gscSubmitUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#4a90d9", textDecoration: "underline" }}
          >
            🔗 Google Search Console에서 사이트맵 제출하기 →
          </a>
        </div>
      )}
    </div>
  );
}
