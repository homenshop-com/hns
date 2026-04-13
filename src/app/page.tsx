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
    alternates: {
      canonical: "https://homenshop.com",
    },
    openGraph: {
      type: "website",
      siteName: "homeNshop",
      title: t("pageTitle"),
      description: t("metaDescription"),
      url: "https://homenshop.com",
    },
    other: {
      "ai:description": "homeNshop is a multilingual website builder for Korean SMEs preparing for global export. Users create product catalogs and company pages in English, Chinese, Japanese, Spanish without coding. Key features: drag-and-drop editor, 100+ templates, mobile responsive, custom domain, multilingual support. Pricing: 66,000 KRW/year. Target: Korean small businesses using KOTRA, trade associations, export voucher programs.",
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "homeNshop",
    applicationCategory: "WebApplication",
    applicationSubCategory: "Website Builder",
    operatingSystem: "Web",
    url: "https://homenshop.com",
    description: "Multilingual website builder for Korean SMEs preparing for global export. Create product catalogs and company pages in English, Chinese, Japanese, Spanish — no coding required.",
    featureList: [
      "Multilingual website (Korean, English, Chinese, Japanese, Spanish)",
      "Product catalog management",
      "Drag-and-drop page editor",
      "100+ design templates",
      "Mobile responsive design",
      "Custom domain binding",
      "No coding required",
    ],
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Korean small and medium enterprises preparing for export",
    },
    offers: {
      "@type": "Offer",
      price: "66000",
      priceCurrency: "KRW",
      priceValidUntil: "2027-12-31",
      description: "Annual premium plan",
    },
    provider: {
      "@type": "Organization",
      name: "homeNshop",
      url: "https://homenshop.com",
      logo: "https://homenshop.com/favicon.ico",
      contactPoint: {
        "@type": "ContactPoint",
        email: "help@homenshop.com",
        contactType: "customer service",
        availableLanguage: ["Korean", "English", "Japanese", "Chinese", "Spanish"],
      },
    },
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "homeNshop",
    legalName: "(주)홈앤샵",
    url: "https://homenshop.com",
    logo: "https://homenshop.com/favicon.ico",
    description: "Multilingual website builder for Korean export SMEs. Create product catalogs in buyer languages without coding.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "400 World Cup North-ro, Seoul Economic Promotion Agency 2F A-425",
      addressLocality: "Mapo-gu",
      addressRegion: "Seoul",
      addressCountry: "KR",
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: "help@homenshop.com",
      contactType: "customer service",
      availableLanguage: ["Korean", "English", "Japanese", "Chinese", "Spanish"],
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is homeNshop?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "homeNshop is a multilingual website builder designed for Korean small and medium businesses preparing for global export. It allows you to create product catalogs and company introduction pages in English, Chinese, Japanese, Spanish, and more — without any coding.",
        },
      },
      {
        "@type": "Question",
        name: "Who is homeNshop for?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "homeNshop is built for Korean SMEs that need multilingual websites to reach overseas buyers. It's ideal for companies using KOTRA services, trade associations, or export voucher programs.",
        },
      },
      {
        "@type": "Question",
        name: "What languages does homeNshop support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "homeNshop supports Korean, English, Chinese (Simplified & Traditional), Japanese, and Spanish. You can create pages in multiple languages simultaneously.",
        },
      },
    ],
  };

  return (
    <div className="landing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* NAVBAR */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            homeNshop
          </Link>
          <div className="lp-nav-links">
            <a href="#solution">{t("solutionEyebrow")}</a>
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

      {/* SOLUTION */}
      <section className="lp-solution" id="solution">
        <div className="section-inner">
          <div className="section-header">
            <div className="section-eyebrow">{t("solutionEyebrow")}</div>
            <h2 className="section-title" style={{ whiteSpace: "pre-line" }}>{t("solutionTitle")}</h2>
            <p className="solution-desc">{t("solutionDesc")}</p>
          </div>
          <div className="solution-points">
            {[
              { icon: "\u{1F30D}", n: 1 },
              { icon: "\u{1F6E0}\uFE0F", n: 2 },
              { icon: "\u{1F3AF}", n: 3 },
            ].map(({ icon, n }) => (
              <div key={n} className="solution-point">
                <div className="solution-point-icon">{icon}</div>
                <div>
                  <div className="solution-point-title">
                    {t(`solutionPoint${n}Title` as never)}
                  </div>
                  <p className="solution-point-desc">
                    {t(`solutionPoint${n}Desc` as never)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="solution-sub">{t("solutionSub")}</p>
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
              { icon: "\u{1F50D}", color: "red", n: 7 },
              { icon: "\u{1F916}", color: "violet", n: 8 },
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
          <div className="pricing-grid pricing-grid-4">
            {/* FREE */}
            <div className="pricing-card">
              <div className="pricing-plan">{t("pricingFreePlan")}</div>
              <div className="pricing-price">
                {t("pricingFreePrice")}
              </div>
              <div className="pricing-period">{t("pricingFreePeriod")}</div>
              <ul className="pricing-features">
                <li>{t("pricingFeatSubdomain")}</li>
                <li>{t("pricingFeatTemplates")}</li>
                <li>{t("pricingFeatMobile")}</li>
                <li>{t("pricingFeatEditor")}</li>
              </ul>
              <Link href="/register" className="pricing-btn pricing-btn-outline">
                {t("pricingFreeBtn")}
              </Link>
            </div>

            {/* 1 YEAR */}
            <div className="pricing-card featured">
              <div className="pricing-badge">{t("pricingBadge")}</div>
              <div className="pricing-plan">{t("pricing1yrPlan")}</div>
              <div className="pricing-price">
                {t("pricing1yrPrice")}<span className="pricing-price-unit">{t("pricingWon")}</span>
              </div>
              <div className="pricing-period">{t("pricing1yrPeriod")}</div>
              <ul className="pricing-features">
                <li>{t("pricingFeatSubdomain")}</li>
                <li>{t("pricingFeatTemplates")}</li>
                <li>{t("pricingFeatMobile")}</li>
                <li>{t("pricingFeatEditor")}</li>
                <li>{t("pricingFeatDomain")}</li>
                <li>{t("pricingFeatNoAd")}</li>
              </ul>
              <Link href="/register" className="pricing-btn pricing-btn-solid">
                {t("pricingBtn")}
              </Link>
            </div>

            {/* 2 YEAR */}
            <div className="pricing-card">
              <div className="pricing-discount-badge">{t("pricing2yrDiscount")}</div>
              <div className="pricing-plan">{t("pricing2yrPlan")}</div>
              <div className="pricing-price">
                {t("pricing2yrPrice")}<span className="pricing-price-unit">{t("pricingWon")}</span>
              </div>
              <div className="pricing-period">{t("pricing2yrPeriod")}</div>
              <ul className="pricing-features">
                <li>{t("pricingFeatSubdomain")}</li>
                <li>{t("pricingFeatTemplates")}</li>
                <li>{t("pricingFeatMobile")}</li>
                <li>{t("pricingFeatEditor")}</li>
                <li>{t("pricingFeatDomain")}</li>
                <li>{t("pricingFeatNoAd")}</li>
              </ul>
              <Link href="/register" className="pricing-btn pricing-btn-outline">
                {t("pricingBtn")}
              </Link>
            </div>

            {/* 3 YEAR */}
            <div className="pricing-card">
              <div className="pricing-discount-badge">{t("pricing3yrDiscount")}</div>
              <div className="pricing-plan">{t("pricing3yrPlan")}</div>
              <div className="pricing-price">
                {t("pricing3yrPrice")}<span className="pricing-price-unit">{t("pricingWon")}</span>
              </div>
              <div className="pricing-period">{t("pricing3yrPeriod")}</div>
              <ul className="pricing-features">
                <li>{t("pricingFeatSubdomain")}</li>
                <li>{t("pricingFeatTemplates")}</li>
                <li>{t("pricingFeatMobile")}</li>
                <li>{t("pricingFeatEditor")}</li>
                <li>{t("pricingFeatDomain")}</li>
                <li>{t("pricingFeatNoAd")}</li>
              </ul>
              <Link href="/register" className="pricing-btn pricing-btn-outline">
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
          <div className="footer-logo">homeNshop</div>
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
