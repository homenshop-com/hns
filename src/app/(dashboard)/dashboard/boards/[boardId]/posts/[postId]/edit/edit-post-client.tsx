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
        body: JSON.stringify({ title, content, author }),
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
