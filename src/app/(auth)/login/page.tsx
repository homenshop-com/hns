"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import Turnstile from "@/components/turnstile";

const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// The canonical host where the Turnstile site key is valid. White-label reseller
// domains serve the same login page, but the widget can't mint a token there
// (site keys are hostname-bound), so we only render/require Turnstile on the
// canonical host — mirroring the server-side gate in src/lib/auth.ts.
const CANONICAL_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://homenshop.com")
      .host.replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "homenshop.com";
  }
})();

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  // Tokens are one-shot — on failed login we bump this key to remount the
  // widget and obtain a fresh token for the next attempt.
  const [turnstileKey, setTurnstileKey] = useState(0);
  // Whether Turnstile is actually active for THIS host. Only the canonical host
  // (where the site key is valid) renders the widget and requires a token; on
  // reseller white-label domains it stays off so login isn't blocked.
  const [turnstileActive, setTurnstileActive] = useState(false);
  const t = useTranslations("auth.login");

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    const host = window.location.hostname.replace(/^www\./, "").toLowerCase();
    setTurnstileActive(host === CANONICAL_HOST);
  }, []);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  // Pre-fill email from URL params (impersonation or post-registration).
  // For impersonation flow, fetch the master password from an admin-only
  // endpoint rather than hardcoding. Non-admin sessions (or no session)
  // get a 401/403 and simply leave the password field blank — the admin
  // can still type it manually on another browser.
  useEffect(() => {
    const paramEmail = searchParams.get("email");
    if (!paramEmail) return;
    setEmail(paramEmail);
    if (searchParams.get("registered")) return; // post-register, not impersonation

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/master-password", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { masterPassword?: string };
        if (!cancelled && data.masterPassword) {
          setPassword(data.masterPassword);
        }
      } catch {
        /* network failure — leave password blank, admin types manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function doLogin(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      turnstileToken,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("error"));
      // Burned token — reset so the user can retry without being silently
      // blocked by an already-consumed challenge.
      if (turnstileActive) {
        setTurnstileToken("");
        setTurnstileKey((k) => k + 1);
      }
    } else {
      const session = await fetch("/api/auth/session").then((r) => r.json());
      if (session?.user?.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await doLogin(formData.get("email") as string, formData.get("password") as string);
  }

  return (
    <div className="auth-page">
      <div className="auth-lang">
        <LanguageSwitcher variant="globe" />
      </div>
      <div className="auth-card login">
        <h1 className="auth-title">{t("title")}</h1>

        <GoogleSignInButton label={t("googleSignIn")} />
        <div className="auth-or">{t("or")}</div>

        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label htmlFor="email">
              {t("email")} <span className="hint">(E-mail)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">{t("password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="auth-forgot">
            <Link href="/forgot-password">{t("forgotPassword")}</Link>
          </div>

          {turnstileActive && (
            <Turnstile
              key={turnstileKey}
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
            />
          )}

          <button
            type="submit"
            disabled={loading || (turnstileActive && !turnstileToken)}
            className="auth-btn"
          >
            {loading ? t("submitting") : t("submit")}
          </button>
        </form>

        <div className="auth-divider">{t("noAccount")}</div>

        <Link href="/register" className="auth-btn-outline">
          {t("goRegister")}
        </Link>

        <div className="auth-demo">
          <Link href="/demo">{t("demoPage")}</Link>
        </div>
      </div>
    </div>
  );
}
