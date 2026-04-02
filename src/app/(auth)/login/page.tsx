"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = useTranslations("auth.login");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("error"));
    } else {
      // 세션에서 role 확인하여 ADMIN이면 /admin으로 이동
      const session = await fetch("/api/auth/session").then((r) => r.json());
      if (session?.user?.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    }
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
