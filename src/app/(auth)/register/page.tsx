"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Turnstile from "@/components/turnstile";

type OtpState =
  | { stage: "idle" }
  | { stage: "sending" }
  | { stage: "sent"; expiresAt: number; testMode: boolean }
  | { stage: "verifying" }
  | { stage: "verified"; token: string }
  | { stage: "error"; message: string };

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const t = useTranslations("auth.register");

  // Phone OTP state — kept separate from the main form submit so resending /
  // re-typing doesn't blow away the rest of the inputs.
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otp, setOtp] = useState<OtpState>({ stage: "idle" });
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Live countdown for the "남은 시간" hint. Only relevant in 'sent' state.
  useEffect(() => {
    if (otp.stage !== "sent") return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((otp.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setOtp({ stage: "idle" });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [otp]);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  // If the user changes the phone after verifying, the verifyToken is no
  // longer valid for the new number — force re-verification.
  function handlePhoneChange(v: string) {
    setPhone(v);
    if (otp.stage === "verified" || otp.stage === "sent") {
      setOtp({ stage: "idle" });
      setOtpCode("");
      setOtpMessage(null);
    }
  }

  async function sendOtp() {
    setOtpMessage(null);
    setOtp({ stage: "sending" });
    try {
      const res = await fetch("/api/auth/phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "register" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtp({ stage: "error", message: data.error || "발송에 실패했습니다." });
        return;
      }
      const ttl = Number(data.ttlSeconds) || 180;
      setOtp({
        stage: "sent",
        expiresAt: Date.now() + ttl * 1000,
        testMode: !!data.testMode,
      });
      setOtpMessage(
        data.testMode
          ? "테스트 모드입니다. 서버 로그에서 인증번호를 확인해주세요."
          : "인증번호를 발송했습니다. 3분 이내에 입력해주세요.",
      );
    } catch (err) {
      console.error(err);
      setOtp({ stage: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }

  async function verifyOtp() {
    setOtpMessage(null);
    setOtp({ stage: "verifying" });
    try {
      const res = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otpCode, purpose: "register" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtp({ stage: "sent", expiresAt: Date.now() + secondsLeft * 1000, testMode: false });
        setOtpMessage(data.error || "인증에 실패했습니다.");
        return;
      }
      setOtp({ stage: "verified", token: data.verifyToken });
      setOtpMessage("인증이 완료되었습니다.");
    } catch (err) {
      console.error(err);
      setOtp({ stage: "sent", expiresAt: Date.now() + secondsLeft * 1000, testMode: false });
      setOtpMessage("네트워크 오류가 발생했습니다.");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError(t("passwordTooShort"));
      setLoading(false);
      return;
    }

    // Phone is optional, but if provided it must be verified — the
    // server enforces this too. Catching it client-side gives a better
    // error UX.
    if (phone && otp.stage !== "verified") {
      setError("핸드폰 번호 입력 시 인증을 완료해주세요.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password,
        name: formData.get("name"),
        phone: phone || null,
        phoneVerifyToken: otp.stage === "verified" ? otp.token : null,
        turnstileToken,
        website: formData.get("website"), // honeypot
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    // Auto-login after successful registration
    const email = formData.get("email") as string;
    const loginRes = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    // Prospect-claim flow: server identified a placeholder waiting for
    // this phone. Send the user to the claim confirmation page; if they
    // decline, they land in /dashboard with a fresh empty account.
    const placeholder = data.claimablePlaceholder as
      | { shopId: string; siteId: string; siteName: string }
      | null
      | undefined;

    if (loginRes?.ok) {
      if (placeholder) {
        const params = new URLSearchParams({
          shopId: placeholder.shopId,
          siteId: placeholder.siteId,
          name: placeholder.siteName,
        });
        router.push(`/register/claim?${params.toString()}`);
      } else {
        router.push("/dashboard");
      }
    } else {
      // Fallback: redirect to login with email pre-filled
      router.push(`/login?registered=true&email=${encodeURIComponent(email)}`);
    }
  }

  const otpSent = otp.stage === "sent" || otp.stage === "verifying";
  const otpVerified = otp.stage === "verified";
  const otpDisabled =
    !phone || phone.replace(/\D/g, "").length < 9 || otp.stage === "sending";

  return (
    <div className="auth-page">
      <div className="auth-lang">
        <LanguageSwitcher />
      </div>
      <div className="auth-card register">
        <h1 className="auth-title">{t("title")}</h1>

        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="name">{t("name")}</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="email">
                {t("email")} <span className="hint">(E-mail)</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder={t("emailPlaceholder")}
              />
            </div>
          </div>

          {/* Phone + OTP — given its own full-width row so the input has
              room for a long number plus the inline send button. */}
          <div className="auth-field">
            <label htmlFor="phone">
              {t("phone")} <span className="optional">{t("phoneOptional")}</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder={t("phonePlaceholder")}
                disabled={otpVerified}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                onClick={sendOtp}
                disabled={otpDisabled || otpVerified}
                style={{
                  flex: "0 0 auto",
                  height: 48,
                  padding: "0 18px",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: otpVerified ? "#dcfce7" : "#f1f5f9",
                  color: otpVerified ? "#166534" : "#334155",
                  cursor: otpDisabled || otpVerified ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {otp.stage === "sending"
                  ? "전송중..."
                  : otpVerified
                    ? "✓ 인증완료"
                    : otpSent
                      ? "재발송"
                      : "인증번호 받기"}
              </button>
            </div>

            {otpSent && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6자리 인증번호"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={otpCode.length !== 6 || otp.stage === "verifying"}
                  style={{
                    flex: "0 0 auto",
                    height: 48,
                    padding: "0 24px",
                    fontSize: 14,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: "1px solid #405189",
                    background: "#405189",
                    color: "white",
                    cursor:
                      otpCode.length !== 6 || otp.stage === "verifying"
                        ? "default"
                        : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {otp.stage === "verifying" ? "확인중..." : "확인"}
                </button>
              </div>
            )}

            {otp.stage === "sent" && secondsLeft > 0 && (
              <p style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                남은 시간 {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </p>
            )}

            {otpMessage && (
              <p
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: otpVerified ? "#166534" : otp.stage === "error" ? "#b91c1c" : "#64748b",
                }}
              >
                {otpMessage}
              </p>
            )}
            {otp.stage === "error" && (
              <p style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
                {otp.message}
              </p>
            )}
          </div>

          {/* Honeypot — invisible to humans, bots fill it */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="password">{t("password")}</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder={t("passwordPlaceholder")}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirmPassword">{t("confirmPassword")}</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                placeholder={t("confirmPasswordPlaceholder")}
              />
            </div>
          </div>

          {/* Cloudflare Turnstile CAPTCHA */}
          <Turnstile
            onVerify={handleTurnstileVerify}
            onExpire={handleTurnstileExpire}
          />

          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? t("submitting") : t("submit")}
          </button>
        </form>

        <div className="auth-footer">
          {t("hasAccount")}{" "}
          <Link href="/login">{t("goLogin")}</Link>
        </div>
      </div>
    </div>
  );
}
