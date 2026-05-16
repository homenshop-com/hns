"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

/**
 * Topbar logout button. Styled via `.dv2-signout` in dashboard-v2.css
 * (matches the rest of the v2 topbar). Replaces the legacy
 * `.dash-header-btn` that depended on landing.css. Mobile (≤640px)
 * hides this button — logout moves into the bottom-nav "더보기" entry.
 */
export default function SignOutButton() {
  const t = useTranslations("common.nav");

  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="dv2-signout"
      aria-label={t("logout")}
    >
      {t("logout")}
    </button>
  );
}
