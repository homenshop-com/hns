"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, useTransition } from "react";
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
 * Variants:
 * - "select" / "compact": native <select> dropdown (settings page).
 * - "globe": a globe-icon button + popover menu — used in the auth pages
 *   and the dashboard chrome so the control is visible to resellers and
 *   their end-users on white-label hosts.
 */

/** Short label shown next to the globe icon for the active locale. */
const SHORT_LABEL: Record<string, string> = {
  ko: "KO",
  en: "EN",
  ja: "JA",
  es: "ES",
  "zh-cn": "简",
  "zh-tw": "繁",
};

export default function LanguageSwitcher({
  variant = "select",
}: {
  variant?: "select" | "compact" | "globe";
}) {
  const locale = useLocale();
  const router = useRouter();
  const { update } = useSession();
  const t = useTranslations("language");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the globe popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applyLocale(newLocale: Locale) {
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

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    applyLocale(e.target.value as Locale);
  }

  if (variant === "globe") {
    return (
      <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={pending}
          aria-label={t("label")}
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 9,
            border: "1px solid #e5e8eb",
            background: "#fff",
            color: "#333d4b",
            padding: "6px 10px",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          <i className="fa-solid fa-globe" style={{ fontSize: 14 }} />
          <span>{SHORT_LABEL[locale] ?? locale.toUpperCase()}</span>
          <i
            className="fa-solid fa-chevron-down"
            style={{ fontSize: 9, opacity: 0.6 }}
          />
        </button>
        {open && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 140,
              background: "#fff",
              border: "1px solid #e5e8eb",
              borderRadius: 10,
              boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
              padding: 4,
              zIndex: 1000,
            }}
          >
            {locales.map((loc) => {
              const active = loc === locale;
              return (
                <button
                  key={loc}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    if (!active) applyLocale(loc);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    border: "none",
                    background: active ? "#f2f4f6" : "transparent",
                    color: active ? "#3182f6" : "#333d4b",
                    borderRadius: 7,
                    padding: "8px 10px",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{t(loc)}</span>
                  {active && <i className="fa-solid fa-check" style={{ fontSize: 11 }} />}
                </button>
              );
            })}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{error}</div>
        )}
      </div>
    );
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
