"use client";

import { useEffect, useState } from "react";
import type { AnalyticsSummary } from "@/lib/analytics";

/**
 * Renders the GA section of a dashboard.
 *
 * Used in two places:
 *  - Admin homenshop.com dashboard (default `/api/admin/analytics` URL)
 *  - User-facing per-site dashboards (`/api/dashboard/sites/[id]/analytics`)
 *
 * The server component passes the initial summary as a prop (no waterfall on
 * first paint). After mount this component polls `refreshUrl` every 60 s so
 * the "realtime users" tile stays live without forcing a full page reload.
 *
 * `notConnectedHelpHref` lets the host page point users at the right setup
 * page when GA hasn't been wired up yet (defaults to GA console).
 */
export default function AnalyticsPanel({
  initial,
  propertyId,
  refreshUrl = "/api/admin/analytics",
  notConnectedHelpHref,
  notConnectedHelpLabel,
}: {
  initial: AnalyticsSummary;
  propertyId: string | undefined;
  refreshUrl?: string;
  notConnectedHelpHref?: string;
  notConnectedHelpLabel?: string;
}) {
  const [data, setData] = useState<AnalyticsSummary>(initial);

  useEffect(() => {
    if (!initial.configured) return;
    const refresh = async () => {
      try {
        const res = await fetch(refreshUrl, { cache: "no-store" });
        if (res.ok) setData((await res.json()) as AnalyticsSummary);
      } catch {
        // Silent — the previous snapshot stays on screen.
      }
    };
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [initial.configured, refreshUrl]);

  if (!data.configured) {
    // Two flavors of "not connected":
    //  - On user dashboards we pass a help link to the setup page (in-app) and
    //    a CTA label like "설정하기" — the message stays user-friendly.
    //  - On the admin dashboard we leave it blank, so we show the env-var
    //    instructions for operators.
    const helpHref = notConnectedHelpHref ?? "https://analytics.google.com/";
    const helpLabel = notConnectedHelpLabel ?? "GA 열기";
    const isUserFlow = !!notConnectedHelpHref;
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-6 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-1">
              Google Analytics
            </h2>
            <p className="text-xs text-slate-500">
              아직 연결되지 않았습니다. <span className="font-mono">{data.reason}</span>
            </p>
            {isUserFlow ? (
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                설정 페이지에서 측정 ID와 Property ID를 입력하고, 서비스 계정에 뷰어 권한을
                부여하시면 이 카드에 실시간 통계가 표시됩니다.
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                  .env.local
                </code>
                에 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                  GA_PROPERTY_ID
                </code>
                {" / "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                  GA_SERVICE_ACCOUNT_JSON
                </code>
                을 설정한 뒤 서버를 재시작하세요. 자세한 절차는{" "}
                <a
                  href="https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#3182f6] hover:underline"
                >
                  Data API 가이드
                </a>
                를 참고하세요.
              </p>
            )}
          </div>
          <a
            href={helpHref}
            target={isUserFlow ? undefined : "_blank"}
            rel={isUserFlow ? undefined : "noreferrer"}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
          >
            {helpLabel}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  // Sparkline geometry — daily users over last 7 days.
  const maxUsers = Math.max(1, ...data.daily.map((d) => d.users));
  const points = data.daily
    .map((d, i) => {
      const x = (i / Math.max(1, data.daily.length - 1)) * 100;
      const y = 100 - (d.users / maxUsers) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const gaTiles = [
    { label: "활성 사용자", sub: "최근 7일", value: data.totalUsers, accent: "text-cyan-600" },
    { label: "신규 사용자", sub: "최근 7일", value: data.newUsers, accent: "text-violet-600" },
    { label: "세션", sub: "최근 7일", value: data.sessions, accent: "text-emerald-600" },
    { label: "페이지뷰", sub: "최근 7일", value: data.pageViews, accent: "text-amber-600" },
  ];

  return (
    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Google Analytics</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            실시간 {data.activeUsersNow.toLocaleString()}명
          </span>
        </div>
        <a
          href={`https://analytics.google.com/analytics/web/#/p${propertyId ?? ""}/reports/intelligenthome`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-[#3182f6] hover:text-[#1b64da] transition-colors"
        >
          GA 콘솔 열기 &rarr;
        </a>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
        {gaTiles.map((t) => (
          <div key={t.label} className="px-6 py-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{t.sub}</p>
            <p className={`mt-2 text-2xl font-bold ${t.accent}`}>{t.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* Sparkline */}
        <div className="lg:col-span-2 px-6 py-5">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
            일별 사용자 추이
          </p>
          {data.daily.length > 1 ? (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-24">
              <polyline
                fill="none"
                stroke="#3182f6"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                points={points}
              />
              <polyline
                fill="rgba(49,130,246,0.08)"
                stroke="none"
                points={`0,100 ${points} 100,100`}
              />
            </svg>
          ) : (
            <p className="text-xs text-slate-400">데이터 수집을 기다리는 중입니다.</p>
          )}
          <div className="mt-2 flex justify-between text-[10px] text-slate-400 font-mono">
            <span>{formatDate(data.daily[0]?.date)}</span>
            <span>{formatDate(data.daily[data.daily.length - 1]?.date)}</span>
          </div>
        </div>

        {/* Top pages */}
        <div className="lg:col-span-3">
          <div className="px-6 py-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              상위 페이지 (최근 7일)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.topPages.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-center text-slate-400 text-xs">
                      데이터가 아직 수집되지 않았습니다.
                    </td>
                  </tr>
                )}
                {data.topPages.map((p) => (
                  <tr key={p.path} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-2.5">
                      <p className="text-xs font-medium text-slate-800 truncate max-w-md">
                        {p.title || "(제목 없음)"}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono truncate max-w-md">
                        {p.path}
                      </p>
                    </td>
                    <td className="px-6 py-2.5 text-right text-sm font-semibold text-slate-700 whitespace-nowrap">
                      {p.views.toLocaleString()}
                      <span className="ml-1 text-[10px] text-slate-400 font-normal">views</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// GA returns dates as "YYYYMMDD" — format for the sparkline axis.
function formatDate(raw: string | undefined): string {
  if (!raw || raw.length !== 8) return "";
  return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
}
