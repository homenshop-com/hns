import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  getBalance,
  getHistory,
  CREDIT_COSTS,
  CREDIT_PACKS,
} from "@/lib/credits";

export const metadata = {
  title: "AI 크레딧 — homeNshop",
};

export default async function CreditsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  const t = await getTranslations("dashboard");

  const [balance, history] = await Promise.all([
    getBalance(userId),
    getHistory(userId, 100),
  ]);

  const dateFmt = (d: Date) =>
    new Date(d).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="credits-page">
      {/* TOP BAR */}
      <div className="credits-topbar">
        <Link href="/dashboard" className="credits-back">
          ← {t("creditBackToDashboard")}
        </Link>
      </div>

      {/* HERO CARD */}
      <div className="credits-hero">
        <div className="credits-hero-inner">
          <div className="credits-hero-label">{t("creditsBalance")}</div>
          <div className="credits-hero-amount">
            <span className="credits-hero-num">{balance.toLocaleString()}</span>
            <span className="credits-hero-unit">C</span>
          </div>
          <div className="credits-hero-hint" title={t("creditTooltipCost")}>
            {t("creditCostCreate")} <b>{CREDIT_COSTS.AI_SITE_CREATE}C</b> · {t("creditCostEdit")} <b>{CREDIT_COSTS.AI_EDIT}C</b>
          </div>
        </div>
      </div>

      {/* PACKS */}
      <section className="credits-section">
        <h2 className="credits-section-title">{t("creditsBuy")}</h2>
        <div className="credits-packs">
          {CREDIT_PACKS.map((p) => {
            const nameKey = `creditPack${p.id.charAt(0).toUpperCase()}${p.id.slice(1)}` as const;
            return (
              <div
                key={p.id}
                className={`credits-pack${p.recommended ? " recommended" : ""}`}
              >
                {p.recommended && (
                  <div className="credits-pack-ribbon">{t("creditPackRecommended")}</div>
                )}
                {p.discountPct && (
                  <div className="credits-pack-discount">{t("creditPackDiscount", { pct: p.discountPct })}</div>
                )}
                <div className="credits-pack-name">{t(nameKey as never)}</div>
                <div className="credits-pack-amount">
                  <span className="credits-pack-num">{p.credits.toLocaleString()}</span>
                  <span className="credits-pack-unit">C</span>
                </div>
                <div className="credits-pack-price">
                  ₩{p.priceKrw.toLocaleString()}
                </div>
                {/* Purchase button is wired in Step 3. */}
                <button className="credits-pack-btn" disabled title="준비중">
                  {t("creditPackBuyBtn")}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* HISTORY */}
      <section className="credits-section">
        <h2 className="credits-section-title">{t("creditsHistory")}</h2>
        {history.length === 0 ? (
          <div className="credits-empty">{t("creditsEmpty")}</div>
        ) : (
          <div className="credits-history">
            <div className="credits-history-header">
              <div className="col-date">{t("creditColDate")}</div>
              <div className="col-kind">{t("creditColKind")}</div>
              <div className="col-desc">{t("creditColDesc")}</div>
              <div className="col-amount">{t("creditColAmount")}</div>
              <div className="col-balance">{t("creditColBalance")}</div>
            </div>
            {history.map((row) => {
              const kindLabelKey = `creditKind${row.kind}` as const;
              const isPositive = row.amount > 0;
              return (
                <div key={row.id} className="credits-history-row">
                  <div className="col-date">{dateFmt(row.createdAt)}</div>
                  <div className="col-kind">
                    <span className={`credit-kind-badge kind-${row.kind.toLowerCase()}`}>
                      {t(kindLabelKey as never)}
                    </span>
                  </div>
                  <div className="col-desc">{row.description || "—"}</div>
                  <div className={`col-amount ${isPositive ? "positive" : "negative"}`}>
                    {isPositive ? "+" : ""}
                    {row.amount.toLocaleString()}
                  </div>
                  <div className="col-balance">{row.balanceAfter.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
