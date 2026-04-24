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
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import BuyPackButton from "./buy-pack-button";
import FaqList from "./faq-list";
import TransactionFilter, { type CreditTxRow } from "./transaction-filter";
import { DashboardIconSprite, Icon } from "../dashboard-icons";
import SupportUnreadIndicator from "../support-unread-indicator";
import "../dashboard-v2.css";
import "./credits-v2.css";

export const metadata = { title: "AI 크레딧 — homeNshop" };

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function humanTimeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "방금 전";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}일 전`;
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

  const [balance, history, currentUser] = await Promise.all([
    getBalance(userId),
    getHistory(userId, 200),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "게스트";

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
  const lastUseLabel = lastUse ? humanTimeAgo(lastUse.createdAt) : "아직 없음";

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
      q: "AI 크레딧은 어떻게 차감되나요?",
      a: `기능별 정해진 크레딧이 사용 시점에 즉시 차감됩니다. 생성이 실패하면 자동 환급됩니다. (AI 홈페이지 생성 ${CREDIT_COSTS.AI_SITE_CREATE}C, AI 디자인 편집 ${CREDIT_COSTS.AI_EDIT}C 등)`,
    },
    {
      q: "크레딧에 유효기간이 있나요?",
      a: "패키지에 따라 다릅니다. STARTER·STANDARD는 12개월, PRO는 18개월, ENTERPRISE는 24개월입니다. 충전일로부터 계산되며, 추가 충전 시 기존 크레딧의 유효기간도 함께 연장됩니다.",
    },
    {
      q: "환불은 가능한가요?",
      a: "결제 후 7일 이내·사용 내역이 없는 경우 전액 환불이 가능합니다. 일부 사용한 경우에는 잔여분에 한해 환불됩니다. 환불은 결제수단으로 영업일 기준 3~5일 내 처리됩니다.",
    },
    {
      q: "자동 충전은 어떻게 설정하나요?",
      a: "잔액이 설정한 기준(기본 50 C) 이하로 떨어지면 자동으로 지정한 패키지가 결제됩니다. 상단 '자동 충전' 버튼에서 설정할 수 있습니다. (현재 준비 중 — 곧 제공 예정)",
    },
    {
      q: "세금계산서를 받을 수 있나요?",
      a: "결제 내역 페이지에서 사업자 정보를 등록한 후 세금계산서를 직접 발행하실 수 있습니다.",
    },
  ];

  const packDescriptions: Record<string, { desc: string; perHint: string; bonus: string | null; list: string[] }> = {
    starter: {
      desc: "가벼운 테스트 용도",
      perHint: "AI 생성 약 2회",
      bonus: null,
      list: ["가벼운 테스트 용도", "유효기간 12개월"],
    },
    standard: {
      desc: "소규모 사이트 운영",
      perHint: "AI 생성 약 10회",
      bonus: "+30 C 보너스",
      list: ["소규모 사이트 운영", "유효기간 12개월"],
    },
    pro: {
      desc: "월 15~30회 AI 편집",
      perHint: "AI 생성 약 30회",
      bonus: "+150 C 보너스 · 우선 지원",
      list: ["월 15~30회 AI 편집", "우선 생성 큐", "유효기간 18개월"],
    },
    enterprise: {
      desc: "대량 콘텐츠 생성",
      perHint: "AI 생성 약 100회",
      bonus: "+750 C · 전용 매니저",
      list: ["대량 콘텐츠 생성", "월 정산 가능", "유효기간 24개월"],
    },
  };

  return (
    <>
      <ImpersonationBanner />
      <DashboardIconSprite />
      <div className="dv2-app">
        {/* ───── SIDEBAR ───── */}
        <aside className="dv2-side">
          <div className="dv2-brand">
            <div className="dv2-brand-mark">h</div>
            <div className="dv2-brand-name">
              home<span className="ns">Nshop</span>
            </div>
          </div>

          <div className="dv2-side-section">
            <div className="dv2-side-label">사이트 관리</div>
            <nav className="dv2-nav">
              <Link href="/dashboard">
                <span className="ic"><Icon id="i-home" /></span>
                <span className="label">대시보드</span>
              </Link>
              <Link href="/dashboard/domains">
                <span className="ic"><Icon id="i-globe" /></span>
                <span className="label">도메인 관리</span>
              </Link>
            </nav>
          </div>

          <div className="dv2-side-section">
            <div className="dv2-side-label">계정</div>
            <nav className="dv2-nav">
              <Link className="active" href="/dashboard/credits">
                <span className="ic"><Icon id="i-coin" /></span>
                <span className="label">AI 크레딧</span>
                <span className={coinPillClass}>{balance.toLocaleString()} C</span>
              </Link>
              <Link href="/dashboard/profile">
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
                    {balance.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>coin</span>
                  </div>
                  <div className="cap">AI 제작 · 편집에 사용</div>
                </div>
              </div>
              <a className="go" href="#packages">
                지금 충전하기 <Icon id="i-chev-right" size={12} />
              </a>
            </div>
          </div>
        </aside>

        {/* ───── MAIN ───── */}
        <div className="dv2-main">
          <div className="dv2-topbar">
            <div className="dv2-crumbs">
              <Link href="/dashboard">대시보드</Link>
              <span className="sep">/</span>
              <span className="cur">AI 크레딧</span>
            </div>
            <div className="dv2-spacer" />
            <div className="dv2-topbar-actions">
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
                    AI 카피라이팅 <b>{CREDIT_COSTS.AI_OTHER} C</b>
                  </span>
                </div>
                <div className="cr2-bal-meta secondary">
                  <span className="mi">
                    <Icon id="i-info" size={11} />
                    마지막 사용 <b>{lastUseLabel}</b>
                  </span>
                  <span className="dot" />
                  <span className="mi">
                    이번 달 사용 <b>{monthUsed.toLocaleString()} C</b>
                  </span>
                </div>
              </div>
              <div className="cr2-bal-right">
                <div className="cr2-bal-chart">
                  <div className="ct">
                    <span>최근 14일 사용량</span>
                    <span className="delta">평균 {spark.avg} C/일</span>
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
                    <Icon id="i-bolt" size={14} /> 지금 충전
                  </a>
                  <button type="button" className="cr2-bal-cta ghost" title="자동 충전 기능 준비 중" disabled>
                    <Icon id="i-refresh" size={14} /> 자동 충전
                  </button>
                </div>
              </div>
            </div>

            {/* Packages */}
            <div id="packages" className="cr2-sect-head">
              <h2>{t("creditsBuy")}</h2>
              <span className="sub">대용량 패키지일수록 할인률이 커집니다.</span>
              <div className="spacer" />
              <a
                href="https://homenshop.com/pricing"
                className="help"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon id="i-info" size={12} /> 크레딧 사용 가이드
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
                      크레딧당 ₩{perUnit.toLocaleString()} · {meta.perHint}
                    </div>
                    <div className={`cr2-pkg-bonus${meta.bonus ? "" : " none"}`}>
                      <Icon id="i-gift" size={12} /> {meta.bonus || "보너스"}
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
                <Icon id="i-card" size={14} /> 카드 · 계좌이체 · 카카오페이
              </span>
              <span className="it">
                <Icon id="i-shield" size={14} /> PG사 결제 · <b>결제 7일 내 환불</b> 가능
              </span>
              <span className="it">
                <Icon id="i-receipt" size={14} /> 세금계산서 발행
              </span>
              <span className="it" style={{ marginLeft: "auto" }}>
                <Icon id="i-chat" size={14} /> 대량 구매 문의
                <a href="mailto:sales@homenshop.com">sales@homenshop.com</a>
              </span>
            </div>

            {/* Usage history */}
            <div className="cr2-sect-head">
              <h2>{t("creditsHistory")}</h2>
              <span className="sub">최근 30일 기준</span>
              <div className="spacer" />
            </div>

            <div className="cr2-use-card">
              {(() => {
                const txRows: CreditTxRow[] = last30.map((row) => {
                  const kindKey = `creditKind${row.kind}`;
                  const cat = kindCategory(row.kind);
                  const submeta =
                    row.refOrderId
                      ? `주문 · ${row.refOrderId.slice(-12)}`
                      : cat === "minus" && row.refSiteId
                        ? `사이트 · ${row.refSiteId.slice(-12)}`
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
                  최근 30일 · <b>{last30.length}</b>건 표시 중
                </span>
                <div className="spacer" />
                {history.length > 30 && (
                  <span style={{ color: "var(--ink-3)" }}>
                    전체 {history.length}건 중 30일 표시
                  </span>
                )}
              </div>
            </div>

            {/* FAQ */}
            <section className="cr2-faq">
              <div>
                <h3>자주 묻는 질문</h3>
                <div className="sub">
                  크레딧 충전과 사용에 대해 궁금한 점을 확인해보세요.
                </div>
                <a className="ask" href="mailto:help@homenshop.com">
                  <Icon id="i-chat" size={12} /> 더 많은 질문 보기 →
                </a>
              </div>
              <FaqList items={faqItems} defaultOpen={1} />
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
