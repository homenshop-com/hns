"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("domainsDash");
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
      if (!res.ok) throw new Error(data.error || t("dnsCheckFailed"));
      setDnsCheck(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dnsCheckError"));
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
      setError(t("dnsNotReady"));
      return;
    }

    const eff = siteId || selectedSiteId || null;
    if (!siteId && availableSites.length > 1 && !selectedSiteId) {
      setError(t("selectSiteFirst"));
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
      if (!res.ok) throw new Error(data.error || t("addFailed"));

      setSuccess(t("addSuccess", { domain: data.domain }));
      setDomain("");
      setDnsCheck(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
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
          {t("addDomain")}
        </h3>
        <span className="note">{t("addNote")}</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="dm2-add-body">
          {/* ── Step 1 ── */}
          <div className="dm2-step">
            <div className={`dm2-step-num${step1Done ? " done" : ""}`}>1</div>
            <div className="dm2-step-body">
              <div className="dm2-step-title">
                {t("step1Title")} <span className="req">*</span>
                {step1Done && <span className="done-tag">{t("selected")}</span>}
              </div>
              <div className="dm2-step-desc">
                {t("step1Desc")}
              </div>
              <div className="dm2-step-content">
                {siteId && siteName ? (
                  <div className="dm2-site-banner">
                    <svg width={14} height={14} style={{ color: "var(--brand)" }}><use href="#i-link" /></svg>
                    {t.rich("siteBanner", { site: siteName, b: (c) => <b>{c}</b> })}
                  </div>
                ) : availableSites.length === 0 ? (
                  <div className="dm2-site-banner" style={{ background: "#fff4e0", color: "#a56b00", borderColor: "#f5d496" }}>
                    <svg width={14} height={14}><use href="#i-warn" /></svg>
                    {t("createSiteFirst")}
                  </div>
                ) : (
                  <select
                    className="dm2-select"
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    required
                  >
                    <option value="">{t("selectSiteOption")}</option>
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
                {t("step2Title")}
                <span className="hint-inline">{t("step2Hint")}</span>
              </div>
              <div className="dm2-step-desc">
                {t.rich("step2Desc", {
                  count: dnsCheck?.apex.ok && dnsCheck?.www.ok ? 2 : 3,
                  b: (c) => <b>{c}</b>,
                })}
              </div>

              <div className="dm2-step-content">
                <div className="dm2-dns-guide">
                  <div className="dm2-dns-guide-head">
                    <div className="ic"><svg width={13} height={13}><use href="#i-pin" /></svg></div>
                    <div className="t">{t("dnsGuideTitle")}</div>
                    <div className="n">{t("threeARecords")}</div>
                  </div>
                  <div className="dm2-dns-guide-body">
                    <table className="dm2-dns-tbl">
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>{t("dnsColType")}</th>
                          <th>{t("dnsColHost")}</th>
                          <th style={{ width: 220 }}>{t("dnsColValue")}</th>
                          <th style={{ width: 80 }}>{t("dnsColRequired")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="type">A</span></td>
                          <td className="host">
                            @ <span className="hint">{t("hostApexHint")}</span>
                          </td>
                          <td className="val">
                            {serverIp}
                            <CopyDnsValueButton value={serverIp} />
                          </td>
                          <td className="req y">{t("required")}</td>
                        </tr>
                        <tr>
                          <td><span className="type">A</span></td>
                          <td className="host">www</td>
                          <td className="val">
                            {serverIp}
                            <CopyDnsValueButton value={serverIp} />
                          </td>
                          <td className="req y">{t("required")}</td>
                        </tr>
                        <tr>
                          <td><span className="type">A</span></td>
                          <td className="host">
                            * <span className="hint">{t("hostWildcardHint")}</span>
                          </td>
                          <td className="val">
                            {serverIp}
                            <CopyDnsValueButton value={serverIp} />
                          </td>
                          <td className="req n">{t("optional")}</td>
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
                        <b style={{ color: "var(--ink-0)" }}>{t("viewExamples")}</b>{" "}
                        <span style={{ color: "var(--ink-3)" }}>
                          {t("viewExamplesProviders")}
                        </span>
                      </span>
                      <span className="chev"><svg width={12} height={12}><use href="#i-chev-right" /></svg></span>
                    </button>
                    <div className={`dm2-collapse-body${providerOpen ? " open" : ""}`}>
                      {t.rich("collapseBody", {
                        b: (c) => <b style={{ color: "var(--ink-0)" }}>{c}</b>,
                      })}
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
                        {t.rich("terminologyTip", { b: (c) => <b>{c}</b> })}
                      </p>
                    </div>

                    <div className="dm2-pill-row">
                      <span className="dm2-pill">
                        <svg className="ic" width={12} height={12}><use href="#i-clock" /></svg>
                        {t("pillPropagation")}
                      </span>
                      <span className="dm2-pill">
                        <svg className="ic" width={12} height={12}><use href="#i-lock" /></svg>
                        {t("pillSslAuto")}
                      </span>
                      <span className="dm2-pill ok">{t("pillFree")}</span>
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
                {t("step3Title")}
                {step3Done && <span className="done-tag">{t("verified")}</span>}
              </div>
              <div className="dm2-step-desc">
                {t.rich("step3Desc", { b: (c) => <b>{c}</b> })}
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
                    {checking ? t("checking") : t("dnsCheck")}
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="dm2-submit-btn"
                    title={
                      dnsCheck !== null && !anyOk
                        ? t("submitDisabledTooltip")
                        : undefined
                    }
                  >
                    <svg width={14} height={14}><use href="#i-plus" /></svg>
                    {loading ? t("adding") : t("addDomain")}
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
                    ? t("dnsResultOk")
                    : partial
                      ? t("dnsResultPartial")
                      : t("dnsResultNone");
                  return (
                    <div className={`dm2-dns-result ${cls}`}>
                      <svg width={18} height={18}>
                        <use href={`#${cls === "ok" ? "i-check" : "i-warn"}`} />
                      </svg>
                      <div>
                        <b>{title}</b>{" "}
                        {dnsCheck.allOk
                          ? t("dnsBodyAllOkPre")
                          : partial
                            ? t("dnsBodyPartialPre")
                            : t("dnsBodyNonePre")}
                        {dnsCheck.allOk || partial ? (
                          <>
                            <span className="mono">{dnsCheck.serverIp}</span>
                            {dnsCheck.allOk ? t("dnsBodyAllOkPost") : t("dnsBodyPartialPost")}
                          </>
                        ) : (
                          t("dnsBodyNonePost")
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
                                  ? t("noRecord")
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
                                  ? t("noRecord")
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
                    {t.rich("bottomTip", { b: (c) => <b>{c}</b> })}
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
