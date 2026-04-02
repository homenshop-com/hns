import Link from "next/link";
import { getTranslations } from "next-intl/server";
import PublicPageLayout from "@/components/PublicPageLayout";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  return {
    title: t("pageTitle"),
    description: t("metaDescription"),
    openGraph: {
      type: "website",
      siteName: "Homenshop",
      title: t("pageTitle"),
      description: t("metaDescription"),
    },
  };
}

export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const home = await getTranslations("home");

  return (
    <PublicPageLayout t={(key: string) => home(key as never)}>
      <section className="static-page">
        <div className="static-page-inner">
          <div className="section-header">
            <h1 className="static-page-title">{t("title")}</h1>
            <p className="static-page-subtitle">{t("subtitle")}</p>
          </div>

          <div className="pricing-grid" style={{ marginTop: 40 }}>
            {/* Free Plan */}
            <div className="pricing-card">
              <div className="pricing-plan">{t("freePlan")}</div>
              <div className="pricing-price">
                {t("freePrice")}{" "}
              </div>
              <div className="pricing-period">{t("freePeriod")}</div>
              <ul className="pricing-features">
                <li>{t("freeFeat1")}</li>
                <li>{t("freeFeat2")}</li>
                <li>{t("freeFeat3")}</li>
                <li>{t("freeFeat4")}</li>
              </ul>
              <Link href="/register" className="pricing-btn pricing-btn-outline">
                {t("freeBtn")}
              </Link>
            </div>

            {/* Premium Plan */}
            <div className="pricing-card featured">
              <div className="pricing-badge">{t("premiumBadge")}</div>
              <div className="pricing-plan">{t("premiumPlan")}</div>
              <div className="pricing-price">
                {t("premiumPrice")}{" "}
                <span className="pricing-price-unit">{t("premiumUnit")}</span>
              </div>
              <div className="pricing-period">{t("premiumPeriod")}</div>
              <ul className="pricing-features">
                <li>{t("premiumFeat1")}</li>
                <li>{t("premiumFeat2")}</li>
                <li>{t("premiumFeat3")}</li>
                <li>{t("premiumFeat4")}</li>
                <li>{t("premiumFeat5")}</li>
                <li>{t("premiumFeat6")}</li>
              </ul>
              <Link
                href="/register"
                className="pricing-btn pricing-btn-solid"
              >
                {t("premiumBtn")}
              </Link>
            </div>
          </div>

          <div className="pricing-faq">
            <h2>{t("faqTitle")}</h2>
            <div className="faq-list">
              <div className="faq-item">
                <h3>{t("faq1Q")}</h3>
                <p>{t("faq1A")}</p>
              </div>
              <div className="faq-item">
                <h3>{t("faq2Q")}</h3>
                <p>{t("faq2A")}</p>
              </div>
              <div className="faq-item">
                <h3>{t("faq3Q")}</h3>
                <p>{t("faq3A")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicPageLayout>
  );
}
