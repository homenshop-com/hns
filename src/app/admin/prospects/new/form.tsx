"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TemplateOption {
  id: string;
  name: string;
  category: string | null;
  thumbnailUrl: string | null;
}

export default function NewProspectForm({
  templates,
}: {
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      phone: fd.get("phone"),
      name: fd.get("name"),
      shopId: fd.get("shopId"),
      defaultLanguage: fd.get("defaultLanguage") || "ko",
      templateId: fd.get("templateId") || null,
      prospectNote: fd.get("prospectNote") || "",
      trialDays: Number(fd.get("trialDays")) || 30,
    };

    try {
      const res = await fetch("/api/admin/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "등록에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      router.push("/admin/prospects");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-5"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            핸드폰 번호 <span className="text-red-500">*</span>
          </label>
          <input
            name="phone"
            type="tel"
            required
            placeholder="010-1234-5678"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#405189] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            고객 회원가입 시 이 번호와 일치해야 자동 인계됩니다.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            상호/이름 <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="셀로에스테틱"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#405189] focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            shopId <span className="text-red-500">*</span>
          </label>
          <input
            name="shopId"
            type="text"
            required
            pattern="[a-z0-9][a-z0-9\-]{4,12}[a-z0-9]"
            placeholder="celo-aesthetic"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#405189] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            6~14자 영문 소문자/숫자/-. URL 경로로 사용됩니다 (예: /celo-aesthetic/ko/).
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            기본 언어
          </label>
          <select
            name="defaultLanguage"
            defaultValue="ko"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#405189] focus:outline-none"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            무료 체험 기간 (일)
          </label>
          <input
            name="trialDays"
            type="number"
            min={1}
            max={365}
            defaultValue={30}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#405189] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            인계 시점에 다시 30일로 자동 재설정됩니다. 인계 전까지의 만료일을 길게 두고 싶을 때 사용.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            템플릿
          </label>
          <select
            name="templateId"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#405189] focus:outline-none"
            defaultValue=""
          >
            <option value="">선택하지 않음 (빈 사이트)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.category ? `[${t.category}] ` : ""}{t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          관리자 메모
        </label>
        <textarea
          name="prospectNote"
          rows={3}
          placeholder="소개자, 영업 상태, 후속 일정 등"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#405189] focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
        <Link
          href="/admin/prospects"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574] disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "잠재고객 등록"}
        </button>
      </div>
    </form>
  );
}
