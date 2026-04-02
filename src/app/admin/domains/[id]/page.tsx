"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface DomainDetail {
  id: string;
  domain: string;
  status: string;
  sslEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  site: {
    id: string;
    name: string;
  };
}

export default function AdminDomainDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [status, setStatus] = useState("");
  const [sslEnabled, setSslEnabled] = useState(false);

  useEffect(() => {
    async function fetchDomain() {
      try {
        const res = await fetch(`/api/admin/domains/${id}`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          if (res.status === 403) {
            router.push("/dashboard");
            return;
          }
          throw new Error("도메인 정보를 불러올 수 없습니다.");
        }
        const data = await res.json();
        setDomain(data);
        setStatus(data.status);
        setSslEnabled(data.sslEnabled);
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchDomain();
  }, [id, router]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/domains/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, sslEnabled }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      const data = await res.json();
      setDomain(data);
      setSuccess("변경사항이 저장되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-500">로딩 중...</p>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-500">
          {error || "도메인을 찾을 수 없습니다."}
        </p>
        <Link href="/admin/domains" className="text-cyan-400 hover:text-cyan-300">
          도메인 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/domains"
          className="text-sm text-slate-500 hover:text-slate-300"
        >
          &larr; 도메인 목록
        </Link>
      </div>

      <h1 className="text-xl font-bold text-slate-100 mb-6">도메인 상세정보</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Domain Info */}
        <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 p-6">
          <h2 className="text-base font-semibold text-slate-200 mb-4">도메인 정보</h2>
          <dl className="space-y-3">
            <div className="flex justify-between items-center"><dt className="text-sm text-slate-500">도메인</dt><dd className="text-sm text-slate-200 font-mono text-xs"><a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">{domain.domain} ↗</a></dd></div>
            <InfoRow label="ID" value={domain.id} mono />
            <InfoRow
              label="등록일"
              value={new Date(domain.createdAt).toLocaleString("ko-KR")}
            />
            <InfoRow
              label="수정일"
              value={new Date(domain.updatedAt).toLocaleString("ko-KR")}
            />
          </dl>
        </div>

        {/* Owner Info */}
        <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 p-6">
          <h2 className="text-base font-semibold text-slate-200 mb-4">소유자 정보</h2>
          <dl className="space-y-3">
            <InfoRow label="이메일" value={domain.user.email} />
            <InfoRow label="이름" value={domain.user.name || "-"} />
            <InfoRow label="사이트" value={domain.site.name} />
          </dl>
          <div className="mt-4">
            <Link
              href={`/admin/members/${domain.user.id}`}
              className="text-sm text-cyan-400 hover:text-cyan-300"
            >
              회원 상세보기
            </Link>
          </div>
        </div>

        {/* Status & SSL Edit */}
        <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-200 mb-4">상태 및 SSL 설정</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                도메인 상태
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
              >
                <option value="PENDING">PENDING (대기중)</option>
                <option value="ACTIVE">ACTIVE (활성)</option>
                <option value="EXPIRED">EXPIRED (만료)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                SSL 인증서
              </label>
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setSslEnabled(!sslEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    sslEnabled ? "bg-emerald-500" : "bg-zinc-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-[#1e293b]/80 transition-transform ${
                      sslEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-400">
                  {sslEnabled ? "활성" : "비활성"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-6 rounded-lg bg-cyan-500 px-6 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "저장 중..." : "변경사항 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
