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
 * All styles are inline so the component renders identically inside the
 * admin (Tailwind-driven) and the user dashboard (which uses dashboard-v2.css
 * that overrides utility classes). The visual language follows Toss-style
 * cues: #3182f6 primary blue, 12px card radius, light grey borders, soft
 * shadows, 600-weight CTAs on white surfaces.
 */

const T = {
  blue: "#3182f6",
  blueHover: "#1b64da",
  blueSoft: "#e8f3ff",
  blueDeep: "#1f56b5",
  ink: "#191f28",
  ink2: "#4e5968",
  ink3: "#8b95a1",
  line: "#e5e8eb",
  lineSoft: "#f2f4f6",
  surface: "#ffffff",
  surfaceMuted: "#f9fafb",
  green: "#10b981",
  greenSoft: "#ecfdf5",
  greenInk: "#047857",
  amber: "#f59e0b",
  amberSoft: "#fffbeb",
  amberInk: "#92400e",
  violet: "#7c3aed",
  emerald: "#059669",
  teal: "#14b8a6",
  orange: "#f97316",
  radiusCard: 12,
  radiusBtn: 8,
  radiusChip: 999,
  shadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
};

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
        // Silent — previous snapshot stays on screen.
      }
    };
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [initial.configured, refreshUrl]);

  // ─── Not connected state ─────────────────────────────────────────
  if (!data.configured) {
    const isUserFlow = !!notConnectedHelpHref;
    const helpHref = notConnectedHelpHref ?? "https://analytics.google.com/";
    const helpLabel = notConnectedHelpLabel ?? "GA 열기";
    return (
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          borderRadius: T.radiusCard,
          padding: 24,
          marginBottom: 20,
          boxShadow: T.shadow,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>📊</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: T.ink, margin: 0 }}>Google Analytics</h2>
            </div>
            <p style={{ fontSize: 13, color: T.ink2, margin: "0 0 4px", lineHeight: 1.6 }}>
              아직 연결되지 않았습니다.{" "}
              <span style={{ fontFamily: "monospace", fontSize: 12, color: T.ink3 }}>{data.reason}</span>
            </p>
            <p style={{ fontSize: 13, color: T.ink2, margin: 0, lineHeight: 1.6 }}>
              {isUserFlow
                ? "설정 페이지에서 측정 ID와 Property ID를 입력하고 서비스 계정에 뷰어 권한을 부여하시면 이 카드에 실시간 통계가 표시됩니다."
                : "운영 서버 환경변수(GA_PROPERTY_ID / GA_SERVICE_ACCOUNT_JSON)를 설정한 뒤 재시작하세요."}
            </p>
          </div>
          <a
            href={helpHref}
            target={isUserFlow ? undefined : "_blank"}
            rel={isUserFlow ? undefined : "noreferrer"}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: T.blue,
              color: "#fff",
              borderRadius: T.radiusBtn,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 0.12s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = T.blueHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = T.blue)}
          >
            {helpLabel}
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  // ─── Connected state ─────────────────────────────────────────────
  const maxUsers = Math.max(1, ...data.daily.map((d) => d.users));
  const points = data.daily
    .map((d, i) => {
      const x = (i / Math.max(1, data.daily.length - 1)) * 100;
      const y = 100 - (d.users / maxUsers) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const tiles: Array<{ label: string; sub: string; value: number; accent: string }> = [
    { label: "활성 사용자", sub: "최근 7일", value: data.totalUsers, accent: T.blue },
    { label: "신규 사용자", sub: "최근 7일", value: data.newUsers, accent: T.violet },
    { label: "세션", sub: "최근 7일", value: data.sessions, accent: T.emerald },
    { label: "페이지뷰", sub: "최근 7일", value: data.pageViews, accent: T.orange },
  ];

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: T.radiusCard,
        marginBottom: 20,
        overflow: "hidden",
        boxShadow: T.shadow,
      }}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 24px",
          borderBottom: `1px solid ${T.lineSoft}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: T.ink, margin: 0 }}>Google Analytics</h2>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: T.radiusChip,
              background: T.greenSoft,
              color: T.greenInk,
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid #a7f3d0`,
            }}
          >
            <RealtimePulse value={data.activeUsersNow} />
            실시간 {data.activeUsersNow.toLocaleString()}명
          </span>
        </div>
        <a
          href={`https://analytics.google.com/analytics/web/#/p${propertyId ?? ""}/reports/intelligenthome`}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.blue,
            textDecoration: "none",
            transition: "color 0.12s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = T.blueHover)}
          onMouseOut={(e) => (e.currentTarget.style.color = T.blue)}
        >
          GA 콘솔 열기 →
        </a>
      </div>

      {/* ── KPI tiles ────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderBottom: `1px solid ${T.lineSoft}`,
        }}
      >
        {tiles.map((t, i) => (
          <div
            key={t.label}
            style={{
              padding: "18px 24px",
              borderLeft: i === 0 ? "none" : `1px solid ${T.lineSoft}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.ink3,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              {t.label}
            </div>
            <div style={{ fontSize: 10, color: T.ink3, marginTop: 2, marginBottom: 8 }}>{t.sub}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: t.accent, lineHeight: 1 }}>
              {t.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sparkline + Top pages ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr" }}>
        {/* Sparkline */}
        <div style={{ padding: "20px 24px", borderRight: `1px solid ${T.lineSoft}` }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.ink3,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 12,
            }}
          >
            일별 사용자 추이
          </div>
          {data.daily.length > 1 ? (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: 96 }}>
              <polyline
                fill="none"
                stroke={T.blue}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                points={points}
              />
              <polyline fill="rgba(49, 130, 246, 0.08)" stroke="none" points={`0,100 ${points} 100,100`} />
            </svg>
          ) : (
            <p style={{ fontSize: 12, color: T.ink3, margin: 0 }}>데이터 수집을 기다리는 중입니다.</p>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: T.ink3,
              fontFamily: "monospace",
              marginTop: 8,
            }}
          >
            <span>{formatDate(data.daily[0]?.date)}</span>
            <span>{formatDate(data.daily[data.daily.length - 1]?.date)}</span>
          </div>
        </div>

        {/* Top pages */}
        <div>
          <div style={{ padding: "18px 24px 10px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.ink3,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              상위 페이지 (최근 7일)
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {data.topPages.length === 0 && (
                  <tr>
                    <td
                      style={{
                        padding: "24px",
                        textAlign: "center",
                        color: T.ink3,
                        fontSize: 12,
                      }}
                    >
                      데이터가 아직 수집되지 않았습니다.
                    </td>
                  </tr>
                )}
                {data.topPages.map((p, i) => (
                  <tr
                    key={p.path}
                    style={{
                      borderTop: i === 0 ? `1px solid ${T.lineSoft}` : `1px solid ${T.lineSoft}`,
                    }}
                  >
                    <td style={{ padding: "10px 24px" }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: T.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 420,
                        }}
                      >
                        {p.title || "(제목 없음)"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: T.ink3,
                          fontFamily: "monospace",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 420,
                          marginTop: 2,
                        }}
                      >
                        {p.path}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "10px 24px",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        fontSize: 14,
                        fontWeight: 700,
                        color: T.ink,
                      }}
                    >
                      {p.views.toLocaleString()}
                      <span style={{ marginLeft: 4, fontSize: 10, color: T.ink3, fontWeight: 400 }}>views</span>
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

function RealtimePulse({ value }: { value: number }) {
  const active = value > 0;
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 6, height: 6 }}>
      {active && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            background: T.green,
            opacity: 0.75,
            animation: "ga-ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          width: 6,
          height: 6,
          borderRadius: 999,
          background: active ? T.green : T.ink3,
        }}
      />
      <style>{`
        @keyframes ga-ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </span>
  );
}

// GA returns dates as YYYYMMDD — format for the sparkline axis.
function formatDate(raw: string | undefined): string {
  if (!raw || raw.length !== 8) return "";
  return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
}
