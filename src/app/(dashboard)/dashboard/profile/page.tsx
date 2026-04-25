import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import ProfileForm from "./profile-form";
import PasswordForm from "./password-form";
import DeleteAccount from "./delete-account";
import { DashboardIconSprite, Icon } from "../dashboard-icons";
import SupportUnreadIndicator from "../support-unread-indicator";
import { getBalance } from "@/lib/credits";
import "../dashboard-v2.css";
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

  const t = await getTranslations("profile");
  const displayName = user.name || user.email.split("@")[0];
  const avatarLetter = (user.name || user.email)[0].toUpperCase();
  const years = yearsSince(new Date(user.createdAt));
  const siteCount = user.sites.length;

  // Top-level "대표 사이트" for sidebar site switcher context (first site)
  const primarySite = user.sites[0];

  return (
    <>
      <ImpersonationBanner />
      <DashboardIconSprite />
      <div className="dv2-app">
        {/* ───── SIDEBAR ───── */}
        <aside className="dv2-side">
          <Link href="/dashboard" className="dv2-brand" title="대시보드로"><div className="dv2-brand-mark">h</div><div className="dv2-brand-name">home<span className="ns">Nshop</span></div></Link>

          <div className="dv2-side-section">
            <div className="dv2-side-label">사이트 관리</div>
            <nav className="dv2-nav">
              <Link href="/dashboard">
                <span className="ic"><Icon id="i-home" /></span>
                <span className="label">대시보드</span>
              </Link>
              {primarySite && (
                <Link href={`/dashboard/site/settings?id=${primarySite.id}`}>
                  <span className="ic"><Icon id="i-info" /></span>
                  <span className="label">기본정보 관리</span>
                </Link>
              )}
              <Link href="/dashboard/domains">
                <span className="ic"><Icon id="i-globe" /></span>
                <span className="label">도메인 관리</span>
              </Link>
            </nav>
          </div>

          <div className="dv2-side-section">
            <div className="dv2-side-label">계정</div>
            <nav className="dv2-nav">
              <Link href="/dashboard/credits">
                <span className="ic"><Icon id="i-credit" /></span>
                <span className="label">AI 크레딧</span>
              </Link>
              <Link className="active" href="/dashboard/profile">
                <span className="ic"><Icon id="i-user" /></span>
                <span className="label">관리자 정보</span>
              </Link>
              <Link href="/dashboard/support"><span className="ic"><Icon id="i-chat" /></span><span className="label">도움말 · 지원</span><SupportUnreadIndicator variant="count" /></Link>
            </nav>
          </div>

          <div className="dv2-side-footer">
            <div className="dv2-coin-card">
              <div className="row">
                <div className="ball">C</div>
                <div>
                  <div className="num">
                    {credits.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>coin</span>
                  </div>
                  <div className="cap">AI 제작 · 편집에 사용</div>
                </div>
              </div>
              <Link className="go" href="/dashboard/credits">
                충전하기 <Icon id="i-chev-right" size={12} />
              </Link>
            </div>
          </div>
        </aside>

        {/* ───── MAIN ───── */}
        <div className="dv2-main">
          <div className="dv2-topbar">
            <div className="dv2-crumbs">
              <Link href="/dashboard">대시보드</Link>
              <span className="sep">/</span>
              <span className="cur">관리자 정보</span>
            </div>
            <div className="dv2-spacer" />
            <div className="dv2-topbar-actions">
              <Link className="dv2-coin-pill" href="/dashboard/credits" title="크레딧 잔액">
                <span className="ball">C</span>
                <span>{credits.toLocaleString()}</span>
                <span className="c">coin</span>
              </Link>
              <div className="dv2-lang">
                <LanguageSwitcher />
              </div>
              <Link href="/dashboard/profile" className="dv2-user" style={{ textDecoration: "none" }}>
                <div>
                  <div className="name">{displayName}</div>
                  <div className="role">Owner</div>
                </div>
                <div className="dv2-avatar">{initialsFrom(displayName)}</div>
              </Link>
              <SignOutButton />
            </div>
          </div>

          <div className="dv2-content">
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
          </div>
        </div>
      </div>
    </>
  );
}
