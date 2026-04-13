"use client";

import { useState } from "react";

interface EmailVerifyBannerProps {
  email: string;
  labels: {
    title: string;
    message: string;
    resend: string;
    sent: string;
  };
}

export default function EmailVerifyBanner({ email, labels }: EmailVerifyBannerProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleResend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        setError(data.error || "Error");
      }
    } catch {
      setError("Error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%)",
      border: "1px solid #ffc107",
      borderRadius: 10,
      padding: "16px 24px",
      marginBottom: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#856404", marginBottom: 4 }}>
          {labels.title}
        </div>
        <div style={{ fontSize: 13, color: "#856404", lineHeight: 1.5 }}>
          {labels.message} <strong>{email}</strong>
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {sent ? (
          <span style={{ fontSize: 13, color: "#155724", fontWeight: 600 }}>
            {labels.sent}
          </span>
        ) : (
          <button
            onClick={handleResend}
            disabled={sending}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              background: "#856404",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: sending ? "default" : "pointer",
              opacity: sending ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {sending ? "..." : labels.resend}
          </button>
        )}
        {error && (
          <div style={{ fontSize: 12, color: "#c92a2a", marginTop: 4 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
