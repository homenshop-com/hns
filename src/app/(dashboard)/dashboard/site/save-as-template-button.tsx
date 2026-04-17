"use client";

import { useState } from "react";

/**
 * Small modal trigger that snapshots the current site (header/menu/footer/CSS
 * + pages) into a new private Template owned by the user.
 *
 * Appears in the site-info-bar of /dashboard/site.
 */
export default function SaveAsTemplateButton({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (saving) return;
    setOpen(false);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("템플릿 이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/templates/save-from-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: name.trim(),
          description: description.trim() || undefined,
          thumbnailUrl: thumbnailUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `저장 실패 (${res.status})`);
        setSaving(false);
        return;
      }
      setSaving(false);
      setOpen(false);
      alert("나의 템플릿으로 저장되었습니다.\n/dashboard/templates > 내 템플릿 탭에서 확인하세요.");
      setName("");
      setDescription("");
      setThumbnailUrl("");
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="dash-manage-btn"
        onClick={() => setOpen(true)}
        title="현재 사이트의 디자인을 나의 템플릿으로 저장"
      >
        나의 템플릿으로 저장
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            style={{
              background: "#fff",
              borderRadius: 10,
              width: "100%",
              maxWidth: 480,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 6, fontSize: 18, fontWeight: 700 }}>
              나의 템플릿으로 저장
            </h3>
            <p style={{ margin: 0, marginBottom: 20, fontSize: 13, color: "#6b7280" }}>
              현재 사이트의 헤더/메뉴/푸터/CSS 및 모든 페이지를 스냅샷하여 개인 템플릿으로 저장합니다.
              저장 후 공개 전환은 템플릿 목록에서 가능합니다.
            </p>

            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                템플릿 이름 <span style={{ color: "#e03131" }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                autoFocus
                placeholder="예: 내 쇼핑몰 템플릿 v1"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                설명 (선택)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="이 템플릿에 대한 간단한 설명"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                썸네일 URL (선택)
              </label>
              <input
                type="url"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={close}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#fff",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: saving ? "#9ca3af" : "#228be6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
