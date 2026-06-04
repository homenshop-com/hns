"use client";

/**
 * Reseller self-service "계정 100% 복제" — a per-row button + modal on the
 * dashboard sites list. Only rendered for reseller operators (the page gates
 * on manageScope.resellerId). Posts to the dashboard-scoped clone endpoint,
 * which authorises through the manage scope (own + customer sites).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  siteId: string;
  shopId: string;
  name: string;
}

export default function CloneSiteControl({ siteId, shopId, name }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newShopId, setNewShopId] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<
    | { id: string; shopId: string; name: string; assetsCopied: { legacy: boolean; siteUploads: boolean } }
    | null
  >(null);

  const shopIdValid = /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(newShopId);
  const canSubmit = shopIdValid && !busy;

  function close() {
    if (busy) return;
    setOpen(false);
    setNewShopId("");
    setNewName("");
    setError("");
    setResult(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/sites/${siteId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newShopId, newName: newName.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult({ ...data.site, assetsCopied: data.assetsCopied });
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="dv2-row-btn"
        title="이 계정의 디자인·페이지·게시판·상품을 새 계정으로 100% 복제"
      >
        <i className="fa-solid fa-clone" style={{ fontSize: 12 }} /> 복제
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, backdropFilter: "blur(2px)",
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            style={{
              background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520,
              overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
            }}
          >
            <header style={{
              padding: "16px 22px", borderBottom: "1px solid #e2e8f0",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 }}>계정 100% 복제</h3>
                <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                  <span style={{ fontFamily: "monospace" }}>{shopId}</span> 의 모든 디자인·페이지·게시판·상품을 새 계정으로 복제합니다.
                </p>
              </div>
              {!busy && (
                <button
                  type="button"
                  onClick={close}
                  aria-label="닫기"
                  style={{ background: "none", border: "none", fontSize: 24, lineHeight: 1, color: "#94a3b8", cursor: "pointer" }}
                >
                  ×
                </button>
              )}
            </header>

            {!result ? (
              <>
                <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                      새 Account ID (shopId)
                    </label>
                    <input
                      type="text"
                      value={newShopId}
                      onChange={(e) => setNewShopId(e.target.value.toLowerCase())}
                      placeholder={`${shopId}2`}
                      disabled={busy}
                      autoFocus
                      style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1",
                        borderRadius: 8, fontSize: 14, fontFamily: "monospace", outline: "none",
                      }}
                    />
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      {newShopId.length === 0 ? (
                        <span style={{ color: "#94a3b8" }}>소문자·숫자·하이픈, 6~14자</span>
                      ) : shopIdValid ? (
                        <span style={{ color: "#059669" }}>✓ 사용 가능한 형식</span>
                      ) : (
                        <span style={{ color: "#ef4444" }}>형식이 올바르지 않습니다 (소문자·숫자·하이픈, 6~14자)</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                      사이트명 <span style={{ fontWeight: 400, color: "#94a3b8" }}>(선택 — 비우면 원본과 동일)</span>
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={name}
                      disabled={busy}
                      style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1",
                        borderRadius: 8, fontSize: 14, outline: "none",
                      }}
                    />
                  </div>

                  <div style={{
                    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                    padding: 12, fontSize: 12, color: "#475569", lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, color: "#334155", marginBottom: 6 }}>복제 내용:</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>헤더·메뉴·푸터·CSS, 모든 페이지(본문·SEO), 다국어 설정</li>
                      <li>게시판(카테고리·게시물·댓글·플러그인), 상품(카테고리·플러그인)</li>
                      <li>이미지 경로를 새 shopId 로 치환 + 업로드 폴더 복사(서버)</li>
                      <li>활성(1년) 계정으로 생성 — 도메인·주문은 복제 안 함</li>
                    </ul>
                  </div>

                  {error && (
                    <div style={{
                      background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                      padding: "10px 12px", fontSize: 13, color: "#991b1b",
                    }}>
                      {error}
                    </div>
                  )}
                </div>

                <footer style={{
                  padding: "14px 22px", borderTop: "1px solid #e2e8f0", background: "#f8fafc",
                  display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
                }}>
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    style={{ padding: "9px 16px", fontSize: 13, color: "#475569", background: "none", border: "none", cursor: "pointer", opacity: busy ? 0.5 : 1 }}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "9px 20px", background: "#3182f6", color: "#fff",
                      fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none",
                      cursor: canSubmit ? "pointer" : "not-allowed", opacity: canSubmit ? 1 : 0.5,
                    }}
                  >
                    {busy && <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 12 }} />}
                    {busy ? "복제 중…" : "복제하기"}
                  </button>
                </footer>
              </>
            ) : (
              <div style={{ padding: "32px 22px", textAlign: "center" }}>
                <div style={{
                  width: 56, height: 56, margin: "0 auto 16px", borderRadius: "50%",
                  background: "#ecfdf5", display: "grid", placeItems: "center",
                  color: "#059669", fontSize: 26,
                }}>
                  ✓
                </div>
                <h4 style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>복제 완료</h4>
                <p style={{ fontSize: 13, color: "#475569", margin: "0 0 4px" }}>
                  <b style={{ fontFamily: "monospace" }}>{result.shopId}</b> 계정이 생성되었습니다.
                </p>
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 20px" }}>
                  업로드 폴더 복사: 레거시 {result.assetsCopied.legacy ? "✓" : "—"} · 사이트 {result.assetsCopied.siteUploads ? "✓" : "—"}
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      router.refresh();
                    }}
                    style={{ padding: "9px 16px", fontSize: 13, color: "#475569", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer" }}
                  >
                    목록 새로고침
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/site/settings?id=${result.id}`)}
                    style={{ padding: "9px 20px", background: "#3182f6", color: "#fff", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", cursor: "pointer" }}
                  >
                    새 계정 설정 →
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </>
  );
}
