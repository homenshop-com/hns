import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import {
  getBalance,
  getHistory,
  CREDIT_COSTS,
  CREDIT_PACKS,
} from "@/lib/credits";
import BuyPackButton from "./buy-pack-button";
import FaqList from "./faq-list";
import TransactionFilter, { type CreditTxRow } from "./transaction-filter";
import DashboardShell from "../dashboard-shell";
import { Icon } from "../dashboard-icons";
import "./credits-v2.css";

export async function generateMetadata() {
  const t = await getTranslations("creditsPage");
  return { title: t("metaTitle") };
}

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function humanTimeAgo(
  d: Date,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return t("justNow");
  if (s < 3600) return t("minutesAgo", { n: Math.floor(s / 60) });
  if (s < 86400) return t("hoursAgo", { n: Math.floor(s / 3600) });
  if (s < 86400 * 30) return t("daysAgo", { n: Math.floor(s / 86400) });
  return d.toLocaleDateString("ko-KR");
}

type KindCategory = "plus" | "minus";
function kindCategory(kind: string): KindCategory {
  // Signed amount gives us the real direction; kind just picks the chip.
  return kind.startsWith("AI_") || kind === "ADMIN_DEBIT" ? "minus" : "plus";
}

function kindChipClass(kind: string): string {
  switch (kind) {
    case "PURCHASE":        return "cr2-chip buy";
    case "REFUND":          return "cr2-chip refund";
    case "SIGNUP_BONUS":    return "cr2-chip bonus";
    case "MONTHLY_GRANT":   return "cr2-chip plan";
    case "ADMIN_GRANT":     return "cr2-chip plan";
    case "ADMIN_DEBIT":     return "cr2-chip refund";
    case "AI_SITE_CREATE":
    case "AI_EDIT":
    case "AI_OTHER":
    default:                return "cr2-chip use";
  }
}

/** Build a 14-day mini spark from recent transactions (sum of |amount| per day). */
function buildSpark(
  history: { createdAt: Date; amount: number }[],
  days = 14,
): { path: string; area: string; lastX: number; lastY: number; avg: number } {
  const buckets = new Array(days).fill(0);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  let totalUse = 0;
  for (const r of history) {
    if (r.amount >= 0) continue;
    const d = new Date(r.createdAt);
    const idx = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (idx >= 0 && idx < days) {
      const used = -r.amount;
      buckets[idx] += used;
      totalUse += used;
    }
  }
  const max = Math.max(1, ...buckets);
  const W = 260;
  const H = 52;
  const pad = 4;
  const step = (W - 0) / (days - 1);
  const pts = buckets.map((v, i) => {
    const x = Math.round(i * step);
    const y = Math.round(H - pad - (v / max) * (H - pad * 2));
    return { x, y };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const last = pts[pts.length - 1] || { x: W, y: H - pad };
  const avg = Math.round(totalUse / days);
  return { path: line, area, lastX: last.x, lastY: last.y, avg };
}

export default async function CreditsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("creditsPage");

  const [balance, history, currentUser] = await Promise.all([
    getBalance(userId),
    getHistory(userId, 200),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || tc("guest");

  // Sidebar coin pill tone
  const coinPillClass =
    balance < 50 ? "cr2-coin-pill low"
    : balance >= 1000 ? "cr2-coin-pill high"
    : "cr2-coin-pill";

  // Month-to-date usage (absolute sum of all debits this calendar month)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthUsed = history
    .filter((r) => r.createdAt >= monthStart && r.amount < 0)
    .reduce((sum, r) => sum - r.amount, 0);

  const lastUse = history.find((r) => r.amount < 0);
  const lastUseLabel = lastUse ? humanTimeAgo(lastUse.createdAt, tc) : tc("noneYet");

  // 30-day history for the table (credit rules + visual consistency)
  const last30 = history.filter((r) => daysAgo(r.createdAt) < 30);

  const spark = buildSpark(history);

  const dateFmt = (d: Date) =>
    new Date(d).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const faqItems = [
    {
      q: tc("faqDeductQ"),
      a: tc("faqDeductA", {
        create: CREDIT_COSTS.AI_SITE_CREATE,
        edit: CREDIT_COSTS.AI_EDIT,
      }),
    },
    {
      q: tc("faqExpiryQ"),
      a: tc("faqExpiryA"),
    },
    {
      q: tc("faqRefundQ"),
      a: tc("faqRefundA"),
    },
    {
      q: tc("faqAutoTopupQ"),
      a: tc("faqAutoTopupA"),
    },
    {
      q: tc("faqInvoiceQ"),
      a: tc("faqInvoiceA"),
    },
  ];

  const packDescriptions: Record<string, { desc: string; perHint: string; bonus: string | null; list: string[] }> = {
    starter: {
      desc: tc("packStarterDesc"),
      perHint: tc("packStarterPerHint"),
      bonus: null,
      list: [tc("packStarterDesc"), tc("expiry12m")],
    },
    standard: {
      desc: tc("packStandardDesc"),
      perHint: tc("packStandardPerHint"),
      bonus: tc("packStandardBonus"),
      list: [tc("packStandardDesc"), tc("expiry12m")],
    },
    pro: {
      desc: tc("packProDesc"),
      perHint: tc("packProPerHint"),
      bonus: tc("packProBonus"),
      list: [tc("packProDesc"), tc("packProQueue"), tc("expiry18m")],
    },
    enterprise: {
      desc: tc("packEnterpriseDesc"),
      perHint: tc("packEnterprisePerHint"),
      bonus: tc("packEnterpriseBonus"),
      list: [tc("packEnterpriseDesc"), tc("packEnterpriseMonthly"), tc("expiry24m")],
    },
  };

  const tDash = await getTranslations("dashboard");

  return (
    <DashboardShell
      active="credits"
      breadcrumbs={[
        { label: tDash("breadcrumbHome"), href: "/dashboard" },
        { label: tDash("navCredits") },
      ]}
    >
      <Link href="/dashboard" className="cr2-back">
              <Icon id="i-chev-left" size={14} /> {t("creditBackToDashboard")}
            </Link>

            {/* Balance hero */}
            <div className="cr2-balance">
              <div className="cr2-bal-left">
                <span className="cr2-bal-label">{t("creditBalance")}</span>
                <div className="cr2-bal-amount">
                  <span className="cr2-bal-num">{balance.toLocaleString()}</span>
                  <span className="cr2-bal-unit">C</span>
                </div>
                <div className="cr2-bal-meta">
                  <span className="mi">
                    <Icon id="i-sparkle" size={12} style={{ color: "#a897ff" }} />
                    {t("creditCostCreate")} <b>{CREDIT_COSTS.AI_SITE_CREATE} C</b>
                  </span>
                  <span className="dot" />
                  <span className="mi">
                    <Icon id="i-palette" size={12} style={{ color: "#a897ff" }} />
                    {t("creditCostEdit")} <b>{CREDIT_COSTS.AI_EDIT} C</b>
                  </span>
                  <span className="dot" />
                  <span className="mi">
                    <Icon id="i-chat" size={12} style={{ color: "#a897ff" }} />
                    {tc("costCopywriting")} <b>{CREDIT_COSTS.AI_OTHER} C</b>
                  </span>
                </div>
                <div className="cr2-bal-meta secondary">
                  <span className="mi">
                    <Icon id="i-info" size={11} />
                    {tc("lastUse")} <b>{lastUseLabel}</b>
                  </span>
                  <span className="dot" />
                  <span className="mi">
                    {tc("monthUse")} <b>{monthUsed.toLocaleString()} C</b>
                  </span>
                </div>
              </div>
              <div className="cr2-bal-right">
                <div className="cr2-bal-chart">
                  <div className="ct">
                    <span>{tc("usage14d")}</span>
                    <span className="delta">{tc("avgPerDay", { n: spark.avg })}</span>
                  </div>
                  <svg className="cr2-spark" viewBox="0 0 260 52" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="cr2GSpark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#a897ff" stopOpacity=".6" />
                        <stop offset="1" stopColor="#a897ff" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={spark.area} fill="url(#cr2GSpark)" />
                    <path d={spark.path} fill="none" stroke="#d4cbff" strokeWidth={1.5} strokeLinejoin="round" />
                    <circle cx={spark.lastX} cy={spark.lastY} r={3} fill="#fff" />
                    <circle cx={spark.lastX} cy={spark.lastY} r={6} fill="#fff" opacity={0.3} />
                  </svg>
                </div>
                <div className="cr2-bal-ctas">
                  <a className="cr2-bal-cta primary" href="#packages">
                    <Icon id="i-bolt" size={14} /> {tc("topUpNow")}
                  </a>
                  <button type="button" className="cr2-bal-cta ghost" title={tc("autoTopupComing")} disabled>
                    <Icon id="i-refresh" size={14} /> {tc("autoTopup")}
                  </button>
                </div>
              </div>
            </div>

            {/* Packages */}
            <div id="packages" className="cr2-sect-head">
              <h2>{t("creditsBuy")}</h2>
              <span className="sub">{tc("buySub")}</span>
              <div className="spacer" />
              <a
                href="https://homenshop.net/pricing"
                className="help"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon id="i-info" size={12} /> {tc("usageGuide")}
              </a>
            </div>

            <div className="cr2-pkgs">
              {CREDIT_PACKS.map((p) => {
                const nameKey = `creditPack${p.id.charAt(0).toUpperCase()}${p.id.slice(1)}`;
                const meta = packDescriptions[p.id] || { desc: "", perHint: "", bonus: null, list: [] };
                const perUnit = Math.round(p.priceKrw / p.credits);
                return (
                  <div
                    key={p.id}
                    className={`cr2-pkg${p.recommended ? " on" : ""}`}
                    data-pkg={p.id}
                  >
                    {p.recommended && (
                      <span className="reco-tag">
                        <Icon id="i-sparkle" size={10} /> {t("creditPackRecommended")}
                      </span>
                    )}
                    <div className="cr2-pkg-head">
                      <span className="cr2-pkg-tier">{t(nameKey as never)}</span>
                      {p.discountPct && (
                        <span className="cr2-pkg-discount">
                          {t("creditPackDiscount", { pct: p.discountPct })}
                        </span>
                      )}
                    </div>
                    <div className="cr2-pkg-amount">
                      <span className="cr2-pkg-num">{p.credits.toLocaleString()}</span>
                      <span className="cr2-pkg-unit">C</span>
                    </div>
                    <div>
                      <span className="cr2-pkg-price">₩{p.priceKrw.toLocaleString()}</span>
                      {p.discountPct && (
                        <span className="cr2-pkg-orig">
                          ₩{Math.round(p.priceKrw / (1 - p.discountPct / 100)).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="cr2-pkg-per">
                      {tc("perCredit", { price: perUnit.toLocaleString() })} · {meta.perHint}
                    </div>
                    <div className={`cr2-pkg-bonus${meta.bonus ? "" : " none"}`}>
                      <Icon id="i-gift" size={12} /> {meta.bonus || tc("bonus")}
                    </div>
                    <ul className="cr2-pkg-list">
                      {meta.list.map((item, i) => (
                        <li key={i}>
                          <Icon id="i-check" size={12} style={{ color: "var(--ok)" }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <BuyPackButton packId={p.id} label={t("creditPackBuyBtn")} />
                  </div>
                );
              })}
            </div>

            <div className="cr2-info-strip">
              <span className="it">
                <Icon id="i-card" size={14} /> {tc("payMethods")}
              </span>
              <span className="it">
                <Icon id="i-shield" size={14} /> {tc("pgPay")} · <b>{tc("refund7d")}</b>
              </span>
              <span className="it">
                <Icon id="i-receipt" size={14} /> {tc("invoiceIssue")}
              </span>
              <span className="it" style={{ marginLeft: "auto" }}>
                <Icon id="i-chat" size={14} /> {tc("bulkInquiry")}
                <a href="mailto:sales@homenshop.com">sales@homenshop.com</a>
              </span>
            </div>

            {/* Usage history */}
            <div className="cr2-sect-head">
              <h2>{t("creditsHistory")}</h2>
              <span className="sub">{tc("last30dBasis")}</span>
              <div className="spacer" />
            </div>

            <div className="cr2-use-card">
              {(() => {
                const txRows: CreditTxRow[] = last30.map((row) => {
                  const kindKey = `creditKind${row.kind}`;
                  const cat = kindCategory(row.kind);
                  const submeta =
                    row.refOrderId
                      ? tc("submetaOrder", { ref: row.refOrderId.slice(-12) })
                      : cat === "minus" && row.refSiteId
                        ? tc("submetaSite", { ref: row.refSiteId.slice(-12) })
                        : null;
                  return {
                    id: row.id,
                    createdAt: dateFmt(row.createdAt),
                    kindLabel: t(kindKey as never),
                    kindChipClass: kindChipClass(row.kind),
                    amount: row.amount,
                    balanceAfter: row.balanceAfter,
                    description: row.description || t(kindKey as never),
                    submeta,
                  };
                });
                return (
                  <TransactionFilter
                    rows={txRows}
                    labels={{
                      colDate: t("creditColDate"),
                      colKind: t("creditColKind"),
                      colDesc: t("creditColDesc"),
                      colAmount: t("creditColAmount"),
                      colBalance: t("creditColBalance"),
                      empty: t("creditsEmpty"),
                    }}
                  />
                );
              })()}
              <div className="cr2-use-foot">
                <span>
                  {tc.rich("footShowing", {
                    n: last30.length,
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </span>
                <div className="spacer" />
                {history.length > 30 && (
                  <span style={{ color: "var(--ink-3)" }}>
                    {tc("footTotal", { total: history.length })}
                  </span>
                )}
              </div>
            </div>

            {/* FAQ */}
            <section className="cr2-faq">
              <div>
                <h3>{tc("faqTitle")}</h3>
                <div className="sub">
                  {tc("faqSub")}
                </div>
                <a className="ask" href="mailto:help@homenshop.com">
                  <Icon id="i-chat" size={12} /> {tc("faqMore")}
                </a>
              </div>
              <FaqList items={faqItems} defaultOpen={1} />
            </section>
    </DashboardShell>
  );
}
