"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { locales, type Locale } from "@/i18n/routing";

/**
 * Language picker.
 *
 * - Anonymous users: writes the NEXT_LOCALE cookie via /api/user/language
 *   so the change persists for that browser.
 * - Logged-in users: also updates User.preferredLanguage in the DB so
 *   the choice follows them across devices. Triggers a NextAuth session
 *   refresh so the JWT carries the new value to the middleware.
 *
 * Used in /dashboard/profile (settings) and on the public storefront
 * footer. No longer in the dashboard topbar — modern SaaS pattern is to
 * treat language as a one-and-done preference, not a chrome control.
 */
export default function LanguageSwitcher({
  variant = "select",
}: {
  variant?: "select" | "compact";
}) {
  const locale = useLocale();
  const router = useRouter();
  const { update } = useSession();
  const t = useTranslations("language");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value as Locale;
    setError(null);
    startTransition(async () => {
      try {
        const r = await fetch("/api/user/language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: newLocale }),
        });
        if (!r.ok) {
          // Fallback: write the cookie client-side so the change still
          // takes effect even if the API call failed.
          document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
        } else {
          // Refresh the NextAuth session so the JWT is rotated with the
          // new preferredLanguage. Middleware reads the JWT to keep cookies
          // consistent across devices.
          await update?.().catch(() => {});
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <select
        value={locale}
        onChange={handleChange}
        disabled={pending}
        style={{
          borderRadius: 8,
          border: "1px solid #d4d4d8",
          backgroundColor: "#fff",
          color: "#1a1a2e",
          padding: variant === "compact" ? "4px 6px" : "6px 8px",
          fontSize: variant === "compact" ? 12 : 13,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
        aria-label={t("label")}
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {t(loc)}
          </option>
        ))}
      </select>
      {error && (
        <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div>
      )}
    </div>
  );
}
