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
      <div className="pv2-leave">
        <button type="button" onClick={() => setOpen(true)} className="trigger">
          {labels.title}
        </button>
      </div>
    );
  }

  return (
    <div className="pv2-danger-box">
      <div className="tt">
        <svg width={14} height={14}><use href="#i-warn" /></svg>
        {labels.title}
      </div>
      <p className="warn">{labels.warning}</p>
      <div className="confirm-label">{labels.confirmText}</div>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={labels.confirmPlaceholder}
        autoFocus
      />
      {error && <p className="err">⚠️ {error}</p>}
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPassword("");
            setError("");
          }}
          className="pv2-btn-cancel"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!password || loading}
          className="pv2-btn-danger"
        >
          <svg width={14} height={14}><use href="#i-trash" /></svg>
          {loading ? labels.deleting : labels.deleteBtn}
        </button>
      </div>
    </div>
  );
}
