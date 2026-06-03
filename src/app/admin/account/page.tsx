"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import ResellerLogoField from "@/components/admin/ResellerLogoField";
import ResellerDomainGuide from "@/components/admin/ResellerDomainGuide";

const TiptapEditor = lazy(() => import("@/components/tiptap-editor"));

/** TipTap emits `<p></p>` for an empty doc — treat that as no value. */
function normalizeHtml(html: string): string {
  return html.replace(/<p>\s*<\/p>/g, "").trim();
}

interface MyReseller {
  id: string;
  domain: string;
  siteName: string;
  logo: string | null;
  copyright: string | null;
  analytics: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  revenueShareBps: number;
  isActive: boolean;
}

export default function MyResellerSettingsPage() {
  const router = useRouter();

  const [reseller, setReseller] = useState<MyReseller | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [siteName, setSiteName] = useState("");
  const [logo, setLogo] = useState("");
  const [copyright, setCopyright] = useState("");
  const [analytics, setAnalytics] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");

  useEffect(() => {
    async function fetchReseller() {
      try {
        const res = await fetch("/api/admin/my-reseller");
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          if (res.status === 403) {
            router.push("/admin");
            return;
          }
          throw new Error("리셀러 정보를 불러올 수 없습니다.");
        }
        const data: MyReseller = await res.json();
        setReseller(data);
        setSiteName(data.siteName);
        setLogo(data.logo || "");
        setCopyright(data.copyright || "");
        setAnalytics(data.analytics || "");
        setMetaTitle(data.metaTitle || "");
        setMetaDescription(data.metaDescription || "");
        setMetaKeywords(data.metaKeywords || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchReseller();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/my-reseller", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName,
          logo,
          copyright: normalizeHtml(copyright),
          analytics,
          metaTitle,
          metaDescription,
          metaKeywords,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }
      const data: MyReseller = await res.json();
      setReseller(data);
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

  if (!reseller) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-500">
          {error || "리셀러 정보를 찾을 수 없습니다."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">리셀러 설정</h1>
        <p className="text-sm text-slate-500 mt-1">
          내 도메인의 사이트명·로고·푸터 문구·검색 정보를 직접 수정할 수
          있습니다.
        </p>
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
              푸터에 표시되는 저작권/안내 문구입니다. 서식·링크·줄바꿈을 자유롭게
              편집할 수 있습니다.
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

          {/* Domain — read only. Resellers cannot rename their own domain. */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              도메인
            </label>
            <input
              type="text"
              value={reseller.domain}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">
              도메인 변경은 플랫폼 관리자에게 문의하세요.
            </p>
          </div>

          <ResellerDomainGuide domain={reseller.domain} />

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

          {/* Revenue share — informational only, set by the platform admin. */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">
              수익 분배
            </h2>
            <p className="text-xs text-slate-400 mb-2">
              내 도메인으로 가입한 고객의 호스팅 구독 결제 중 내 몫 비율입니다.
              분배율은 플랫폼 관리자가 설정합니다.
            </p>
            <div className="inline-flex items-baseline gap-2 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
              <span className="text-2xl font-bold text-[#3182f6]">
                {(reseller.revenueShareBps / 100).toFixed(0)}%
              </span>
              <span className="text-xs text-slate-500">현재 분배율</span>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving || !siteName.trim()}
              className="rounded-lg bg-[#3182f6] px-6 py-2 text-sm font-medium text-white hover:bg-[#1b64da] disabled:opacity-50 transition-colors"
            >
              {saving ? "저장 중..." : "변경사항 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
