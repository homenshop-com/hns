import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readTemplateCss, rewriteAssetUrls } from "@/lib/template-parser";
import { getManageScope, canManage } from "@/lib/site-access";
import HmfEditor from "./hmf-editor";

interface Props {
  params: Promise<{ siteId: string }>;
}

/** 헤더/풋터 전용 편집기 페이지.
 *  페이지 에디터와 달리 body 영역은 비활성화(플레이스홀더)되고,
 *  header/menu/footer 만 드래그·리사이즈 편집 가능.
 *  저장 시 SiteHmf에 기록 → 모든 페이지에 즉시 적용.
 *  절대좌표 모드 사이트는 PC/Tablet/Mobile 디바이스별 독립 편집 지원.
 *
 *  menuHtml은 published route와 동일하게 #hns_header 안에 주입하여 렌더링함
 *  (WYSIWYG 일치). 에디터에서 headerRef = headerHtml + menuHtml 합산.
 */
export default async function HmfEditorPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      hmfTranslations: true,
      user: { select: { resellerId: true } },
    },
  });

  const scope = await getManageScope();
  if (
    !site ||
    !scope ||
    !canManage(scope, {
      userId: site.userId,
      ownerResellerId: site.user.resellerId,
    })
  ) {
    redirect("/dashboard");
  }

  const siteLanguages =
    (site as typeof site & { languages?: string[] }).languages || ["ko"];

  const editorMode = (site as unknown as { editorMode?: string | null }).editorMode ?? null;
  const templatePath = (site as unknown as { templatePath?: string }).templatePath || "";
  const rawTemplateCss = templatePath ? readTemplateCss(templatePath) : "";
  const cssText = (site as unknown as { cssText?: string }).cssText || "";

  const isModernCanvas =
    cssText.includes("/* HNS-MODERN-TEMPLATE */") ||
    cssText.includes("calc(-50vw + 50%)");

  // 캔버스 기준폭 (legacy 사이트 중 1000px 초과 레이아웃 대응)
  // 페이지별 CSS에도 width 오버라이드가 있을 수 있으므로 첫 번째 페이지 CSS도 검색
  const firstPageCss = await (async () => {
    if (isModernCanvas) return "";
    try {
      const firstPage = await prisma.page.findFirst({
        where: { siteId, lang: site.defaultLanguage },
        select: { css: true },
        orderBy: { sortOrder: "asc" },
      });
      return firstPage?.css ?? "";
    } catch {
      return "";
    }
  })();

  const designCanvasWidth = (() => {
    if (isModernCanvas) return null;
    const sources = [cssText, rawTemplateCss, firstPageCss].filter(Boolean).join("\n");
    const re =
      /(?:#v_home_dft|\.c_v_home_dft)\s*\{[^}]*?(?<![a-z-])width\s*:\s*(\d+)px/gi;
    let max = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sources)) !== null) {
      const w = parseInt(m[1], 10);
      if (w > max) max = w;
    }
    return max > 1000 ? max : null;
  })();

  /** asset URL을 절대 경로로 변환하는 헬퍼 */
  const rw = (html: string) =>
    templatePath ? rewriteAssetUrls(html, templatePath) : html;

  // ────────────────────────────────────────────────
  // 메뉴 아이템 생성 (published route와 동일 로직)
  // 에디터에서 nav widget 안의 mainmenu 를 채워 WYSIWYG 표시
  // ────────────────────────────────────────────────
  const SKIP_SLUGS = new Set(["user", "users", "agreement", "empty"]);

  // 전체 언어 페이지 한 번에 로드
  const allPages = await prisma.page.findMany({
    where: { siteId },
    select: {
      id: true, title: true, menuTitle: true, slug: true,
      isHome: true, parentId: true, sortOrder: true,
      showInMenu: true, lang: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  /** 해당 언어의 showInMenu 페이지 → ul.mainmenu 용 <li> 문자열 */
  function buildMenuItems(lang: string): string {
    const langPages = allPages.filter(
      (p) => p.lang === lang || p.lang === site!.defaultLanguage
    );
    const visible = langPages.filter(
      (p) => p.showInMenu !== false && !SKIP_SLUGS.has(p.slug)
    );
    const topLevel = visible.filter((p) => !p.parentId);
    return topLevel
      .map((p) => {
        const label = (p.menuTitle || p.title).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        return `<li><a href="#" title="${label}">${label}</a></li>`;
      })
      .join("");
  }

  /**
   * headerHtml + menuHtml 를 합쳐 헤더 하나로 통합.
   * published route 는 menuHtml 을 #hns_header 안에 렌더링하므로
   * 에디터도 같은 구조로 맞춘다.
   *
   * menuHtml 을 headerHtml 뒤에 이어 붙인 결과를 반환하고,
   * 합산된 HTML 안의 ul.mainmenu 를 실제 메뉴 아이템으로 채워준다.
   */
  function combineAndEnrich(
    header: string,
    menu: string,
    menuItemsHtml: string
  ): string {
    // header + menu 통합 (published route: ${headerHtml}${menuHtml} inside #hns_header)
    const combined = header + menu;
    if (!menuItemsHtml) return combined;
    // ul.mainmenu 가 있으면 내용을 현재 페이지 목록으로 교체
    return combined.replace(
      /(<ul[^>]*class="mainmenu"[^>]*>)([\s\S]*?)(<\/ul>)/i,
      (_m, open, _old, close) => `${open}${menuItemsHtml}${close}`
    );
  }

  // ────────────────────────────────────────────────
  // 언어별 × 디바이스별 HMF 맵 구성
  // ────────────────────────────────────────────────
  const langHmfMap: Record<
    string,
    {
      pc: { headerHtml: string; menuHtml: string; footerHtml: string };
      tablet: { headerHtml: string; menuHtml: string; footerHtml: string };
      mobile: { headerHtml: string; menuHtml: string; footerHtml: string };
    }
  > = {};

  for (const lang of siteLanguages) {
    const hmf =
      site.hmfTranslations?.find((h) => h.lang === lang) ||
      site.hmfTranslations?.find((h) => h.lang === site.defaultLanguage);

    const siteAny = site as unknown as Record<string, string | null | undefined>;
    const menuItems = buildMenuItems(lang);

    // PC base
    const pcHeaderRaw = rw(hmf?.headerHtml ?? siteAny.headerHtml ?? "");
    const pcMenuRaw   = rw(hmf?.menuHtml   ?? siteAny.menuHtml   ?? "");
    const pcFooter    = rw(hmf?.footerHtml ?? siteAny.footerHtml ?? "");
    // published route 와 동일하게 menu 를 header 안으로 통합
    const pcHeader    = combineAndEnrich(pcHeaderRaw, pcMenuRaw, menuItems);

    // Tablet — 없으면 PC 복사 (첫 편집 시 PC를 출발점으로)
    const tabHeaderRaw = rw(hmf?.tabletHeaderHtml ?? pcHeaderRaw);
    const tabMenuRaw   = rw(hmf?.tabletMenuHtml   ?? pcMenuRaw);
    const tabHeader    = combineAndEnrich(tabHeaderRaw, tabMenuRaw, menuItems);
    const tabFooter    = rw(hmf?.tabletFooterHtml ?? pcFooter);

    // Mobile — 없으면 PC 복사
    const mobHeaderRaw = rw(hmf?.mobileHeaderHtml ?? pcHeaderRaw);
    const mobMenuRaw   = rw(hmf?.mobileMenuHtml   ?? pcMenuRaw);
    const mobHeader    = combineAndEnrich(mobHeaderRaw, mobMenuRaw, menuItems);
    const mobFooter    = rw(hmf?.mobileFooterHtml ?? pcFooter);

    langHmfMap[lang] = {
      // menuHtml 은 header 안으로 통합했으므로 빈 문자열 전달
      pc:     { headerHtml: pcHeader,  menuHtml: "", footerHtml: pcFooter },
      tablet: { headerHtml: tabHeader, menuHtml: "", footerHtml: tabFooter },
      mobile: { headerHtml: mobHeader, menuHtml: "", footerHtml: mobFooter },
    };
  }

  return (
    <HmfEditor
      siteId={site.id}
      shopId={(site as unknown as { shopId?: string }).shopId ?? ""}
      siteName={
        (site as unknown as { name?: string }).name ||
        (site as unknown as { shopId?: string }).shopId ||
        ""
      }
      defaultLanguage={site.defaultLanguage}
      siteLanguages={siteLanguages}
      langHmfMap={langHmfMap}
      templateCss={rawTemplateCss}
      cssText={cssText}
      templatePath={templatePath}
      isModernCanvas={isModernCanvas}
      designCanvasWidth={designCanvasWidth}
      editorMode={editorMode}
    />
  );
}
