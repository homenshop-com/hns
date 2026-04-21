import { getTranslations } from "next-intl/server";
import PublicPageLayout from "@/components/PublicPageLayout";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return {
    title: t("pageTitle"),
    description: t("metaDescription"),
    openGraph: {
      type: "website",
      siteName: "homeNshop",
      title: t("pageTitle"),
      description: t("metaDescription"),
    },
  };
}

export default async function AboutPage() {
  const t = await getTranslations("about");
  const home = await getTranslations("home");

  return (
    <PublicPageLayout t={(key: string) => home(key as never)}>
      <section className="static-page">
        <div className="static-page-inner">
          <h1 className="static-page-title">{t("title")}</h1>
          <p className="static-page-subtitle">{t("subtitle")}</p>

          <div className="about-grid">
            <div className="about-card">
              <div className="about-icon">
                <i className="fa-solid fa-building" aria-hidden="true" />
              </div>
              <h3>{t("companyTitle")}</h3>
              <p>{t("companyDesc")}</p>
            </div>
            <div className="about-card">
              <div className="about-icon">
                <i className="fa-solid fa-bullseye" aria-hidden="true" />
              </div>
              <h3>{t("missionTitle")}</h3>
              <p>{t("missionDesc")}</p>
            </div>
            <div className="about-card">
              <div className="about-icon">
                <i className="fa-solid fa-earth-asia" aria-hidden="true" />
              </div>
              <h3>{t("globalTitle")}</h3>
              <p>{t("globalDesc")}</p>
            </div>
          </div>

          <div className="about-info-section">
            <h2>{t("infoTitle")}</h2>
            <div className="about-info-grid">
              <div className="about-info-item">
                <span className="about-info-label">{t("infoCompanyName")}</span>
                <span className="about-info-value">{t("infoCompanyValue")}</span>
              </div>
              <div className="about-info-item">
                <span className="about-info-label">{t("infoCeo")}</span>
                <span className="about-info-value">{t("infoCeoValue")}</span>
              </div>
              <div className="about-info-item">
                <span className="about-info-label">{t("infoBizNo")}</span>
                <span className="about-info-value">199-86-03387</span>
              </div>
              <div className="about-info-item">
                <span className="about-info-label">{t("infoAddress")}</span>
                <span className="about-info-value">{t("infoAddressValue")}</span>
              </div>
              <div className="about-info-item">
                <span className="about-info-label">{t("infoEmail")}</span>
                <span className="about-info-value">
                  <a href="mailto:help@homenshop.com">help@homenshop.com</a>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicPageLayout>
  );
}
