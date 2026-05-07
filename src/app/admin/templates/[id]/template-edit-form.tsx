"use client";

import { useRef, useState } from "react";
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof Template>(key: K, value: Template[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleThumbnailFile(file: File) {
    setError("");
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
      setError("이미지 파일만 업로드 가능합니다 (JPEG / PNG / GIF / WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("이미지 크기가 10MB를 초과합니다.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "template-thumbnails");
      fd.append("compress", "true");
      fd.append("maxWidth", "1280");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? `업로드 실패 (HTTP ${res.status})`);
        return;
      }
      update("thumbnailUrl", data.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

      <Row label="썸네일" hint="이미지를 업로드하거나 URL 직접 입력 — 16:9 비율 권장 (1280×720)">
        <div className="flex items-start gap-3">
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (uploading) return;
              const f = e.dataTransfer.files?.[0];
              if (f) handleThumbnailFile(f);
            }}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="w-32 h-20 rounded border-2 border-dashed border-slate-300 bg-slate-50 hover:border-[#405189]/60 hover:bg-slate-100 flex items-center justify-center text-xs text-slate-500 cursor-pointer flex-shrink-0 overflow-hidden relative transition-colors"
            title="클릭 또는 드래그해서 업로드"
          >
            {form.thumbnailUrl ? (
              <img
                src={form.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="px-2 text-center leading-tight">클릭/드래그<br />이미지 업로드</span>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                <svg className="animate-spin text-[#405189]" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleThumbnailFile(f);
            }}
          />
          <div className="flex-1 flex flex-col gap-1.5">
            <input
              type="url"
              value={form.thumbnailUrl}
              onChange={(e) => update("thumbnailUrl", e.target.value)}
              placeholder="https://homenshop.com/api/img?q=… 또는 업로드한 이미지 URL"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#405189]/40"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {uploading ? "업로드 중…" : "이미지 업로드"}
              </button>
              {form.thumbnailUrl && !uploading && (
                <button
                  type="button"
                  onClick={() => update("thumbnailUrl", "")}
                  className="text-xs px-3 py-1.5 text-slate-500 hover:text-red-600"
                >
                  제거
                </button>
              )}
            </div>
          </div>
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
