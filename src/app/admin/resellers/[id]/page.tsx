"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ResellerLogoField from "@/components/admin/ResellerLogoField";
import ResellerDomainGuide from "@/components/admin/ResellerDomainGuide";

const TiptapEditor = lazy(() => import("@/components/tiptap-editor"));

/** TipTap emits `<p></p>` for an empty doc — treat that as no value. */
function normalizeHtml(html: string): string {
  const stripped = html.replace(/<p>\s*<\/p>/g, "").trim();
  return stripped;
}

interface SettlementSummary {
  balance: number;
  totalEarned: number;
  totalPaidOut: number;
}

interface ResellerDetail {
  id: string;
  domain: string;
  siteName: string;
  logo: string | null;
  copyright: string | null;
  analytics: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  isActive: boolean;
  revenueShareBps: number;
  ownerEmail: string | null;
  settlementSummary: SettlementSummary;
}

interface SettlementRow {
  id: string;
  amount: number;
  balanceAfter: number;
  kind: "EARNING" | "PAYOUT" | "ADJUSTMENT";
  refOrderId: string | null;
  orderAmount: number | null;
  shareBps: number | null;
  note: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<SettlementRow["kind"], string> = {
  EARNING: "귀속 매출",
  PAYOUT: "출금",
  ADJUSTMENT: "조정",
};

export default function AdminResellerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [reseller, setReseller] = useState<ResellerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [domain, setDomain] = useState("");
  const [siteName, setSiteName] = useState("");
  const [logo, setLogo] = useState("");
  const [copyright, setCopyright] = useState("");
  const [analytics, setAnalytics] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [revenueSharePercent, setRevenueSharePercent] = useState("50");
  const [ownerEmail, setOwnerEmail] = useState("");

  // ─── Settlement panel state ───
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [history, setHistory] = useState<SettlementRow[]>([]);
  const [settleAction, setSettleAction] = useState<"payout" | "adjust">("payout");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState("");

  async function loadSettlements() {
    try {
      const res = await fetch(`/api/admin/resellers/${id}/settlements`);
      if (!res.ok) return;
      const data = await res.json();
      setSummary(data.summary);
      setHistory(data.history);
    } catch {
      /* non-fatal — panel just stays empty */
    }
  }

  useEffect(() => {
    async function fetchReseller() {
      try {
        const res = await fetch(`/api/admin/resellers/${id}`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          if (res.status === 403) {
            router.push("/dashboard");
            return;
          }
          throw new Error("리셀러 정보를 불러올 수 없습니다.");
        }
        const data = await res.json();
        setReseller(data);
        setDomain(data.domain);
        setSiteName(data.siteName);
        setLogo(data.logo || "");
        setCopyright(data.copyright || "");
        setAnalytics(data.analytics || "");
        setMetaTitle(data.metaTitle || "");
        setMetaDescription(data.metaDescription || "");
        setMetaKeywords(data.metaKeywords || "");
        setIsActive(data.isActive);
        setRevenueSharePercent(
          typeof data.revenueShareBps === "number"
            ? String(data.revenueShareBps / 100)
            : "50"
        );
        setOwnerEmail(data.ownerEmail || "");
        setSummary(data.settlementSummary ?? null);
        loadSettlements();
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchReseller();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/resellers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          siteName,
          logo,
          copyright: normalizeHtml(copyright),
          analytics,
          metaTitle,
          metaDescription,
          metaKeywords,
          isActive,
          revenueSharePercent,
          ownerEmail,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      const data = await res.json();
      setReseller((prev) => (prev ? { ...prev, ...data } : prev));
      setSuccess("변경사항이 저장되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("정말 이 리셀러를 삭제하시겠습니까?")) return;

    setDeleting(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/resellers/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "삭제에 실패했습니다.");
      }

      router.push("/admin/resellers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setDeleting(false);
    }
  }

  async function handleSettle() {
    setSettling(true);
    setSettleError("");
    try {
      const res = await fetch(`/api/admin/resellers/${id}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: settleAction,
          amount: Number(settleAmount),
          note: settleNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "정산 처리에 실패했습니다.");
      }
      setSettleAmount("");
      setSettleNote("");
      await loadSettlements();
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSettling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-500">로딩 중...</p>
      </div>
    );
  }

  if (!reseller) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-500">
          {error || "리셀러를 찾을 수 없습니다."}
        </p>
        <Link
          href="/admin/resellers"
          className="text-[#3182f6] hover:text-[#3182f6]"
        >
          리셀러 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/resellers"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; 리셀러 목록
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">리셀러 수정</h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {deleting ? "삭제 중..." : "리셀러 삭제"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              사이트명 *
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="My Reseller Site"
            />
          </div>

          <ResellerLogoField value={logo} onChange={setLogo} />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Copyright
            </label>
            <p className="text-xs text-slate-400 mb-2">
              푸터에 표시되는 저작권/안내 문구입니다. 서식·링크·줄바꿈을 자유롭게 편집할 수 있습니다.
            </p>
            <Suspense
              fallback={
                <div className="border border-slate-300 rounded-lg p-4 text-slate-400 text-sm">
                  에디터 로딩중...
                </div>
              }
            >
              <TiptapEditor
                initialHtml={copyright}
                onChange={setCopyright}
                minHeight={140}
              />
            </Suspense>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              도메인 *
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="reseller.example.com"
            />
          </div>

          <ResellerDomainGuide domain={domain} />

          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">
              메타 정보 (SEO)
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              이 도메인으로 접속했을 때 페이지 제목·검색 설명·키워드에 사용됩니다.
              비워두면 기본 homeNshop 값이 적용됩니다.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  메타 타이틀 (페이지 제목)
                </label>
                <input
                  type="text"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  placeholder={siteName || "예: 홈앤샵 - 나만의 홈페이지 빌더"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  메타 설명 (description)
                </label>
                <textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  placeholder="검색 결과에 표시되는 사이트 설명..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  메타 키워드 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={metaKeywords}
                  onChange={(e) => setMetaKeywords(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  placeholder="홈페이지 제작, 홈페이지 빌더, 다국어 홈페이지"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Analytics 코드
            </label>
            <textarea
              value={analytics}
              onChange={(e) => setAnalytics(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="Google Analytics 또는 기타 추적 코드..."
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">
              수익 분배
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              이 도메인으로 가입한 고객의 호스팅 구독 결제 금액 중 리셀러 몫
              비율입니다. 기본 50%(5:5). 정산은 결제 완료 시 자동 적립됩니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  분배율 (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={revenueSharePercent}
                  onChange={(e) => setRevenueSharePercent(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  placeholder="50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  운영자 이메일 (정산 열람 계정)
                </label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  placeholder="reseller-owner@example.com"
                />
                <p className="text-xs text-slate-400 mt-1">
                  이 계정으로 로그인하면 리셀러 정산 대시보드를 볼 수 있습니다. 비우면 해제됩니다.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              활성 상태
            </label>
            <div className="flex items-center gap-3 mt-1">
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isActive ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-slate-600">
                {isActive ? "활성" : "비활성"}
              </span>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving || !domain.trim() || !siteName.trim()}
              className="rounded-lg bg-[#3182f6] px-6 py-2 text-sm font-medium text-white hover:bg-[#1b64da] disabled:opacity-50 transition-colors"
            >
              {saving ? "저장 중..." : "변경사항 저장"}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Settlement panel ─── */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">정산 관리</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
            <div className="text-xs text-slate-500 mb-1">미지급 잔액</div>
            <div className="text-xl font-bold text-[#3182f6]">
              {(summary?.balance ?? 0).toLocaleString()}원
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
            <div className="text-xs text-slate-500 mb-1">누적 귀속 매출</div>
            <div className="text-xl font-bold text-slate-800">
              {(summary?.totalEarned ?? 0).toLocaleString()}원
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
            <div className="text-xs text-slate-500 mb-1">누적 출금</div>
            <div className="text-xl font-bold text-slate-800">
              {(summary?.totalPaidOut ?? 0).toLocaleString()}원
            </div>
          </div>
        </div>

        {/* Payout / adjustment form */}
        <div className="rounded-lg border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                구분
              </label>
              <select
                value={settleAction}
                onChange={(e) =>
                  setSettleAction(e.target.value as "payout" | "adjust")
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              >
                <option value="payout">출금 (잔액 차감)</option>
                <option value="adjust">조정 (±)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                금액 (원){settleAction === "adjust" ? " · 음수 가능" : ""}
              </label>
              <input
                type="number"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder={settleAction === "payout" ? "예: 50000" : "예: -10000"}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                메모
              </label>
              <input
                type="text"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="계좌이체 / 사유 등"
              />
            </div>
            <button
              type="button"
              onClick={handleSettle}
              disabled={settling || !settleAmount.trim()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              {settling ? "처리 중..." : "기록"}
            </button>
          </div>
          {settleError && (
            <p className="text-sm text-red-600 mt-2">{settleError}</p>
          )}
        </div>

        {/* History table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">일시</th>
                <th className="py-2 pr-3 font-medium">구분</th>
                <th className="py-2 pr-3 font-medium text-right">금액</th>
                <th className="py-2 pr-3 font-medium text-right">잔액</th>
                <th className="py-2 pr-3 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          row.kind === "EARNING"
                            ? "bg-emerald-50 text-emerald-700"
                            : row.kind === "PAYOUT"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {KIND_LABEL[row.kind]}
                      </span>
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-medium ${
                        row.amount >= 0 ? "text-slate-800" : "text-red-600"
                      }`}
                    >
                      {row.amount >= 0 ? "+" : ""}
                      {row.amount.toLocaleString()}원
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-500">
                      {row.balanceAfter.toLocaleString()}원
                    </td>
                    <td className="py-2 pr-3 text-slate-500">
                      {row.kind === "EARNING" && row.orderAmount != null
                        ? `주문 ${row.orderAmount.toLocaleString()}원 × ${((row.shareBps ?? 0) / 100).toFixed(0)}%`
                        : row.note || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
