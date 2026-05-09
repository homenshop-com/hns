"use client";

/**
 * SEO/GEO audit panel — shared by admin (free) and user dashboard
 * (5 코인 차감). Renders the existing audit (if any), a "재실행" button
 * with a confirmation modal that shows credits before/after, and the
 * results UI (overall score + per-category accordion).
 *
 * The server-side endpoint /api/seo-audit handles the actual charge;
 * `mode="admin"` simply skips the cost label + confirmation step.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type Severity = "critical" | "major" | "minor" | "info";

interface Autofix {
  type: "seoMeta" | "site";
  key?: string;
  field?: string;
  value: string;
}

interface Finding {
  severity: Severity;
  issue: string;
  recommendation: string;
  autofix?: Autofix;
  appliedAt?: string;
}

interface Category {
  key: string;
  label: string;
  score: number;
  findings: Finding[];
}

export interface AuditResultShape {
  version: number;
  overallScore: number;
  summary: string;
  categories: Category[];
  meta: {
    model: string;
    auditedUrl: string;
    htmlBytes: number;
    truncated: boolean;
    tokensIn: number;
    tokensOut: number;
    creditsCharged: number;
    runAt: string;
  };
}

interface Props {
  siteId: string;
  mode: "admin" | "user";
  /** 5 — only used in user mode for the confirmation modal label. */
  costCredits: number;
  /** 10 — cost of the Tier 2 HTML optimize call (user mode). */
  optimizeCostCredits: number;
  /** User's current balance, only used in user mode. */
  balance: number;
  /** Existing stored result; null if never audited. */
  initialResult: AuditResultShape | null;
  initialAuditedAt: string | null;
}

interface OptimizePreview {
  pageId: string;
  pageSlug: string;
  before: string;
  after: string;
  changes: string[];
  addressedFindings: { categoryKey: string; findingIndex: number }[];
  meta: { model: string; tokensIn: number; tokensOut: number; creditsCharged: number; runAt: string };
}

const SEV_STYLE: Record<Severity, { bg: string; text: string; label: string }> = {
  critical: { bg: "#fee2e2", text: "#991b1b", label: "치명" },
  major: { bg: "#ffedd5", text: "#9a3412", label: "주요" },
  minor: { bg: "#fef3c7", text: "#854d0e", label: "보통" },
  info: { bg: "#e0e7ff", text: "#3730a3", label: "정보" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "#059669"; // emerald
  if (score >= 60) return "#d97706"; // amber
  if (score >= 40) return "#ea580c"; // orange
  return "#dc2626"; // red
}

function formatTs(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SeoAuditPanel({
  siteId,
  mode,
  costCredits,
  optimizeCostCredits,
  balance,
  initialResult,
  initialAuditedAt,
}: Props) {
  const router = useRouter();
  const [result, setResult] = useState<AuditResultShape | null>(initialResult);
  const [auditedAt, setAuditedAt] = useState<string | null>(initialAuditedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(balance);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{ required: number; balance: number } | null>(null);
  // Tier 1 + Tier 2 state
  const [applyingAll, setApplyingAll] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeConfirm, setOptimizeConfirm] = useState(false);
  const [preview, setPreview] = useState<OptimizePreview | null>(null);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<string>("");

  const isUser = mode === "user";

  function onRunClick() {
    setError("");
    setInsufficient(null);
    if (isUser) {
      setShowConfirm(true);
    } else {
      runAudit();
    }
  }

  async function runAudit() {
    setShowConfirm(false);
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/seo-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (res.status === 402 && data.code === "INSUFFICIENT_CREDITS") {
        setInsufficient({ required: data.required, balance: data.balance });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "진단에 실패했습니다.");
      }
      setResult(data.result);
      setAuditedAt(data.result.meta.runAt);
      if (isUser) setCurrentBalance(data.balanceAfter);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "오류");
    } finally {
      setLoading(false);
    }
  }

  const hasResult = result !== null;

  // Collect all autofix-able findings that haven't been applied yet
  // — feeds the "전체 자동 적용" button at the top of the result.
  const pendingAutofixes: { categoryKey: string; findingIndex: number }[] = result
    ? result.categories.flatMap((c) =>
        c.findings
          .map((f, idx) => ({ f, idx }))
          .filter(({ f }) => f.autofix && !f.appliedAt)
          .map(({ idx }) => ({ categoryKey: c.key, findingIndex: idx })),
      )
    : [];
  const pendingHtmlFindings = result
    ? result.categories.reduce(
        (n, c) => n + c.findings.filter((f) => !f.autofix && !f.appliedAt && f.severity !== "info").length,
        0,
      )
    : 0;

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 4000);
  }

  async function applyFixes(refs: { categoryKey: string; findingIndex: number }[], allButton = false) {
    if (refs.length === 0) return;
    if (allButton) setApplyingAll(true);
    setError("");
    try {
      const res = await fetch("/api/seo-audit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, fixes: refs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "적용 실패");
      setResult(data.result);
      showToast(`${data.applied}개 적용 완료${data.skipped ? ` · ${data.skipped}개 건너뜀` : ""}${data.errors?.length ? ` · 오류 ${data.errors.length}` : ""}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (allButton) setApplyingAll(false);
    }
  }

  function onOptimizeClick() {
    setError("");
    if (mode === "user") setOptimizeConfirm(true);
    else runOptimize();
  }

  async function runOptimize() {
    setOptimizeConfirm(false);
    setOptimizing(true);
    setError("");
    try {
      const res = await fetch("/api/seo-audit/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (res.status === 402 && data.code === "INSUFFICIENT_CREDITS") {
        setInsufficient({ required: data.required, balance: data.balance });
        return;
      }
      if (!res.ok) throw new Error(data.error || "최적화 실패");
      setPreview(data.preview);
      if (mode === "user") setCurrentBalance(data.balanceAfter);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOptimizing(false);
    }
  }

  async function commitOptimize() {
    if (!preview) return;
    setCommitting(true);
    setError("");
    try {
      const res = await fetch("/api/seo-audit/optimize/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          pageId: preview.pageId,
          patchedHtml: preview.after,
          addressedFindings: preview.addressedFindings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      // Mark addressed findings as applied locally — server already
      // persisted the same change, but we mirror it so the UI doesn't
      // need a router.refresh() roundtrip to catch up.
      if (result) {
        const cloned = JSON.parse(JSON.stringify(result)) as AuditResultShape;
        const nowIso = new Date().toISOString();
        for (const ref of preview.addressedFindings) {
          const cat = cloned.categories.find((c) => c.key === ref.categoryKey);
          if (cat?.findings[ref.findingIndex] && !cat.findings[ref.findingIndex].appliedAt) {
            cat.findings[ref.findingIndex].appliedAt = nowIso;
          }
        }
        setResult(cloned);
      }
      setPreview(null);
      showToast(`홈페이지 HTML 저장 완료 · ${preview.changes.length}개 변경 반영`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div style={{
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 20,
      background: "#fff",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 16,
      }}>
        <div>
          <h3 style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#1e293b",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            🤖 SEO / GEO 진단
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 999,
              background: "#f1f5f9",
              color: "#475569",
            }}>
              AI 분석
            </span>
          </h3>
          <p style={{
            fontSize: 12,
            color: "#64748b",
            margin: "4px 0 0",
            lineHeight: 1.5,
          }}>
            퍼블리싱된 홈페이지를 Claude AI가 분석하여 검색엔진(Google/Naver) 및
            생성형 AI(ChatGPT/Claude/Perplexity) 노출 최적화를 진단합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRunClick}
          disabled={loading}
          style={{
            background: loading ? "#94a3b8" : "#405189",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {loading ? "분석 중…" : hasResult
            ? (isUser ? `재진단 (${costCredits} 코인)` : "재진단")
            : (isUser ? `진단 실행 (${costCredits} 코인)` : "진단 실행")}
        </button>
      </div>

      {auditedAt && (
        <div style={{
          fontSize: 11,
          color: "#94a3b8",
          marginBottom: 16,
        }}>
          최근 진단: {formatTs(auditedAt)} · 모델 {result?.meta.model || "-"}
          {result?.meta.creditsCharged ? ` · ${result.meta.creditsCharged}코인 차감됨` : ""}
        </div>
      )}

      {error && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          padding: 12,
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 12,
        }}>
          ⚠️ {error}
        </div>
      )}

      {!hasResult && !loading && (
        <div style={{
          background: "#f8fafc",
          border: "1px dashed #cbd5e1",
          padding: 24,
          borderRadius: 8,
          textAlign: "center",
          color: "#64748b",
          fontSize: 13,
        }}>
          아직 진단을 실행하지 않았습니다.
          {isUser && (
            <>
              <br />
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                실행 시 {costCredits} 코인이 차감됩니다 (현재 잔액: {currentBalance}C)
              </span>
            </>
          )}
        </div>
      )}

      {hasResult && result && (
        <>
          {/* Overall score */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 16,
            background: "#f8fafc",
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: `4px solid ${scoreColor(result.overallScore)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              flexDirection: "column",
            }}>
              <div style={{
                fontSize: 24,
                fontWeight: 700,
                color: scoreColor(result.overallScore),
              }}>
                {result.overallScore}
              </div>
              <div style={{ fontSize: 9, color: "#64748b", marginTop: -2 }}>
                / 100
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                color: "#1e293b",
                lineHeight: 1.6,
              }}>
                {result.summary}
              </div>
              <div style={{
                fontSize: 11,
                color: "#94a3b8",
                marginTop: 6,
              }}>
                분석 URL: <span style={{ fontFamily: "monospace" }}>{result.meta.auditedUrl}</span>
              </div>
            </div>
          </div>

          {/* Optimization action bar (Tier 1 + Tier 2) */}
          {(pendingAutofixes.length > 0 || pendingHtmlFindings > 0) && (
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              padding: 12,
              background: "linear-gradient(90deg, #eef2ff 0%, #fdf4ff 100%)",
              border: "1px solid #c7d2fe",
              borderRadius: 8,
              marginBottom: 12,
              alignItems: "center",
            }}>
              <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: "#3730a3" }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>🪄 자동 최적화</div>
                <div style={{ color: "#6366f1" }}>
                  {pendingAutofixes.length > 0 && `데이터 ${pendingAutofixes.length}개 자동 적용 가능 (무료)`}
                  {pendingAutofixes.length > 0 && pendingHtmlFindings > 0 && " · "}
                  {pendingHtmlFindings > 0 && `HTML/콘텐츠 ${pendingHtmlFindings}개 권고 (Claude 재작성)`}
                </div>
              </div>
              {pendingAutofixes.length > 0 && (
                <button
                  type="button"
                  onClick={() => applyFixes(pendingAutofixes, true)}
                  disabled={applyingAll}
                  style={{
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    background: applyingAll ? "#94a3b8" : "#6366f1",
                    border: "none",
                    borderRadius: 6,
                    cursor: applyingAll ? "not-allowed" : "pointer",
                  }}
                >
                  {applyingAll ? "적용 중…" : `전체 자동 적용 (무료)`}
                </button>
              )}
              {pendingHtmlFindings > 0 && (
                <button
                  type="button"
                  onClick={onOptimizeClick}
                  disabled={optimizing}
                  style={{
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    background: optimizing ? "#94a3b8" : "#a855f7",
                    border: "none",
                    borderRadius: 6,
                    cursor: optimizing ? "not-allowed" : "pointer",
                  }}
                >
                  {optimizing ? "AI 작성 중…" : (mode === "user" ? `홈 HTML 최적화 (${optimizeCostCredits} 코인)` : "홈 HTML 최적화")}
                </button>
              )}
            </div>
          )}

          {/* Category accordion */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {result.categories.map((cat) => {
              const isOpen = openCat === cat.key;
              const critCount = cat.findings.filter((f) => f.severity === "critical").length;
              const majCount = cat.findings.filter((f) => f.severity === "major").length;
              return (
                <div key={cat.key} style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => setOpenCat(isOpen ? null : cat.key)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: isOpen ? "#f8fafc" : "#fff",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        background: scoreColor(cat.score) + "15",
                        color: scoreColor(cat.score),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                      }}>
                        {cat.score}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                          {cat.label}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          {cat.findings.length}개 발견
                          {critCount > 0 && <span style={{ color: "#dc2626", marginLeft: 6 }}>· 치명 {critCount}</span>}
                          {majCount > 0 && <span style={{ color: "#ea580c", marginLeft: 6 }}>· 주요 {majCount}</span>}
                        </div>
                      </div>
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: 13 }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: 12,
                      borderTop: "1px solid #e5e7eb",
                      background: "#fafafa",
                    }}>
                      {cat.findings.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#64748b", padding: 8 }}>
                          이 항목은 통과했습니다 ✓
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {cat.findings.map((f, i) => {
                            const sev = SEV_STYLE[f.severity];
                            const isAutofix = Boolean(f.autofix);
                            const isApplied = Boolean(f.appliedAt);
                            const fixValue = f.autofix?.value || "";
                            const fixTarget = f.autofix?.type === "site"
                              ? `Site.${f.autofix.field}`
                              : f.autofix?.type === "seoMeta"
                                ? `seoMeta.${f.autofix.key}`
                                : null;
                            return (
                              <div key={i} style={{
                                background: isApplied ? "#f0fdf4" : "#fff",
                                border: `1px solid ${isApplied ? "#bbf7d0" : "#e5e7eb"}`,
                                borderRadius: 6,
                                padding: 10,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: sev.bg,
                                    color: sev.text,
                                  }}>
                                    {sev.label}
                                  </span>
                                  {isAutofix && !isApplied && (
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      background: "#ede9fe",
                                      color: "#6d28d9",
                                    }}>
                                      ✨ 자동 적용 가능
                                    </span>
                                  )}
                                  {isApplied && (
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      background: "#dcfce7",
                                      color: "#166534",
                                    }}>
                                      ✓ 적용됨
                                    </span>
                                  )}
                                  <span style={{ fontSize: 12, color: "#1e293b", fontWeight: 500 }}>
                                    {f.issue}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, paddingLeft: 4 }}>
                                  💡 {f.recommendation}
                                </div>
                                {isAutofix && fixTarget && (
                                  <div style={{
                                    marginTop: 8,
                                    padding: 8,
                                    background: isApplied ? "#dcfce7" : "#faf5ff",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <span style={{ color: "#6b7280", fontFamily: "monospace" }}>{fixTarget}</span>
                                      <span style={{ color: "#1f2937", margin: "0 6px" }}>=</span>
                                      <span style={{ color: "#1f2937", fontWeight: 500, wordBreak: "break-all" }}>{fixValue}</span>
                                    </div>
                                    {!isApplied && (
                                      <button
                                        type="button"
                                        onClick={() => applyFixes([{ categoryKey: cat.key, findingIndex: i }])}
                                        style={{
                                          padding: "4px 10px",
                                          fontSize: 11,
                                          fontWeight: 600,
                                          color: "#fff",
                                          background: "#6d28d9",
                                          border: "none",
                                          borderRadius: 4,
                                          cursor: "pointer",
                                          flexShrink: 0,
                                        }}
                                      >
                                        적용
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Toast (after apply / commit) */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "#1e293b",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: 8,
          fontSize: 13,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          zIndex: 1100,
        }}>
          ✓ {toast}
        </div>
      )}

      {/* Optimize confirmation modal (Tier 2, user mode only) */}
      {optimizeConfirm && isUser && (
        <div
          onClick={() => setOptimizeConfirm(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 12, padding: 24,
            maxWidth: 420, width: "calc(100% - 32px)",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3)",
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: "0 0 12px" }}>
              🪄 홈페이지 HTML 최적화
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.5 }}>
              Claude가 진단 결과(HTML 권고 {pendingHtmlFindings}개)를 바탕으로 홈페이지 HTML을 다시 작성합니다.
              <br />
              <strong>저장 전 미리보기</strong>가 표시되며, 취소해도 코인은 차감됩니다 (AI 호출 비용).
            </p>
            <div style={{
              background: "#f8fafc", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "#64748b" }}>비용</span>
                <span style={{ fontWeight: 600, color: "#1e293b" }}>{optimizeCostCredits} 코인</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "#64748b" }}>현재 잔액</span>
                <span style={{ color: "#1e293b" }}>{currentBalance} 코인</span>
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", padding: "8px 0 4px",
                borderTop: "1px solid #e5e7eb", marginTop: 4,
              }}>
                <span style={{ color: "#64748b" }}>실행 후 잔액</span>
                <span style={{ fontWeight: 600, color: currentBalance - optimizeCostCredits < 0 ? "#dc2626" : "#059669" }}>
                  {currentBalance - optimizeCostCredits} 코인
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setOptimizeConfirm(false)}
                style={{ padding: "8px 16px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 500 }}>
                취소
              </button>
              <button type="button" onClick={runOptimize} disabled={currentBalance < optimizeCostCredits}
                style={{ padding: "8px 16px", fontSize: 13, border: "none", borderRadius: 6, background: currentBalance < optimizeCostCredits ? "#cbd5e1" : "#a855f7", color: "#fff", cursor: currentBalance < optimizeCostCredits ? "not-allowed" : "pointer", fontWeight: 600 }}>
                {optimizeCostCredits}코인 사용하고 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optimization preview modal */}
      {preview && (
        <div
          onClick={() => !committing && setPreview(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 12, padding: 24,
            maxWidth: 800, width: "100%", maxHeight: "90vh", overflow: "auto",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3)",
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: "0 0 4px" }}>
              🪄 홈페이지 HTML 최적화 미리보기
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>
              {preview.changes.length}개 변경 · {preview.addressedFindings.length}개 권고 반영 · 모델 {preview.meta.model}
            </p>

            {preview.changes.length > 0 && (
              <div style={{
                background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8,
                padding: 12, marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0c4a6e", marginBottom: 6 }}>
                  변경 내역
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#0369a1", lineHeight: 1.7 }}>
                  {preview.changes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}

            <details style={{ marginBottom: 16 }}>
              <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer", padding: 4 }}>
                패치된 HTML 보기 ({preview.after.length.toLocaleString()} bytes)
              </summary>
              <pre style={{
                background: "#0f172a", color: "#e2e8f0", padding: 12, borderRadius: 6,
                fontSize: 11, overflow: "auto", maxHeight: 300, marginTop: 8,
              }}>
                {preview.after}
              </pre>
            </details>

            <div style={{
              background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6,
              padding: 10, marginBottom: 16, fontSize: 12, color: "#854d0e",
            }}>
              ⚠️ 적용 후에는 디자인 에디터에서도 변경 사항이 보입니다. 원본 백업이 필요하면 적용 전 사이트를 복사해두세요.
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setPreview(null)} disabled={committing}
                style={{ padding: "10px 16px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", cursor: committing ? "not-allowed" : "pointer", fontWeight: 500 }}>
                취소
              </button>
              <button type="button" onClick={commitOptimize} disabled={committing}
                style={{ padding: "10px 20px", fontSize: 13, border: "none", borderRadius: 6, background: committing ? "#94a3b8" : "#059669", color: "#fff", cursor: committing ? "not-allowed" : "pointer", fontWeight: 600 }}>
                {committing ? "저장 중…" : "홈페이지에 적용"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User confirmation modal */}
      {showConfirm && isUser && (
        <div
          onClick={() => setShowConfirm(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "calc(100% - 32px)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3)",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: "0 0 12px" }}>
              SEO/GEO 진단을 실행합니다
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.5 }}>
              퍼블리싱된 홈페이지를 Claude Sonnet 4-6이 분석합니다.
              결과는 저장되어 다시 보는 것은 무료입니다.
            </p>
            <div style={{
              background: "#f8fafc",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              fontSize: 13,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "#64748b" }}>비용</span>
                <span style={{ fontWeight: 600, color: "#1e293b" }}>{costCredits} 코인</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "#64748b" }}>현재 잔액</span>
                <span style={{ color: "#1e293b" }}>{currentBalance} 코인</span>
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0 4px",
                borderTop: "1px solid #e5e7eb",
                marginTop: 4,
              }}>
                <span style={{ color: "#64748b" }}>실행 후 잔액</span>
                <span style={{ fontWeight: 600, color: currentBalance - costCredits < 0 ? "#dc2626" : "#059669" }}>
                  {currentBalance - costCredits} 코인
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#475569",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={runAudit}
                disabled={currentBalance < costCredits}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  border: "none",
                  borderRadius: 6,
                  background: currentBalance < costCredits ? "#cbd5e1" : "#405189",
                  color: "#fff",
                  cursor: currentBalance < costCredits ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {costCredits}코인 사용하고 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient credits modal */}
      {insufficient && isUser && (
        <div
          onClick={() => setInsufficient(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
              color: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "calc(100% - 32px)",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
              💎 코인이 부족합니다
            </h3>
            <p style={{ fontSize: 13, opacity: 0.9, margin: "0 0 16px", lineHeight: 1.5 }}>
              필요: {insufficient.required} 코인 / 잔액: {insufficient.balance} 코인
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setInsufficient(null)}
                style={{
                  flex: 1,
                  padding: "10px",
                  fontSize: 13,
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: 6,
                  background: "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                나중에
              </button>
              <a
                href="/pricing"
                style={{
                  flex: 1,
                  padding: "10px",
                  fontSize: 13,
                  border: "none",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#6d28d9",
                  textAlign: "center",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                크레딧 충전하러 가기 →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
