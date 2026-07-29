"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const tAuth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        // The API still returns Korean-only strings; fall back to the
        // localized generic message when it has nothing specific to say.
        setError(data.error || t("error"));
        return;
      }

      setMessage(t("success"));
      setEmail("");
    } catch {
      setError(t("serverError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <Link href="/" className="auth-home">
        <span aria-hidden="true">←</span> {tAuth("backHome")}
      </Link>
      <div className="auth-lang">
        <LanguageSwitcher variant="globe" />
      </div>
      <div className="auth-card login">
        <h1 className="auth-title">{t("title")}</h1>

        {message ? (
          <>
            <div className="auth-success">{message}</div>
            <Link href="/login" className="auth-btn-outline">
              {t("backToLogin")}
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            <div className="auth-field">
              <label htmlFor="email">{t("email")}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                required
              />
            </div>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>
        )}

        <div className="auth-footer" style={{ marginTop: 24 }}>
          <Link href="/login">{t("backToLogin")}</Link>
        </div>
      </div>
    </div>
  );
}
