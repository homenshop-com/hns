"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("siteSettings");
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
      if (!res.ok) throw new Error(data.error || t("refreshFailed"));
      setResult(data as SitemapRefreshResult);
    } catch (e) {
      setError((e as Error).message || t("error"));
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
        {t.rich("urlsRegistered", {
          count: urlCount.toLocaleString(),
          c: (chunks) => <span className="count">{chunks}</span>,
        })}
      </span>
      <span className="t">{t("lastModified", { time: formatTimestamp(lastMod) })}</span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        className={`refresh${spinning ? " spinning" : ""}`}
      >
        <svg width={13} height={13}>
          <use href="#i-refresh" />
        </svg>
        {loading ? t("checking") : t("refreshSitemap")}
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
          💡 {t("indexNowNotConfigured")}
        </div>
      )}
      {result && !hasCustomDomain && (
        <div className="hint-line" style={{ flexBasis: "100%" }}>
          💡 {t("autoNotifyHint")}
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
          🔗 {t("submitToGsc")} →
        </a>
      )}
    </div>
  );
}
