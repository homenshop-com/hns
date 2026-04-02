"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeletePageButtonProps {
  siteId: string;
  pageId: string;
}

export default function DeletePageButton({ siteId, pageId }: DeletePageButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("이 페이지를 삭제하시겠습니까?")) return;

    setLoading(true);

    const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
      method: "DELETE",
    });

    setLoading(false);

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "삭제에 실패했습니다.");
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      {loading ? "삭제 중..." : "삭제"}
    </button>
  );
}
