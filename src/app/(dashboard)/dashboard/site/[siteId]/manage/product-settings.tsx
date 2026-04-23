"use client";

import { useState } from "react";

interface ProductSettingsData {
  itemsPerRow: number;
  totalRows: number;
  thumbWidth: number;
  thumbHeight: number;
  detailWidth: number;
}

interface ProductSettingsLabels {
  productDisplaySettings: string;
  itemsPerRow: string;
  totalRows: string;
  perPage: string;
  thumbWidth: string;
  thumbHeight: string;
  detailImageWidth: string;
  saveSettings: string;
  saving: string;
  saved: string;
  saveError: string;
  error: string;
}

interface ProductSettingsProps {
  siteId: string;
  initialSettings: ProductSettingsData;
  labels: ProductSettingsLabels;
  /** "v2" renders with manage-v2.css classes (inside a .dv2-app tree). */
  variant?: "legacy" | "v2";
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#374151",
  marginBottom: 4,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 14,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  outline: "none",
  boxSizing: "border-box",
};

export default function ProductSettings({ siteId, initialSettings, labels, variant = "legacy" }: ProductSettingsProps) {
  const [settings, setSettings] = useState<ProductSettingsData>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/sites/${siteId}/product-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || labels.saveError);
      }
      setMessage(labels.saved);
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : labels.error);
    } finally {
      setSaving(false);
    }
  }

  const perPage = settings.itemsPerRow * settings.totalRows;

  if (variant === "v2") {
    return (
      <div className="mv2-sub-section">
        <h4>
          {labels.productDisplaySettings} <span className="hint">쇼룸 페이지에 적용</span>
        </h4>
        <div className="mv2-field-row">
          <div className="mv2-field">
            <label>{labels.itemsPerRow}</label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.itemsPerRow}
              onChange={(e) => setSettings((s) => ({ ...s, itemsPerRow: Number(e.target.value) || 1 }))}
            />
          </div>
          <div className="mv2-field">
            <label>{labels.totalRows}</label>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.totalRows}
              onChange={(e) => setSettings((s) => ({ ...s, totalRows: Number(e.target.value) || 1 }))}
            />
          </div>
        </div>
        <div className="mv2-field-hint">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="7.5" /><path d="M10 9v5" /><circle cx="10" cy="6" r="1" fill="currentColor" stroke="none" />
          </svg>
          페이지당 <b>{settings.itemsPerRow} × {settings.totalRows} = {perPage}</b>개 상품이 표시됩니다
        </div>
        <div className="mv2-field-row">
          <div className="mv2-field">
            <label>{labels.thumbWidth} <span className="suffix">px</span></label>
            <input
              type="number"
              min={50}
              max={500}
              value={settings.thumbWidth}
              onChange={(e) => setSettings((s) => ({ ...s, thumbWidth: Number(e.target.value) || 135 }))}
            />
          </div>
          <div className="mv2-field">
            <label>{labels.thumbHeight} <span className="suffix">px</span></label>
            <input
              type="number"
              min={50}
              max={500}
              value={settings.thumbHeight}
              onChange={(e) => setSettings((s) => ({ ...s, thumbHeight: Number(e.target.value) || 135 }))}
            />
          </div>
        </div>
        <div className="mv2-field" style={{ marginBottom: 12 }}>
          <label>{labels.detailImageWidth} <span className="suffix">px</span></label>
          <input
            type="number"
            min={100}
            max={1200}
            value={settings.detailWidth}
            onChange={(e) => setSettings((s) => ({ ...s, detailWidth: Number(e.target.value) || 500 }))}
          />
        </div>
        <button onClick={handleSave} disabled={saving} className="mv2-form-submit">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 3h10l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" />
            <path d="M6 3v5h8V3M6 17v-5h8v5" />
          </svg>
          {saving ? labels.saving : labels.saveSettings}
        </button>
        {message && (
          <div
            style={{
              fontSize: 11.5,
              color: message === labels.saved ? "#0d7d45" : "#c93041",
              marginTop: 8,
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10, borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
        {labels.productDisplaySettings}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>{labels.itemsPerRow}</label>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.itemsPerRow}
            onChange={(e) => setSettings((s) => ({ ...s, itemsPerRow: Number(e.target.value) || 1 }))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>{labels.totalRows}</label>
          <input
            type="number"
            min={1}
            max={50}
            value={settings.totalRows}
            onChange={(e) => setSettings((s) => ({ ...s, totalRows: Number(e.target.value) || 1 }))}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        {labels.perPage} {settings.itemsPerRow} × {settings.totalRows} = {perPage}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>{labels.thumbWidth}</label>
          <input
            type="number"
            min={50}
            max={500}
            value={settings.thumbWidth}
            onChange={(e) => setSettings((s) => ({ ...s, thumbWidth: Number(e.target.value) || 135 }))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>{labels.thumbHeight}</label>
          <input
            type="number"
            min={50}
            max={500}
            value={settings.thumbHeight}
            onChange={(e) => setSettings((s) => ({ ...s, thumbHeight: Number(e.target.value) || 135 }))}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>{labels.detailImageWidth}</label>
        <input
          type="number"
          min={100}
          max={1200}
          value={settings.detailWidth}
          onChange={(e) => setSettings((s) => ({ ...s, detailWidth: Number(e.target.value) || 500 }))}
          style={inputStyle}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: "100%",
          padding: "8px 0",
          fontSize: 13,
          fontWeight: 600,
          color: "#fff",
          background: saving ? "#93c5fd" : "#2563eb",
          border: "none",
          borderRadius: 4,
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? labels.saving : labels.saveSettings}
      </button>
      {message && (
        <div style={{ fontSize: 12, color: message === labels.saved ? "#059669" : "#dc2626", marginTop: 6, textAlign: "center" }}>
          {message}
        </div>
      )}
    </div>
  );
}
