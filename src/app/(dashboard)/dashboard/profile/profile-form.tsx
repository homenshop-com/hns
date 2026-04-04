"use client";

import { useState } from "react";

interface ProfileFormProps {
  userId: string;
  defaultName: string;
  defaultPhone: string;
  email: string;
  labels: {
    email: string;
    name: string;
    namePlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    save: string;
    saving: string;
    saved: string;
    error: string;
  };
}

export default function ProfileForm({ userId, defaultName, defaultPhone, email, labels }: ProfileFormProps) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      if (res.ok) {
        setMessage(labels.saved);
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
        <label style={labelStyle}>{labels.email}</label>
        <input
          type="email"
          value={email}
          disabled
          style={{ ...inputStyle, background: "#f8f9fa", color: "#868e96", cursor: "not-allowed" }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{labels.name}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.namePlaceholder}
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>{labels.phone}</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={labels.phonePlaceholder}
          style={inputStyle}
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        style={{
          width: "100%",
          height: 44,
          background: saving ? "#adb5bd" : "#4a90d9",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? labels.saving : labels.save}
      </button>
      {message && (
        <p style={{
          fontSize: 13,
          color: message === labels.saved ? "#2f9e44" : "#e03131",
          textAlign: "center",
          marginTop: 10,
        }}>
          {message}
        </p>
      )}
    </form>
  );
}
