import { getTranslations } from "next-intl/server";
import PublicPageLayout from "@/components/PublicPageLayout";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
  return {
    title: t("pageTitle"),
    description: t("metaDescription"),
  };
}

export default async function TermsPage() {
  const t = await getTranslations("terms");
  const home = await getTranslations("home");

  return (
    <PublicPageLayout t={(key: string) => home(key as never)}>
      <section className="static-page">
        <div className="static-page-inner legal-page">
          <h1 className="static-page-title">{t("title")}</h1>
          <p className="legal-updated">{t("lastUpdated")}</p>

          <div className="legal-content">
            <h2>{t("section1Title")}</h2>
            <p>{t("section1Content")}</p>

            <h2>{t("section2Title")}</h2>
            <p>{t("section2Content")}</p>

            <h2>{t("section3Title")}</h2>
            <p>{t("section3Content")}</p>

            <h2>{t("section4Title")}</h2>
            <p>{t("section4Content")}</p>

            <h2>{t("section5Title")}</h2>
            <p>{t("section5Content")}</p>

            <h2>{t("section6Title")}</h2>
            <p>{t("section6Content")}</p>

            <h2>{t("section7Title")}</h2>
            <p>{t("section7Content")}</p>
          </div>
        </div>
      </section>
    </PublicPageLayout>
  );
}
