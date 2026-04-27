import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import DashboardShell from "../dashboard-shell";
import SupportChat from "./support-chat";
import "./support-v2.css";

export const metadata = { title: "homeNshop" };

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

export default async function SupportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, t] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
    getTranslations("dashboard"),
  ]);

  const displayName = user?.name || user?.email?.split("@")[0] || "Guest";
  const userInitial = initialsFrom(displayName)[0] || "U";

  return (
    <DashboardShell
      active="support"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("navSupport") },
      ]}
    >
      <div className="sp2-page-head">
        <h1 className="sp2-page-title">
          <svg width={22} height={22} style={{ color: "var(--ai, #7b5cff)" }}>
            <use href="#i-chat" />
          </svg>
          {t("navSupport")}
          <span className="status-dot" />
        </h1>
        <div className="sp2-page-sub">
          {/* TODO: localize this support intro copy in a future pass */}
          홈앤샵 시스템 이용하시면서 불편사항이 있으시면 메세지 주시면 확인 후 바로 조치토록 하겠습니다.
        </div>
      </div>
      <SupportChat userInitial={userInitial} />
    </DashboardShell>
  );
}
