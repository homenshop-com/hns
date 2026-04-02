"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = useTranslations("auth.register");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError(t("passwordTooShort"));
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password,
        name: formData.get("name"),
        phone: formData.get("phone"),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
    } else {
      router.push("/login?registered=true");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-lang">
        <LanguageSwitcher />
      </div>
      <div className="auth-card register">
        <h1 className="auth-title">{t("title")}</h1>

        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="name">{t("name")}</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="phone">
                {t("phone")} <span className="optional">{t("phoneOptional")}</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder={t("phonePlaceholder")}
              />
            </div>
          </div>

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
            />
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="password">{t("password")}</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder={t("passwordPlaceholder")}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirmPassword">{t("confirmPassword")}</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                placeholder={t("confirmPasswordPlaceholder")}
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? t("submitting") : t("submit")}
          </button>
        </form>

        <div className="auth-footer">
          {t("hasAccount")}{" "}
          <Link href="/login">{t("goLogin")}</Link>
        </div>
      </div>
    </div>
  );
}
