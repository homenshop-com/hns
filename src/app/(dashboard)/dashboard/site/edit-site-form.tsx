"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EditSiteFormProps {
  site: {
    id: string;
    name: string;
    description: string | null;
    languages: string[];
    defaultLanguage: string;
  };
}

export default function EditSiteForm({ site }: EditSiteFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const formData = new FormData(e.currentTarget);

    const res = await fetch(`/api/sites/${site.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "수정에 실패했습니다.");
    } else {
      setSuccess("사이트 정보가 수정되었습니다.");
      setEditing(false);
      router.refresh();
    }
  }

  if (!editing) {
    return (
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#868e96", marginBottom: 2 }}>사이트 이름</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{site.name}</div>
        </div>
        {site.description && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#868e96", marginBottom: 2 }}>설명</div>
            <div style={{ fontSize: 13 }}>{site.description}</div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#868e96", marginBottom: 2 }}>기본 언어</div>
          <div style={{ fontSize: 13 }}>{site.defaultLanguage}</div>
        </div>

        {success && (
          <div style={{
            background: "#f0fdf4",
            color: "#22c55e",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 12,
          }}>
            {success}
          </div>
        )}

        <button
          onClick={() => { setEditing(true); setSuccess(""); }}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            border: "1.5px solid #4a90d9",
            borderRadius: 6,
            color: "#4a90d9",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          수정
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{
          background: "#fef2f2",
          color: "#ef4444",
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 13,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
          사이트 이름 <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          defaultValue={site.name}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#868e96", marginBottom: 4 }}>
          사이트 설명 <span style={{ color: "#868e96" }}>(선택)</span>
        </label>
        <textarea
          name="description"
          rows={3}
          defaultValue={site.description || ""}
          style={{ resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "6px 16px",
            fontSize: 13,
            fontWeight: 600,
            background: "#4a90d9",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setError(""); }}
          style={{
            padding: "6px 16px",
            fontSize: 13,
            fontWeight: 600,
            background: "#fff",
            color: "#495057",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          취소
        </button>
      </div>
    </form>
  );
}
