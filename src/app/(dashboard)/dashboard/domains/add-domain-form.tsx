"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export default function AddDomainForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dnsCheck, setDnsCheck] = useState<DnsCheck | null>(null);

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

  async function handleCheckClick() {
    await runDnsCheck();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Require a successful DNS check before allowing registration.
    // Either the user clicked "DNS 확인" and got allOk, or we run it now.
    let check = dnsCheck;
    if (!check || check.domain !== normalizeDomain(domain)) {
      check = await runDnsCheck();
      if (!check) return;
    }
    // 부분 성공도 허용 — apex 또는 www 중 하나라도 서버를 가리키면 등록 가능.
    // (www만 설정하고 @ 는 유지하는 케이스 등 실사용 패턴을 반영)
    const anyOk = check.apex.ok || check.www.ok;
    if (!anyOk) {
      setError("DNS 설정이 완료되지 않았습니다. A 레코드를 확인 후 다시 시도해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
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

  // Reset DNS check when domain input changes — stale results would mislead.
  function handleDomainChange(v: string) {
    const next = normalizeDomain(v);
    setDomain(next);
    if (dnsCheck && dnsCheck.domain !== next) setDnsCheck(null);
  }

  return (
    <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a1a2e" }}>도메인 추가</h3>

      <div style={{ background: "#eef4fc", border: "1px solid #c6daf7", borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#2c5fa0", marginBottom: 10 }}>
          📌 DNS 설정 안내 (초보자 가이드)
        </p>

        <p style={{ fontSize: 13, color: "#357abd", marginBottom: 10, lineHeight: 1.6 }}>
          도메인을 홈앤샵 서버에 연결하려면, 도메인을 구입한 업체의 <strong>DNS 관리 페이지</strong>에서
          아래와 같이 <strong>A 레코드 3개</strong>를 추가해주세요.
        </p>

        {/* Example DNS records table */}
        <div style={{ background: "#fff", border: "1px solid #c6daf7", borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 140px 80px", background: "#f4f8fd", padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "#2c5fa0", borderBottom: "1px solid #c6daf7" }}>
            <div>타입</div>
            <div>호스트 / 이름</div>
            <div>값 (IP 주소)</div>
            <div>필수</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 140px 80px", padding: "8px 12px", fontSize: 12, color: "#333", borderBottom: "1px solid #eef4fc", alignItems: "center" }}>
            <div><code style={{ background: "#eef4fc", padding: "2px 6px", borderRadius: 3, fontFamily: "monospace" }}>A</code></div>
            <div><code style={{ fontFamily: "monospace" }}>@</code> <span style={{ color: "#888", fontSize: 11 }}>(또는 빈칸 / 도메인명)</span></div>
            <div><code style={{ fontFamily: "monospace", color: "#2c5fa0" }}>167.71.199.28</code></div>
            <div style={{ color: "#22c55e", fontWeight: 700 }}>✓ 필수</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 140px 80px", padding: "8px 12px", fontSize: 12, color: "#333", borderBottom: "1px solid #eef4fc", alignItems: "center" }}>
            <div><code style={{ background: "#eef4fc", padding: "2px 6px", borderRadius: 3, fontFamily: "monospace" }}>A</code></div>
            <div><code style={{ fontFamily: "monospace" }}>www</code></div>
            <div><code style={{ fontFamily: "monospace", color: "#2c5fa0" }}>167.71.199.28</code></div>
            <div style={{ color: "#22c55e", fontWeight: 700 }}>✓ 필수</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 140px 80px", padding: "8px 12px", fontSize: 12, color: "#333", alignItems: "center" }}>
            <div><code style={{ background: "#eef4fc", padding: "2px 6px", borderRadius: 3, fontFamily: "monospace" }}>A</code></div>
            <div><code style={{ fontFamily: "monospace" }}>*</code> <span style={{ color: "#888", fontSize: 11 }}>(와일드카드, 선택)</span></div>
            <div><code style={{ fontFamily: "monospace", color: "#2c5fa0" }}>167.71.199.28</code></div>
            <div style={{ color: "#888" }}>선택</div>
          </div>
        </div>

        <details style={{ marginBottom: 10 }}>
          <summary style={{ fontSize: 12, fontWeight: 600, color: "#4a90d9", cursor: "pointer", padding: "4px 0" }}>
            📖 설정 예시 보기 (클릭하여 펼치기)
          </summary>
          <div style={{ background: "#fff", border: "1px solid #c6daf7", borderRadius: 6, padding: 12, marginTop: 8, fontSize: 12, color: "#444", lineHeight: 1.7 }}>
            <p style={{ fontWeight: 600, marginBottom: 6, color: "#2c5fa0" }}>예시) mydomain.com 도메인 연결</p>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>도메인 구입 업체 사이트에 로그인 (예: GoDaddy, Cafe24, 가비아, Crazy Domains 등)</li>
              <li>내 도메인 목록에서 <strong>mydomain.com</strong> 선택</li>
              <li><strong>DNS 관리</strong> 또는 <strong>DNS Settings</strong> 메뉴 진입</li>
              <li>기존 A 레코드가 있다면 값을 <code style={{ background: "#eef4fc", padding: "1px 4px", borderRadius: 2 }}>167.71.199.28</code>로 수정, 없다면 <strong>Add Record</strong>로 추가</li>
              <li>위 표의 3개 레코드를 모두 등록하고 저장</li>
              <li>DNS 전파 대기 (보통 5~30분, 최대 48시간)</li>
              <li>본 페이지에서 도메인 추가 → 연결 완료</li>
            </ol>
            <p style={{ marginTop: 10, padding: "8px 10px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 4, color: "#9a3412", fontSize: 11 }}>
              💡 업체별 용어 차이: <strong>호스트/Name/Sub Domain</strong> = 모두 같은 뜻. <strong>값/Value/Points to/IP Address</strong> = 모두 같은 뜻. 타입은 반드시 <strong>A</strong>로 선택하세요 (CNAME, TXT 아님).
            </p>
          </div>
        </details>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#6ba3d6" }}>
          <span>⏱ DNS 전파: 최대 48시간</span>
          <span>•</span>
          <span>🔒 SSL 인증서: 자동 발급 (Let&apos;s Encrypt)</span>
          <span>•</span>
          <span>✅ 무료</span>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 13, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 13, color: "#22c55e" }}>
          {success}
        </div>
      )}

      {/* DNS check result panel */}
      {dnsCheck && (() => {
        const anyOk = dnsCheck.apex.ok || dnsCheck.www.ok;
        const partial = anyOk && !dnsCheck.allOk;
        const bg = dnsCheck.allOk ? "#f0fdf4" : partial ? "#fefce8" : "#fff7ed";
        const border = dnsCheck.allOk ? "#bbf7d0" : partial ? "#fde68a" : "#fed7aa";
        const color = dnsCheck.allOk ? "#16a34a" : partial ? "#a16207" : "#c2410c";
        const title = dnsCheck.allOk
          ? "✅ DNS 설정이 확인되었습니다. 도메인을 추가할 수 있습니다."
          : partial
            ? "⚠️ 부분 설정됨 — 등록은 가능하지만 누락된 레코드를 확인해주세요."
            : "⚠️ DNS 설정이 완료되지 않았습니다.";
        return (
          <div
            style={{
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 6,
              padding: 12,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <p style={{ fontWeight: 700, color, marginBottom: 8 }}>{title}</p>
            <DnsRow label="@" host={dnsCheck.apex} serverIp={dnsCheck.serverIp} />
            <DnsRow label="www" host={dnsCheck.www} serverIp={dnsCheck.serverIp} />
            {!anyOk && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#7c2d12" }}>
                💡 DNS 변경 직후라면 전파 대기 중일 수 있습니다. 5~30분 후 다시 확인해주세요.
              </p>
            )}
            {partial && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#713f12" }}>
                💡 하나만 설정되어도 서비스는 동작하지만, <strong>@</strong>와 <strong>www</strong> 둘 다 등록하시는 것을 권장합니다.
              </p>
            )}
          </div>
        );
      })()}

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
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
          style={{
            flex: 1,
            minWidth: 200,
            padding: "8px 14px",
            fontSize: 13,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={handleCheckClick}
          disabled={checking || !domain.trim()}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            background: "#fff",
            color: checking || !domain.trim() ? "#aaa" : "#4a90d9",
            border: `1px solid ${checking || !domain.trim() ? "#e2e8f0" : "#4a90d9"}`,
            borderRadius: 6,
            cursor: checking || !domain.trim() ? "default" : "pointer",
          }}
        >
          {checking ? "확인 중..." : "DNS 확인"}
        </button>
        <button
          type="submit"
          disabled={
            loading || checking || !domain.trim() ||
            (dnsCheck !== null && !(dnsCheck.apex.ok || dnsCheck.www.ok))
          }
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            background:
              loading || checking || !domain.trim() ||
              (dnsCheck !== null && !(dnsCheck.apex.ok || dnsCheck.www.ok))
                ? "#aaa"
                : "#4a90d9",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor:
              loading || checking || !domain.trim() ||
              (dnsCheck !== null && !(dnsCheck.apex.ok || dnsCheck.www.ok))
                ? "default"
                : "pointer",
          }}
          title={
            dnsCheck !== null && !(dnsCheck.apex.ok || dnsCheck.www.ok)
              ? "최소 하나(@ 또는 www)의 A 레코드가 서버를 가리켜야 합니다."
              : undefined
          }
        >
          {loading ? "추가 중..." : "도메인 추가"}
        </button>
      </form>
      <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
        💡 <strong>DNS 확인</strong> 버튼으로 먼저 설정을 검증한 후 도메인을 추가하세요.
      </p>
    </div>
  );
}

function DnsRow({ label, host, serverIp }: { label: string; host: DnsCheckHost; serverIp: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", fontFamily: "monospace" }}>
      <span style={{ minWidth: 40, fontWeight: 700, color: "#555" }}>{label}</span>
      <span style={{ color: host.ok ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
        {host.ok ? "✓" : "✗"}
      </span>
      <span style={{ color: "#555" }}>{host.host} →</span>
      <span style={{ color: host.ok ? "#16a34a" : "#dc2626" }}>
        {host.error
          ? host.error
          : host.ips.length === 0
            ? "레코드 없음"
            : host.ips.join(", ")}
      </span>
      {!host.ok && !host.error && host.ips.length > 0 && (
        <span style={{ color: "#888" }}>(기대값: {serverIp})</span>
      )}
    </div>
  );
}
