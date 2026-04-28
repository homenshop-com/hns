"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface AICreateButtonProps {
  emailVerified: boolean;
  /** When true, render as the large dashboard-v2 gradient card (homepage
   *  quick-action) instead of the plain old toolbar button. */
  renderAsCard?: boolean;
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
    aiStyleStep: string;
    aiInfoStep: string;
    aiStyleTitle: string;
    aiStyleDesc: string;
    aiStyleNext: string;
    aiStyleBack: string;
    aiStyleAuto: string;
    aiStyleAutoDesc: string;
    aiStyleMinimal: string;
    aiStyleMinimalDesc: string;
    aiStyleEditorial: string;
    aiStyleEditorialDesc: string;
    aiStyleOrganic: string;
    aiStyleOrganicDesc: string;
    aiStyleLuxury: string;
    aiStyleLuxuryDesc: string;
    aiStyleColorful: string;
    aiStyleColorfulDesc: string;
  };
}

type DesignStyle =
  | "auto"
  | "minimal"
  | "editorial"
  | "organic"
  | "luxury"
  | "colorful";

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

export default function AICreateButton({ emailVerified, labels, renderAsCard }: AICreateButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"style" | "form" | "verify">("style");
  const [designStyle, setDesignStyle] = useState<DesignStyle>("auto");
  const [language, setLanguage] = useState("ko");
  const [shopId, setShopId] = useState("");
  const [siteTitle, setSiteTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [insufficientCredits, setInsufficientCredits] = useState<{ required: number; balance: number } | null>(null);
  // Attached promotional materials — flyers / brochures / PDFs that
  // Claude Vision analyzes for brand name, services, prices, contact
  // info, and uses as the source of truth for the generated homepage.
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const MAX_ATTACHMENTS = 5;
  const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB per file
  const ACCEPTED_TYPES = "image/jpeg,image/png,image/gif,image/webp,application/pdf";

  const onAddFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    const tooBig = incoming.find((f) => f.size > MAX_ATTACHMENT_SIZE);
    if (tooBig) {
      setError(`파일 크기 초과: ${tooBig.name} (최대 10MB)`);
      return;
    }
    setAttachments((prev) => {
      const next = [...prev];
      for (const f of incoming) {
        if (next.length >= MAX_ATTACHMENTS) break;
        // Dedupe by name+size — typical re-pick of the same file.
        if (!next.some((x) => x.name === f.name && x.size === f.size)) {
          next.push(f);
        }
      }
      return next;
    });
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

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
      setStep("style");
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
      // Two paths: with attachments → multipart (Claude Vision can read
      // images/PDFs directly); without → JSON (legacy text-only flow).
      let res: Response;
      if (attachments.length > 0) {
        const fd = new FormData();
        fd.append("shopId", shopId);
        fd.append("defaultLanguage", language);
        fd.append("siteTitle", siteTitle);
        fd.append("prompt", prompt);
        fd.append("designStyle", designStyle);
        for (const f of attachments) fd.append("attachments", f);
        res = await fetch("/api/sites/create-from-ai", {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch("/api/sites/create-from-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId,
            defaultLanguage: language,
            siteTitle,
            prompt,
            designStyle,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 && data.code === "INSUFFICIENT_CREDITS") {
          setInsufficientCredits({
            required: typeof data.required === "number" ? data.required : 50,
            balance: typeof data.balance === "number" ? data.balance : 0,
          });
        } else if (res.status === 409 && data.error?.includes("shopId")) {
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
        .ai-step-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
        }
        .ai-step-indicator .pill {
          padding: 4px 10px;
          border-radius: 999px;
          background: #f3f4f6;
          color: #6b7280;
        }
        .ai-step-indicator .pill.active {
          background: linear-gradient(135deg, #7c3aed 0%, #4338ca 100%);
          color: #fff;
        }
        .ai-step-indicator .pill.done {
          background: #ede9fe;
          color: #6b46c1;
        }
        .ai-style-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin: 16px 0 0;
        }
        @media (max-width: 720px) {
          .ai-style-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .ai-style-grid { grid-template-columns: 1fr; }
        }
        .ai-style-card {
          position: relative;
          padding: 16px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
          cursor: pointer;
          text-align: left;
          transition: all 0.18s ease;
          font-family: inherit;
        }
        .ai-style-card:hover {
          border-color: #c4b5fd;
          background: #faf5ff;
          transform: translateY(-1px);
        }
        .ai-style-card.selected {
          border-color: #7c3aed;
          background: linear-gradient(135deg, #faf5ff 0%, #f0f4ff 100%);
          box-shadow: 0 4px 16px rgba(124, 58, 237, 0.14);
        }
        .ai-style-card .icon {
          font-size: 26px;
          line-height: 1;
          margin-bottom: 8px;
        }
        .ai-style-card .label {
          font-size: 14px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 4px;
        }
        .ai-style-card .desc {
          font-size: 11.5px;
          color: #6b7280;
          line-height: 1.45;
        }
        .ai-style-card.selected .label {
          color: #4338ca;
        }
        .ai-style-card .check {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #7c3aed;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
        }
        .ai-style-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 18px;
        }
        .ai-style-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #6b7280;
          background: transparent;
          border: none;
          cursor: pointer;
          border-radius: 6px;
          font-family: inherit;
        }
        .ai-style-back-btn:hover {
          color: #4338ca;
          background: #f3f4f6;
        }
      `}</style>
      {renderAsCard ? (
        <button
          type="button"
          onClick={handleOpen}
          className="dv2-action"
          style={{ textAlign: "left", width: "100%" }}
        >
          <div className="ai-bg" /><div className="glow" />
          <div className="inner">
            <div className="ic" style={{ display: "grid", placeItems: "center", fontSize: 22 }}>✨</div>
            <div className="text">
              <div className="ttl">
                AI 홈페이지 제작 <span className="tag">NEW</span>
              </div>
              <div className="desc">몇 문장만으로 5분 만에 완성</div>
            </div>
            <div className="arr" aria-hidden>
              <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10h12M11 5l5 5-5 5" />
              </svg>
            </div>
          </div>
        </button>
      ) : (
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
      )}

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

            {step === "style" && (
              <div className="tpl-modal-setup">
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1a1a2e",
                    margin: "0 0 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  ✨ {labels.aiModalTitle}
                </h3>
                <div className="ai-step-indicator">
                  <span className="pill active">{labels.aiStyleStep}</span>
                  <span className="pill">{labels.aiInfoStep}</span>
                </div>
                <h4
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#1a1a2e",
                    margin: "10px 0 4px",
                  }}
                >
                  {labels.aiStyleTitle}
                </h4>
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
                  {labels.aiStyleDesc}
                </p>
                <div className="ai-style-grid">
                  {(
                    [
                      { code: "auto", icon: "✨", label: labels.aiStyleAuto, desc: labels.aiStyleAutoDesc },
                      { code: "minimal", icon: "🎯", label: labels.aiStyleMinimal, desc: labels.aiStyleMinimalDesc },
                      { code: "editorial", icon: "📰", label: labels.aiStyleEditorial, desc: labels.aiStyleEditorialDesc },
                      { code: "organic", icon: "🌿", label: labels.aiStyleOrganic, desc: labels.aiStyleOrganicDesc },
                      { code: "luxury", icon: "💎", label: labels.aiStyleLuxury, desc: labels.aiStyleLuxuryDesc },
                      { code: "colorful", icon: "🎨", label: labels.aiStyleColorful, desc: labels.aiStyleColorfulDesc },
                    ] as { code: DesignStyle; icon: string; label: string; desc: string }[]
                  ).map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setDesignStyle(s.code)}
                      className={`ai-style-card${designStyle === s.code ? " selected" : ""}`}
                      aria-pressed={designStyle === s.code}
                    >
                      <div className="icon">{s.icon}</div>
                      <div className="label">{s.label}</div>
                      <div className="desc">{s.desc}</div>
                      {designStyle === s.code && <span className="check">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="ai-style-actions">
                  <button
                    className="tpl-modal-create"
                    onClick={() => setStep("form")}
                    style={{
                      background: "linear-gradient(135deg, #7c3aed 0%, #4338ca 100%)",
                      width: "auto",
                      minWidth: 140,
                    }}
                  >
                    {labels.aiStyleNext} →
                  </button>
                </div>
              </div>
            )}

            {step === "form" && (
              <div className="tpl-modal-setup">
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1a1a2e",
                    margin: "0 0 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  ✨ {labels.aiModalTitle}
                </h3>

                <div className="ai-step-indicator">
                  <span className="pill done">{labels.aiStyleStep} ✓</span>
                  <span className="pill active">{labels.aiInfoStep}</span>
                </div>

                {!creating && (
                  <button
                    type="button"
                    className="ai-style-back-btn"
                    onClick={() => setStep("style")}
                  >
                    ← {labels.aiStyleBack}
                  </button>
                )}

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

                {/* Promotional material upload — flyers, brochures, PDFs.
                    Claude Vision analyzes uploads for brand/service/price
                    /contact info and uses them as source content. */}
                <div className="tpl-modal-field" style={{ marginTop: 16, flexDirection: "column", alignItems: "stretch" }}>
                  <label style={{ marginBottom: 6, display: "block" }}>
                    홍보물 첨부 <span style={{ color: "#868e96", fontWeight: 400, fontSize: 12 }}>(선택 · 이미지·PDF, 최대 5개)</span>:
                  </label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      onAddFiles(e.dataTransfer.files);
                    }}
                    style={{
                      border: "1.5px dashed #c9c9c9",
                      borderRadius: 8,
                      padding: "16px",
                      textAlign: "center",
                      background: "#fafafa",
                      cursor: "pointer",
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: 22, color: "#868e96" }} />
                    <div style={{ marginTop: 6, fontSize: 13, color: "#495057" }}>
                      전단지·브로셔·메뉴판 파일을 드래그하거나 클릭해서 추가
                    </div>
                    <div style={{ fontSize: 11, color: "#868e96", marginTop: 2 }}>
                      JPG · PNG · GIF · WebP · PDF (각 10MB 이하)
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPTED_TYPES}
                      style={{ display: "none" }}
                      onChange={(e) => {
                        onAddFiles(e.target.files);
                        e.target.value = "";
                      }}
                      disabled={creating}
                    />
                  </div>
                  {attachments.length > 0 && (
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                      {attachments.map((f, i) => {
                        const isImage = f.type.startsWith("image/");
                        const url = isImage ? URL.createObjectURL(f) : null;
                        return (
                          <div
                            key={`${f.name}-${i}`}
                            style={{
                              position: "relative",
                              padding: 6,
                              border: "1px solid #e5e7eb",
                              borderRadius: 6,
                              background: "#fff",
                            }}
                          >
                            {isImage && url ? (
                              <img
                                src={url}
                                alt={f.name}
                                onLoad={() => URL.revokeObjectURL(url)}
                                style={{
                                  width: "100%",
                                  height: 80,
                                  objectFit: "cover",
                                  borderRadius: 4,
                                  display: "block",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "100%",
                                  height: 80,
                                  background: "#f3f4f6",
                                  borderRadius: 4,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#dc2626",
                                  fontSize: 28,
                                }}
                              >
                                <i className="fa-solid fa-file-pdf" />
                              </div>
                            )}
                            <div
                              title={f.name}
                              style={{
                                fontSize: 10,
                                color: "#495057",
                                marginTop: 4,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {f.name}
                            </div>
                            <div style={{ fontSize: 9, color: "#868e96" }}>
                              {(f.size / 1024).toFixed(0)} KB
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAttachment(i);
                              }}
                              disabled={creating}
                              title="제거"
                              style={{
                                position: "absolute",
                                top: 4,
                                right: 4,
                                width: 20,
                                height: 20,
                                padding: 0,
                                background: "rgba(0,0,0,0.55)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "50%",
                                cursor: "pointer",
                                fontSize: 11,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

      {insufficientCredits && (
        <div
          onClick={() => setInsufficientCredits(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              maxWidth: 420,
              width: "100%",
              padding: "32px 28px 24px",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                margin: "0 auto 16px",
                borderRadius: "50%",
                background: "#fef3c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              ✨
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e", margin: "0 0 10px" }}>
              크레딧이 부족합니다
            </h3>
            <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, margin: "0 0 24px" }}>
              AI 홈페이지 생성에는 <b>{insufficientCredits.required} 크레딧</b>이 필요합니다.
              <br />
              현재 잔액: <b>{insufficientCredits.balance.toLocaleString()} C</b>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href="/dashboard/credits"
                style={{
                  display: "block",
                  padding: "12px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#7c3aed",
                  borderRadius: 8,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                크레딧 충전하러 가기
              </a>
              <button
                onClick={() => setInsufficientCredits(null)}
                style={{
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#4b5563",
                  background: "#fff",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
