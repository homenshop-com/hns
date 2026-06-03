"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function CreateSiteForm() {
  const router = useRouter();
  const t = useTranslations("siteCore");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t("createFailed"));
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          {t("siteNameLabel")} <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          placeholder={t("siteNamePlaceholder")}
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">
          {t("siteDescLabel")} <span className="text-zinc-400">{t("optional")}</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          placeholder={t("siteDescPlaceholder")}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#3182f6] px-6 h-11 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(49,130,246,0.25),0_2px_6px_rgba(49,130,246,0.18)] transition hover:bg-[#1b64da] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <><i className="fa-solid fa-spinner fa-spin" />{t("creating")}</>
        ) : (
          <><i className="fa-solid fa-store" />{t("createSite")}</>
        )}
      </button>
    </form>
  );
}
