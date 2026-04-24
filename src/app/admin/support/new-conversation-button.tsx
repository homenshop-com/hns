"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Admin → start a new support conversation with any user (even if
 * they haven't messaged first). Click opens a search modal backed by
 * /api/admin/members?search=. Picking a user navigates to
 * /admin/support/[userId] where the admin can type the first message —
 * the thread is lazy-created on POST.
 */
export default function NewConversationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ("");
      setResults([]);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    // Empty query still shows the most recent users (no search param).
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = term
          ? `/api/admin/members?search=${encodeURIComponent(term)}`
          : `/api/admin/members`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("검색 실패");
        const data = await res.json();
        setResults(Array.isArray(data.members) ? data.members.slice(0, 20) : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") setOpen(false);
  }

  function pick(m: Member) {
    setOpen(false);
    router.push(`/admin/support/${m.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#405189] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#364574] transition-colors"
      >
        <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
        고객에게 먼저 문의하기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          onKeyDown={handleKey}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="#8a91a8" strokeWidth={1.6}>
                <circle cx="9" cy="9" r="5.5" />
                <path d="M13 13l4 4" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="고객 이메일 또는 이름 검색…"
                className="flex-1 outline-none text-sm bg-transparent placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center text-sm text-slate-400">검색 중…</div>
              ) : results.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  {q.trim() ? "일치하는 고객이 없습니다." : "검색어를 입력하세요."}
                </div>
              ) : (
                results.map((m) => {
                  const display = m.name || m.email.split("@")[0];
                  const avatar = (display || m.email)[0].toUpperCase();
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pick(m)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white grid place-items-center font-bold text-sm shrink-0">
                        {avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {display}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {m.email}
                        </div>
                      </div>
                      <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="#8a91a8" strokeWidth={1.6}>
                        <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  );
                })
              )}
            </div>
            <div className="px-4 py-2.5 bg-slate-50 text-[11px] text-slate-500 border-t border-slate-100">
              선택한 고객의 채팅창으로 이동합니다. 첫 메시지를 보내면 대화가 시작돼요.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
