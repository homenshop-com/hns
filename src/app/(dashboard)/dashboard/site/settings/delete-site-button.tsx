"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteSiteButton({ siteId, shopId }: { siteId: string; shopId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "삭제에 실패했습니다.");
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setLoading(false);
    }
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="sv2-btn-danger"
      >
        <svg width={14} height={14}><use href="#i-trash" /></svg>
        계정 삭제
      </button>
    );
  }

  return (
    <div className="sv2-danger-confirm">
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>
        삭제를 확인하려면 계정 ID{" "}
        <b style={{ color: "var(--danger)", fontFamily: "'JetBrains Mono', monospace" }}>{shopId}</b>{" "}
        를 입력하세요. 이 작업은 되돌릴 수 없습니다.
      </p>

      {error && (
        <div style={{ fontSize: 12, color: "var(--danger)" }}>⚠️ {error}</div>
      )}

      <div className="confirm-row">
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={shopId}
          autoFocus
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading || confirmText !== shopId}
          className="sv2-btn-danger solid"
        >
          <svg width={14} height={14}><use href="#i-trash" /></svg>
          {loading ? "삭제 중…" : "삭제 확인"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowConfirm(false);
            setConfirmText("");
            setError("");
          }}
          className="sv2-foot-btn"
        >
          취소
        </button>
      </div>
    </div>
  );
}
