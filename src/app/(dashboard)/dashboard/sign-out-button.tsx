"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function SignOutButton() {
  const t = useTranslations("common.nav");

  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="dash-header-btn"
    >
      {t("logout")}
    </button>
  );
}
