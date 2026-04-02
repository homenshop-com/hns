import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";

interface PublicPageLayoutProps {
  t: (key: string) => string;
  children: React.ReactNode;
}

export default function PublicPageLayout({ t, children }: PublicPageLayoutProps) {
  return (
    <div className="landing-page">
      {/* NAVBAR */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            Homenshop
          </Link>
          <div className="lp-nav-links">
            <Link href="/about">{t("navAbout")}</Link>
            <Link href="/pricing">{t("navPricing")}</Link>
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

      {/* PAGE CONTENT */}
      {children}

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="footer-logo">Homenshop</div>
          <div className="footer-links">
            <Link href="/login">{t("footerLogin")}</Link>
            <Link href="/register">{t("footerSignup")}</Link>
            <Link href="/about">{t("navAbout")}</Link>
            <Link href="/pricing">{t("footerPricing")}</Link>
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
