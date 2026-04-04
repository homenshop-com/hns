import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../../../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import WebmasterForm from "./WebmasterForm";

export default async function WebmasterConfigPage({
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

  const td = await getTranslations("dashboard");

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">HomeNShop</Link>
            <span className="dash-logo-sub">Google</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">{td("dashboard")}</Link>
            <Link href="/dashboard/profile" className="dash-header-btn">{td("memberInfo")}</Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/site/${siteId}/manage`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; 데이타관리
          </Link>
        </div>
        <div style={{ background: "#fff", borderRadius: 8, padding: "32px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8, marginTop: 0 }}>
            Google Search Console (Webmaster Tools)
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
            Google Search Console 소유권 확인을 위한 메타 태그를 설정합니다.<br />
            Google Search Console에서 &quot;HTML 태그&quot; 방식으로 확인 시, content 값을 입력하세요.
          </p>

          <WebmasterForm siteId={site.id} currentValue={site.googleVerification || ""} />

          <div style={{ marginTop: 24, padding: "16px 20px", background: "#f0f9ff", borderRadius: 6, border: "1px solid #bae6fd" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0c4a6e", marginBottom: 8 }}>설정 방법</div>
            <ol style={{ fontSize: 13, color: "#374151", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li><a href="https://search.google.com/search-console" target="_blank" rel="noopener" style={{ color: "#2563eb" }}>Google Search Console</a>에 로그인합니다.</li>
              <li>속성 추가 → URL 접두어 → 사이트 주소를 입력합니다.</li>
              <li>확인 방법에서 &quot;HTML 태그&quot;를 선택합니다.</li>
              <li>메타 태그의 <code style={{ background: "#e0f2fe", padding: "1px 4px", borderRadius: 3 }}>content</code> 값을 복사하여 위 입력란에 붙여넣기 합니다.</li>
              <li>저장 후 Google Search Console에서 &quot;확인&quot; 버튼을 클릭합니다.</li>
            </ol>
          </div>
        </div>
      </main>

      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
