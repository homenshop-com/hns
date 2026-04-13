import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ProfileForm from "./profile-form";
import PasswordForm from "./password-form";
import DeleteAccount from "./delete-account";

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
      sites: { select: { id: true, shopId: true, name: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!user) redirect("/login");

  const t = await getTranslations("profile");
  const td = await getTranslations("dashboard");

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">
              homeNshop
            </Link>
            <span className="dash-logo-sub">{t("pageTitle")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">
              {td("dashboard")}
            </Link>
            <Link href="/dashboard/profile" className="dash-header-btn active">
              {td("memberInfo")}
            </Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Link
            href="/dashboard"
            style={{ fontSize: 13, color: "#4a90d9", marginBottom: 20, display: "inline-block" }}
          >
            &larr; {t("backToDashboard")}
          </Link>

          {/* 회원 정보 요약 */}
          <div style={{
            background: "linear-gradient(135deg, #495057 0%, #343a40 100%)",
            borderRadius: 12,
            padding: "24px 28px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                {user.email}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>
                {user.name || t("nameUnset")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
                {t("joinDate")}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                {new Date(user.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* 기본 정보 수정 */}
            <div style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "16px 24px",
                borderBottom: "1px solid #f1f3f5",
                fontSize: 14,
                fontWeight: 700,
                color: "#1a1a2e",
              }}>
                {t("editProfile")}
              </div>
              <div style={{ padding: 24 }}>
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
              </div>
            </div>

            {/* 비밀번호 변경 */}
            <div style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "16px 24px",
                borderBottom: "1px solid #f1f3f5",
                fontSize: 14,
                fontWeight: 700,
                color: "#1a1a2e",
              }}>
                {t("changePassword")}
              </div>
              <div style={{ padding: 24 }}>
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
              </div>
            </div>
          </div>

          {/* 보유 사이트 */}
          {user.sites.length > 0 && (
            <div style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
              overflow: "hidden",
              marginTop: 24,
            }}>
              <div style={{
                padding: "16px 24px",
                borderBottom: "1px solid #f1f3f5",
                fontSize: 14,
                fontWeight: 700,
                color: "#1a1a2e",
              }}>
                {t("mySites")} ({user.sites.length})
              </div>
              <div style={{ padding: "12px 24px" }}>
                {user.sites.map((s) => (
                  <div key={s.id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid #f8f9fa",
                  }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                        {s.name || s.shopId}
                      </span>
                      {s.name && s.name !== s.shopId && (
                        <span style={{ fontSize: 12, color: "#868e96", marginLeft: 8 }}>
                          {s.shopId}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/site/settings?id=${s.id}`}
                      style={{ fontSize: 12, color: "#4a90d9" }}
                    >
                      {t("siteSettings")}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 회원 탈퇴 — demo 계정 제외 */}
          {user.email !== "demo@demo.com" && (
            <div style={{ marginTop: 32, textAlign: "right" }}>
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
            </div>
          )}
        </div>
      </main>

      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
