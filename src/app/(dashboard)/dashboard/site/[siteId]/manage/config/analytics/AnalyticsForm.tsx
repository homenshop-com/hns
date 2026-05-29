"use client";

import { useState } from "react";

/**
 * Site-level Google Analytics setup form.
 *
 * Two distinct identifiers, both required for the full integration:
 *
 *  - Measurement ID (G-XXXXXXXXXX) — embedded in gtag.js on the published site.
 *    Without this, no traffic is collected.
 *  - GA4 Property ID (numeric)     — used by the Data API to read this site's
 *    stats into the dashboard. Without this, gtag still works but the
 *    dashboard panel can't show numbers.
 *
 * The "Property access" step (where the user grants our service account
 * Viewer access on their GA property) is rendered inline because that's the
 * one step users almost always miss. We surface the service-account email
 * with a copy button and include the known GA-UI bug workaround link.
 */
export default function AnalyticsForm({
  siteId,
  currentMeasurementId,
  currentPropertyId,
  serviceAccountEmail,
}: {
  siteId: string;
  currentMeasurementId: string;
  currentPropertyId: string;
  serviceAccountEmail: string | null;
}) {
  const [measurementId, setMeasurementId] = useState(currentMeasurementId);
  const [propertyId, setPropertyId] = useState(currentPropertyId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleAnalyticsId: measurementId.trim(),
          googleAnalyticsPropertyId: propertyId.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ kind: "err", text: data.error || "저장에 실패했습니다." });
      } else {
        setMessage({ kind: "ok", text: "저장되었습니다. 사이트 측 gtag.js 는 다음 퍼블리시 후 반영됩니다." });
      }
    } catch {
      setMessage({ kind: "err", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  }

  function copyEmail() {
    if (!serviceAccountEmail) return;
    navigator.clipboard.writeText(serviceAccountEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    outline: "none",
    fontFamily: "monospace",
    boxSizing: "border-box",
  };

  return (
    <div>
      {/* ── Form fields ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            측정 ID
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#6b7280" }}>
              gtag.js 에 사용
            </span>
          </label>
          <input
            type="text"
            value={measurementId}
            onChange={(e) => setMeasurementId(e.target.value)}
            placeholder="G-XXXXXXXXXX"
            style={inputBase}
          />
          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, marginBottom: 0 }}>
            GA → 관리 → 데이터 스트림 → 웹 스트림
          </p>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Property ID
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#6b7280" }}>
              대시보드 통계용 (선택)
            </span>
          </label>
          <input
            type="text"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="539341583"
            style={inputBase}
          />
          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, marginBottom: 0 }}>
            GA → 관리 → 속성 세부정보 → 9~10자리 숫자
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "10px 24px",
          background: saving ? "#9ca3af" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? "저장 중..." : "저장"}
      </button>
      {message && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            fontSize: 13,
            borderRadius: 6,
            background: message.kind === "ok" ? "#ecfdf5" : "#fef2f2",
            color: message.kind === "ok" ? "#047857" : "#b91c1c",
            border: `1px solid ${message.kind === "ok" ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {message.text}
        </div>
      )}

      {/* ── Step 3: grant service account access ────────────────────── */}
      {serviceAccountEmail && propertyId.trim() && (
        <div
          style={{
            marginTop: 28,
            padding: 20,
            borderRadius: 10,
            background: "linear-gradient(135deg, #fdf4ff 0%, #faf5ff 100%)",
            border: "1px solid #e9d5ff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 999,
                background: "#a855f7",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              !
            </span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#581c87", margin: 0 }}>
              마지막 한 단계 — 우리 서비스 계정에 Viewer 권한 부여
            </h3>
          </div>
          <p style={{ fontSize: 13, color: "#6b21a8", lineHeight: 1.6, margin: "0 0 14px" }}>
            데이터를 이 대시보드에 표시하려면 아래 이메일을 회원님의 GA Property 에 <strong>뷰어</strong>로 추가해야
            합니다 (단 한번만 하면 끝).
          </p>

          {/* Email + copy */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <code
              style={{
                flex: 1,
                padding: "10px 14px",
                background: "#fff",
                border: "1px solid #e9d5ff",
                borderRadius: 6,
                fontSize: 13,
                color: "#581c87",
                wordBreak: "break-all",
              }}
            >
              {serviceAccountEmail}
            </code>
            <button
              onClick={copyEmail}
              style={{
                padding: "0 16px",
                background: copied ? "#10b981" : "#a855f7",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ 복사됨" : "복사"}
            </button>
          </div>

          {/* Steps */}
          <ol style={{ fontSize: 13, color: "#374151", lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
            <li>
              <a
                href={`https://analytics.google.com/analytics/web/?hl=ko#/p${propertyId.trim()}/admin/suiteusermanagement/property`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#7c3aed", fontWeight: 600 }}
              >
                내 속성 액세스 관리 페이지 열기 ↗
              </a>{" "}
              (위 Property ID 로 자동 이동)
            </li>
            <li>우측 상단 <strong>+</strong> 버튼 → <strong>사용자 추가</strong></li>
            <li>위 이메일 붙여넣기 → 역할 <strong>뷰어</strong> 선택 → <strong>추가</strong> 클릭</li>
          </ol>

          {/* Known GA UI bug workaround */}
          <details style={{ marginTop: 14, fontSize: 12, color: "#6b7280" }}>
            <summary style={{ cursor: "pointer", color: "#6b21a8", fontWeight: 600 }}>
              "이메일이 Google 계정과 일치하지 않습니다" 오류가 나는 경우
            </summary>
            <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: "2px solid #e9d5ff", lineHeight: 1.7 }}>
              현재 GA UI의 알려진 버그입니다. 우회 방법:
              <ol style={{ marginTop: 6, paddingLeft: 16 }}>
                <li>
                  <a
                    href="https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.accessBindings/create"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#7c3aed" }}
                  >
                    공식 API Explorer ↗
                  </a>{" "}
                  접속
                </li>
                <li>"Try this method" 패널에서 parent = <code>properties/{propertyId.trim()}</code></li>
                <li>
                  Request body 에 아래 JSON 붙여넣기 후 Execute:
                  <pre
                    style={{
                      marginTop: 6,
                      padding: 8,
                      background: "#fff",
                      borderRadius: 4,
                      fontSize: 11,
                      overflowX: "auto",
                    }}
                  >{`{
  "user": "${serviceAccountEmail}",
  "roles": ["predefinedRoles/viewer"]
}`}</pre>
                </li>
              </ol>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
