"use client";

/**
 * "계정 100% 복제" modal — duplicate an existing site into a new shopId.
 * Copies all design + content exactly; the new site lands active & private-
 * ready under the same owner (admin can reassign / publish afterwards).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  sourceSiteId: string;
  sourceShopId: string;
  sourceName: string;
  onClose(): void;
}

export default function CloneSiteModal({
  sourceSiteId,
  sourceShopId,
  sourceName,
  onClose,
}: Props) {
  const router = useRouter();
  const [newShopId, setNewShopId] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<
    | { id: string; shopId: string; name: string; assetsCopied: { legacy: boolean; siteUploads: boolean } }
    | null
  >(null);

  const shopIdValid = /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(newShopId);
  const canSubmit = shopIdValid && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/sites/${sourceSiteId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newShopId, newName: newName.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult({ ...data.site, assetsCopied: data.assetsCopied });
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
            <h3 className="text-lg font-bold text-slate-900">계정 100% 복제</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono">{sourceShopId}</span> 의 모든 디자인·페이지·게시판·상품을 새 계정으로 복제합니다.
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
                  새 Account ID (shopId)
                </label>
                <input
                  type="text"
                  value={newShopId}
                  onChange={(e) => setNewShopId(e.target.value.toLowerCase())}
                  placeholder={`${sourceShopId}2`}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#3182f6]/40"
                  disabled={busy}
                  autoFocus
                />
                <div className="mt-1.5 text-xs">
                  {newShopId.length === 0 ? (
                    <span className="text-slate-400">소문자·숫자·하이픈, 6~14자</span>
                  ) : shopIdValid ? (
                    <span className="text-emerald-600">✓ 사용 가능한 형식</span>
                  ) : (
                    <span className="text-red-500">형식이 올바르지 않습니다 (소문자·숫자·하이픈, 6~14자)</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  사이트명 <span className="font-normal text-slate-400">(선택 — 비우면 원본과 동일)</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={sourceName}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]/40"
                  disabled={busy}
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600 leading-relaxed">
                <div className="font-semibold text-slate-700 mb-1.5">복제 내용:</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>헤더·메뉴·푸터·CSS, 모든 페이지(본문·SEO), 다국어 설정</li>
                  <li>게시판(카테고리·게시물·댓글·플러그인), 상품(카테고리·플러그인)</li>
                  <li>이미지 경로를 새 shopId 로 치환 + 업로드 폴더 복사(서버)</li>
                  <li>원본 소유자에게 활성(1년) 계정으로 생성 — 도메인·주문은 복제 안 함</li>
                </ul>
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
                {busy ? "복제 중…" : "복제하기"}
              </button>
            </footer>
          </>
        ) : (
          <div className="px-6 py-8 text-center">
            <div className="w-14 h-14 mx-auto bg-emerald-50 rounded-full grid place-items-center text-emerald-600 text-2xl mb-4">
              ✓
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-1">복제 완료</h4>
            <p className="text-sm text-slate-600 mb-1">
              <b className="font-mono">{result.shopId}</b> 계정이 생성되었습니다.
            </p>
            <p className="text-xs text-slate-500 mb-5">
              업로드 폴더 복사: 레거시 {result.assetsCopied.legacy ? "✓" : "—"} · 사이트 {result.assetsCopied.siteUploads ? "✓" : "—"}
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
                목록 새로고침
              </button>
              <button
                type="button"
                onClick={() => router.push(`/admin/sites/${result.id}`)}
                className="px-5 py-2 bg-[#3182f6] text-white text-sm font-semibold rounded-md hover:bg-[#1b64da]"
              >
                새 계정 상세보기 →
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
