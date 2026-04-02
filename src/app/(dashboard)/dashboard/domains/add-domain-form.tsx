"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddDomainForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "도메인 추가에 실패했습니다.");
      }

      setSuccess(`${data.domain} 도메인이 등록되었습니다.`);
      setDomain("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a1a2e" }}>도메인 추가</h3>

      <div style={{ background: "#eef4fc", border: "1px solid #c6daf7", borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#4a90d9", marginBottom: 6 }}>
          DNS 설정 안내
        </p>
        <p style={{ fontSize: 13, color: "#357abd" }}>
          도메인을 연결하려면 DNS A 레코드를{" "}
          <code style={{ background: "#d4e4f7", padding: "2px 6px", borderRadius: 3, fontFamily: "monospace", fontSize: 12 }}>
            167.71.199.28
          </code>
          로 설정해주세요.
        </p>
        <p style={{ fontSize: 11, color: "#6ba3d6", marginTop: 6 }}>
          DNS 변경 후 적용까지 최대 48시간이 소요될 수 있습니다.
        </p>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 13, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 13, color: "#22c55e" }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          required
          style={{
            flex: 1,
            padding: "8px 14px",
            fontSize: 13,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading || !domain.trim()}
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            background: loading || !domain.trim() ? "#aaa" : "#4a90d9",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading || !domain.trim() ? "default" : "pointer",
          }}
        >
          {loading ? "추가 중..." : "도메인 추가"}
        </button>
      </form>
    </div>
  );
}
