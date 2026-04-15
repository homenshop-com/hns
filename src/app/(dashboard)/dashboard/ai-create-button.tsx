"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface AICreateButtonProps {
  emailVerified: boolean;
  labels: {
    btnNewSiteAI: string;
    aiModalTitle: string;
    aiNotice1: string;
    aiNotice2: string;
    defaultLanguage: string;
    subdomainSetup: string;
    subdomainPrefix: string;
    subdomainHint: string;
    aiSiteTitle: string;
    aiSiteTitlePlaceholder: string;
    aiPrompt: string;
    aiPromptPlaceholder: string;
    aiGenerate: string;
    aiGenerating: string;
    langKo: string;
    langEn: string;
    langZhCn: string;
    langJa: string;
    langZhTw: string;
    langEs: string;
    errorShopIdRequired: string;
    errorShopIdFormat: string;
    errorShopIdTaken: string;
    errorSiteTitleRequired: string;
    errorPromptRequired: string;
    emailVerifyRequired: string;
    emailVerifyMessage: string;
    emailVerifyResend: string;
    emailVerifySent: string;
  };
}

// Progress-stage messages shown while AI generates the site
// Designed to cycle on a schedule that roughly matches real generation phases
const STAGE_MESSAGES_KO = [
  { at: 0, label: "디자인 컨셉 분석 중" },
  { at: 8, label: "컬러 팔레트 & 타이포그래피 결정 중" },
  { at: 18, label: "사이트 구조 설계 중" },
  { at: 32, label: "홈 페이지 콘텐츠 작성 중" },
  { at: 48, label: "서브 페이지 구성 중" },
  { at: 64, label: "CSS 디자인 시스템 생성 중" },
  { at: 85, label: "마무리 및 검증 중" },
  { at: 110, label: "곧 완료됩니다" },
];

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(1, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function AICreateButton({ emailVerified, labels }: AICreateButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [language, setLanguage] = useState("ko");
  const [shopId, setShopId] = useState("");
  const [siteTitle, setSiteTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick elapsed seconds while creating
  useEffect(() => {
    if (creating) {
      setElapsed(0);
      tickerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } else {
      if (tickerRef.current) clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [creating]);

  // Pick current stage label based on elapsed seconds
  const currentStage = (() => {
    let latest = STAGE_MESSAGES_KO[0];
    for (const s of STAGE_MESSAGES_KO) {
      if (elapsed >= s.at) latest = s;
    }
    return latest;
  })();

  // Estimated total: 75s typical for sonnet; hard cap at 180s for bar fill
  const ESTIMATED_TOTAL = 75;
  const progressPct = Math.min(95, (elapsed / ESTIMATED_TOTAL) * 95);

  const languages = [
    { code: "ko", label: labels.langKo },
    { code: "en", label: labels.langEn },
    { code: "zh-cn", label: labels.langZhCn },
    { code: "ja", label: labels.langJa },
    { code: "zh-tw", label: labels.langZhTw },
    { code: "es", label: labels.langEs },
  ];

  function handleOpen() {
    setError("");
    setResendMsg("");
    if (!emailVerified) {
      setStep("verify");
    } else {
      setStep("form");
    }
    setOpen(true);
  }

  function handleClose() {
    if (creating) return;
    setOpen(false);
    setError("");
  }

  function validateShopId(value: string): boolean {
    return /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(value);
  }

  async function handleResendVerification() {
    setResending(true);
    setResendMsg("");
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (res.ok) {
        setResendMsg(labels.emailVerifySent);
      } else {
        const data = await res.json();
        setResendMsg(data.error || "Error");
      }
    } catch {
      setResendMsg("Error");
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!shopId.trim()) {
      setError(labels.errorShopIdRequired);
      return;
    }
    if (!validateShopId(shopId)) {
      setError(labels.errorShopIdFormat);
      return;
    }
    if (!siteTitle.trim()) {
      setError(labels.errorSiteTitleRequired);
      return;
    }
    if (!prompt.trim() || prompt.trim().length < 10) {
      setError(labels.errorPromptRequired);
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/sites/create-from-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          defaultLanguage: language,
          siteTitle,
          prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.error?.includes("shopId")) {
          setError(labels.errorShopIdTaken);
        } else {
          setError(data.error || "Failed to create site");
        }
        setCreating(false);
        return;
      }
      if (data.site?.pages?.[0]?.id) {
        router.push(`/dashboard/site/pages/${data.site.pages[0].id}/edit`);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Failed to create site");
      setCreating(false);
    }
  }

  return (
    <>
      <style>{`
        .ai-progress-panel {
          margin-top: 20px;
          padding: 20px;
          border: 1px solid #e9d8fd;
          border-radius: 12px;
          background: linear-gradient(135deg, #faf5ff 0%, #f0f4ff 100%);
        }
        .ai-progress-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .ai-progress-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid #e9d8fd;
          border-top-color: #7c3aed;
          border-radius: 50%;
          animation: ai-spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes ai-spin { to { transform: rotate(360deg); } }
        .ai-progress-stage {
          flex: 1;
          font-size: 14px;
          font-weight: 600;
          color: #4338ca;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ai-progress-dot {
          width: 8px;
          height: 8px;
          background: #7c3aed;
          border-radius: 50%;
          animation: ai-pulse 1.2s ease-in-out infinite;
        }
        @keyframes ai-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        .ai-progress-ellipsis { display: inline-flex; gap: 1px; margin-left: 2px; }
        .ai-progress-ellipsis i {
          animation: ai-blink 1.4s infinite;
          font-style: normal;
          opacity: 0;
        }
        .ai-progress-ellipsis i:nth-child(1) { animation-delay: 0s; }
        .ai-progress-ellipsis i:nth-child(2) { animation-delay: 0.2s; }
        .ai-progress-ellipsis i:nth-child(3) { animation-delay: 0.4s; }
        @keyframes ai-blink {
          0%, 40% { opacity: 0; }
          50%, 100% { opacity: 1; }
        }
        .ai-progress-time {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          font-weight: 600;
          color: #6b46c1;
          background: #fff;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid #e9d8fd;
        }
        .ai-progress-bar {
          width: 100%;
          height: 8px;
          background: #ede9fe;
          border-radius: 999px;
          overflow: hidden;
          position: relative;
        }
        .ai-progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #7c3aed 0%, #4338ca 50%, #7c3aed 100%);
          background-size: 200% 100%;
          border-radius: 999px;
          transition: width 0.4s ease;
          animation: ai-shimmer 2s linear infinite;
        }
        @keyframes ai-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .ai-progress-steps {
          list-style: none;
          padding: 0;
          margin: 16px 0 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 12px;
        }
        .ai-step {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #9ca3af;
          transition: color 0.3s;
        }
        .ai-step.done { color: #16a34a; }
        .ai-step.active { color: #4338ca; font-weight: 600; }
        .ai-step-mark {
          width: 16px;
          display: inline-flex;
          justify-content: center;
          font-weight: 700;
        }
        .ai-step.active .ai-step-mark {
          color: #7c3aed;
          animation: ai-pulse 1.2s ease-in-out infinite;
        }
        .ai-progress-hint {
          margin: 14px 0 0;
          padding: 0;
          font-size: 11px;
          color: #6b7280;
          text-align: center;
          line-height: 1.5;
        }
        @media (max-width: 540px) {
          .ai-progress-steps { grid-template-columns: 1fr; }
        }
      `}</style>
      <button
        type="button"
        onClick={handleOpen}
        className="dash-action-btn ai-create-btn"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #4338ca 100%)",
          color: "#fff",
          border: "none",
        }}
      >
        ✨ {labels.btnNewSiteAI}
      </button>

      {open && (
        <div className="tpl-modal-overlay" onClick={handleClose}>
          <div className="tpl-modal" onClick={(e) => e.stopPropagation()}>
            <button className="tpl-modal-close" onClick={handleClose} disabled={creating}>
              ×
            </button>

            {step === "verify" && (
              <div style={{ padding: "40px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>&#x2709;&#xFE0F;</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>
                  {labels.emailVerifyRequired}
                </h3>
                <p style={{ fontSize: 14, color: "#4a5568", lineHeight: 1.7, marginBottom: 24 }}>
                  {labels.emailVerifyMessage}
                </p>
                <button
                  onClick={handleResendVerification}
                  disabled={resending}
                  style={{
                    padding: "10px 24px",
                    fontSize: 14,
                    fontWeight: 600,
                    background: "#1a1a2e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: resending ? "default" : "pointer",
                    opacity: resending ? 0.6 : 1,
                  }}
                >
                  {resending ? "..." : labels.emailVerifyResend}
                </button>
                {resendMsg && (
                  <p
                    style={{
                      fontSize: 13,
                      color: resendMsg === labels.emailVerifySent ? "#2b8a3e" : "#c92a2a",
                      marginTop: 12,
                    }}
                  >
                    {resendMsg}
                  </p>
                )}
              </div>
            )}

            {step === "form" && (
              <div className="tpl-modal-setup">
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1a1a2e",
                    margin: "0 0 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  ✨ {labels.aiModalTitle}
                </h3>

                <div className="tpl-modal-notices">
                  <p>- {labels.aiNotice1}</p>
                  <p>- {labels.aiNotice2}</p>
                </div>

                <div className="tpl-modal-field">
                  <label>{labels.defaultLanguage}:</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={creating}
                    style={{
                      height: 36,
                      padding: "0 12px",
                      fontSize: 14,
                      border: "1px solid #d4d4d8",
                      borderRadius: 6,
                      backgroundColor: "#fff",
                      color: "#1a1a2e",
                    }}
                  >
                    {languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <h4 className="tpl-modal-subtitle">{labels.subdomainSetup}</h4>
                <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "12px 0" }} />

                <div className="tpl-modal-domain">
                  <span className="tpl-modal-domain-prefix">{labels.subdomainPrefix}</span>
                  <input
                    type="text"
                    value={shopId}
                    onChange={(e) => {
                      setShopId(e.target.value.toLowerCase());
                      setError("");
                    }}
                    maxLength={14}
                    disabled={creating}
                    style={{
                      height: 36,
                      padding: "0 12px",
                      fontSize: 14,
                      border: "1px solid #d4d4d8",
                      borderRadius: 6,
                      flex: 1,
                      minWidth: 120,
                    }}
                  />
                </div>
                <p className="tpl-modal-hint">{labels.subdomainHint}</p>

                <div className="tpl-modal-field" style={{ marginTop: 16, flexDirection: "column", alignItems: "stretch" }}>
                  <label style={{ marginBottom: 6, display: "block" }}>{labels.aiSiteTitle}:</label>
                  <input
                    type="text"
                    value={siteTitle}
                    onChange={(e) => {
                      setSiteTitle(e.target.value);
                      setError("");
                    }}
                    placeholder={labels.aiSiteTitlePlaceholder}
                    maxLength={100}
                    disabled={creating}
                    style={{
                      height: 36,
                      width: "100%",
                      padding: "0 12px",
                      fontSize: 14,
                      border: "1px solid #d4d4d8",
                      borderRadius: 6,
                    }}
                  />
                </div>

                <div className="tpl-modal-field" style={{ marginTop: 16, flexDirection: "column", alignItems: "stretch" }}>
                  <label style={{ marginBottom: 6, display: "block" }}>{labels.aiPrompt}:</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      setError("");
                    }}
                    placeholder={labels.aiPromptPlaceholder}
                    rows={6}
                    maxLength={2000}
                    disabled={creating}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #d4d4d8",
                      borderRadius: 6,
                      resize: "vertical",
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                    }}
                  />
                  <span style={{ fontSize: 11, color: "#868e96", marginTop: 4, display: "block" }}>
                    {prompt.length}/2000
                  </span>
                </div>

                {error && <p className="tpl-modal-error">{error}</p>}

                {creating && (
                  <div className="ai-progress-panel" aria-live="polite">
                    <div className="ai-progress-header">
                      <div className="ai-progress-spinner" aria-hidden="true" />
                      <div className="ai-progress-stage">
                        <span className="ai-progress-dot" />
                        {currentStage.label}
                        <span className="ai-progress-ellipsis">
                          <i>.</i>
                          <i>.</i>
                          <i>.</i>
                        </span>
                      </div>
                      <div className="ai-progress-time">
                        {formatElapsed(elapsed)}
                      </div>
                    </div>
                    <div className="ai-progress-bar">
                      <div
                        className="ai-progress-bar-fill"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <ul className="ai-progress-steps">
                      {STAGE_MESSAGES_KO.map((s, i) => {
                        const done = elapsed >= (STAGE_MESSAGES_KO[i + 1]?.at ?? 999);
                        const active =
                          elapsed >= s.at &&
                          (!STAGE_MESSAGES_KO[i + 1] ||
                            elapsed < STAGE_MESSAGES_KO[i + 1].at);
                        return (
                          <li
                            key={s.at}
                            className={`ai-step ${done ? "done" : ""} ${active ? "active" : ""}`}
                          >
                            <span className="ai-step-mark">
                              {done ? "✓" : active ? "●" : "○"}
                            </span>
                            <span className="ai-step-label">{s.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="ai-progress-hint">
                      이 과정은 보통 60–90초가 소요됩니다. 창을 닫지 말고 잠시 기다려 주세요.
                    </p>
                  </div>
                )}

                {!creating && (
                  <button
                    className="tpl-modal-create"
                    onClick={handleSubmit}
                    style={{
                      background: "linear-gradient(135deg, #7c3aed 0%, #4338ca 100%)",
                      marginTop: 16,
                    }}
                  >
                    ✨ {labels.aiGenerate}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
