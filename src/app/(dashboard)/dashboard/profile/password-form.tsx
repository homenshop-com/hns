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

/**
 * Password strength scoring — 0 (none) to 4 (strong).
 * Criteria: length >= 8, has lowercase+uppercase, has digit, has symbol.
 * Displayed as 4 colored segments.
 */
function scorePassword(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}

function segmentClass(score: number, idx: number): string {
  if (idx >= score) return "";
  if (score <= 1) return "d";
  if (score <= 2) return "b";
  return "a";
}

export default function PasswordForm({ labels }: PasswordFormProps) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const score = scorePassword(newPw);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (newPw.length < 6) {
      setMsg({ type: "err", text: labels.passwordTooShort });
      return;
    }
    if (newPw !== confirmPw) {
      setMsg({ type: "err", text: labels.passwordMismatch });
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
        setMsg({ type: "ok", text: labels.passwordChanged });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
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
        <label>{labels.currentPassword}</label>
        <input
          type="password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div className="pv2-field">
        <label>{labels.newPassword}</label>
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          required
          placeholder={labels.passwordMinLength}
          autoComplete="new-password"
        />
        <div className="pv2-pw-strength" aria-hidden="true">
          <span className={segmentClass(score, 0)} />
          <span className={segmentClass(score, 1)} />
          <span className={segmentClass(score, 2)} />
          <span className={segmentClass(score, 3)} />
        </div>
        <div className="help">안전한 비밀번호일수록 강도가 높아집니다</div>
      </div>
      <div className="pv2-field">
        <label>{labels.confirmPassword}</label>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          autoComplete="new-password"
        />
        {confirmPw && confirmPw !== newPw && (
          <div className="help err">비밀번호가 일치하지 않습니다</div>
        )}
        {confirmPw && confirmPw === newPw && newPw.length >= 6 && (
          <div className="help ok">일치합니다</div>
        )}
      </div>
      <button type="submit" disabled={saving} className="pv2-submit dark">
        <svg width={14} height={14}><use href="#i-shield" /></svg>
        {saving ? labels.changing : labels.changePasswordBtn}
      </button>

      <div className="pv2-security-tips">
        <svg width={13} height={13}><use href="#i-shield" /></svg>
        <div>비밀번호는 주기적으로 변경하세요. 다른 사이트와 다른 비밀번호를 사용하면 더 안전합니다.</div>
      </div>

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
