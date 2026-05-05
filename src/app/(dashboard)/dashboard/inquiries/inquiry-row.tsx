"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InquiryRowProps {
  inquiry: {
    id: string;
    siteId: string;
    siteName: string;
    siteShopId: string;
    source: string;
    productName: string | null;
    productLegacyId: number | null;
    productId: string | null;
    pageUrl: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    message: string;
    status: string;
    replySubject: string | null;
    replyBody: string | null;
    repliedAt: string | null;
    createdAt: string; // ISO string from server
  };
}

const STATUS_OPTIONS = [
  { value: "NEW", label: "신규", color: "#dc2626", bg: "#fee2e2" },
  { value: "READ", label: "확인", color: "#2563eb", bg: "#dbeafe" },
  { value: "REPLIED", label: "회신", color: "#047857", bg: "#d1fae5" },
  { value: "ARCHIVED", label: "보관", color: "#52525b", bg: "#e4e4e7" },
];

export default function InquiryRow({ inquiry }: InquiryRowProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(inquiry.status);
  const [busy, setBusy] = useState(false);

  // In-app reply composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const defaultSubject = `Re: ${inquiry.productName ? `Inquiry · ${inquiry.productName}` : "Inquiry"}`;
  const [replySubject, setReplySubject] = useState(defaultSubject);
  const [replyBodyText, setReplyBodyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyMsg, setReplyMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function updateStatus(next: string) {
    if (next === status) return;
    setBusy(true);
    const res = await fetch(`/api/inquiries/${inquiry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (res.ok) {
      setStatus(next);
      router.refresh();
    } else {
      alert("상태 변경 실패");
    }
  }

  async function remove() {
    if (!confirm("이 문의를 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    setBusy(true);
    const res = await fetch(`/api/inquiries/${inquiry.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("삭제 실패");
  }

  function openComposer() {
    setComposerOpen(true);
    setReplyMsg(null);
    // Pre-fill body with greeting + room to write + quoted original.
    if (!replyBodyText) {
      const greeting = inquiry.name ? `Hi ${inquiry.name},` : "Hello,";
      const quoted = inquiry.message.split("\n").map((l) => `> ${l}`).join("\n");
      setReplyBodyText(`${greeting}\n\nThank you for your inquiry${inquiry.productName ? ` about ${inquiry.productName}` : ""}.\n\n\n\n--\n--- Original message ---\n${quoted}`);
    }
  }

  async function sendReply() {
    if (!replySubject.trim() || !replyBodyText.trim()) {
      setReplyMsg({ kind: "err", text: "제목과 본문을 모두 입력하세요." });
      return;
    }
    setReplyBusy(true);
    setReplyMsg(null);
    try {
      const res = await fetch(`/api/inquiries/${inquiry.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: replySubject, body: replyBodyText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReplyMsg({ kind: "ok", text: "회신 메일이 발송되었습니다." });
        setStatus("REPLIED");
        setTimeout(() => {
          setComposerOpen(false);
          setReplyMsg(null);
          router.refresh();
        }, 1200);
      } else {
        setReplyMsg({ kind: "err", text: data.detail || data.error || "발송 실패" });
      }
    } catch {
      setReplyMsg({ kind: "err", text: "네트워크 오류 — 잠시 후 다시 시도하세요." });
    } finally {
      setReplyBusy(false);
    }
  }

  // Auto-mark NEW → READ when expanding for the first time.
  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && status === "NEW") updateStatus("READ");
  }

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
  const date = new Date(inquiry.createdAt);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const preview = inquiry.message.replace(/\s+/g, " ").slice(0, 80);

  return (
    <div style={{ borderBottom: "1px solid #e5e7eb", background: status === "NEW" ? "#fffbeb" : "#fff" }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "70px 1fr 130px 130px 100px 32px",
          gap: 16,
          padding: "16px 20px",
          alignItems: "center",
          background: "transparent",
          border: "none",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: statusOpt.color,
          background: statusOpt.bg,
          borderRadius: 4,
        }}>
          {statusOpt.label}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
            {inquiry.name || "(이름 없음)"}
            {inquiry.company ? <span style={{ color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>· {inquiry.company}</span> : null}
            {inquiry.source === "product" && inquiry.productName ? (
              <span style={{ marginLeft: 10, fontSize: 11, padding: "2px 8px", background: "#0a2540", color: "#fff", fontFamily: "monospace", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {inquiry.productName.slice(0, 40)}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview}{inquiry.message.length > 80 ? "…" : ""}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#374151" }}>
          {inquiry.email && <div>{inquiry.email}</div>}
          {inquiry.phone && <div style={{ color: "#6b7280" }}>{inquiry.phone}</div>}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
          {inquiry.siteShopId}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
          {dateStr}
        </div>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "16px 24px 24px", background: "#fafafa", borderTop: "1px solid #f3f4f6" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Field label="이름" value={inquiry.name || "-"} />
            <Field label="회사" value={inquiry.company || "-"} />
            <Field label="이메일" value={inquiry.email || "-"} link={inquiry.email ? `mailto:${inquiry.email}` : undefined} />
            <Field label="전화" value={inquiry.phone || "-"} link={inquiry.phone ? `tel:${inquiry.phone}` : undefined} />
            {inquiry.source === "product" && (
              <Field
                label="상품"
                value={inquiry.productName || "-"}
                link={inquiry.pageUrl || undefined}
              />
            )}
            {inquiry.pageUrl && (
              <Field label="페이지" value={inquiry.pageUrl} link={inquiry.pageUrl} mono />
            )}
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>문의 내용</div>
            <div style={{ padding: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 13, lineHeight: 1.7, color: "#1f2937", whiteSpace: "pre-wrap" }}>
              {inquiry.message}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#6b7280", marginRight: 4 }}>상태 변경:</span>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={busy || s.value === status}
                onClick={() => updateStatus(s.value)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: s.value === status ? "#fff" : s.color,
                  background: s.value === status ? s.color : s.bg,
                  border: "none",
                  borderRadius: 4,
                  cursor: s.value === status ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {s.label}
              </button>
            ))}
            {inquiry.email && !composerOpen && (
              <button
                type="button"
                onClick={openComposer}
                style={{ marginLeft: "auto", padding: "6px 14px", fontSize: 12, fontWeight: 500, color: "#fff", background: "#2563eb", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                답장 작성
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              style={{ padding: "6px 12px", fontSize: 12, color: "#b91c1c", background: "transparent", border: "1px solid #fecaca", borderRadius: 4, cursor: "pointer" }}
            >
              삭제
            </button>
          </div>

          {/* Prior reply (if any) */}
          {inquiry.replyBody && inquiry.repliedAt && !composerOpen && (
            <div style={{ marginTop: 16, padding: 16, background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#047857", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                회신 발송됨 · {new Date(inquiry.repliedAt).toLocaleString("ko-KR")}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#064e3b", marginBottom: 6 }}>{inquiry.replySubject}</div>
              <div style={{ fontSize: 13, color: "#1f2937", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {inquiry.replyBody}
              </div>
            </div>
          )}

          {/* In-app reply composer */}
          {composerOpen && inquiry.email && (
            <div style={{ marginTop: 16, padding: 20, background: "#fff", border: "2px solid #2563eb", borderRadius: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                  회신 메일 작성 · 받는 사람: <span style={{ fontFamily: "monospace", color: "#2563eb" }}>{inquiry.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setComposerOpen(false); setReplyMsg(null); }}
                  style={{ padding: "4px 8px", fontSize: 11, color: "#6b7280", background: "transparent", border: "none", cursor: "pointer" }}
                >
                  취소 ✕
                </button>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  제목
                </label>
                <input
                  type="text"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  maxLength={200}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  본문
                </label>
                <textarea
                  value={replyBodyText}
                  onChange={(e) => setReplyBodyText(e.target.value)}
                  rows={12}
                  maxLength={10000}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, lineHeight: 1.6, border: "1px solid #d1d5db", borderRadius: 4, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={replyBusy}
                  onClick={sendReply}
                  style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", background: replyBusy ? "#93c5fd" : "#2563eb", border: "none", borderRadius: 4, cursor: replyBusy ? "default" : "pointer" }}
                >
                  {replyBusy ? "발송 중…" : "회신 발송"}
                </button>
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  발신: 시스템 (관리자 메일이 답장 주소에 자동 설정됩니다)
                </span>
                {replyMsg && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: replyMsg.kind === "ok" ? "#047857" : "#b91c1c" }}>
                    {replyMsg.text}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, link, mono }: { label: string; value: string; link?: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
        {label}
      </div>
      {link ? (
        <a href={link} target={link.startsWith("http") ? "_blank" : undefined} rel="noopener" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all" }}>
          {value}
        </a>
      ) : (
        <div style={{ fontSize: 13, color: "#111827", fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all" }}>
          {value}
        </div>
      )}
    </div>
  );
}
