"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { pageTemplates } from "@/lib/page-templates";

interface CreatePageFormProps {
  siteId: string;
}

export default function CreatePageForm({ siteId }: CreatePageFormProps) {
  const router = useRouter();
  const t = useTranslations("sitePages");
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
      setError(data.error || t("createPageFailed"));
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
          {t("pageTitleLabel")} <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          placeholder={t("pageTitlePlaceholder")}
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium mb-1">
          {t("slugLabel")} <span className="text-red-500">*</span>
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
          {t("slugHelp")}
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
          {t("setAsHome")}
        </label>
      </div>

      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">
          {t("selectTemplate")}
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
                {template.id === "blank" && t("templatePreviewBlank")}
                {template.id === "landing" && t("templatePreviewLanding")}
                {template.id === "shop" && t("templatePreviewShop")}
                {template.id === "portfolio" && t("templatePreviewPortfolio")}
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
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#3182f6] px-6 h-11 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(49,130,246,0.25),0_2px_6px_rgba(49,130,246,0.18)] transition hover:bg-[#1b64da] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><i className="fa-solid fa-spinner fa-spin" />{t("creating")}</>
          ) : (
            <><i className="fa-solid fa-plus" />{t("createPage")}</>
          )}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-6 h-11 text-sm text-zinc-700 transition hover:bg-zinc-50 hover:border-zinc-300 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
