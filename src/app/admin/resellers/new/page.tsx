"use client";

import { useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ResellerLogoField from "@/components/admin/ResellerLogoField";
import ResellerDomainGuide from "@/components/admin/ResellerDomainGuide";

const TiptapEditor = lazy(() => import("@/components/tiptap-editor"));

/** TipTap emits `<p></p>` for an empty doc — treat that as no value. */
function normalizeHtml(html: string): string {
  return html.replace(/<p>\s*<\/p>/g, "").trim();
}

export default function AdminResellerNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
          copyright: normalizeHtml(copyright) || null,
          analytics: analytics.trim() || null,
          metaTitle: metaTitle.trim() || null,
          metaDescription: metaDescription.trim() || null,
          metaKeywords: metaKeywords.trim() || null,
          isActive,
          revenueSharePercent,
          ownerEmail: ownerEmail.trim(),
        }),
      });

      // Read the body defensively — an empty or non-JSON response (e.g. an
      // unexpected 500) must not surface as "Unexpected end of JSON input".
      const raw = await res.text();
      let data: { id?: string; error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          /* keep data empty; fall through to status-based message */
        }
      }

      if (!res.ok) {
        throw new Error(
          data.error || `리셀러 생성에 실패했습니다. (오류 ${res.status})`
        );
      }

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
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; 리셀러 목록
        </Link>
      </div>

      <h1 className="text-xl font-bold text-slate-900 mb-6">리셀러 추가</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
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
              required
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
              required
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
              이 도메인으로 가입한 고객의 호스팅 구독 결제 중 리셀러 몫 비율입니다.
              기본 50%(5:5).
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
              type="submit"
              disabled={saving || !domain.trim() || !siteName.trim()}
              className="rounded-lg bg-[#3182f6] px-6 py-2 text-sm font-medium text-white hover:bg-[#1b64da] disabled:opacity-50 transition-colors"
            >
              {saving ? "생성 중..." : "리셀러 생성"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
