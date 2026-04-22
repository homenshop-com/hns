"use client";

/**
 * "템플릿 추가 (Claude Design)" modal.
 *
 * UX: admin pastes the command they copied from
 *   claude.ai/design → Share → Handoff to Claude Code
 *   → Send to local coding agent → Copy command
 *
 * The command looks like:
 *   Fetch this design file, read its readme, and implement ...
 *   https://api.anthropic.com/v1/design/h/<hash>?open_file=<file>.html
 *   Implement: <file>.html
 *
 * Backend fetches the bundle, hands both README + HTML to Sonnet, and
 * inserts the converted template. Admin gets redirected to the new
 * template's basic-info page to polish the thumbnail / category.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  onClose(): void;
}

export default function ImportFromDesignModal({ onClose }: Props) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ name: string; editUrl: string; stats: Record<string, number> } | null>(null);

  const hasUrl = /https:\/\/api\.anthropic\.com\/v1\/design\/h\//.test(command);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !hasUrl) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/templates/import-from-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim() }),
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
            <h3 className="text-lg font-bold text-slate-900">Claude Design 에서 가져오기</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              claude.ai/design → Share → Handoff to Claude Code → Copy command
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
                  붙여넣기 <span className="text-slate-400 font-normal">— Copy command 로 복사한 전체 내용</span>
                </label>
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  rows={6}
                  placeholder={`Fetch this design file, read its readme, and implement the relevant aspects of the design. https://api.anthropic.com/v1/design/h/Ew1rboXzg8jvyZRliOU0AA?open_file=Plus+Academy.html\n\nImplement: Plus Academy.html`}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#405189]/40 resize-y"
                  disabled={busy}
                  autoFocus
                />
                <div className="mt-1.5 text-xs flex items-center gap-2">
                  {hasUrl ? (
                    <span className="text-emerald-600">✓ design URL 감지됨</span>
                  ) : (
                    <span className="text-slate-400">api.anthropic.com/v1/design/h/... 형식의 URL 이 포함되어야 합니다</span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600 leading-relaxed">
                <div className="font-semibold text-slate-700 mb-1.5">이 기능은:</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>디자인 번들 다운로드 → README + HTML 프로토타입 추출</li>
                  <li>Claude Sonnet 으로 homeNshop 원자-레이어 템플릿 형식으로 변환</li>
                  <li>3–6 페이지 자동 분할 (index / about / services / contact 등)</li>
                  <li>시스템 템플릿 (비공개) 으로 저장 → 기본정보 페이지로 이동</li>
                </ul>
                <div className="mt-2 text-slate-500">
                  변환에 30–90초 소요됩니다. 다운로드/AI 호출 중에는 모달을 닫지 마세요.
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
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#405189] text-white text-sm font-semibold rounded-md hover:bg-[#405189]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy && (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {busy ? "변환 중…" : "가져오기"}
              </button>
            </footer>
          </>
        ) : (
          <div className="px-6 py-8 text-center">
            <div className="w-14 h-14 mx-auto bg-emerald-50 rounded-full grid place-items-center text-emerald-600 text-2xl mb-4">
              ✓
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-1">변환 완료</h4>
            <p className="text-sm text-slate-600 mb-5">
              <b>{result.name}</b> 템플릿이 비공개 상태로 저장되었습니다.
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
              <dt>원본 HTML</dt>
              <dd className="font-mono text-slate-800 text-right">{result.stats.htmlChars.toLocaleString()} chars</dd>
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
                className="px-5 py-2 bg-[#405189] text-white text-sm font-semibold rounded-md hover:bg-[#405189]/90"
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
