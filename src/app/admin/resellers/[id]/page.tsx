"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ResellerDetail {
  id: string;
  domain: string;
  siteName: string;
  logo: string | null;
  copyright: string | null;
  analytics: string | null;
  isActive: boolean;
}

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
  const [isActive, setIsActive] = useState(true);

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
        setIsActive(data.isActive);
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchReseller();
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
          copyright,
          analytics,
          isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      const data = await res.json();
      setReseller(data);
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
          className="text-[#405189] hover:text-[#405189]"
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              로고 URL
            </label>
            <input
              type="text"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Copyright
            </label>
            <input
              type="text"
              value={copyright}
              onChange={(e) => setCopyright(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="© 2026 My Company. All rights reserved."
            />
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
              className="rounded-lg bg-[#405189] px-6 py-2 text-sm font-medium text-white hover:bg-[#364574] disabled:opacity-50 transition-colors"
            >
              {saving ? "저장 중..." : "변경사항 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
