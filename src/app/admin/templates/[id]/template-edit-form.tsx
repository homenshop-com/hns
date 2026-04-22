"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  name: string;
  description: string;
  keywords: string;
  category: string;
  thumbnailUrl: string;
  sortOrder: number;
  price: number;
  isActive: boolean;
  isPublic: boolean;
}

export default function TemplateEditForm({ template }: { template: Template }) {
  const router = useRouter();
  const [form, setForm] = useState(template);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  function update<K extends keyof Template>(key: K, value: Template[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          keywords: form.keywords,
          category: form.category,
          thumbnailUrl: form.thumbnailUrl,
          sortOrder: form.sortOrder,
          price: form.price,
          isActive: form.isActive,
          isPublic: form.isPublic,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `저장 실패 (HTTP ${res.status})`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
      <Row label="이름" required>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          maxLength={100}
          required
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
        />
      </Row>

      <Row label="설명">
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="템플릿의 용도·특징을 간단히. 500자 이내 권장."
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40 resize-y"
        />
      </Row>

      <div className="grid grid-cols-2 gap-4">
        <Row label="카테고리">
          <input
            type="text"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            placeholder="예: business, education, portfolio"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
          />
        </Row>
        <Row label="정렬 순서" hint="낮을수록 목록 상단 — 최신 정렬 기준">
          <input
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => update("sortOrder", Math.max(0, Math.round(Number(e.target.value) || 0)))}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
          />
        </Row>
      </div>

      <Row label="키워드" hint="쉼표로 구분. 검색에 사용됨.">
        <input
          type="text"
          value={form.keywords}
          onChange={(e) => update("keywords", e.target.value)}
          placeholder="agency, modern, business, 비즈니스"
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
        />
      </Row>

      <Row label="썸네일 URL">
        <div className="flex items-center gap-3">
          {form.thumbnailUrl && (
            <img
              src={form.thumbnailUrl}
              alt=""
              className="w-20 h-14 object-cover rounded border border-slate-200 bg-slate-100 flex-shrink-0"
            />
          )}
          <input
            type="url"
            value={form.thumbnailUrl}
            onChange={(e) => update("thumbnailUrl", e.target.value)}
            placeholder="https://homenshop.com/api/img?q=…"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
          />
        </div>
      </Row>

      <div className="grid grid-cols-2 gap-4">
        <Row label="가격 (원)" hint="0 = 무료, 그 외 = 유료. 구매 플로우는 향후 연결 예정.">
          <div className="relative">
            <input
              type="number"
              min={0}
              step={1000}
              value={form.price}
              onChange={(e) => update("price", Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="w-full px-3 py-2 pr-14 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
              {form.price === 0 ? "FREE" : "KRW"}
            </span>
          </div>
        </Row>

        <Row label="상태">
          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update("isActive", e.target.checked)}
                className="w-4 h-4 text-[#405189] rounded"
              />
              <span>활성 (비활성 시 목록에서 숨김)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => update("isPublic", e.target.checked)}
                className="w-4 h-4 text-[#405189] rounded"
              />
              <span>공개 (유저 템플릿을 공용 탭에 노출)</span>
            </label>
          </div>
        </Row>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-[#405189] text-white text-sm font-medium rounded-md hover:bg-[#405189]/90 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-600">✓ 저장됨 · 방금 전</span>
        )}
      </div>
    </form>
  );
}

function Row({ label, hint, required, children }: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="ml-2 text-slate-400 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
