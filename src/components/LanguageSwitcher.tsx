"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, type Locale } from "@/i18n/routing";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("language");

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value as Locale;
    // Set cookie with 1 year expiry
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    router.refresh();
  }

  return (
    <select
      value={locale}
      onChange={handleChange}
      style={{
        borderRadius: 8,
        border: "1px solid #d4d4d8",
        backgroundColor: "#fff",
        color: "#1a1a2e",
        padding: "6px 8px",
        fontSize: 13,
        cursor: "pointer",
      }}
      aria-label={t("label")}
    >
      {locales.map((loc) => (
        <option key={loc} value={loc}>
          {t(loc)}
        </option>
      ))}
    </select>
  );
}
