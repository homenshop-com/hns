"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface DeletePageButtonProps {
  siteId: string;
  pageId: string;
}

export default function DeletePageButton({ siteId, pageId }: DeletePageButtonProps) {
  const router = useRouter();
  const t = useTranslations("sitePages");
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;

    setLoading(true);

    const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
      method: "DELETE",
    });

    setLoading(false);

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || t("deleteFailed"));
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      {loading ? t("deleting") : t("delete")}
    </button>
  );
}
