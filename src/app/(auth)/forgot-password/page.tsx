"use client";

import { useState } from "react";
import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "오류가 발생했습니다.");
        return;
      }

      setMessage(data.message || "비밀번호 재설정 링크가 이메일로 전송되었습니다.");
      setEmail("");
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-lang">
        <LanguageSwitcher />
      </div>
      <div className="auth-card login">
        <h1 className="auth-title">비밀번호 찾기</h1>

        {message ? (
          <>
            <div className="auth-success">{message}</div>
            <Link href="/login" className="auth-btn-outline">
              로그인으로 돌아가기
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            <div className="auth-field">
              <label htmlFor="email">이메일</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="가입한 이메일 주소 입력"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? "전송 중..." : "재설정 링크 보내기"}
            </button>
          </form>
        )}

        <div className="auth-footer" style={{ marginTop: 24 }}>
          <Link href="/login">로그인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
