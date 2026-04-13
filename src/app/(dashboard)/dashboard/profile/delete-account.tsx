"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

interface DeleteAccountProps {
  labels: {
    title: string;
    warning: string;
    confirmText: string;
    confirmPlaceholder: string;
    deleteBtn: string;
    deleting: string;
    cancel: string;
    error: string;
    wrongPassword: string;
  };
}

export default function DeleteAccount({ labels }: DeleteAccountProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 403) {
        setError(labels.wrongPassword);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error();
      await signOut({ callbackUrl: "/" });
    } catch {
      setError(labels.error);
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "none",
          color: "#9ca3af",
          fontSize: 13,
          cursor: "pointer",
          padding: "8px 0",
          textDecoration: "underline",
        }}
      >
        {labels.title}
      </button>
    );
  }

  return (
    <div style={{
      background: "#fef2f2",
      border: "1px solid #fecaca",
      borderRadius: 10,
      padding: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>
        {labels.title}
      </div>
      <p style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.6, marginBottom: 12 }}>
        {labels.warning}
      </p>
      <p style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
        {labels.confirmText}
      </p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={labels.confirmPlaceholder}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: 14,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          marginBottom: 12,
          boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleDelete}
          disabled={!password || loading}
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 700,
            background: password && !loading ? "#dc2626" : "#e5e7eb",
            color: password && !loading ? "#fff" : "#9ca3af",
            border: "none",
            borderRadius: 6,
            cursor: password && !loading ? "pointer" : "default",
          }}
        >
          {loading ? labels.deleting : labels.deleteBtn}
        </button>
        <button
          onClick={() => { setOpen(false); setPassword(""); setError(""); }}
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 500,
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
