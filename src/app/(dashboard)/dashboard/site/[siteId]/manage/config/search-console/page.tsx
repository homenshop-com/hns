import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardShell from "../../../../../dashboard-shell";
import SearchConsoleForm from "./SearchConsoleForm";

export default async function SearchConsoleConfigPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, shopId: true, userId: true, googleVerification: true },
  });

  if (!site || site.userId !== session.user.id) {
    redirect("/dashboard");
  }

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "기본정보관리", href: `/dashboard/site/settings?id=${siteId}` },
        { label: "Google Search Console" },
      ]}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/site/settings?id=${siteId}`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; 기본정보관리
          </Link>
        </div>

        <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", overflow: "hidden", maxWidth: 720 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
              Google Search Console
            </h1>
            <p style={{ fontSize: 13, color: "#868e96", marginTop: 4, marginBottom: 0 }}>
              소유권 확인을 위한 메타 태그를 설정합니다.
            </p>
          </div>

          <div style={{ padding: 24 }}>
            <SearchConsoleForm siteId={site.id} currentValue={site.googleVerification || ""} />

            <div style={{ marginTop: 24, padding: "16px 20px", background: "#f8f9fa", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 8 }}>설정 방법</div>
              <ol style={{ fontSize: 13, color: "#495057", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
                <li>
                  <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9" }}>
                    Google Search Console
                  </a>에 로그인합니다.
                </li>
                <li>속성 추가 → URL 접두어 → 사이트 주소를 입력합니다.</li>
                <li>확인 방법에서 &quot;HTML 태그&quot;를 선택합니다.</li>
                <li>
                  메타 태그의 <code style={{ background: "#e9ecef", padding: "1px 4px", borderRadius: 3, fontSize: 12 }}>content</code> 값을 복사하여 위 입력란에 붙여넣기 합니다.
                </li>
                <li>저장 후 Google Search Console에서 &quot;확인&quot; 버튼을 클릭합니다.</li>
              </ol>
            </div>

            <div style={{ marginTop: 16 }}>
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4a90d9", textDecoration: "none" }}
              >
                Google Search Console 바로가기 &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
