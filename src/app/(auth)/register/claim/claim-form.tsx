"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClaimForm({
  siteId,
}: {
  siteId: string;
  shopId: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/claim-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "인계에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      router.push("/dashboard?claimed=1");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  function decline() {
    router.push("/dashboard");
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={submitting}
        className="w-full rounded-lg bg-[#405189] py-3 text-sm font-semibold text-white hover:bg-[#364574] disabled:opacity-50"
      >
        {submitting ? "인계 중..." : "사이트 인계받기 (30일 무료)"}
      </button>
      <button
        type="button"
        onClick={decline}
        disabled={submitting}
        className="w-full rounded-lg border border-slate-300 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        나중에 결정하기
      </button>
    </div>
  );
}
