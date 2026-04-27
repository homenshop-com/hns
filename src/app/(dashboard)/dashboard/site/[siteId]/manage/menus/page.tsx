import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import MenuManagerClient from "./menu-manager-client";
import SignOutButton from "../../../../sign-out-button";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import "../../../../dashboard-v2.css";
import "../manage-v2.css";
import "./menus-v2.css";
import { DashboardIconSprite, Icon } from "../../../../dashboard-icons";
import DashboardShell from "../../../../dashboard-shell";

const SITE_THUMB_GRADS: Record<string, [string, string, string, string]> = {
  unionled:      ["#0a1630", "#1a3370", "#6fa0ff", "LED"],
  xunion5:       ["#1f2940", "#3a4b7a", "#ffffff", "X5"],
  bomnaldriving: ["#ffe8d4", "#ff9a5a", "#7c3a00", "🌸"],
};

function pickThumb(shopId: string): [string, string, string, string] {
  if (SITE_THUMB_GRADS[shopId]) return SITE_THUMB_GRADS[shopId];
  let h = 0;
  for (let i = 0; i < shopId.length; i++) h = ((h << 5) - h + shopId.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return [`hsl(${hue}, 40%, 22%)`, `hsl(${hue}, 45%, 40%)`, "#fff", shopId.slice(0, 2).toUpperCase()];
}

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

export default async function MenuManagerPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;

  const [site, currentUser] = await Promise.all([
    prisma.site.findUnique({
      where: { id: siteId },
      include: {
        pages: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true, title: true, slug: true, lang: true, sortOrder: true,
            isHome: true, parentId: true, showInMenu: true, menuTitle: true,
            menuType: true, externalUrl: true, seoTitle: true, seoDescription: true,
            seoKeywords: true, ogImage: true, createdAt: true, updatedAt: true,
          },
        },
        domains: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, credits: true },
    }),
  ]);

  if (!site || site.userId !== session.user.id) redirect("/dashboard");

  const siteLanguages = site.languages || ["ko"];
  const activeDomain = site.domains[0];
  const publicUrlLabel = activeDomain ? activeDomain.domain : `home.homenshop.com/${site.shopId}`;
  const siteName = site.name || site.shopId;
  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "게스트";
  const credits = currentUser?.credits ?? 0;
  const [thumbFrom, thumbTo, thumbColor, thumbLabel] = pickThumb(site.shopId);

  // Menu stats (count pages in default language)
  const defaultLangPages = site.pages.filter((p) => p.lang === site.defaultLanguage);
  const totalMenuPages = defaultLangPages.length;
  const visiblePages = defaultLangPages.filter((p) => p.showInMenu).length;
  const hiddenPages = totalMenuPages - visiblePages;

  const homePage =
    site.pages.find((p) => p.isHome && p.lang === site.defaultLanguage) ||
    site.pages.find((p) => p.isHome) ||
    site.pages[0];

  const tDash = await getTranslations("dashboard");

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: tDash("breadcrumbHome"), href: "/dashboard" },
        { label: siteName, href: `/dashboard/site/settings?id=${site.id}` },
        { label: tDash("btnData") },
      ]}
    >
          <div className="mnv2-content">
            <MenuManagerClient
              siteId={siteId}
              shopId={site.shopId}
              initialPages={site.pages}
              userName={session.user.name || ""}
              languages={siteLanguages}
              defaultLanguage={site.defaultLanguage}
              embedded
            />

            {/* Info cards — wired into real data below the manager */}
            <div className="mnv2-info-row">
              <div className="mnv2-info-card">
                <div className="ic"><Icon id="i-info" size={17} /></div>
                <div style={{ flex: 1 }}>
                  <div className="tt">메뉴 순서를 바꾸는 법</div>
                  <div className="sub">
                    항목을 드래그하거나 ▲▼ 버튼으로 이동할 수 있어요.
                    홈은 고정이며, 숨김 상태 항목은 사이트 메뉴에 노출되지 않지만
                    URL로는 접근 가능합니다.
                  </div>
                </div>
              </div>
              {hiddenPages > 0 ? (
                <Link href={`/dashboard/site/${siteId}/manage/menus`} className="mnv2-info-card ai">
                  <div className="ic"><Icon id="i-sparkle" size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="tt">숨김 페이지 {hiddenPages}개</div>
                    <div className="sub">
                      전체 {totalMenuPages}개 중 <b>{hiddenPages}개</b>가 메뉴에서 숨겨져 있습니다.
                      사용하지 않는 페이지는 정리하면 SEO에 도움이 돼요.
                    </div>
                  </div>
                  <div className="go"><Icon id="i-chev-right" size={16} /></div>
                </Link>
              ) : (
                <div className="mnv2-info-card ai">
                  <div className="ic"><Icon id="i-sparkle" size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="tt">메뉴가 깔끔해요</div>
                    <div className="sub">
                      전체 {totalMenuPages}개 페이지가 메뉴에 모두 노출 중입니다.
                      <b>AI 메뉴 정리</b>로 더 나은 순서 추천을 받아보세요.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
    </DashboardShell>
  );
}
