"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface SiteInfo {
  id: string;
  name: string;
  shopId: string;
  published: boolean;
}

interface MemberDetail {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sites: SiteInfo[];
  _count: {
    orders: number;
    domains: number;
  };
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
  }, [id, router]);

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
          </div>
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
                      <td className="px-4 py-3 font-mono text-xs"><a href={`https://home.homenshop.com/${site.shopId}`} target="_blank" rel="noopener noreferrer" className="text-[#405189] hover:text-[#405189]">{site.shopId} ↗</a></td>
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
