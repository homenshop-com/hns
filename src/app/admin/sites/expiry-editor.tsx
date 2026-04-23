"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ACCOUNT_TYPES: Array<{ value: string; label: string }> = [
  { value: "0", label: "무료" },
  { value: "1", label: "유료" },
  { value: "2", label: "테스트" },
  { value: "9", label: "만료(하드)" },
];

type Props = {
  siteId: string;
  shopId: string;
  accountType: string;
  expiresAt: string | null;
};

function addDays(base: Date | null, days: number): Date {
  const start = base && base.getTime() > Date.now() ? new Date(base) : new Date();
  start.setUTCDate(start.getUTCDate() + days);
  return start;
}

function toDateInput(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ExpiryEditor({
  siteId,
  shopId,
  accountType,
  expiresAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentExpiry = expiresAt ? new Date(expiresAt) : null;
  const isExpired = currentExpiry ? currentExpiry.getTime() < Date.now() : false;

  const [dateInput, setDateInput] = useState(toDateInput(currentExpiry));
  const [typeInput, setTypeInput] = useState(accountType);

  useEffect(() => {
    setDateInput(toDateInput(currentExpiry));
    setTypeInput(accountType);
  }, [accountType, expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function patch(body: { expiresAt?: string | null; accountType?: string }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`실패: ${j.error || res.statusText}`);
        return;
      }
      startTransition(() => router.refresh());
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function quickExtend(days: number) {
    const next = addDays(currentExpiry, days);
    patch({ expiresAt: next.toISOString() });
  }

  function setUnlimited() {
    if (!confirm(`${shopId}의 만료일을 해제하시겠습니까? (무기한)`)) return;
    patch({ expiresAt: null });
  }

  function saveManual() {
    const body: { expiresAt?: string | null; accountType?: string } = {};
    if (dateInput !== toDateInput(currentExpiry)) {
      body.expiresAt = dateInput
        ? new Date(dateInput + "T23:59:59").toISOString()
        : null;
    }
    if (typeInput !== accountType) {
      body.accountType = typeInput;
    }
    if (Object.keys(body).length === 0) {
      setOpen(false);
      return;
    }
    patch(body);
  }

  const isBusy = saving || pending;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#405189] ml-1"
        title="만료일/계정 유형 조정"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 z-50 mt-2 w-[280px] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl"
          style={{ top: "100%" }}
        >
          <div className="mb-2 text-xs font-semibold text-slate-600">
            {shopId} 만료 조정
          </div>
          <div className="mb-2 text-[11px] text-slate-500">
            현재: {currentExpiry ? currentExpiry.toLocaleDateString("ko-KR") : "무기한"}
            {isExpired && <span className="ml-1 text-red-600">(만료됨)</span>}
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            <button
              onClick={() => quickExtend(30)}
              disabled={isBusy}
              className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              +30일
            </button>
            <button
              onClick={() => quickExtend(90)}
              disabled={isBusy}
              className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              +3개월
            </button>
            <button
              onClick={() => quickExtend(365)}
              disabled={isBusy}
              className="rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              +1년
            </button>
            <button
              onClick={() => quickExtend(730)}
              disabled={isBusy}
              className="rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              +2년
            </button>
            <button
              onClick={() => quickExtend(1095)}
              disabled={isBusy}
              className="rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              +3년
            </button>
            <button
              onClick={setUnlimited}
              disabled={isBusy}
              className="rounded bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              무기한
            </button>
          </div>

          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            직접 입력
          </div>
          <div className="mb-2 flex items-center gap-1">
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              disabled={isBusy}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              onClick={() => setDateInput("")}
              disabled={isBusy}
              type="button"
              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
              title="비우기"
            >
              ✕
            </button>
          </div>

          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            계정 유형
          </div>
          <select
            value={typeInput}
            onChange={(e) => setTypeInput(e.target.value)}
            disabled={isBusy}
            className="mb-3 w-full rounded border border-slate-300 px-2 py-1 text-xs"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <div className="flex justify-end gap-1">
            <button
              onClick={() => setOpen(false)}
              disabled={isBusy}
              className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              type="button"
            >
              취소
            </button>
            <button
              onClick={saveManual}
              disabled={isBusy}
              className="rounded bg-[#405189] px-3 py-1 text-xs font-medium text-white hover:bg-[#364574] disabled:opacity-50"
              type="button"
            >
              {isBusy ? "저장중…" : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
