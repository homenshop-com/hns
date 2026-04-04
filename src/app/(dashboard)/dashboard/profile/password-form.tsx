"use client";

import { useState } from "react";

interface PasswordFormProps {
  labels: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    passwordMinLength: string;
    changePasswordBtn: string;
    changing: string;
    passwordChanged: string;
    passwordMismatch: string;
    passwordTooShort: string;
    error: string;
  };
}

export default function PasswordForm({ labels }: PasswordFormProps) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (newPw.length < 6) {
      setMessage(labels.passwordTooShort);
      return;
    }
    if (newPw !== confirmPw) {
      setMessage(labels.passwordMismatch);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (res.ok) {
        setMessage(labels.passwordChanged);
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } else {
        const data = await res.json();
        setMessage(data.error || labels.error);
      }
    } catch {
      setMessage(labels.error);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 42,
    padding: "0 14px",
    border: "1.5px solid #dee2e6",
    borderRadius: 8,
    fontSize: 14,
    color: "#343a40",
    background: "#fff",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#495057",
    marginBottom: 6,
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{labels.currentPassword}</label>
        <input
          type="password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{labels.newPassword}</label>
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          required
          placeholder={labels.passwordMinLength}
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>{labels.confirmPassword}</label>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        style={{
          width: "100%",
          height: 44,
          background: saving ? "#adb5bd" : "#495057",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? labels.changing : labels.changePasswordBtn}
      </button>
      {message && (
        <p style={{
          fontSize: 13,
          color: message === labels.passwordChanged ? "#2f9e44" : "#e03131",
          textAlign: "center",
          marginTop: 10,
        }}>
          {message}
        </p>
      )}
    </form>
  );
}
