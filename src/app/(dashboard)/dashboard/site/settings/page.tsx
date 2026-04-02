import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import EditSiteForm from "../edit-site-form";
import LanguageSettings from "@/components/LanguageSettings";
import DeleteSiteButton from "./delete-site-button";

interface SettingsPageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function SiteSettingsPage({ searchParams }: SettingsPageProps) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const siteId = params.id;

  const site = siteId
    ? await prisma.site.findFirst({
        where: { id: siteId, userId: session.user.id },
        include: { domains: true },
      })
    : await prisma.site.findFirst({
        where: { userId: session.user.id },
        include: { domains: true },
      });

  if (!site) {
    redirect("/dashboard");
  }

  const siteLanguages = (site as typeof site & { languages?: string[] })
    .languages || ["ko"];

  return (
    <div className="dash-page">
      {/* HEADER */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">
              HomeNShop
            </Link>
            <span className="dash-logo-sub">기본정보관리</span>
          </div>
          <div className="dash-header-right">
            <span className="dash-user-info">{site.shopId}</span>
            <Link href="/dashboard" className="dash-header-btn">
              대시보드
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="dash-main">
        {/* Site URL bar */}
        <div className="settings-url-bar">
          <div>
            <div className="settings-url-label">사이트 주소</div>
            <a
              href={`https://home.homenshop.com/${site.shopId}/${site.defaultLanguage}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="settings-url-link"
            >
              home.homenshop.com/{site.shopId}/{site.defaultLanguage}/
            </a>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span
              className={`settings-status ${site.published ? "published" : ""}`}
            >
              {site.published ? "퍼블리싱됨" : "미퍼블리싱"}
            </span>
            <Link
              href={`/dashboard/site/${site.id}/manage/menus`}
              className="settings-action-btn"
            >
              메뉴관리
            </Link>
          </div>
        </div>

        {/* Cards grid */}
        <div className="settings-grid">
          {/* 기본 정보 */}
          <div className="settings-card">
            <div className="settings-card-header orange">기본 정보</div>
            <div className="settings-card-body">
              <EditSiteForm
                site={{
                  id: site.id,
                  name: site.name,
                  description: site.description,
                  languages: siteLanguages,
                  defaultLanguage: site.defaultLanguage,
                }}
              />
            </div>
          </div>

          {/* 언어 설정 */}
          <div className="settings-card">
            <div className="settings-card-header green">언어 설정</div>
            <div className="settings-card-body">
              <LanguageSettings
                siteId={site.id}
                languages={siteLanguages}
                defaultLanguage={site.defaultLanguage}
                variant="full"
              />
            </div>
          </div>

          {/* 커스텀 도메인 */}
          <div className="settings-card">
            <div className="settings-card-header blue">커스텀 도메인</div>
            <div className="settings-card-body">
              {site.domains.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {site.domains.map((d) => (
                    <li key={d.id} className="settings-domain-item">
                      <span
                        className={`settings-domain-dot ${d.sslEnabled ? "ssl" : ""}`}
                      />
                      <span>{d.domain}</span>
                      {d.sslEnabled && (
                        <span className="settings-ssl-badge">SSL</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="settings-empty-text">연결된 도메인이 없습니다.</p>
              )}
              <div style={{ marginTop: 12 }}>
                <Link href="/dashboard/domains" className="settings-link">
                  도메인 관리 &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* 계정/만료일 */}
          <div className="settings-card">
            <div className="settings-card-header" style={{ background: "#495057" }}>계정 정보</div>
            <div className="settings-card-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#868e96" }}>계정 유형</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>
                  {site.accountType === "free" ? "무료" : site.accountType === "paid" ? "유료" : site.accountType}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#868e96" }}>만료일</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: site.expiresAt && new Date(site.expiresAt) < new Date() ? "#e03131" : "#1a1a2e" }}>
                  {site.expiresAt
                    ? new Date(site.expiresAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
                    : "무제한"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#868e96" }}>생성일</span>
                <span style={{ fontSize: 13, color: "#495057" }}>
                  {new Date(site.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                </span>
              </div>
            </div>
          </div>

          {/* Google 설정 */}
          <div className="settings-card">
            <div className="settings-card-header purple">Google 설정</div>
            <div className="settings-card-body">
              <Link
                href={`/dashboard/site/${site.id}/manage/config/analytics`}
                className="settings-menu-item"
              >
                Google Analytics
              </Link>
              <Link
                href={`/dashboard/site/${site.id}/manage/config/search-console`}
                className="settings-menu-item"
              >
                Google Search Console
              </Link>

              {/* Sitemap */}
              <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 12, paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 8 }}>Sitemap</div>
                {(() => {
                  const activeDomain = site.domains.find((d) => d.status === "ACTIVE");
                  const sitemapApiUrl = `https://homenshop.com/api/sitemap/${site.id}`;
                  const sitemapCustomUrl = activeDomain ? `https://${activeDomain.domain}/sitemap.xml` : null;
                  return (
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ color: "#868e96" }}>기본 URL: </span>
                        <a
                          href={sitemapApiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#4a90d9", wordBreak: "break-all" }}
                        >
                          {sitemapApiUrl}
                        </a>
                      </div>
                      {sitemapCustomUrl && (
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ color: "#868e96" }}>도메인 URL: </span>
                          <a
                            href={sitemapCustomUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#4a90d9", wordBreak: "break-all" }}
                          >
                            {sitemapCustomUrl}
                          </a>
                        </div>
                      )}
                      <p style={{ color: "#868e96", marginTop: 8, lineHeight: 1.5 }}>
                        Google Search Console에서 위 URL을 사이트맵으로 등록하세요.
                        {sitemapCustomUrl
                          ? " 커스텀 도메인 URL 사용을 권장합니다."
                          : " 커스텀 도메인 연결 시 도메인 URL도 생성됩니다."}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* 계정 삭제 */}
        <div className="settings-card" style={{ marginTop: 24 }}>
          <div className="settings-card-header" style={{ background: "#e03131" }}>계정 삭제</div>
          <div className="settings-card-body">
            <p style={{ fontSize: 13, color: "#868e96", marginBottom: 12 }}>
              계정을 삭제하면 모든 페이지, 게시판, 상품 데이터가 영구적으로 삭제됩니다.
            </p>
            <DeleteSiteButton siteId={site.id} shopId={site.shopId} />
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
