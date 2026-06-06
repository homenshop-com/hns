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

  // 언어별 HMF 맵 구성
  const langHmfMap: Record<
    string,
    { headerHtml: string; menuHtml: string; footerHtml: string }
  > = {};
  for (const lang of siteLanguages) {
    const hmf =
      site.hmfTranslations?.find((h) => h.lang === lang) ||
      site.hmfTranslations?.find((h) => h.lang === site.defaultLanguage);
    langHmfMap[lang] = {
      headerHtml: hmf?.headerHtml ?? (site as any).headerHtml ?? "",
      menuHtml: hmf?.menuHtml || (site as any).menuHtml || "",
      footerHtml: hmf?.footerHtml ?? (site as any).footerHtml ?? "",
    };
  }

  const templatePath = (site as any).templatePath || "";
  const rawTemplateCss = templatePath ? readTemplateCss(templatePath) : "";
  const cssText = (site as any).cssText || "";

  // 에셋 URL 절대화 (published route / page editor와 동일 처리)
  if (templatePath) {
    for (const lang of Object.keys(langHmfMap)) {
      const h = langHmfMap[lang];
      h.headerHtml = rewriteAssetUrls(h.headerHtml, templatePath);
      h.menuHtml = rewriteAssetUrls(h.menuHtml, templatePath);
      h.footerHtml = rewriteAssetUrls(h.footerHtml, templatePath);
    }
  }

  const isModernCanvas =
    cssText.includes("/* HNS-MODERN-TEMPLATE */") ||
    cssText.includes("calc(-50vw + 50%)");

  // 캔버스 기준폭 (legacy 사이트 중 1000px 초과 레이아웃 대응)
  const designCanvasWidth = (() => {
    if (isModernCanvas) return null;
    const sources = [cssText, rawTemplateCss].filter(Boolean).join("\n");
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

  return (
    <HmfEditor
      siteId={site.id}
      shopId={(site as any).shopId}
      siteName={(site as any).name || (site as any).shopId}
      defaultLanguage={site.defaultLanguage}
      siteLanguages={siteLanguages}
      langHmfMap={langHmfMap}
      templateCss={rawTemplateCss}
      cssText={cssText}
      templatePath={templatePath}
      isModernCanvas={isModernCanvas}
      designCanvasWidth={designCanvasWidth}
    />
  );
}
