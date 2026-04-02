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
        onClick={() => setShowConfirm(true)}
        style={{
          padding: "6px 14px",
          fontSize: 13,
          fontWeight: 600,
          color: "#e03131",
          background: "#fff",
          border: "1.5px solid #e03131",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        계정 삭제
      </button>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#495057", marginBottom: 12 }}>
        삭제를 확인하려면 계정 ID <strong>{shopId}</strong>를 입력하세요.
        이 작업은 되돌릴 수 없습니다.
      </p>

      {error && (
        <div style={{ background: "#fef2f2", color: "#ef4444", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={shopId}
          style={{
            padding: "8px 12px",
            fontSize: 13,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            width: 200,
          }}
        />
        <button
          onClick={handleDelete}
          disabled={loading || confirmText !== shopId}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: loading || confirmText !== shopId ? "#ccc" : "#e03131",
            border: "none",
            borderRadius: 6,
            cursor: loading || confirmText !== shopId ? "default" : "pointer",
          }}
        >
          {loading ? "삭제 중..." : "삭제 확인"}
        </button>
        <button
          onClick={() => { setShowConfirm(false); setConfirmText(""); setError(""); }}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#495057",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
}
