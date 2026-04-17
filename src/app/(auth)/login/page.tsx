"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const t = useTranslations("auth.login");

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
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("error"));
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
        <LanguageSwitcher />
      </div>
      <div className="auth-card login">
        <h1 className="auth-title">{t("title")}</h1>

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

          <button type="submit" disabled={loading} className="auth-btn">
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
