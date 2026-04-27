"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function EditPostClient() {
  const router = useRouter();
  const params = useParams();
  const boardId = params.boardId as string;
  const postId = params.postId as string;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");

  useEffect(() => {
    fetch(`/api/boards/${boardId}/posts/${postId}`)
      .then((res) => {
        if (!res.ok) throw new Error("게시글을 불러올 수 없습니다.");
        return res.json();
      })
      .then((data) => {
        setTitle(data.post.title);
        setContent(data.post.content);
        setAuthor(data.post.author);
      })
      .catch((err) => setError(err.message))
      .finally(() => setFetching(false));
  }, [boardId, postId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, author }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "오류가 발생했습니다.");
      }

      router.push(`/dashboard/boards/${boardId}/posts/${postId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 13,
    border: "1px solid #e2e8f0", borderRadius: 6, boxSizing: "border-box",
  };

  if (fetching) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <p style={{ color: "#868e96" }}>로딩 중...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/boards/${boardId}/posts/${postId}`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; 게시글로 돌아가기
          </Link>
        </div>

        <h1 className="dash-title" style={{ marginBottom: 24 }}>게시글 수정</h1>

        {error && (
          <div style={{ background: "#fef2f2", color: "#ef4444", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>작성자</label>
            <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="작성자명" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
              제목 <span style={{ color: "#e03131" }}>*</span>
            </label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력하세요" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
              내용 <span style={{ color: "#e03131" }}>*</span>
            </label>
            <textarea required rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder="내용을 입력하세요" style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: loading ? "#aaa" : "#4a90d9", color: "#fff", border: "none", borderRadius: 6, cursor: loading ? "default" : "pointer" }}>
              {loading ? "저장 중..." : "게시글 수정"}
            </button>
            <button type="button" onClick={() => router.back()} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: "#fff", color: "#495057", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }}>
              취소
            </button>
          </div>
        </form>
    </div>
  );
}
