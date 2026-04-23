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

export default function ProfileForm({ defaultName, defaultPhone, email, labels }: ProfileFormProps) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      if (res.ok) {
        setMsg({ type: "ok", text: labels.saved });
      } else {
        const data = await res.json();
        setMsg({ type: "err", text: data.error || labels.error });
      }
    } catch {
      setMsg({ type: "err", text: labels.error });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pv2-form-body">
      <div className="pv2-field">
        <label className="req">{labels.email}</label>
        <input type="email" value={email} readOnly />
        <div className="help">
          <svg width={11} height={11}><use href="#i-info" /></svg>
          로그인 ID로 사용됩니다. 변경하려면 고객지원에 문의하세요.
        </div>
      </div>
      <div className="pv2-field">
        <label className="req">{labels.name}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.namePlaceholder}
        />
      </div>
      <div className="pv2-field">
        <label>{labels.phone}</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={labels.phonePlaceholder}
        />
        <div className="help">SMS 알림 · 결제 본인인증에 사용됩니다</div>
      </div>
      <button type="submit" disabled={saving} className="pv2-submit primary">
        <svg width={14} height={14}><use href="#i-save" /></svg>
        {saving ? labels.saving : labels.save}
      </button>
      {msg && (
        <div className={`pv2-form-msg ${msg.type}`}>
          <svg width={12} height={12}>
            <use href={`#${msg.type === "ok" ? "i-check" : "i-warn"}`} />
          </svg>
          {msg.text}
        </div>
      )}
    </form>
  );
}
