"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface SiteInfo {
  id: string;
  name: string;
  shopId: string;
  tempDomain: string;
  published: boolean;
}

interface MemberDetail {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  status: string;
  emailVerified: string | null;
  createdAt: string;
  updatedAt: string;
  sites: SiteInfo[];
  _count: {
    orders: number;
    domains: number;
  };
}

interface CreditTxn {
  id: string;
  amount: number;
  balanceAfter: number;
  kind: string;
  description: string | null;
  createdAt: string;
}

export default function AdminMemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  // Credits
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditTxn[]>([]);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDesc, setAdjustDesc] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  async function loadCredits(targetId: string) {
    try {
      const res = await fetch(`/api/admin/members/${targetId}/credits`);
      if (!res.ok) return;
      const data = await res.json();
      setCreditBalance(data.balance);
      setCreditHistory(data.history || []);
    } catch {
      // soft-fail — credits UI hides if unavailable
    }
  }

  async function handleAdjust() {
    setAdjustError("");
    const n = parseInt(adjustAmount, 10);
    if (!Number.isInteger(n) || n === 0) {
      setAdjustError("금액은 0이 아닌 정수여야 합니다.");
      return;
    }
    setAdjustSaving(true);
    try {
      const res = await fetch(`/api/admin/members/${id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: n, description: adjustDesc || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdjustError(data.error || "조정에 실패했습니다.");
      } else {
        setAdjustAmount("");
        setAdjustDesc("");
        await loadCredits(id);
      }
    } catch {
      setAdjustError("네트워크 오류");
    } finally {
      setAdjustSaving(false);
    }
  }

  useEffect(() => {
    async function fetchMember() {
      try {
        const res = await fetch(`/api/admin/members/${id}`);
        if (!res.ok) {
          if (res.status === 403) { router.push("/dashboard"); return; }
          throw new Error("회원 정보를 불러올 수 없습니다.");
        }
        const data = await res.json();
        setMember(data);
        setName(data.name || "");
        setEmail(data.email);
        setPhone(data.phone || "");
        setRole(data.role);
        setStatus(data.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchMember();
    loadCredits(id);
  }, [id, router]);

  async function handleToggleEmailVerified() {
    if (!member) return;
    const willVerify = !member.emailVerified;
    const confirmMsg = willVerify
      ? "이 회원을 이메일 인증 완료 상태로 처리하시겠습니까?"
      : "이메일 인증을 해제하시겠습니까? (다시 로그인 시 인증 필요)";
    if (!window.confirm(confirmMsg)) return;
    setVerifyingEmail(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailVerified: willVerify }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "처리에 실패했습니다.");
      setMember(data);
      setSuccess(willVerify ? "이메일 인증 완료로 처리되었습니다." : "이메일 인증이 해제되었습니다.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setVerifyingEmail(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, role, status }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      const data = await res.json();
      setMember(data);
      setSuccess("변경사항이 저장되었습니다.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-slate-500">로딩 중...</p></div>;
  }

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-500">{error || "회원을 찾을 수 없습니다."}</p>
        <Link href="/admin/members" className="text-[#405189] hover:text-[#405189]">회원 목록으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/members" className="text-sm text-slate-500 hover:text-[#405189] transition-colors">
          &larr; 회원 목록
        </Link>
      </div>

      <h1 className="text-xl font-bold text-slate-900 mb-6">회원 상세정보</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info - Editable */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">기본 정보</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">ID</label>
              <p className="font-mono text-xs text-slate-600">{member.id}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#405189] focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {member.emailVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <svg width={12} height={12} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      인증 완료
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                      <svg width={12} height={12} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                      미인증
                    </span>
                  )}
                  {member.emailVerified && (
                    <span className="text-[11px] text-slate-500">
                      {new Date(member.emailVerified).toLocaleString("ko-KR")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleToggleEmailVerified}
                  disabled={verifyingEmail}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    member.emailVerified
                      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      : "bg-[#405189] text-white hover:bg-[#364574]"
                  }`}
                >
                  {verifyingEmail ? "처리 중..." : member.emailVerified ? "인증 해제" : "인증 완료 처리"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#405189] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">전화번호</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#405189] focus:outline-none"
                placeholder="-"
              />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">가입일</label>
                <p className="text-xs text-slate-600">{new Date(member.createdAt).toLocaleString("ko-KR")}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">수정일</label>
                <p className="text-xs text-slate-600">{new Date(member.updatedAt).toLocaleString("ko-KR")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Role & Status */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">역할 및 상태</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">역할</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#405189] focus:outline-none"
              >
                <option value="MEMBER">MEMBER (일반 회원)</option>
                <option value="RESELLER">RESELLER (리셀러)</option>
                <option value="ADMIN">ADMIN (관리자)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">상태</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#405189] focus:outline-none"
              >
                <option value="ACTIVE">ACTIVE (활성)</option>
                <option value="SUSPENDED">SUSPENDED (정지)</option>
                <option value="DELETED">DELETED (삭제)</option>
              </select>
            </div>

            {/* Stats */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">활동 현황</h3>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">주문 수</span>
                <span className="text-sm text-slate-800">{member._count.orders}건</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">도메인 수</span>
                <span className="text-sm text-slate-800">{member._count.domains}개</span>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574] disabled:opacity-50 transition-colors"
            >
              {saving ? "저장 중..." : "변경사항 저장"}
            </button>

            <Link
              href={`/admin/support/${id}`}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M4 4h12a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 3v-3H4a1 1 0 01-1-1V5a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              이 고객에게 채팅 보내기
            </Link>
          </div>
        </div>

        {/* Credits */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">AI 크레딧</h2>
            {creditBalance !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700 ring-1 ring-violet-200">
                <span>✨</span>
                <span className="tabular-nums">{creditBalance.toLocaleString()}</span>
                <span className="text-violet-400 text-xs">C</span>
              </span>
            )}
          </div>

          {/* Adjust form */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 mb-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">크레딧 조정</div>
            <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-3">
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="금액 (예: +100, -50)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#405189] focus:outline-none"
              />
              <input
                type="text"
                value={adjustDesc}
                onChange={(e) => setAdjustDesc(e.target.value)}
                placeholder="사유 (내역에 기록됨)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#405189] focus:outline-none"
              />
              <button
                onClick={handleAdjust}
                disabled={adjustSaving || !adjustAmount}
                className="rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574] disabled:opacity-50 transition-colors"
              >
                {adjustSaving ? "처리 중..." : "적용"}
              </button>
            </div>
            {adjustError && (
              <div className="mt-2 text-xs text-red-600">{adjustError}</div>
            )}
            <div className="mt-2 text-[11px] text-slate-500">
              양수 = 지급 (ADMIN_GRANT), 음수 = 차감 (ADMIN_DEBIT). ±1,000,000 C 이내.
            </div>
          </div>

          {/* History */}
          {creditHistory.length === 0 ? (
            <p className="text-sm text-slate-500">아직 거래 내역이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">시각</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">유형</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">설명</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">변동</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditHistory.map((row) => {
                    const positive = row.amount > 0;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700">
                            {row.kind}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 max-w-[300px] truncate">{row.description || "—"}</td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${positive ? "text-emerald-700" : "text-red-700"}`}>
                          {positive ? "+" : ""}{row.amount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{row.balanceAfter.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sites */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-800 mb-4">사이트 정보 ({member.sites.length})</h2>
          {member.sites.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">사이트명</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Account ID</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">공개</th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {member.sites.map((site) => (
                    <tr key={site.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800">{site.name}</td>
                      <td className="px-4 py-3 font-mono text-xs"><a href={`https://${site.tempDomain || "home.homenshop.com"}/${site.shopId}`} target="_blank" rel="noopener noreferrer" className="text-[#405189] hover:text-[#405189]">{site.shopId} ↗</a></td>
                      <td className="px-4 py-3">
                        {site.published ? (
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-200">공개</span>
                        ) : (
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset bg-slate-500/10 text-slate-600 ring-slate-400/20">비공개</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/sites/${site.id}`} className="text-xs text-[#405189] hover:text-[#405189]">
                          View &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">생성된 사이트가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
