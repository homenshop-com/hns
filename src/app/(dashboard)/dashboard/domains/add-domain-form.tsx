"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CopyDnsValueButton from "./copy-dns-value-button";

type DnsCheckHost = {
  host: string;
  ips: string[];
  ok: boolean;
  error: string | null;
};

type DnsCheck = {
  domain: string;
  serverIp: string;
  allOk: boolean;
  apex: DnsCheckHost;
  www: DnsCheckHost;
};

type SiteOption = { id: string; name: string; shopId: string };

interface AddDomainFormProps {
  siteId?: string | null;
  siteName?: string | null;
  availableSites?: SiteOption[];
  serverIp?: string;
}

const DEFAULT_SERVER_IP = "167.71.199.28";

const PROVIDERS: { key: string; name: string; letter: string; color: string; url: string }[] = [
  { key: "whois",  name: "후이즈",   letter: "후", color: "#e11",     url: "https://whois.co.kr/" },
  { key: "gabia",  name: "가비아",   letter: "G", color: "#0066cc",  url: "https://my.gabia.com/" },
  { key: "cafe24", name: "카페24",   letter: "C", color: "#ff6600",  url: "https://www.cafe24.com/" },
  { key: "godaddy",name: "GoDaddy",  letter: "G", color: "#4b8",     url: "https://sso.godaddy.com/" },
];

export default function AddDomainForm({
  siteId,
  siteName,
  availableSites = [],
  serverIp = DEFAULT_SERVER_IP,
}: AddDomainFormProps) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dnsCheck, setDnsCheck] = useState<DnsCheck | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    availableSites.length === 1 ? availableSites[0].id : "",
  );

  const effectiveSiteChosen = Boolean(siteId || selectedSiteId || availableSites.length === 0);
  const anyOk = dnsCheck ? (dnsCheck.apex.ok || dnsCheck.www.ok) : false;
  const canSubmit = effectiveSiteChosen && domain.trim() && anyOk && !loading && !checking;

  // Step state for numbered circles
  const step1Done = effectiveSiteChosen;
  const step2Done = step1Done; // reading guide is passive
  const step3Done = anyOk;

  function normalizeDomain(v: string) {
    return v
      .replace(/\s+/g, "")
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }

  async function runDnsCheck(): Promise<DnsCheck | null> {
    setChecking(true);
    setError("");
    setDnsCheck(null);
    try {
      const res = await fetch("/api/domains/verify-dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "DNS 확인에 실패했습니다.");
      setDnsCheck(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "DNS 확인 중 오류가 발생했습니다.");
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    let check = dnsCheck;
    if (!check || check.domain !== normalizeDomain(domain)) {
      check = await runDnsCheck();
      if (!check) return;
    }
    const _anyOk = check.apex.ok || check.www.ok;
    if (!_anyOk) {
      setError("DNS 설정이 완료되지 않았습니다. A 레코드를 확인 후 다시 시도해주세요.");
      return;
    }

    const eff = siteId || selectedSiteId || null;
    if (!siteId && availableSites.length > 1 && !selectedSiteId) {
      setError("도메인을 연결할 사이트를 선택해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          ...(eff ? { siteId: eff } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "도메인 추가에 실패했습니다.");

      setSuccess(`${data.domain} 도메인이 등록되었습니다.`);
      setDomain("");
      setDnsCheck(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDomainChange(v: string) {
    const next = normalizeDomain(v);
    setDomain(next);
    if (dnsCheck && dnsCheck.domain !== next) setDnsCheck(null);
    setSuccess("");
  }

  return (
    <section className="dm2-card green">
      <div className="dm2-card-head">
        <div className="accent" />
        <h3>
          <svg className="ic" width={16} height={16}><use href="#i-plus" /></svg>
          도메인 추가
        </h3>
        <span className="note">이미 구매한 도메인을 사이트에 연결하세요.</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="dm2-add-body">
          {/* ── Step 1 ── */}
          <div className="dm2-step">
            <div className={`dm2-step-num${step1Done ? " done" : ""}`}>1</div>
            <div className="dm2-step-body">
              <div className="dm2-step-title">
                연결할 사이트 선택 <span className="req">*</span>
                {step1Done && <span className="done-tag">선택됨</span>}
              </div>
              <div className="dm2-step-desc">
                계정에 여러 사이트가 있는 경우, 어느 사이트로 도메인을 연결할지 선택해주세요.
              </div>
              <div className="dm2-step-content">
                {siteId && siteName ? (
                  <div className="dm2-site-banner">
                    <svg width={14} height={14} style={{ color: "var(--brand)" }}><use href="#i-link" /></svg>
                    <b>{siteName}</b> 사이트에 연결될 도메인입니다.
                  </div>
                ) : availableSites.length === 0 ? (
                  <div className="dm2-site-banner" style={{ background: "#fff4e0", color: "#a56b00", borderColor: "#f5d496" }}>
                    <svg width={14} height={14}><use href="#i-warn" /></svg>
                    먼저 사이트를 생성한 뒤 도메인을 연결할 수 있습니다.
                  </div>
                ) : (
                  <select
                    className="dm2-select"
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    required
                  >
                    <option value="">— 사이트 선택 —</option>
                    {availableSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.shopId})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* ── Step 2 ── */}
          <div className="dm2-step">
            <div className={`dm2-step-num${step2Done ? " done" : ""}`}>2</div>
            <div className="dm2-step-body">
              <div className="dm2-step-title">
                DNS 설정
                <span className="hint-inline">— 초보자 가이드</span>
              </div>
              <div className="dm2-step-desc">
                도메인을 홈앤샵 서버에 연결하려면, 도메인을 구입한 업체의 <b>DNS 관리 페이지</b>에서
                아래와 같이 <b>A 레코드 {dnsCheck?.apex.ok && dnsCheck?.www.ok ? "2개" : "3개"}</b>를
                추가해주세요.
              </div>

              <div className="dm2-step-content">
                <div className="dm2-dns-guide">
                  <div className="dm2-dns-guide-head">
                    <div className="ic"><svg width={13} height={13}><use href="#i-pin" /></svg></div>
                    <div className="t">DNS 설정 안내</div>
                    <div className="n">3개 A 레코드</div>
                  </div>
                  <div className="dm2-dns-guide-body">
                    <table className="dm2-dns-tbl">
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>타입</th>
                          <th>호스트 / 이름</th>
                          <th style={{ width: 220 }}>값 (IP 주소)</th>
                          <th style={{ width: 80 }}>필수</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="type">A</span></td>
                          <td className="host">
                            @ <span className="hint">(또는 빈칸 / 도메인명)</span>
                          </td>
                          <td className="val">
                            {serverIp}
                            <CopyDnsValueButton value={serverIp} />
                          </td>
                          <td className="req y">필수</td>
                        </tr>
                        <tr>
                          <td><span className="type">A</span></td>
                          <td className="host">www</td>
                          <td className="val">
                            {serverIp}
                            <CopyDnsValueButton value={serverIp} />
                          </td>
                          <td className="req y">필수</td>
                        </tr>
                        <tr>
                          <td><span className="type">A</span></td>
                          <td className="host">
                            * <span className="hint">(와일드카드 · 선택)</span>
                          </td>
                          <td className="val">
                            {serverIp}
                            <CopyDnsValueButton value={serverIp} />
                          </td>
                          <td className="req n">선택</td>
                        </tr>
                      </tbody>
                    </table>

                    <button
                      type="button"
                      onClick={() => setProviderOpen((o) => !o)}
                      className={`dm2-collapse${providerOpen ? " open" : ""}`}
                      aria-expanded={providerOpen}
                    >
                      <svg width={14} height={14}><use href="#i-book" /></svg>
                      <span style={{ flex: 1 }}>
                        <b style={{ color: "var(--ink-0)" }}>설정 예시 보기</b>{" "}
                        <span style={{ color: "var(--ink-3)" }}>
                          (후이즈·가비아·카페24·GoDaddy 등)
                        </span>
                      </span>
                      <span className="chev"><svg width={12} height={12}><use href="#i-chev-right" /></svg></span>
                    </button>
                    <div className={`dm2-collapse-body${providerOpen ? " open" : ""}`}>
                      도메인 업체별로 메뉴 이름이 조금씩 다릅니다. 아래 업체를 클릭해 공식 DNS 관리
                      페이지를 여세요. 공통 절차는{" "}
                      <b style={{ color: "var(--ink-0)" }}>
                        로그인 → 내 도메인 → DNS 관리 → A 레코드 추가
                      </b>{" "}
                      입니다.
                      <div className="dm2-provider-grid">
                        {PROVIDERS.map((p) => (
                          <a
                            key={p.key}
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dm2-provider"
                          >
                            <div className="lg" style={{ color: p.color }}>{p.letter}</div>
                            <div className="nm">{p.name}</div>
                          </a>
                        ))}
                      </div>
                      <p
                        style={{
                          marginTop: 10,
                          padding: "8px 10px",
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                          borderRadius: 6,
                          color: "#9a3412",
                          fontSize: 11.5,
                          lineHeight: 1.5,
                        }}
                      >
                        💡 업체별 용어 차이: <b>호스트/Name/Sub Domain</b> = 모두 같은 뜻 ·{" "}
                        <b>값/Value/Points to/IP Address</b> = 모두 같은 뜻. 타입은 반드시{" "}
                        <b>A</b>로 선택하세요 (CNAME, TXT 아님).
                      </p>
                    </div>

                    <div className="dm2-pill-row">
                      <span className="dm2-pill">
                        <svg className="ic" width={12} height={12}><use href="#i-clock" /></svg>
                        DNS 전파: 최대 48시간
                      </span>
                      <span className="dm2-pill">
                        <svg className="ic" width={12} height={12}><use href="#i-lock" /></svg>
                        SSL 인증서 자동 발급 (Let&apos;s Encrypt)
                      </span>
                      <span className="dm2-pill ok">무료</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 3 ── */}
          <div className="dm2-step">
            <div className={`dm2-step-num${step3Done ? " done" : ""}`}>3</div>
            <div className="dm2-step-body">
              <div className="dm2-step-title">
                도메인 입력 &amp; 확인
                {step3Done && <span className="done-tag">확인 완료</span>}
              </div>
              <div className="dm2-step-desc">
                DNS 설정 후 아래에 도메인을 입력하고 <b>DNS 확인</b> 버튼을 눌러주세요.
              </div>
              <div className="dm2-step-content">
                <div className="dm2-check-row">
                  <input
                    className="dm2-input"
                    type="text"
                    value={domain}
                    onChange={(e) => handleDomainChange(e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData("text");
                      handleDomainChange(text);
                    }}
                    placeholder="example.com"
                    required
                  />
                  <button
                    type="button"
                    onClick={runDnsCheck}
                    disabled={checking || !domain.trim()}
                    className={`dm2-check-btn${checking ? " checking" : ""}`}
                  >
                    <svg width={14} height={14}><use href="#i-refresh" /></svg>
                    {checking ? "확인 중…" : "DNS 확인"}
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="dm2-submit-btn"
                    title={
                      dnsCheck !== null && !anyOk
                        ? "최소 하나(@ 또는 www)의 A 레코드가 서버를 가리켜야 합니다."
                        : undefined
                    }
                  >
                    <svg width={14} height={14}><use href="#i-plus" /></svg>
                    {loading ? "추가 중…" : "도메인 추가"}
                  </button>
                </div>

                {/* Error banner */}
                {error && (
                  <div className="dm2-dns-result err">
                    <svg width={18} height={18} style={{ color: "var(--danger)" }}><use href="#i-warn" /></svg>
                    <div>
                      <b>{error}</b>
                    </div>
                  </div>
                )}

                {/* Success banner */}
                {success && (
                  <div className="dm2-dns-result ok">
                    <svg width={18} height={18}><use href="#i-check" /></svg>
                    <div>
                      <b>{success}</b>
                    </div>
                  </div>
                )}

                {/* DNS check result */}
                {dnsCheck && !success && (() => {
                  const partial = anyOk && !dnsCheck.allOk;
                  const cls = dnsCheck.allOk ? "ok" : partial ? "warn" : "err";
                  const title = dnsCheck.allOk
                    ? "DNS 설정이 정상입니다."
                    : partial
                      ? "부분 설정됨 — 등록은 가능하지만 누락된 레코드를 확인해주세요."
                      : "A 레코드를 찾을 수 없습니다.";
                  return (
                    <div className={`dm2-dns-result ${cls}`}>
                      <svg width={18} height={18}>
                        <use href={`#${cls === "ok" ? "i-check" : "i-warn"}`} />
                      </svg>
                      <div>
                        <b>{title}</b>{" "}
                        {dnsCheck.allOk
                          ? `3개 A 레코드가 모두 `
                          : partial
                            ? `일부 레코드만 `
                            : `DNS 전파에 최대 48시간이 걸릴 수 있습니다. `}
                        {dnsCheck.allOk || partial ? (
                          <>
                            <span className="mono">{dnsCheck.serverIp}</span>
                            {dnsCheck.allOk ? "로 전파되었습니다. 도메인을 추가할 수 있습니다." : "로 전파되었습니다."}
                          </>
                        ) : (
                          "잠시 후 다시 시도해주세요."
                        )}
                        <div className="row-list">
                          <div className="dns-row">
                            <span className={dnsCheck.apex.ok ? "ok-mark" : "ng-mark"}>
                              {dnsCheck.apex.ok ? "✓" : "✗"}
                            </span>
                            <span>@ →</span>
                            <span>
                              {dnsCheck.apex.error
                                ? dnsCheck.apex.error
                                : dnsCheck.apex.ips.length === 0
                                  ? "레코드 없음"
                                  : dnsCheck.apex.ips.join(", ")}
                            </span>
                          </div>
                          <div className="dns-row">
                            <span className={dnsCheck.www.ok ? "ok-mark" : "ng-mark"}>
                              {dnsCheck.www.ok ? "✓" : "✗"}
                            </span>
                            <span>www →</span>
                            <span>
                              {dnsCheck.www.error
                                ? dnsCheck.www.error
                                : dnsCheck.www.ips.length === 0
                                  ? "레코드 없음"
                                  : dnsCheck.www.ips.join(", ")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="dm2-tip">
                  <svg className="lightbulb" width={13} height={13}><use href="#i-bulb" /></svg>
                  <span>
                    <b>DNS 확인</b> 버튼으로 먼저 설정을 검증한 후 도메인을 추가하세요.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
