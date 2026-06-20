"use client";

/**
 * AI 언급률 측정 패널 ('AI 언급률' 탭).
 *
 * 최근 측정 결과를 보여주고, '측정 시작' 시 POST /api/sites/:id/visibility 로
 * 크레딧을 차감하며 실행한다. 측정은 수십 초 걸릴 수 있어 로딩 상태를 명확히
 * 표시한다. 현재 엔진은 Claude(웹검색) 단일 — 타 엔진은 준비 중.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ResultItem {
  query: string;
  mentioned: boolean;
  position: number | null;
  competitors: string[];
  citations: string[];
  answerExcerpt: string;
}
interface RunResult {
  id: string;
  engine: string;
  model: string;
  brandName: string | null;
  domain: string | null;
  totalQueries: number;
  mentionedCount: number;
  mentionRate: number;
  creditsCharged: number;
  results: ResultItem[];
  createdAt: string;
}

interface Props {
  siteId: string;
  costCredits: number;
  balance: number;
  initialRun: RunResult | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function rateColor(rate: number): string {
  if (rate >= 50) return "#16a34a";
  if (rate >= 20) return "#ba7517";
  return "#dc2626";
}

export default function VisibilityPanel({ siteId, costCredits, balance, initialRun }: Props) {
  const router = useRouter();
  const [run, setRun] = useState<RunResult | null>(initialRun);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setConfirming(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/visibility`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "측정에 실패했습니다.");
        return;
      }
      setRun(data.run as RunResult);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const enough = balance >= costCredits;

  return (
    <div className="seo-vis">
      <div className="seo-vis-head">
        <div className="seo-vis-engine">
          <span className="eng on">
            <i className="fa-solid fa-circle" aria-hidden="true" style={{ fontSize: 7, color: "#16a34a" }} /> Claude
          </span>
          <span className="eng soon">ChatGPT</span>
          <span className="eng soon">Perplexity</span>
          <span className="eng soon">Gemini</span>
        </div>
        {run && !loading && (
          <button className="seo-vis-rerun" onClick={() => setConfirming(true)} disabled={loading}>
            <i className="fa-solid fa-rotate" aria-hidden="true" style={{ marginRight: 6 }} />
            재측정 ({costCredits} C)
          </button>
        )}
      </div>

      {error && (
        <div className="seo-vis-error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" style={{ marginRight: 6 }} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="seo-vis-loading">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" style={{ fontSize: 22, color: "#3182f6" }} />
          <p className="t">AI 엔진에 질의하는 중…</p>
          <p className="p">질문 세트 생성 후 여러 질문을 웹검색으로 질의합니다. 수십 초 걸릴 수 있어요.</p>
        </div>
      ) : !run ? (
        <div className="seo-soon" style={{ borderStyle: "solid" }}>
          <div className="tag">AI 언급률 측정</div>
          <div className="ic">
            <i className="fa-solid fa-quote-left" aria-hidden="true" />
          </div>
          <p className="t">아직 측정 결과가 없습니다</p>
          <p className="p">
            ChatGPT·Claude 같은 생성형 AI가 업종 관련 질문에 우리 사이트를 추천·인용하는지 측정합니다.
            브랜드명을 넣지 않은 ‘발견형’ 질문 세트로 무명 상태의 노출 가능성을 점검합니다.
          </p>
          <button
            className="seo-vis-start"
            onClick={() => setConfirming(true)}
            disabled={!enough}
            style={{ marginTop: 16 }}
          >
            <i className="fa-solid fa-play" aria-hidden="true" style={{ marginRight: 7 }} />
            측정 시작 ({costCredits} C)
          </button>
          {!enough && <div className="seo-vis-low">크레딧이 부족합니다 (잔액 {balance} C)</div>}
        </div>
      ) : (
        <>
          <div className="seo-vis-summary">
            <div className="big">
              <div className="pct" style={{ color: rateColor(run.mentionRate) }}>
                {run.mentionRate}
                <small>%</small>
              </div>
              <div className="lbl">AI 언급률</div>
            </div>
            <div className="seo-vis-stats">
              <div>
                <div className="n">
                  {run.mentionedCount}
                  <span className="muted"> / {run.totalQueries}</span>
                </div>
                <div className="l">언급된 질문</div>
              </div>
              <div>
                <div className="n">{fmtDate(run.createdAt).split(" ")[0]}</div>
                <div className="l">측정일</div>
              </div>
              <div>
                <div className="n" style={{ fontSize: 13 }}>
                  {run.domain}
                </div>
                <div className="l">대상 도메인</div>
              </div>
            </div>
          </div>

          <div className="seo-vis-list">
            {run.results.map((r, i) => (
              <div key={i} className="seo-vis-row">
                <span className={`seo-vis-dot ${r.mentioned ? "yes" : "no"}`}>
                  <i className={`fa-solid ${r.mentioned ? "fa-check" : "fa-xmark"}`} aria-hidden="true" />
                </span>
                <div className="seo-vis-q">
                  <div className="q">{r.query}</div>
                  <div className="meta">
                    {r.mentioned ? (
                      <span className="ok">
                        언급됨{r.position ? ` · ${r.position}순위` : ""}
                      </span>
                    ) : (
                      <span className="off">미언급</span>
                    )}
                    {r.competitors.length > 0 && (
                      <span className="comp">경쟁: {r.competitors.slice(0, 3).join(", ")}</span>
                    )}
                    {r.citations.length > 0 && <span className="cite">인용 {r.citations.length}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {confirming && (
        <div className="seo-vis-modal-bg" onClick={() => setConfirming(false)}>
          <div className="seo-vis-modal" onClick={(e) => e.stopPropagation()}>
            <h4>AI 언급률 측정</h4>
            <p>
              생성형 AI에 업종 질문을 던져 우리 사이트의 언급 여부를 측정합니다.
              <br />
              <b>{costCredits} 코인</b>이 차감됩니다 (잔액 {balance} → {balance - costCredits} C).
            </p>
            <div className="btns">
              <button className="ghost" onClick={() => setConfirming(false)}>
                취소
              </button>
              <button className="primary" onClick={start} disabled={!enough}>
                측정 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
