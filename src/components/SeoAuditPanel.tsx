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

interface Finding {
  severity: Severity;
  issue: string;
  recommendation: string;
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
  /** User's current balance, only used in user mode. */
  balance: number;
  /** Existing stored result; null if never audited. */
  initialResult: AuditResultShape | null;
  initialAuditedAt: string | null;
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
                            return (
                              <div key={i} style={{
                                background: "#fff",
                                border: "1px solid #e5e7eb",
                                borderRadius: 6,
                                padding: 10,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
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
                                  <span style={{ fontSize: 12, color: "#1e293b", fontWeight: 500 }}>
                                    {f.issue}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, paddingLeft: 4 }}>
                                  💡 {f.recommendation}
                                </div>
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
