import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ProfileForm from "./profile-form";
import PasswordForm from "./password-form";
import DeleteAccount from "./delete-account";
import DashboardShell from "../dashboard-shell";
import { Icon } from "../dashboard-icons";
import { getBalance } from "@/lib/credits";
import "./profile-v2.css";

const SITE_THUMB_GRADS: Record<string, [string, string, string, string]> = {
  unionled:      ["#0a1630", "#1a3370", "#6fa0ff", "LED"],
  xunion5:       ["#1f2940", "#3a4b7a", "#ffffff", "X5"],
  bomnaldriving: ["#ffe8d4", "#ff9a5a", "#7c3a00", "봄"],
};

function pickThumb(shopId: string): [string, string, string, string] {
  if (SITE_THUMB_GRADS[shopId]) return SITE_THUMB_GRADS[shopId];
  let h = 0;
  for (let i = 0; i < shopId.length; i++) h = ((h << 5) - h + shopId.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return [`hsl(${hue}, 40%, 22%)`, `hsl(${hue}, 45%, 40%)`, "#fff", shopId.slice(0, 2).toUpperCase()];
}

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

function yearsSince(d: Date): number {
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      createdAt: true,
      sites: {
        select: {
          id: true,
          shopId: true,
          name: true,
          accountType: true,
          expiresAt: true,
          domains: { select: { domain: true, status: true }, where: { status: "ACTIVE" }, take: 1 },
        },
        where: { isTemplateStorage: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) redirect("/login");

  const credits = await getBalance(user.id);

  const [t, tDash] = await Promise.all([
    getTranslations("profile"),
    getTranslations("dashboard"),
  ]);
  const displayName = user.name || user.email.split("@")[0];
  const avatarLetter = (user.name || user.email)[0].toUpperCase();
  const years = yearsSince(new Date(user.createdAt));
  const siteCount = user.sites.length;

  // Top-level "대표 사이트" for sidebar site switcher context (first site)
  const primarySite = user.sites[0];

  return (
    <DashboardShell
      active="profile"
      breadcrumbs={[
        { label: tDash("breadcrumbHome"), href: "/dashboard" },
        { label: tDash("navProfile") },
      ]}
    >
      <Link href="/dashboard" className="pv2-back">
              <Icon id="i-chev-left" size={14} /> {t("backToDashboard")}
            </Link>

            {/* Hero */}
            <div className="pv2-hero">
              <div className="pv2-avatar">{avatarLetter}</div>
              <div className="pv2-info">
                <div className="pv2-email">
                  <Icon id="i-mail" size={11} /> {user.email}
                </div>
                <div className="pv2-name">
                  {displayName}
                  <span className="owner-tag">OWNER</span>
                </div>
                <div className="pv2-stats">
                  <div className="pv2-stat">
                    <div className="pk">보유 사이트</div>
                    <div className="pv">{siteCount}개</div>
                  </div>
                  <div className="pv2-stat">
                    <div className="pk">보유 크레딧</div>
                    <div className="pv">{credits.toLocaleString()} C</div>
                  </div>
                  <div className="pv2-stat">
                    <div className="pk">가입 기간</div>
                    <div className="pv">{years > 0 ? `${years}년차` : "신규"}</div>
                  </div>
                </div>
              </div>
              <div className="pv2-right">
                <div className="join">{t("joinDate")}</div>
                <div className="jd">
                  {new Date(user.createdAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                {years > 0 && <div className="yrs">{years}년차 사용자 · 🏆</div>}
              </div>
            </div>

            {/* 2-col: 기본 정보 + 비밀번호 */}
            <div className="pv2-cols">
              <section className="pv2-panel">
                <div className="pv2-panel-head">
                  <h2>
                    <svg width={15} height={15} style={{ color: "var(--brand)" }}>
                      <use href="#i-user" />
                    </svg>
                    {t("editProfile")}
                  </h2>
                </div>
                <ProfileForm
                  userId={user.id}
                  defaultName={user.name || ""}
                  defaultPhone={user.phone || ""}
                  email={user.email}
                  labels={{
                    email: t("email"),
                    name: t("name"),
                    namePlaceholder: t("namePlaceholder"),
                    phone: t("phone"),
                    phonePlaceholder: t("phonePlaceholder"),
                    save: t("save"),
                    saving: t("saving"),
                    saved: t("saved"),
                    error: t("error"),
                  }}
                />
              </section>

              <section className="pv2-panel">
                <div className="pv2-panel-head">
                  <h2>
                    <svg width={15} height={15} style={{ color: "#2a3147" }}>
                      <use href="#i-key" />
                    </svg>
                    {t("changePassword")}
                  </h2>
                </div>
                <PasswordForm
                  labels={{
                    currentPassword: t("currentPassword"),
                    newPassword: t("newPassword"),
                    confirmPassword: t("confirmPassword"),
                    passwordMinLength: t("passwordMinLength"),
                    changePasswordBtn: t("changePasswordBtn"),
                    changing: t("changing"),
                    passwordChanged: t("passwordChanged"),
                    passwordMismatch: t("passwordMismatch"),
                    passwordTooShort: t("passwordTooShort"),
                    error: t("error"),
                  }}
                />
              </section>
            </div>

            {/* 언어 / Language — moved here from the dashboard topbar.
                Set once per account; follows the user across devices via
                User.preferredLanguage and the JWT-driven middleware sync. */}
            <section className="pv2-panel">
              <div className="pv2-panel-head">
                <h2>
                  <svg width={15} height={15} style={{ color: "#3b5bff" }}>
                    <use href="#i-globe" />
                  </svg>
                  {t("languageSection")}
                </h2>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                <LanguageSwitcher />
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {t("languageHint")}
                </div>
              </div>
            </section>

            {/* 보유 사이트 */}
            <section className="pv2-panel">
              <div className="pv2-panel-head">
                <h2>
                  {t("mySites")}
                  <span className="count">{siteCount}개</span>
                </h2>
                <Link href="/dashboard" className="pv2-tool-btn primary">
                  <Icon id="i-plus" size={13} /> 새 사이트
                </Link>
              </div>
              {user.sites.length > 0 ? (
                <div className="pv2-owned-list">
                  {user.sites.map((s) => {
                    const [from, to, color, label] = pickThumb(s.shopId);
                    const domain = s.domains[0]?.domain;
                    const type = String(s.accountType || "free").toLowerCase();
                    const isExpired =
                      type === "expired" ||
                      (s.expiresAt && new Date(s.expiresAt) < new Date());
                    const planClass = isExpired
                      ? "pv2-os-plan expired"
                      : type === "paid"
                        ? "pv2-os-plan pro"
                        : "pv2-os-plan free";
                    const planLabel = isExpired ? "만료" : type === "paid" ? "유료" : "무료";
                    return (
                      <div key={s.id} className="pv2-os-row">
                        <div
                          className="pv2-os-thumb"
                          style={{
                            background: `linear-gradient(135deg, ${from}, ${to})`,
                            color,
                          }}
                        >
                          {label}
                        </div>
                        <div className="pv2-os-info">
                          <div className="pv2-os-name">{s.name || s.shopId}</div>
                          <div className="pv2-os-meta">
                            {s.shopId}
                            {domain ? ` · ${domain}` : ""}
                          </div>
                        </div>
                        <span className={planClass}>{planLabel}</span>
                        <Link href={`/dashboard/site/settings?id=${s.id}`} className="pv2-os-set">
                          {t("siteSettings")}
                          <Icon id="i-chev-right" size={12} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="pv2-owned-empty">
                  <div className="ic"><Icon id="i-info" size={22} /></div>
                  <div className="t">아직 사이트가 없습니다</div>
                  <div className="s">대시보드에서 첫 사이트를 만들어보세요.</div>
                  <Link href="/dashboard" className="cta">
                    <Icon id="i-plus" size={13} /> 사이트 만들기
                  </Link>
                </div>
              )}
            </section>

            {/* 회원 탈퇴 — demo 계정 제외 */}
            {user.email !== "demo@demo.com" && (
              <DeleteAccount
                labels={{
                  title: t("deleteAccount"),
                  warning: t("deleteAccountWarning"),
                  confirmText: t("deleteAccountConfirm"),
                  confirmPlaceholder: t("deleteAccountPlaceholder"),
                  deleteBtn: t("deleteAccountBtn"),
                  deleting: t("deleteAccountDeleting"),
                  cancel: t("deleteAccountCancel"),
                  error: t("error"),
                  wrongPassword: t("deleteAccountWrongPassword"),
                }}
              />
            )}
    </DashboardShell>
  );
}
