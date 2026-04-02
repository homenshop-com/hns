"use client";

import { useState, useEffect } from "react";

interface Comment {
  id: string;
  author: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  replies?: Comment[];
}

export default function CommentSection({
  boardId,
  postId,
}: {
  boardId: string;
  postId: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyAuthor, setReplyAuthor] = useState("");
  const [replyContent, setReplyContent] = useState("");

  useEffect(() => {
    fetchComments();
    // Get session user name for default author
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.name) {
          setAuthor(data.user.name);
          setReplyAuthor(data.user.name);
        }
      })
      .catch(() => {});
  }, []);

  function fetchComments() {
    setLoading(true);
    fetch(`/api/boards/${boardId}/posts/${postId}/comments`)
      .then((res) => res.json())
      .then((data) => setComments(data.comments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, content }),
      });
      if (res.ok) {
        setContent("");
        fetchComments();
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyContent.trim() || !replyTo) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: replyAuthor, content: replyContent, parentId: replyTo }),
      });
      if (res.ok) {
        setReplyContent("");
        setReplyTo(null);
        fetchComments();
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok) fetchComments();
    } catch {
      // ignore
    }
  }

  const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    boxSizing: "border-box",
  };

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderComment(comment: Comment, isReply = false) {
    return (
      <div
        key={comment.id}
        style={{
          padding: "14px 16px",
          borderBottom: isReply ? "none" : "1px solid #f1f3f5",
          marginLeft: isReply ? 32 : 0,
          background: isReply ? "#f8f9fa" : "transparent",
          borderRadius: isReply ? 6 : 0,
          marginBottom: isReply ? 4 : 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isReply && (
              <span style={{ color: "#868e96", fontSize: 12 }}>↳</span>
            )}
            <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a2e" }}>{comment.author}</span>
            <span style={{ fontSize: 12, color: "#adb5bd" }}>{formatDate(comment.createdAt)}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!isReply && (
              <button
                onClick={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                  setReplyContent("");
                }}
                style={{
                  fontSize: 12,
                  color: "#4a90d9",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {replyTo === comment.id ? "취소" : "답글"}
              </button>
            )}
            <button
              onClick={() => handleDelete(comment.id)}
              style={{
                fontSize: 12,
                color: "#e03131",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              삭제
            </button>
          </div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "#1a1a2e", whiteSpace: "pre-wrap" }}>
          {comment.content}
        </div>

        {/* Reply form */}
        {replyTo === comment.id && (
          <form onSubmit={handleReply} style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input
              type="text"
              value={replyAuthor}
              onChange={(e) => setReplyAuthor(e.target.value)}
              placeholder="작성자"
              style={{ ...inputStyle, width: 120, flex: "none" }}
            />
            <input
              type="text"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="답글을 입력하세요"
              style={inputStyle}
              autoFocus
            />
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                background: submitting ? "#aaa" : "#4a90d9",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: submitting ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              등록
            </button>
          </form>
        )}

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          borderBottom: "1px solid #e2e8f0",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            댓글 {totalCount > 0 && <span style={{ color: "#4a90d9" }}>{totalCount}</span>}
          </h3>
        </div>

        {/* Comment list */}
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#868e96", fontSize: 13 }}>
            로딩 중...
          </div>
        ) : comments.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#868e96", fontSize: 13 }}>
            아직 댓글이 없습니다. 첫 댓글을 남겨보세요.
          </div>
        ) : (
          <div>{comments.map((c) => renderComment(c))}</div>
        )}

        {/* New comment form */}
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: "1px solid #e2e8f0",
            padding: "16px 20px",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="작성자"
            style={{ ...inputStyle, width: 120, flex: "none" }}
          />
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요"
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              background: submitting || !content.trim() ? "#aaa" : "#4a90d9",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: submitting || !content.trim() ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {submitting ? "등록 중..." : "댓글 등록"}
          </button>
        </form>
      </div>
    </div>
  );
}
