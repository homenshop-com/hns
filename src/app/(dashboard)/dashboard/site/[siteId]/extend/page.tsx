import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ExtendForm from "./extend-form";
import { resolveExpiresAt, FREE_TRIAL_DAYS } from "@/lib/site-expiration";

export default async function ExtendPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const t = await getTranslations("extend");
  const td = await getTranslations("dashboard");
  const ts = await getTranslations("settings");

  const ACCOUNT_TYPES: Record<string, string> = {
    "0": ts("accountFree"),
    "1": ts("accountPaid"),
    "2": ts("accountTest"),
    "9": ts("accountExpired"),
    // Legacy string-literal accountType values that some older sites
    // still carry (pre-freeSiteDefaults path). Map them to the same
    // user-facing labels so the header reads "무료계정" either way.
    "free": ts("accountFree"),
    "paid": ts("accountPaid"),
    "test": ts("accountTest"),
    "expired": ts("accountExpired"),
  };

  const { siteId } = await params;

  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id },
    include: { domains: true },
  });

  if (!site) redirect("/dashboard");

  // For free sites with no stored expiresAt we derive it from createdAt
  // + FREE_TRIAL_DAYS so the user sees a real date instead of "무제한".
  const effectiveExpiry = resolveExpiresAt(site);
  const isExpired = !!effectiveExpiry && effectiveExpiry < new Date();
  const accountTypeLower = String(site.accountType || "").toLowerCase();
  const isFreeType = accountTypeLower === "0" || accountTypeLower === "free";
  // Test accounts (type "2") are the only ones we show as truly
  // unlimited; everything else now has a concrete date.
  const isTrulyUnlimited = accountTypeLower === "2" && !site.expiresAt;

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
            <Link href="/dashboard/profile" className="dash-header-btn">
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
            href={`/dashboard/site/settings?id=${site.id}`}
            style={{ fontSize: 13, color: "#4a90d9", marginBottom: 20, display: "inline-block" }}
          >
            &larr; {t("backToSettings")}
          </Link>

          {/* 현재 계정 상태 카드 */}
          <div style={{
            background: "linear-gradient(135deg, #4a90d9 0%, #357abd 100%)",
            borderRadius: 12,
            padding: "24px 28px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>
                {site.name || site.shopId}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
                {ACCOUNT_TYPES[site.accountType] || ts("accountFree")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                {t("currentExpiry")}
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: isExpired ? "#ffa8a8" : "#fff",
              }}>
                {isTrulyUnlimited
                  ? ts("unlimited")
                  : effectiveExpiry
                    ? new Date(effectiveExpiry).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
                    : ts("unlimited")}
                {isExpired && <span style={{ fontSize: 12, marginLeft: 6 }}>({t("expired")})</span>}
              </div>
              {isFreeType && !site.expiresAt && effectiveExpiry && !isExpired && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>
                  무료 체험 {FREE_TRIAL_DAYS}일 · 생성일로부터
                </div>
              )}
            </div>
          </div>

          {/* 호스팅 플랜 */}
          <div style={{
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
            overflow: "hidden",
            marginBottom: 24,
          }}>
            <div style={{
              padding: "18px 28px",
              borderBottom: "1px solid #f1f3f5",
              fontSize: 15,
              fontWeight: 700,
              color: "#1a1a2e",
            }}>
              {t("selectPlan")}
            </div>
            <div style={{ padding: 28 }}>
              <ExtendForm
                siteId={site.id}
                shopId={site.shopId}
                labels={{
                  year: t("year"),
                  years2: t("years2"),
                  years3: t("years3"),
                  monthly: t("monthly"),
                  won: t("won"),
                  discount: t("discount"),
                  baseFee: t("baseFee"),
                  months: t("months"),
                  totalAmount: t("totalAmount"),
                  payButton: t("payButton"),
                  processing: t("processing"),
                  tossGuide: t("tossGuide"),
                  tossNotReady: t("tossNotReady"),
                  account: t("account"),
                  plan: t("plan"),
                  amount: t("amount"),
                  useBankTransfer: t("useBankTransfer"),
                }}
              />
            </div>
          </div>

          {/* 무통장 입금 안내 */}
          <div style={{
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
            overflow: "hidden",
            marginBottom: 24,
          }}>
            <div style={{
              padding: "18px 28px",
              borderBottom: "1px solid #f1f3f5",
              fontSize: 15,
              fontWeight: 700,
              color: "#1a1a2e",
            }}>
              {t("bankTransfer")}
            </div>
            <div style={{ padding: 28 }}>
              <div style={{
                background: "#f8f9fa",
                borderRadius: 8,
                padding: 20,
                marginBottom: 16,
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "6px 0", color: "#868e96", width: 80 }}>{t("bank")}</td>
                      <td style={{ padding: "6px 0", fontWeight: 600 }}>우리은행</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "6px 0", color: "#868e96" }}>{t("accountNumber")}</td>
                      <td style={{ padding: "6px 0", fontWeight: 600 }}>1005-804-658161</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "6px 0", color: "#868e96" }}>{t("accountHolder")}</td>
                      <td style={{ padding: "6px 0", fontWeight: 600 }}>(주)홈앤샵</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 13, color: "#868e96", lineHeight: 1.6, margin: 0 }}>
                {t("bankTransferGuide").split("{email}")[0]}
                <a href="mailto:help@homenshop.com" style={{ color: "#4a90d9" }}>help@homenshop.com</a>
                {t("bankTransferGuide").split("{email}")[1]}
              </p>
            </div>
          </div>

          {/* 문의 */}
          <div style={{
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
            padding: "20px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>
                {t("needHelp")}
              </div>
              <div style={{ fontSize: 13, color: "#868e96" }}>
                {t("helpGuide")}
              </div>
            </div>
            <a
              href="mailto:help@homenshop.com"
              style={{
                padding: "10px 20px",
                background: "#f8f9fa",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "#4a90d9",
                textDecoration: "none",
                border: "1.5px solid #dee2e6",
                whiteSpace: "nowrap",
              }}
            >
              {t("emailInquiry")}
            </a>
          </div>
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
