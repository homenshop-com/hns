"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderChannel } from "@/generated/prisma/client";

type Channel = Exclude<OrderChannel, "STOREFRONT">;

interface Adapter {
  channel: Channel;
  displayName: string;
  implemented: boolean;
}

interface SiteOption {
  id: string;
  name: string;
  shopId: string;
}

interface Integration {
  id: string;
  channel: Channel;
  label: string;
  displayName: string | null;
  siteId: string | null;
  siteName: string | null;
  siteShopId: string | null;
  status: "DISCONNECTED" | "ACTIVE" | "ERROR" | "PAUSED";
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface IntegrationsLabels {
  panelTitle: string;
  panelCount: string;
  soonBadge: string;
  soonHint: string;
  accountsCount: (n: number) => string;
  noAccounts: string;
  btnAddAccount: string;
  btnAddAccountTooltip: string;
  btnReconnect: string;
  btnDisconnect: string;
  confirmDisconnect: (label: string) => string;
  statusActive: string;
  statusError: string;
  statusPaused: string;
  statusDisconnected: string;
  lastSyncLabel: (time: string) => string;
  modalTitleConnect: (name: string) => string;
  modalTitleReconnect: (name: string) => string;
  modalSoonNotice: string;
  fieldLabel: string;
  fieldLabelPlaceholder: string;
  fieldLabelHint: string;
  fieldLabelRequired: string;
  fieldSiteLink: string;
  fieldSiteLinkNone: string;
  fieldSiteLinkHint: string;
  fieldShopDomain: string;
  fieldShopDomainPlaceholder: string;
  fieldShopDomainHint: string;
  fieldShopDomainRequired: string;
  btnSave: string;
  btnSaving: string;
  btnGotoShopify: string;
  btnCancel: string;
  errorOAuthUrl: string;
  errorSaveFailed: string;
  descSHOPIFY: string;
  descCOUPANG: string;
  descAMAZON: string;
  descQOO10: string;
  descRAKUTEN: string;
  descTIKTOKSHOP: string;
}

const CHANNEL_LOGO_BG: Record<Channel, string> = {
  SHOPIFY: "#5fa44b",
  COUPANG: "#e62e2e",
  AMAZON: "#232f3e",
  QOO10: "#e91e63",
  RAKUTEN: "#bf0000",
  TIKTOKSHOP: "#000000",
};

const STATUS_BG: Record<Integration["status"], { bg: string; fg: string }> = {
  ACTIVE: { bg: "#dcfce7", fg: "#166534" },
  ERROR: { bg: "#fee2e2", fg: "#991b1b" },
  PAUSED: { bg: "#fef3c7", fg: "#92400e" },
  DISCONNECTED: { bg: "#f1f5f9", fg: "#64748b" },
};

function statusLabel(status: Integration["status"], labels: IntegrationsLabels): string {
  switch (status) {
    case "ACTIVE": return labels.statusActive;
    case "ERROR": return labels.statusError;
    case "PAUSED": return labels.statusPaused;
    case "DISCONNECTED": return labels.statusDisconnected;
  }
}

function channelDesc(channel: Channel, labels: IntegrationsLabels): string {
  switch (channel) {
    case "SHOPIFY": return labels.descSHOPIFY;
    case "COUPANG": return labels.descCOUPANG;
    case "AMAZON": return labels.descAMAZON;
    case "QOO10": return labels.descQOO10;
    case "RAKUTEN": return labels.descRAKUTEN;
    case "TIKTOKSHOP": return labels.descTIKTOKSHOP;
  }
}

export default function IntegrationsClient({
  sites,
  adapters,
  integrations,
  labels,
}: {
  sites: SiteOption[];
  adapters: Adapter[];
  integrations: Integration[];
  labels: IntegrationsLabels;
}) {
  const router = useRouter();
  const [modalState, setModalState] = useState<{
    channel: Channel;
    integrationId?: string;
  } | null>(null);

  const byChannel = new Map<Channel, Integration[]>();
  for (const integ of integrations) {
    const list = byChannel.get(integ.channel) ?? [];
    list.push(integ);
    byChannel.set(integ.channel, list);
  }

  return (
    <>
      <section className="dv2-panel">
        <div className="dv2-panel-head">
          <h2>
            {labels.panelTitle}
            <span className="count">{labels.panelCount}</span>
          </h2>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          {adapters.map((a) => {
            const accounts = byChannel.get(a.channel) ?? [];
            return (
              <ChannelGroup
                key={a.channel}
                adapter={a}
                accounts={accounts}
                labels={labels}
                onConnect={() => setModalState({ channel: a.channel })}
                onEdit={(id) => setModalState({ channel: a.channel, integrationId: id })}
                onDelete={async (id, label) => {
                  if (!confirm(labels.confirmDisconnect(label))) return;
                  const r = await fetch(`/api/integrations?integrationId=${id}`, {
                    method: "DELETE",
                  });
                  if (r.ok) router.refresh();
                }}
              />
            );
          })}
        </div>
      </section>

      {modalState && (
        <ConnectModal
          sites={sites}
          channel={modalState.channel}
          integrationId={modalState.integrationId}
          existing={
            modalState.integrationId
              ? integrations.find((i) => i.id === modalState.integrationId) ?? null
              : null
          }
          adapter={adapters.find((a) => a.channel === modalState.channel)!}
          labels={labels}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ChannelGroup({
  adapter,
  accounts,
  labels,
  onConnect,
  onEdit,
  onDelete,
}: {
  adapter: Adapter;
  accounts: Integration[];
  labels: IntegrationsLabels;
  onConnect: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, label: string) => void;
}) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }}>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: accounts.length > 0 ? "1px solid var(--line-2)" : "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: CHANNEL_LOGO_BG[adapter.channel],
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {adapter.displayName.slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{adapter.displayName}</div>
            {!adapter.implemented && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 8,
                  background: "#fef3c7",
                  color: "#92400e",
                }}
              >
                {labels.soonBadge}
              </span>
            )}
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {accounts.length > 0 ? labels.accountsCount(accounts.length) : labels.noAccounts}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>
            {channelDesc(adapter.channel, labels)}
          </div>
        </div>
        <button
          type="button"
          className="dv2-row-btn primary"
          onClick={onConnect}
          disabled={!adapter.implemented && accounts.length === 0}
          style={!adapter.implemented && accounts.length === 0 ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
          title={!adapter.implemented ? labels.soonHint : labels.btnAddAccountTooltip}
        >
          {labels.btnAddAccount}
        </button>
      </div>

      {accounts.length > 0 && (
        <div>
          {accounts.map((a, idx) => {
            const badge = STATUS_BG[a.status];
            return (
              <div
                key={a.id}
                style={{
                  padding: "12px 16px",
                  borderTop: idx > 0 ? "1px solid var(--line-2)" : undefined,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: 8,
                        background: badge.bg,
                        color: badge.fg,
                      }}
                    >
                      {statusLabel(a.status, labels)}
                    </span>
                    {a.siteId && a.siteName && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 8,
                          background: "#eaefff",
                          color: "#2545e0",
                        }}
                        title={`@${a.siteShopId}`}
                      >
                        🔗 {a.siteName}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {a.displayName && <span>{a.displayName}</span>}
                    {a.lastSyncAt && (
                      <span>{labels.lastSyncLabel(new Date(a.lastSyncAt).toLocaleString())}</span>
                    )}
                  </div>
                  {a.lastError && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#991b1b",
                        background: "#fee2e2",
                        padding: "4px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {a.lastError.slice(0, 200)}
                    </div>
                  )}
                </div>
                <button type="button" className="dv2-row-btn" onClick={() => onEdit(a.id)}>
                  {labels.btnReconnect}
                </button>
                <button
                  type="button"
                  className="dv2-row-btn"
                  style={{ color: "#dc2626" }}
                  onClick={() => onDelete(a.id, a.label)}
                >
                  {labels.btnDisconnect}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ConnectModalProps {
  sites: SiteOption[];
  channel: Channel;
  integrationId?: string;
  existing: Integration | null;
  adapter: Adapter;
  labels: IntegrationsLabels;
  onClose: () => void;
  onSaved: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "password";
  placeholder?: string;
  hint?: string;
}

// Shopify shop field labels are sourced from the labels prop at runtime
// (because the placeholder/hint differ per locale). All other marketplaces
// use English API terms (Vendor ID, Access Key, etc.) which match each
// vendor's own documentation regardless of UI locale.
const CHANNEL_FIELDS_STATIC: Record<Exclude<Channel, "SHOPIFY">, FieldDef[]> = {
  COUPANG: [
    { key: "vendorId", label: "Vendor ID", placeholder: "A00012345" },
    { key: "accessKey", label: "Access Key", type: "password" },
    { key: "secretKey", label: "Secret Key", type: "password" },
  ],
  AMAZON: [
    { key: "lwaClientId", label: "LWA Client ID" },
    { key: "lwaClientSecret", label: "LWA Client Secret", type: "password" },
    { key: "refreshToken", label: "Refresh Token", type: "password" },
    { key: "awsAccessKey", label: "AWS Access Key" },
    { key: "awsSecretKey", label: "AWS Secret Key", type: "password" },
    { key: "roleArn", label: "Role ARN" },
    { key: "sellerId", label: "Seller ID" },
    { key: "marketplaceId", label: "Marketplace ID", placeholder: "ATVPDKIKX0DER (US)" },
    { key: "region", label: "Region", placeholder: "us-east-1" },
  ],
  QOO10: [
    { key: "apiKey", label: "API Key", type: "password" },
    { key: "apiSecret", label: "API Secret", type: "password" },
    { key: "sellerId", label: "Seller ID" },
  ],
  RAKUTEN: [
    { key: "serviceSecret", label: "Service Secret", type: "password" },
    { key: "licenseKey", label: "License Key", type: "password" },
    { key: "shopId", label: "Shop ID" },
    { key: "shopUrl", label: "Shop URL", placeholder: "your-shop.rakuten.co.jp" },
  ],
  TIKTOKSHOP: [
    { key: "appKey", label: "App Key" },
    { key: "appSecret", label: "App Secret", type: "password" },
    { key: "accessToken", label: "Access Token", type: "password" },
    { key: "refreshToken", label: "Refresh Token", type: "password" },
    { key: "shopId", label: "Shop ID" },
    { key: "shopCipher", label: "Shop Cipher" },
  ],
};

function ConnectModal({
  sites,
  channel,
  integrationId,
  existing,
  adapter,
  labels,
  onClose,
  onSaved,
}: ConnectModalProps) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [siteId, setSiteId] = useState<string>(existing?.siteId ?? "");
  const [values, setValues] = useState<Record<string, string>>(
    existing?.displayName ? { shop: existing.displayName } : {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields: FieldDef[] = channel === "SHOPIFY"
    ? [{
        key: "shop",
        label: labels.fieldShopDomain,
        placeholder: labels.fieldShopDomainPlaceholder,
        hint: labels.fieldShopDomainHint,
      }]
    : CHANNEL_FIELDS_STATIC[channel];
  const isOAuth = channel === "SHOPIFY";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError(labels.fieldLabelRequired);
      return;
    }
    setSaving(true);
    try {
      if (isOAuth && channel === "SHOPIFY") {
        const shop = values.shop?.trim();
        if (!shop) {
          setError(labels.fieldShopDomainRequired);
          setSaving(false);
          return;
        }
        const r = await fetch("/api/integrations/shopify/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            shop,
            integrationId,
            siteId: siteId || null,
          }),
        });
        const data = await r.json();
        if (!r.ok || !data.url) {
          setError(data.error || labels.errorOAuthUrl);
          setSaving(false);
          return;
        }
        window.location.href = data.url;
        return;
      }
      const r = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          label: label.trim(),
          credentials: values,
          integrationId,
          siteId: siteId || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || labels.errorSaveFailed);
        setSaving(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,18,38,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          width: "min(540px, 92vw)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: 18 }}>
          {existing
            ? labels.modalTitleReconnect(adapter.displayName)
            : labels.modalTitleConnect(adapter.displayName)}
        </h3>
        {!adapter.implemented && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 12px",
              background: "#fef3c7",
              color: "#92400e",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {labels.modalSoonNotice}
          </div>
        )}
        <form onSubmit={submit} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>
              {labels.fieldLabel}
            </span>
            <input
              type="text"
              required
              placeholder={labels.fieldLabelPlaceholder}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 13,
                border: "1px solid var(--line)",
                borderRadius: 6,
                outline: "none",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
              {labels.fieldLabelHint}
            </div>
          </label>

          {sites.length > 0 && (
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>
                {labels.fieldSiteLink}
              </span>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 13,
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  outline: "none",
                  background: "#fff",
                }}
              >
                <option value="">{labels.fieldSiteLinkNone}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.shopId} (@{s.shopId})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                {labels.fieldSiteLinkHint}
              </div>
            </label>
          )}

          {fields.map((f) => (
            <label key={f.key} style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>
                {f.label}
              </span>
              <input
                type={f.type || "text"}
                placeholder={f.placeholder}
                value={values[f.key] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 13,
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  outline: "none",
                  fontFamily: f.type === "password" ? "monospace" : "inherit",
                }}
              />
              {f.hint && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{f.hint}</div>}
            </label>
          ))}
          {error && (
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 10px", borderRadius: 6, fontSize: 12 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="dv2-row-btn" onClick={onClose}>
              {labels.btnCancel}
            </button>
            <button type="submit" className="dv2-row-btn primary" disabled={saving}>
              {saving ? labels.btnSaving : isOAuth ? labels.btnGotoShopify : labels.btnSave}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
