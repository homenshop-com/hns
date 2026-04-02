import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AnalyticsForm from "./AnalyticsForm";

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
    select: { id: true, shopId: true, userId: true, googleAnalyticsId: true },
  });

  if (!site || site.userId !== session.user.id) {
    redirect("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f8", fontFamily: "Noto Sans KR, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e0e0e0", padding: "0 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/dashboard" style={{ fontSize: 20, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
              HomeNShop
            </Link>
            <span style={{ color: "#6b7280", fontSize: 13 }}>/</span>
            <Link href={`/dashboard/site/${siteId}/manage`} style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>
              데이타관리
            </Link>
            <span style={{ color: "#6b7280", fontSize: 13 }}>/</span>
            <span style={{ color: "#374151", fontSize: 13, fontWeight: 500 }}>Google Analytics</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: "32px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8, marginTop: 0 }}>
            Google Analytics
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
            Google Analytics 추적 ID를 설정하면 사이트 방문자 통계를 확인할 수 있습니다.
          </p>

          <AnalyticsForm siteId={site.id} currentValue={site.googleAnalyticsId || ""} />

          <div style={{ marginTop: 24, padding: "16px 20px", background: "#f0f9ff", borderRadius: 6, border: "1px solid #bae6fd" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0c4a6e", marginBottom: 8 }}>설정 방법</div>
            <ol style={{ fontSize: 13, color: "#374151", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li><a href="https://analytics.google.com/" target="_blank" rel="noopener" style={{ color: "#2563eb" }}>Google Analytics</a>에 로그인합니다.</li>
              <li>관리 → 데이터 스트림 → 웹 스트림을 선택합니다.</li>
              <li>측정 ID (G-XXXXXXXXXX 또는 UA-XXXXXXXXX-X)를 복사합니다.</li>
              <li>위 입력란에 붙여넣기 후 저장합니다.</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}
