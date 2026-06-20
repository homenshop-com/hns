"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function EditPostClient() {
  const t = useTranslations("boardsDash");
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
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");

  useEffect(() => {
    fetch(`/api/boards/${boardId}/posts/${postId}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("loadPostError"));
        return res.json();
      })
      .then((data) => {
        setTitle(data.post.title);
        setContent(data.post.content);
        setAuthor(data.post.author);
        setSeoTitle(data.post.seoTitle ?? "");
        setSeoDescription(data.post.seoDescription ?? "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setFetching(false));
  }, [boardId, postId, t]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, author, seoTitle, seoDescription }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("genericError"));
      }

      router.push(`/dashboard/boards/${boardId}/posts/${postId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
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
        <p style={{ color: "#868e96" }}>{t("loading")}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/boards/${boardId}/posts/${postId}`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; {t("backToPost")}
          </Link>
        </div>

        <h1 className="dash-title" style={{ marginBottom: 24 }}>{t("editPostTitle")}</h1>

        {error && (
          <div style={{ background: "#fef2f2", color: "#ef4444", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>{t("fieldAuthor")}</label>
            <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t("authorPlaceholder")} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
              {t("fieldTitle")} <span style={{ color: "#e03131" }}>*</span>
            </label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
              {t("fieldContent")} <span style={{ color: "#e03131" }}>*</span>
            </label>
            <textarea required rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("contentPlaceholder")} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ border: "1px solid #e9ecef", borderRadius: 8, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ color: "#6d28d9" }} aria-hidden="true" />
              검색·AI 노출 (SEO/AEO) <span style={{ fontSize: 11, fontWeight: 400, color: "#adb5bd" }}>선택</span>
            </div>
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
              SEO 제목 — 비우면 글 제목으로 자동 생성
            </label>
            <input type="text" maxLength={120} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} placeholder="검색·AI에 노출될 제목" />
            <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
              SEO 설명 — 비우면 본문에서 자동 생성
            </label>
            <textarea rows={2} maxLength={300} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} placeholder="검색 결과·AI 답변에 노출될 한두 문장" />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: loading ? "#aaa" : "#4a90d9", color: "#fff", border: "none", borderRadius: 6, cursor: loading ? "default" : "pointer" }}>
              {loading ? t("saving") : t("submitEditPost")}
            </button>
            <button type="button" onClick={() => router.back()} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: "#fff", color: "#495057", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }}>
              {t("cancel")}
            </button>
          </div>
        </form>
    </div>
  );
}
