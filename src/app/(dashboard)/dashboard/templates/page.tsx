import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TemplateGallery from "./template-gallery";
import { getSettingBool } from "@/lib/settings";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; keyword?: string; type?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  // Check email verification status
  const emailVerificationEnabled = await getSettingBool("emailVerificationEnabled");
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, email: true },
  });

  const isDemoAccount = currentUser?.email === "demo@demo.com";

  const t = await getTranslations("dashboard");
  const tTpl = await getTranslations("templates");
  const tFooter = await getTranslations("home");

  const params = await searchParams;
  const sort = params.sort || "newest";
  const keyword = params.keyword || "";
  // type filter: "" (all) | "responsive" | "fixed"
  const typeFilter = params.type === "responsive" || params.type === "fixed" ? params.type : "";

  // Keyword OR (may be combined with visibility OR via AND below)
  const keywordOr = keyword
    ? [
        { name: { contains: keyword, mode: "insensitive" as const } },
        { keywords: { contains: keyword, mode: "insensitive" as const } },
        { description: { contains: keyword, mode: "insensitive" as const } },
      ]
    : null;

  // Build sort order (sortOrder = 1000 - legacyUid, so asc = newest first)
  type OrderBy = Record<string, string>;
  let orderBy: OrderBy;
  switch (sort) {
    case "oldest":
      orderBy = { sortOrder: "desc" };
      break;
    case "name":
      orderBy = { name: "asc" };
      break;
    case "popular":
      orderBy = { clicks: "desc" };
      break;
    case "newest":
    default:
      orderBy = { sortOrder: "asc" };
      break;
  }

  // Public templates = system templates (no owner) OR user-contributed templates flagged public
  const visibilityOr = [
    { userId: null },
    { isPublic: true },
  ];
  const typeWhere =
    typeFilter === "responsive" ? { isResponsive: true }
    : typeFilter === "fixed" ? { isResponsive: false }
    : null;
  const andClauses: Array<Record<string, unknown>> = [{ OR: visibilityOr }];
  if (keywordOr) andClauses.push({ OR: keywordOr });
  if (typeWhere) andClauses.push(typeWhere);
  const publicWhere = {
    isActive: true,
    AND: andClauses,
  };
  const templates = await prisma.template.findMany({
    where: publicWhere,
    orderBy,
  });

  // User's own templates (stays visible here even when flipped public,
  // so the owner can still manage / revoke)
  const myTemplates = await prisma.template.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="dash-page">
      {/* HEADER */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">
              homeNshop
            </Link>
            <span className="dash-logo-sub">{t("title")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">
              {t("dashboard")}
            </Link>
            <Link href="/dashboard/profile" className="dash-header-btn">
              {t("memberInfo")}
            </Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* BREADCRUMB */}
      <div className="dash-main">
        <div className="tpl-breadcrumb">
          <Link href="/dashboard">{tTpl("breadcrumbHome")}</Link>
          <span className="sep">&gt;</span>
          {tTpl("breadcrumbTemplates")}
        </div>

        {/* TEMPLATE GALLERY */}
        <TemplateGallery
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            path: t.path,
            thumbnailUrl: t.thumbnailUrl,
            category: t.category,
            price: t.price,
            isResponsive: t.isResponsive,
          }))}
          myTemplates={myTemplates.map((t) => ({
            id: t.id,
            name: t.name,
            path: t.path,
            thumbnailUrl: t.thumbnailUrl,
            category: t.category,
            price: t.price,
            isPublic: t.isPublic,
            demoSiteId: t.demoSiteId,
            isResponsive: t.isResponsive,
          }))}
          totalCount={templates.length}
          currentSort={sort}
          currentKeyword={keyword}
          currentType={typeFilter}
          emailVerified={!emailVerificationEnabled || !!currentUser?.emailVerified || isDemoAccount}
          labels={{
            total: tTpl("total"),
            count: tTpl("count"),
            selectTemplate: tTpl("selectTemplate"),
            free: tTpl("free"),
            search: tTpl("search"),
            keyword: tTpl("keyword"),
            sortNewest: tTpl("sortNewest"),
            sortOldest: tTpl("sortOldest"),
            sortName: tTpl("sortName"),
            sortPopular: tTpl("sortPopular"),
            freeDesign: tTpl("freeDesign"),
            paidDesign: tTpl("paidDesign"),
            selectDesign: tTpl("selectDesign"),
            templateNotice1: tTpl("templateNotice1"),
            templateNotice2: tTpl("templateNotice2"),
            defaultLanguage: tTpl("defaultLanguage"),
            subdomainSetup: tTpl("subdomainSetup"),
            subdomainPrefix: tTpl("subdomainPrefix"),
            subdomainHint: tTpl("subdomainHint"),
            createSite: tTpl("createSite"),
            creating: tTpl("creating"),
            langKo: tTpl("langKo"),
            langEn: tTpl("langEn"),
            langZhCn: tTpl("langZhCn"),
            langJa: tTpl("langJa"),
            langZhTw: tTpl("langZhTw"),
            langEs: tTpl("langEs"),
            errorShopIdRequired: tTpl("errorShopIdRequired"),
            errorShopIdFormat: tTpl("errorShopIdFormat"),
            errorShopIdTaken: tTpl("errorShopIdTaken"),
            errorAlreadyHasSite: tTpl("errorAlreadyHasSite"),
            tabPublic: tTpl("tabPublic"),
            tabMy: tTpl("tabMy"),
            myTemplatesEmpty: tTpl("myTemplatesEmpty"),
            uploadTemplate: tTpl("uploadTemplate"),
            templateName: tTpl("templateName"),
            templateNamePlaceholder: tTpl("templateNamePlaceholder"),
            htmlFiles: tTpl("htmlFiles"),
            cssFile: tTpl("cssFile"),
            assetFiles: tTpl("assetFiles"),
            uploading: tTpl("uploading"),
            uploadSuccess: tTpl("uploadSuccess"),
            uploadError: tTpl("uploadError"),
            deleteTemplate: tTpl("deleteTemplate"),
            deleteConfirm: tTpl("deleteConfirm"),
            emailVerifyRequired: tTpl("emailVerifyRequired"),
            emailVerifyMessage: tTpl("emailVerifyMessage"),
            emailVerifyResend: tTpl("emailVerifyResend"),
            emailVerifySent: tTpl("emailVerifySent"),
          }}
        />
      </div>

      {/* FOOTER */}
      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>
            &copy; {new Date().getFullYear()} homenshop.com. All rights
            reserved.
          </p>
          <p>
            {tFooter("footerCompany")} | {tFooter("footerBizNo")} |{" "}
            {tFooter("footerCeo")}
            <br />
            {tFooter("footerAddress")} |{" "}
            <Link href="/terms">{tFooter("footerTerms")}</Link> |{" "}
            <Link href="/privacy">{tFooter("footerPrivacy")}</Link>
            <br />
            {tFooter("footerContact")}{" "}
            <a href="mailto:help@homenshop.com">help@homenshop.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
