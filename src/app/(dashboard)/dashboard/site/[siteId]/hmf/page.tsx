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

  // 언어별 × 디바이스별 HMF 맵 구성
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

    // PC base
    const pcHeader = rw(hmf?.headerHtml ?? siteAny.headerHtml ?? "");
    const pcMenu   = rw(hmf?.menuHtml   ?? siteAny.menuHtml   ?? "");
    const pcFooter = rw(hmf?.footerHtml ?? siteAny.footerHtml ?? "");

    // Tablet — 없으면 PC 복사 (첫 편집 시 PC를 출발점으로)
    const tabHeader = rw(hmf?.tabletHeaderHtml ?? pcHeader);
    const tabMenu   = rw(hmf?.tabletMenuHtml   ?? pcMenu);
    const tabFooter = rw(hmf?.tabletFooterHtml ?? pcFooter);

    // Mobile — 없으면 PC 복사
    const mobHeader = rw(hmf?.mobileHeaderHtml ?? pcHeader);
    const mobMenu   = rw(hmf?.mobileMenuHtml   ?? pcMenu);
    const mobFooter = rw(hmf?.mobileFooterHtml ?? pcFooter);

    langHmfMap[lang] = {
      pc:     { headerHtml: pcHeader,  menuHtml: pcMenu,   footerHtml: pcFooter },
      tablet: { headerHtml: tabHeader, menuHtml: tabMenu,  footerHtml: tabFooter },
      mobile: { headerHtml: mobHeader, menuHtml: mobMenu,  footerHtml: mobFooter },
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
