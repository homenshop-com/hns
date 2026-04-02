"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminResellerNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [domain, setDomain] = useState("");
  const [siteName, setSiteName] = useState("");
  const [logo, setLogo] = useState("");
  const [copyright, setCopyright] = useState("");
  const [analytics, setAnalytics] = useState("");
  const [isActive, setIsActive] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/resellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          siteName: siteName.trim(),
          logo: logo.trim() || null,
          copyright: copyright.trim() || null,
          analytics: analytics.trim() || null,
          isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "리셀러 생성에 실패했습니다.");
      }

      const data = await res.json();
      router.push(`/admin/resellers/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/resellers"
          className="text-sm text-slate-500 hover:text-slate-300"
        >
          &larr; 리셀러 목록
        </Link>
      </div>

      <h1 className="text-xl font-bold text-slate-100 mb-6">리셀러 추가</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 p-6">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              도메인 *
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
              placeholder="reseller.example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              사이트명 *
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
              placeholder="My Reseller Site"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              로고 URL
            </label>
            <input
              type="text"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              className="w-full rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Copyright
            </label>
            <input
              type="text"
              value={copyright}
              onChange={(e) => setCopyright(e.target.value)}
              className="w-full rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
              placeholder="© 2026 My Company. All rights reserved."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Analytics 코드
            </label>
            <textarea
              value={analytics}
              onChange={(e) => setAnalytics(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
              placeholder="Google Analytics 또는 기타 추적 코드..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
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
                  className={`inline-block h-4 w-4 transform rounded-full bg-[#1e293b]/80 transition-transform ${
                    isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-slate-400">
                {isActive ? "활성" : "비활성"}
              </span>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving || !domain.trim() || !siteName.trim()}
              className="rounded-lg bg-cyan-500 px-6 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "생성 중..." : "리셀러 생성"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
