"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const tAuth = useTranslations("auth");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t("invalidLink"));
    }
  }, [token, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError(t("tooShort"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("mismatch"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // The API still returns Korean-only strings; fall back to the
        // localized generic message when it has nothing specific to say.
        setError(data.error || t("error"));
        return;
      }

      setMessage(t("success"));
      setPassword("");
      setConfirmPassword("");
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
      <div className="auth-card reset">
        <h1 className="auth-title">{t("title")}</h1>

        {message ? (
          <>
            <div className="auth-success">{message}</div>
            <Link href="/login" className="auth-btn-outline">
              {t("goLogin")}
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            <div className="auth-field">
              <label htmlFor="password">{t("newPassword")}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("newPasswordPlaceholder")}
                required
                minLength={8}
                disabled={!token}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="confirmPassword">{t("confirmPassword")}</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("confirmPasswordPlaceholder")}
                required
                minLength={8}
                disabled={!token}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="auth-btn"
            >
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ResetPasswordFallback() {
  const t = useTranslations("auth.resetPassword");
  return (
    <div className="auth-page">
      <div className="auth-card reset">
        <p style={{ textAlign: "center", padding: "20px" }}>{t("loading")}</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
