import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardShell from "../../../../../dashboard-shell";
import AnalyticsForm from "./AnalyticsForm";
import { getServiceAccountEmail, getAnalyticsSummary } from "@/lib/analytics";

export default async function AnalyticsConfigPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      shopId: true,
      userId: true,
      googleAnalyticsId: true,
      googleAnalyticsPropertyId: true,
      tempDomain: true,
      domains: { select: { domain: true, status: true } },
    },
  });

  if (!site || site.userId !== session.user.id) {
    redirect("/dashboard");
  }

  const serviceAccountEmail = getServiceAccountEmail();

  // If a Property ID is set, kick off a Data API call so we can show a
  // preview row inline. Failure → render a "not yet" hint, never crash.
  const summary = site.googleAnalyticsPropertyId
    ? await getAnalyticsSummary(site.googleAnalyticsPropertyId)
    : null;

  // Custom domain detection — domains in ACTIVE status that aren't the
  // platform temp domain. These users need a separate snippet of advice.
  const customDomains = site.domains.filter(
    (d) => d.status === "ACTIVE" && !d.domain.endsWith(".homenshop.com") && !d.domain.endsWith(".homenshop.net"),
  );

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "데이타관리", href: `/dashboard/site/${siteId}/manage` },
        { label: "Google Analytics" },
      ]}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/site/${siteId}/manage`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; 데이타관리
          </Link>
        </div>

        {/* Hero card — title + connection status badge */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#191f28", margin: 0 }}>
              Google Analytics
            </h1>
            {site.googleAnalyticsId && summary?.configured && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                background: "#ecfdf5",
                color: "#047857",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #a7f3d0",
              }}>
                <span style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "#10b981",
                }} />
                연결됨
              </span>
            )}
            {site.googleAnalyticsId && summary && !summary.configured && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                background: "#fef3c7",
                color: "#92400e",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #fde68a",
              }}>
                권한 대기 중
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: "#6b7684", marginBottom: 28, lineHeight: 1.6, marginTop: 0 }}>
            측정 ID로 사이트에 GA 추적 코드가 자동 삽입되고, Property ID + 서비스 계정 권한을 추가하면 이 대시보드에서
            방문자 통계를 바로 확인할 수 있습니다.
          </p>

          <AnalyticsForm
            siteId={site.id}
            currentMeasurementId={site.googleAnalyticsId || ""}
            currentPropertyId={site.googleAnalyticsPropertyId || ""}
            serviceAccountEmail={serviceAccountEmail}
          />

          {/* Live preview if connected — quick reassurance numbers */}
          {summary?.configured && (
            <div style={{ marginTop: 28, padding: 20, background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", marginBottom: 12, letterSpacing: 0.5 }}>
                📊 최근 7일 — 실시간 미리보기
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <Stat label="활성 사용자" value={summary.totalUsers} />
                <Stat label="페이지뷰" value={summary.pageViews} />
                <Stat label="세션" value={summary.sessions} />
                <Stat label="실시간" value={summary.activeUsersNow} pulse />
              </div>
              <Link
                href={`/dashboard/site/${siteId}/manage`}
                style={{
                  display: "inline-block",
                  marginTop: 14,
                  fontSize: 13,
                  color: "#0f766e",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                전체 통계는 데이타관리 페이지에서 보기 →
              </Link>
            </div>
          )}
          {summary && !summary.configured && site.googleAnalyticsPropertyId && (
            <div style={{
              marginTop: 28,
              padding: 16,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              fontSize: 13,
              color: "#92400e",
              lineHeight: 1.6,
            }}>
              <strong>아직 데이터를 불러올 수 없습니다.</strong> 위 보라색 카드 안내대로 서비스 계정에
              뷰어 권한을 부여하셨는지 확인해주세요. (응답: <code style={{ fontSize: 11 }}>{summary.reason}</code>)
            </div>
          )}
        </div>

        {/* Setup guide — collapsible by default since most users follow inline steps */}
        <div style={{
          marginTop: 24,
          background: "#fff",
          borderRadius: 10,
          padding: "20px 28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#191f28", marginTop: 0, marginBottom: 14 }}>
            처음 설정하시나요? — 3분 가이드
          </h2>
          <ol style={{ fontSize: 13.5, color: "#4e5968", lineHeight: 1.9, margin: 0, paddingLeft: 22 }}>
            <li>
              <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#3182f6", fontWeight: 600 }}>
                Google Analytics ↗
              </a>{" "}
              에 본인 Google 계정으로 로그인 (없으면 신규 계정 생성)
            </li>
            <li>
              <strong>관리 → + 새 속성 만들기</strong> → 속성 이름 입력 → 단계 진행 →
              마지막에 <strong>"웹"</strong> 데이터 스트림 추가:
              <ul style={{ marginTop: 6, marginBottom: 6, paddingLeft: 18, color: "#6b7684" }}>
                <li>
                  웹사이트 URL:{" "}
                  <code style={{ background: "#f2f4f6", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>
                    {customDomains[0]?.domain
                      ? `https://${customDomains[0].domain}`
                      : site.tempDomain
                        ? `https://${site.tempDomain}/${site.shopId}`
                        : `https://home.homenshop.com/${site.shopId}`}
                  </code>
                </li>
                <li>스트림 이름: 사이트 이름 (예: My Shop)</li>
              </ul>
            </li>
            <li>
              생성된 데이터 스트림에서 <strong>측정 ID (G-XXXXXXXXXX)</strong> 복사 → 위 입력란에 붙여넣기 → <strong>저장</strong>
            </li>
            <li>
              <strong>관리 → 속성 세부정보</strong> 페이지에서 우측 상단의 <strong>Property ID (9~10자리 숫자)</strong>{" "}
              복사 → 위 입력란에 붙여넣기 → <strong>저장</strong>
            </li>
            <li>저장 후 나타나는 보라색 카드의 안내대로 서비스 계정 이메일을 본인 GA 속성에 추가</li>
            <li>완료! 데이터 수집 후 24~48시간 안에 첫 통계가 표시됩니다 (실시간은 즉시)</li>
          </ol>
        </div>

        {/* Custom-domain specific guidance — only if user has one */}
        {customDomains.length > 0 && (
          <div style={{
            marginTop: 16,
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "1px solid #fde68a",
            borderRadius: 10,
            padding: "20px 28px",
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginTop: 0, marginBottom: 10 }}>
              🌐 커스텀 도메인 사용자 — 추가 안내
            </h2>
            <p style={{ fontSize: 13, color: "#78350f", margin: "0 0 10px", lineHeight: 1.7 }}>
              본인 도메인{" "}
              {customDomains.map((d, i) => (
                <span key={d.domain}>
                  <code style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 3, fontSize: 12, fontWeight: 700 }}>
                    {d.domain}
                  </code>
                  {i < customDomains.length - 1 && ", "}
                </span>
              ))}
              {" "}을(를) GA 에 등록하실 때 주의할 점:
            </p>
            <ul style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li>
                데이터 스트림의 <strong>웹사이트 URL</strong> 은 반드시{" "}
                <code style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>
                  https://{customDomains[0].domain}
                </code>{" "}
                로 입력 (homenshop.com 임시 URL 아님)
              </li>
              <li>
                www 와 non-www 둘 다 사용 가능하다면 GA 에서 두 도메인을 모두 추가해야 합치된 통계가 표시됩니다
              </li>
              <li>
                gtag.js 는 도메인 무관하게 같은 측정 ID 로 작동 — 도메인 추가 후 별도 코드 수정 불필요
              </li>
            </ul>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value, pulse }: { label: string; value: number; pulse?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: "#0f766e",
        letterSpacing: 0.3,
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        {label}
        {pulse && value > 0 && (
          <span style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#10b981",
            animation: "pulse 1.5s infinite",
          }} />
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
