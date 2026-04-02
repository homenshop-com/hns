import Link from "next/link";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
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

export default async function Home() {
  const session = await auth();
  const t = await getTranslations("home");

  if (session) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }

  return (
    <div className="landing-page">
      {/* NAVBAR */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            Homenshop
          </Link>
          <div className="lp-nav-links">
            <a href="#features">{t("navFeatures")}</a>
            <a href="#how-it-works">{t("navHowItWorks")}</a>
            <a href="#pricing">{t("navPricing")}</a>
            <Link href="/about">{t("navAbout")}</Link>
          </div>
          <div className="lp-nav-actions">
            <Link href="/login" className="btn btn-ghost">
              {t("navLogin")}
            </Link>
            <Link href="/register" className="btn btn-primary">
              {t("navStart")}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="hero-badge">{t("heroBadge")}</div>
          <h1 className="hero-title">
            {t("heroTitle")
              .split(t("heroHighlight"))
              .map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>
                    {part}
                    <span className="hero-highlight">{t("heroHighlight")}</span>
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
          </h1>
          <p className="hero-sub">{t("heroSub")}</p>
          <div className="hero-actions">
            <Link href="/register" className="btn btn-primary btn-primary-lg">
              {t("heroBtnCreate")}
            </Link>
            <a href="#features" className="btn btn-outline-lg">
              {t("heroBtnFeatures")}
            </a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-num">{t("statEasy")}</div>
              <div className="hero-stat-label">{t("statEasyLabel")}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{t("statTemplates")}</div>
              <div className="hero-stat-label">{t("statTemplatesLabel")}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{t("statMobile")}</div>
              <div className="hero-stat-label">{t("statMobileLabel")}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{t("statMultilang")}</div>
              <div className="hero-stat-label">{t("statMultilangLabel")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-section" id="features">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-eyebrow">{t("featEyebrow")}</div>
            <h2 className="section-title">{t("featTitle")}</h2>
            <p className="section-sub">{t("featSub")}</p>
          </div>
          <div className="features-grid">
            {[
              { icon: "\u{1F3A8}", color: "blue", n: 1 },
              { icon: "\u{1F4F1}", color: "green", n: 2 },
              { icon: "\u270E", color: "purple", n: 3 },
              { icon: "\u{1F310}", color: "orange", n: 4 },
              { icon: "\u{1F517}", color: "pink", n: 5 },
              { icon: "\u2601", color: "teal", n: 6 },
            ].map(({ icon, color, n }) => (
              <div key={n} className="feature-card">
                <div className={`feature-icon ${color}`}>{icon}</div>
                <div className="feature-title">
                  {t(`feat${n}Title` as never)}
                </div>
                <p className="feature-desc">{t(`feat${n}Desc` as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-section lp-section-alt" id="how-it-works">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-eyebrow">{t("stepsEyebrow")}</div>
            <h2 className="section-title">{t("stepsTitle")}</h2>
            <p className="section-sub">{t("stepsSub")}</p>
          </div>
          <div className="steps-grid">
            {[1, 2, 3].map((n) => (
              <div key={n} className="step-card">
                <div className="step-num">{n}</div>
                <div className="step-title">
                  {t(`step${n}Title` as never)}
                </div>
                <p className="step-desc">{t(`step${n}Desc` as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="lp-section lp-section-alt" id="pricing">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-eyebrow">{t("pricingEyebrow")}</div>
            <h2 className="section-title">{t("pricingTitle")}</h2>
            <p className="section-sub">{t("pricingSub")}</p>
          </div>
          <div className="pricing-grid">
            <div className="pricing-card featured">
              <div className="pricing-badge">{t("pricingBadge")}</div>
              <div className="pricing-plan">{t("pricingPlan")}</div>
              <div className="pricing-price">
                {t("pricingPrice")}{" "}
                <span className="pricing-price-unit">{t("pricingUnit")}</span>
              </div>
              <div className="pricing-period">{t("pricingPeriod")}</div>
              <ul className="pricing-features">
                <li>{t("pricingFeatSubdomain")}</li>
                <li>{t("pricingFeatTemplates")}</li>
                <li>{t("pricingFeatMobile")}</li>
                <li>{t("pricingFeatEditor")}</li>
                <li>{t("pricingFeatDomain")}</li>
                <li>{t("pricingFeatNoAd")}</li>
              </ul>
              <Link
                href="/register"
                className="pricing-btn pricing-btn-solid"
              >
                {t("pricingBtn")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="lp-cta-banner">
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 className="cta-title">{t("ctaTitle")}</h2>
          <p className="cta-sub">{t("ctaSub")}</p>
          <Link
            href="/register"
            className="btn btn-primary btn-primary-lg"
            style={{ display: "inline-block" }}
          >
            {t("ctaBtn")}
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="footer-logo">Homenshop</div>
          <div className="footer-links">
            <Link href="/login">{t("footerLogin")}</Link>
            <Link href="/register">{t("footerSignup")}</Link>
            <a href="#features">{t("footerFeatures")}</a>
            <a href="#pricing">{t("footerPricing")}</a>
          </div>
        </div>
        <div className="lp-footer-inner">
          <p className="footer-copy">
            &copy; {new Date().getFullYear()} homenshop.com. All rights
            reserved.
          </p>
          <div className="footer-info">
            {t("footerCompany")}
            <span className="sep">|</span>
            {t("footerBizNo")}
            <span className="sep">|</span>
            {t("footerCeo")}
            <br />
            {t("footerAddress")}
            <span className="sep">|</span>
            <Link href="/terms">{t("footerTerms")}</Link>
            <span className="sep">|</span>
            <Link href="/privacy">{t("footerPrivacy")}</Link>
            <br />
            {t("footerContact")}{" "}
            <a href="mailto:help@homenshop.com">help@homenshop.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
