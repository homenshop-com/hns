"use client";

/**
 * "템플릿으로 사이트 만들기" — admin/reseller creates a new Site for THIS
 * member from a template (no new user). Pairs with the URL-capture import
 * flow: capture a published design into a system Template, then instantiate
 * it here under a fresh shopId.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface TemplateOption {
  id: string;
  name: string;
  category: string | null;
  isResponsive: boolean;
  isPublic: boolean;
  thumbnailUrl: string | null;
}

interface Props {
  userId: string;
  onClose(): void;
}

const LANGS = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh-cn", label: "简体中文" },
  { code: "zh-tw", label: "繁體中文" },
  { code: "es", label: "Español" },
];

export default function CreateSiteFromTemplate({ userId, onClose }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [shopId, setShopId] = useState("");
  const [lang, setLang] = useState("ko");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; shopId: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/templates/options");
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && Array.isArray(data.templates)) {
          setTemplates(data.templates);
          if (data.templates.length > 0) setTemplateId(data.templates[0].id);
        } else {
          setError(data.error ?? "템플릿 목록을 불러올 수 없습니다.");
        }
      } catch {
        if (active) setError("템플릿 목록을 불러올 수 없습니다.");
      } finally {
        if (active) setLoadingTemplates(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const shopIdValid = /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(shopId);
  const canSubmit = !!templateId && shopIdValid && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sites/create-from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, userId, shopId, defaultLanguage: lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setCreated({ id: data.site.id, shopId: data.site.shopId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, backdropFilter: "blur(2px)",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">템플릿으로 사이트 만들기</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              이 회원에게 템플릿 기반 새 사이트를 생성합니다.
            </p>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
              aria-label="닫기"
            >
              ×
            </button>
          )}
        </header>

        {!created ? (
          <>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">템플릿</label>
                {loadingTemplates ? (
                  <p className="text-sm text-slate-400">불러오는 중…</p>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-slate-400">사용 가능한 템플릿이 없습니다.</p>
                ) : (
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    disabled={busy}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]/40"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.isResponsive ? " · 반응형" : " · PPT"}
                        {t.isPublic ? "" : " · 비공개"}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Account ID (shopId)
                </label>
                <input
                  type="text"
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value.toLowerCase())}
                  placeholder="konnichiwasushi2"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#3182f6]/40"
                  disabled={busy}
                  autoFocus
                />
                <div className="mt-1.5 text-xs">
                  {shopId.length === 0 ? (
                    <span className="text-slate-400">소문자·숫자·하이픈, 6~14자</span>
                  ) : shopIdValid ? (
                    <span className="text-emerald-600">✓ 사용 가능한 형식</span>
                  ) : (
                    <span className="text-red-500">형식이 올바르지 않습니다 (소문자·숫자·하이픈, 6~14자)</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">기본 언어</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]/40"
                >
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2.5 text-sm text-red-800">
                  {error}
                </div>
              )}
            </div>

            <footer className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#3182f6] text-white text-sm font-semibold rounded-md hover:bg-[#1b64da] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy && (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {busy ? "생성 중…" : "사이트 생성"}
              </button>
            </footer>
          </>
        ) : (
          <div className="px-6 py-8 text-center">
            <div className="w-14 h-14 mx-auto bg-emerald-50 rounded-full grid place-items-center text-emerald-600 text-2xl mb-4">
              ✓
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-1">사이트 생성 완료</h4>
            <p className="text-sm text-slate-600 mb-5">
              <b className="font-mono">{created.shopId}</b> 사이트가 생성되었습니다.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.refresh();
                }}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => router.push(`/admin/sites/${created.id}`)}
                className="px-5 py-2 bg-[#3182f6] text-white text-sm font-semibold rounded-md hover:bg-[#1b64da]"
              >
                사이트 상세보기 →
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
