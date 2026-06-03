"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("siteManage");
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
        setMessage({ kind: "err", text: data.error || t("saveFailed") });
      } else {
        setMessage({ kind: "ok", text: t("gaSavedGtagNote") });
      }
    } catch {
      setMessage({ kind: "err", text: t("networkError") });
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
    border: "1px solid #e5e8eb",
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
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4e5968", marginBottom: 6 }}>
            {t("gaMeasurementId")}
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#6b7684" }}>
              {t("gaMeasurementIdHint")}
            </span>
          </label>
          <input
            type="text"
            value={measurementId}
            onChange={(e) => setMeasurementId(e.target.value)}
            placeholder="G-XXXXXXXXXX"
            style={inputBase}
          />
          <p style={{ fontSize: 11, color: "#8b95a1", marginTop: 4, marginBottom: 0 }}>
            {t("gaMeasurementIdPath")}
          </p>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4e5968", marginBottom: 6 }}>
            Property ID
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#6b7684" }}>
              {t("gaPropertyIdHint")}
            </span>
          </label>
          <input
            type="text"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="539341583"
            style={inputBase}
          />
          <p style={{ fontSize: 11, color: "#8b95a1", marginTop: 4, marginBottom: 0 }}>
            {t("gaPropertyIdPath")}
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "10px 24px",
          background: saving ? "#8b95a1" : "#3182f6",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? t("saving") : t("save")}
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
              {t("gaGrantTitle")}
            </h3>
          </div>
          <p style={{ fontSize: 13, color: "#6b21a8", lineHeight: 1.6, margin: "0 0 14px" }}>
            {t.rich("gaGrantDesc", { strong: (c) => <strong>{c}</strong> })}
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
              {copied ? `✓ ${t("copied")}` : t("copy")}
            </button>
          </div>

          {/* Steps */}
          <ol style={{ fontSize: 13, color: "#4e5968", lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
            <li>
              <a
                href={`https://analytics.google.com/analytics/web/?hl=ko#/p${propertyId.trim()}/admin/suiteusermanagement/property`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#7c3aed", fontWeight: 600 }}
              >
                {t("gaGrantStep1Link")} ↗
              </a>{" "}
              {t("gaGrantStep1Note")}
            </li>
            <li>{t.rich("gaGrantStep2", { strong: (c) => <strong>{c}</strong> })}</li>
            <li>{t.rich("gaGrantStep3", { strong: (c) => <strong>{c}</strong> })}</li>
          </ol>

          {/* Known GA UI bug workaround */}
          <details style={{ marginTop: 14, fontSize: 12, color: "#6b7684" }}>
            <summary style={{ cursor: "pointer", color: "#6b21a8", fontWeight: 600 }}>
              {t("gaErrorSummary")}
            </summary>
            <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: "2px solid #e9d5ff", lineHeight: 1.7 }}>
              {t("gaErrorIntro")}
              <ol style={{ marginTop: 6, paddingLeft: 16 }}>
                <li>
                  <a
                    href="https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.accessBindings/create"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#7c3aed" }}
                  >
                    {t("gaErrorApiExplorer")} ↗
                  </a>{" "}
                  {t("gaErrorApiAccess")}
                </li>
                <li>{t("gaErrorParent")} <code>properties/{propertyId.trim()}</code></li>
                <li>
                  {t("gaErrorRequestBody")}
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
