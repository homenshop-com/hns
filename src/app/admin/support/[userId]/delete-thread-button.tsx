"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteThreadButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      `${userName} 고객의 상담 내역(CS 티켓)을 삭제합니다.\n` +
        `주고받은 메시지가 모두 영구 삭제되며 복구할 수 없습니다. 계속할까요?`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "삭제에 실패했습니다.");
      router.push("/admin/support");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="px-3 py-1.5 rounded text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "삭제 중…" : "상담 삭제"}
      </button>
    </div>
  );
}
