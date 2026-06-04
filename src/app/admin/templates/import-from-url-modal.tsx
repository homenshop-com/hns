"use client";

/**
 * "URL 에서 가져오기" modal.
 *
 * Paste a published site URL (e.g. https://home.homenshop.com/{shopId}/{lang}/)
 * and capture its exact published design as a new system Template. Choose
 * PPT (legacy absolute-coordinate) or 반응형 (responsive) mode.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  onClose(): void;
}

type Mode = "ppt" | "responsive";

export default function ImportFromUrlModal({ onClose }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("ppt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<
    { name: string; editUrl: string; mode: Mode; stats: Record<string, number> } | null
  >(null);

  const hasUrl = /^https?:\/\/.+\/.+/i.test(url.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !hasUrl) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/templates/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => !busy && !result && onClose()}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, backdropFilter: "blur(2px)",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">퍼블리싱 URL 에서 가져오기</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              퍼블리싱된 사이트의 디자인을 그대로 캡처해 템플릿으로 저장합니다.
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

        {!result ? (
          <>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  퍼블리싱 URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://home.homenshop.com/konnichiwasushi/en/"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#3182f6]/40"
                  disabled={busy}
                  autoFocus
                />
                <div className="mt-1.5 text-xs">
                  {hasUrl ? (
                    <span className="text-emerald-600">✓ URL 형식 확인됨</span>
                  ) : (
                    <span className="text-slate-400">
                      /{`{shopId}`}/{`{lang}`}/ 형태의 퍼블리싱 주소를 입력하세요
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  레이아웃 방식
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMode("ppt")}
                    className={`text-left rounded-md border px-3 py-2.5 transition-colors ${
                      mode === "ppt"
                        ? "border-[#3182f6] bg-[#3182f6]/5 ring-1 ring-[#3182f6]/30"
                        : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-800">PPT 방식</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      레거시 절대좌표(드래그앤드롭). 퍼블리싱된 디자인을 그대로 유지.
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMode("responsive")}
                    className={`text-left rounded-md border px-3 py-2.5 transition-colors ${
                      mode === "responsive"
                        ? "border-[#3182f6] bg-[#3182f6]/5 ring-1 ring-[#3182f6]/30"
                        : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-800">반응형 방식</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      모던 반응형 마커 적용. 모바일 대응 우선 (레이아웃 변형 가능).
                    </div>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600 leading-relaxed">
                <div className="font-semibold text-slate-700 mb-1.5">이 기능은:</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>퍼블리싱된 HTML 을 그대로 가져와 헤더·메뉴·푸터·CSS 캡처</li>
                  <li>네비게이션 링크를 따라 각 페이지 본문 자동 수집</li>
                  <li>깨진 scene-graph(layers) 없이 published HTML 만 저장</li>
                  <li>시스템 템플릿(비공개)으로 저장 → 기본정보 페이지로 이동</li>
                </ul>
                <div className="mt-2 text-slate-500">
                  이미지/업로드 자원은 원본 사이트 주소를 그대로 가리킵니다. 다운로드 중에는 모달을 닫지 마세요.
                </div>
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
                disabled={busy || !hasUrl}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#3182f6] text-white text-sm font-semibold rounded-md hover:bg-[#3182f6]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy && (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {busy ? "캡처 중…" : "가져오기"}
              </button>
            </footer>
          </>
        ) : (
          <div className="px-6 py-8 text-center">
            <div className="w-14 h-14 mx-auto bg-emerald-50 rounded-full grid place-items-center text-emerald-600 text-2xl mb-4">
              ✓
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-1">캡처 완료</h4>
            <p className="text-sm text-slate-600 mb-1">
              <b>{result.name}</b> 템플릿이 비공개 상태로 저장되었습니다.
            </p>
            <p className="text-xs text-slate-500 mb-5">
              {result.mode === "responsive" ? "반응형" : "PPT(레거시 절대좌표)"} 모드
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-w-xs mx-auto text-xs text-slate-600 mb-6">
              <dt>페이지</dt>
              <dd className="font-mono text-slate-800 text-right">{result.stats.pages}</dd>
              <dt>CSS</dt>
              <dd className="font-mono text-slate-800 text-right">{result.stats.cssChars.toLocaleString()} chars</dd>
              <dt>헤더</dt>
              <dd className="font-mono text-slate-800 text-right">{result.stats.headerChars.toLocaleString()} chars</dd>
              <dt>푸터</dt>
              <dd className="font-mono text-slate-800 text-right">{result.stats.footerChars.toLocaleString()} chars</dd>
            </dl>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.refresh();
                }}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50"
              >
                목록으로 돌아가기
              </button>
              <button
                type="button"
                onClick={() => router.push(result.editUrl)}
                className="px-5 py-2 bg-[#3182f6] text-white text-sm font-semibold rounded-md hover:bg-[#3182f6]/90"
              >
                기본정보 편집하기 →
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
