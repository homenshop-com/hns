"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pageTemplates } from "@/lib/page-templates";

interface CreatePageFormProps {
  siteId: string;
}

export default function CreatePageForm({ siteId }: CreatePageFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("blank");

  function generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugManuallyEdited) {
      setSlug(generateSlug(value));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const template = pageTemplates.find((t) => t.id === selectedTemplate);

    const body: Record<string, unknown> = {
      title: formData.get("title"),
      slug: formData.get("slug"),
      isHome: formData.get("isHome") === "on",
    };

    if (template && template.id !== "blank") {
      body.content = {
        html: template.html,
        components: [],
      };
      body.css = template.css;
    }

    const res = await fetch(`/api/sites/${siteId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "페이지 생성에 실패했습니다.");
    } else {
      // Redirect to editor with the new page
      router.push(`/dashboard/site/pages/${data.id}/edit`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">
          페이지 제목 <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          placeholder="홈페이지"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium mb-1">
          슬러그 (URL) <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-zinc-400">/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugManuallyEdited(true);
            }}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
            placeholder="home"
          />
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          영문, 숫자, 하이픈만 사용 가능합니다.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isHome"
          name="isHome"
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
        />
        <label htmlFor="isHome" className="text-sm">
          홈페이지로 설정
        </label>
      </div>

      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">
          템플릿 선택
        </label>
        <div className="grid grid-cols-2 gap-3">
          {pageTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedTemplate(template.id)}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                selectedTemplate === template.id
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
                  : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
              }`}
            >
              <div
                className={`mb-3 flex h-24 items-center justify-center rounded-lg text-sm ${
                  template.id === "blank"
                    ? "border-2 border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-600"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                }`}
              >
                {template.id === "blank" && "빈 캔버스"}
                {template.id === "landing" && "랜딩 페이지"}
                {template.id === "shop" && "쇼핑몰"}
                {template.id === "portfolio" && "포트폴리오"}
              </div>
              <h3 className="text-sm font-semibold">{template.name}</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {template.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "생성 중..." : "페이지 만들기"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          취소
        </button>
      </div>
    </form>
  );
}
