"use client";

import { useState } from "react";
import { normalizeDomain } from "@/lib/normalize-domain";

/**
 * Domain-setup guidance for the reseller (white-label) admin forms.
 *
 * Mirrors the customer custom-domain guide (dashboard/domains/add-domain-form),
 * but a reseller domain serves the WHOLE Next.js app white-labeled — not a
 * single published site. So the only registrant step is pointing DNS A records
 * at our server; the platform then provisions an nginx vhost + Let's Encrypt
 * SSL (`/root/scripts/provision-reseller-domain.sh <domain>`).
 *
 * The "DNS 확인" button reuses /api/domains/verify-dns (session-gated; the
 * admin is logged in) to confirm propagation before provisioning.
 */

const SERVER_IP = "167.71.199.28";

type DnsCheckHost = { host: string; ips: string[]; ok: boolean; error: string | null };
type DnsCheck = {
  domain: string;
  serverIp: string;
  allOk: boolean;
  apex: DnsCheckHost;
  www: DnsCheckHost;
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard may be unavailable; ignore */
        }
      }}
      className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
    >
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

export default function ResellerDomainGuide({ domain }: { domain: string }) {
  const [checking, setChecking] = useState(false);
  const [dnsCheck, setDnsCheck] = useState<DnsCheck | null>(null);
  const [error, setError] = useState("");

  const normalized = normalizeDomain(domain);

  async function runDnsCheck() {
    if (!normalized) return;
    setChecking(true);
    setError("");
    setDnsCheck(null);
    try {
      const res = await fetch("/api/domains/verify-dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: normalized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "DNS 확인에 실패했습니다.");
      setDnsCheck(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "DNS 확인 중 오류가 발생했습니다.");
    } finally {
      setChecking(false);
    }
  }

  const anyOk = dnsCheck ? dnsCheck.apex.ok || dnsCheck.www.ok : false;

  return (
    <div className="border-t border-slate-100 pt-4">
      {/* DNS check — sits directly under the domain input */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runDnsCheck}
          disabled={checking || !normalized}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {checking ? "확인 중…" : "DNS 확인"}
        </button>
        <span className="text-xs text-slate-400">
          {normalized ? `${normalized} 의 A 레코드를 조회합니다.` : "도메인을 먼저 입력하세요."}
        </span>
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {dnsCheck && (
        <div
          className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
            dnsCheck.allOk
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : anyOk
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <b>
            {dnsCheck.allOk
              ? "DNS 설정이 정상입니다."
              : anyOk
                ? "부분 설정됨 — 누락된 레코드를 확인해주세요."
                : "A 레코드가 서버를 가리키지 않습니다."}
          </b>
          <div className="mt-1 space-y-0.5 text-xs">
            <div>
              <span className={dnsCheck.apex.ok ? "text-emerald-600" : "text-red-500"}>
                {dnsCheck.apex.ok ? "✓" : "✗"}
              </span>{" "}
              @ →{" "}
              {dnsCheck.apex.error
                ? dnsCheck.apex.error
                : dnsCheck.apex.ips.length === 0
                  ? "레코드 없음"
                  : dnsCheck.apex.ips.join(", ")}
            </div>
            <div>
              <span className={dnsCheck.www.ok ? "text-emerald-600" : "text-red-500"}>
                {dnsCheck.www.ok ? "✓" : "✗"}
              </span>{" "}
              www →{" "}
              {dnsCheck.www.error
                ? dnsCheck.www.error
                : dnsCheck.www.ips.length === 0
                  ? "레코드 없음"
                  : dnsCheck.www.ips.join(", ")}
            </div>
          </div>
          {!dnsCheck.allOk && (
            <p className="mt-1 text-xs text-slate-500">
              목표 IP: <span className="font-mono">{dnsCheck.serverIp}</span> · DNS 전파에 최대 48시간이 걸릴 수 있습니다.
            </p>
          )}
          {anyOk && (
            <p className="mt-1 text-xs text-slate-500">
              DNS가 서버를 가리키면, 관리자가{" "}
              <span className="font-mono">provision-reseller-domain.sh {normalized}</span>{" "}
              실행으로 nginx + SSL을 발급합니다.
            </p>
          )}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-800 mb-1 mt-4">도메인 연결 안내</h2>
      <p className="text-xs text-slate-400 mb-3">
        리셀러 도메인이 실제로 접속되려면, 도메인을 구입한 업체의{" "}
        <b>DNS 관리 페이지</b>에서 아래 <b>A 레코드</b>를 추가해 도메인을 홈앤샵
        서버로 향하게 해야 합니다. DNS가 서버를 가리킨 뒤 SSL 인증서가 발급됩니다.
      </p>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-700">DNS 설정 (A 레코드)</span>
          <span className="ml-auto text-[11px] text-slate-400">필수 2개</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 border-b border-slate-100">
              <th className="px-3 py-2 font-medium w-16">타입</th>
              <th className="px-3 py-2 font-medium">호스트 / 이름</th>
              <th className="px-3 py-2 font-medium">값 (IP 주소)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-50">
              <td className="px-3 py-2">
                <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-[#3182f6]">A</span>
              </td>
              <td className="px-3 py-2 text-slate-700">
                @ <span className="text-slate-400 text-xs">(또는 빈칸 / 도메인명)</span>
              </td>
              <td className="px-3 py-2 font-mono text-slate-800">
                {SERVER_IP}
                <CopyButton value={SERVER_IP} />
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2">
                <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-[#3182f6]">A</span>
              </td>
              <td className="px-3 py-2 text-slate-700">www</td>
              <td className="px-3 py-2 font-mono text-slate-800">
                {SERVER_IP}
                <CopyButton value={SERVER_IP} />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
          <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5">⏱ DNS 전파: 최대 48시간</span>
          <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5">🔒 SSL 자동 발급 (Let&apos;s Encrypt · 무료)</span>
        </div>
      </div>
    </div>
  );
}
