"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateBoardForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("board");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "오류가 발생했습니다.");
      }

      setTitle("");
      setType("board");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a1a2e" }}>새 게시판</h3>

      {error && (
        <div style={{ background: "#fef2f2", color: "#ef4444", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
            게시판 제목 <span style={{ color: "#e03131" }}>*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="게시판 제목을 입력하세요"
            style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, boxSizing: "border-box" }}
          />
        </div>

        <div style={{ width: 140 }}>
          <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>유형</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6 }}
          >
            <option value="board">게시판</option>
            <option value="notice">공지사항</option>
            <option value="faq">FAQ</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            background: loading ? "#aaa" : "#4a90d9",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "생성 중..." : "게시판 생성"}
        </button>
      </form>
    </div>
  );
}
