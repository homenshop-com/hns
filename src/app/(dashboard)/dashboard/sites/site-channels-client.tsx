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

export interface SiteIntegration {
  id: string;
  channel: Channel;
  label: string;
  displayName: string | null;
  status: "DISCONNECTED" | "ACTIVE" | "ERROR" | "PAUSED";
  lastSyncAt: string | null;
  lastError: string | null;
}

const STATUS_BADGE: Record<SiteIntegration["status"], { label: string; bg: string; fg: string }> = {
  ACTIVE: { label: "연결됨", bg: "#dcfce7", fg: "#166534" },
  ERROR: { label: "오류", bg: "#fee2e2", fg: "#991b1b" },
  PAUSED: { label: "일시정지", bg: "#fef3c7", fg: "#92400e" },
  DISCONNECTED: { label: "미연결", bg: "#f1f5f9", fg: "#64748b" },
};

const CHANNEL_BADGE_BG: Record<Channel, string> = {
  SHOPIFY: "#dcfce7",
  COUPANG: "#fee2e2",
  AMAZON: "#fef3c7",
  QOO10: "#fce7f3",
  RAKUTEN: "#dbeafe",
  TIKTOKSHOP: "#f3e8ff",
};
const CHANNEL_BADGE_FG: Record<Channel, string> = {
  SHOPIFY: "#166534",
  COUPANG: "#991b1b",
  AMAZON: "#92400e",
  QOO10: "#9d174d",
  RAKUTEN: "#1e40af",
  TIKTOKSHOP: "#6b21a8",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  SHOPIFY: "Shopify",
  COUPANG: "쿠팡",
  AMAZON: "Amazon",
  QOO10: "Qoo10",
  RAKUTEN: "Rakuten",
  TIKTOKSHOP: "TikTok",
};

interface SiteChannelsProps {
  siteId: string;
  integrations: SiteIntegration[];
  adapters: Adapter[];
}

export default function SiteChannelsClient({
  siteId,
  integrations,
  adapters,
}: SiteChannelsProps) {
  const router = useRouter();
  const [modal, setModal] = useState<{
    channel: Channel;
    integrationId?: string;
  } | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="dv2-channels">
      {/* Existing marketplace integrations */}
      {integrations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {integrations.map((integ) => {
            const badge = STATUS_BADGE[integ.status];
            const adapter = adapters.find((a) => a.channel === integ.channel);
            return (
              <div
                key={integ.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderTop: "1px solid var(--line-2)",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 10,
                    background: CHANNEL_BADGE_BG[integ.channel],
                    color: CHANNEL_BADGE_FG[integ.channel],
                    minWidth: 60,
                    textAlign: "center",
                  }}
                >
                  {CHANNEL_LABELS[integ.channel]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{integ.label}</span>
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
                      {badge.label}
                    </span>
                    {adapter && !adapter.implemented && (
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
                        준비중
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      marginTop: 2,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    {integ.displayName && <span>{integ.displayName}</span>}
                    {integ.lastSyncAt && (
                      <span>최근 동기화: {new Date(integ.lastSyncAt).toLocaleString("ko-KR")}</span>
                    )}
                  </div>
                  {integ.lastError && (
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
                      {integ.lastError.slice(0, 200)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="dv2-row-btn"
                  onClick={() => setModal({ channel: integ.channel, integrationId: integ.id })}
                >
                  재연결
                </button>
                <button
                  type="button"
                  className="dv2-row-btn"
                  style={{ color: "#dc2626" }}
                  onClick={async () => {
                    if (!confirm(`"${integ.label}" 연동을 끊을까요?`)) return;
                    const r = await fetch(`/api/integrations?integrationId=${integ.id}`, {
                      method: "DELETE",
                    });
                    if (r.ok) router.refresh();
                  }}
                >
                  연결 끊기
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* + 마켓플레이스 추가 dropdown */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--line-2)",
          background: "#fafbfd",
          position: "relative",
        }}
      >
        <button
          type="button"
          className="dv2-row-btn"
          onClick={() => setShowAddMenu((v) => !v)}
          style={{ fontSize: 12 }}
        >
          + 마켓플레이스 계정 연결 ▾
        </button>
        {showAddMenu && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 16,
              zIndex: 20,
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              marginTop: 4,
              minWidth: 240,
              overflow: "hidden",
            }}
          >
            {adapters.map((a) => (
              <button
                key={a.channel}
                type="button"
                onClick={() => {
                  setShowAddMenu(false);
                  setModal({ channel: a.channel });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: 13,
                  borderBottom: "1px solid var(--line-2)",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#f2f4fa")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 8,
                    background: CHANNEL_BADGE_BG[a.channel],
                    color: CHANNEL_BADGE_FG[a.channel],
                  }}
                >
                  {CHANNEL_LABELS[a.channel]}
                </span>
                <span style={{ flex: 1 }}>{a.displayName}</span>
                {!a.implemented && (
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
                    준비중
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <ConnectModal
          siteId={siteId}
          channel={modal.channel}
          integrationId={modal.integrationId}
          existing={
            modal.integrationId
              ? integrations.find((i) => i.id === modal.integrationId) ?? null
              : null
          }
          adapter={adapters.find((a) => a.channel === modal.channel)!}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

interface ConnectModalProps {
  siteId: string;
  channel: Channel;
  integrationId?: string;
  existing: SiteIntegration | null;
  adapter: Adapter;
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

const CHANNEL_FIELDS: Record<Channel, FieldDef[]> = {
  SHOPIFY: [
    { key: "shop", label: "Shop 도메인", placeholder: "yourstore.myshopify.com", hint: "Shopify 관리자 페이지 도메인" },
  ],
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
  siteId,
  channel,
  integrationId,
  existing,
  adapter,
  onClose,
  onSaved,
}: ConnectModalProps) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [values, setValues] = useState<Record<string, string>>(
    existing?.displayName ? { shop: existing.displayName } : {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = CHANNEL_FIELDS[channel];
  const isOAuth = channel === "SHOPIFY";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError("계정 이름을 입력하세요. 예: 뷰티 계정 / 식품 계정");
      return;
    }
    setSaving(true);
    try {
      if (isOAuth && channel === "SHOPIFY") {
        const shop = values.shop?.trim();
        if (!shop) {
          setError("Shop 도메인을 입력하세요.");
          setSaving(false);
          return;
        }
        const r = await fetch("/api/integrations/shopify/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId, label: label.trim(), shop, integrationId }),
        });
        const data = await r.json();
        if (!r.ok || !data.url) {
          setError(data.error || "OAuth 설치 URL 생성 실패");
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
          siteId,
          channel,
          label: label.trim(),
          credentials: values,
          integrationId,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "저장 실패");
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
          {adapter.displayName} {existing ? "재연결" : "계정 연결"}
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
            준비중인 어댑터입니다. 키만 미리 저장할 수 있으며, 실제 동기화는 정식 출시 후 자동 작동합니다.
          </div>
        )}
        <form onSubmit={submit} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>
              계정 이름 (라벨)
            </span>
            <input
              type="text"
              required
              placeholder="예: 뷰티 계정 / 식품 계정 / 메인"
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
              같은 마켓플레이스에 여러 셀러 계정을 연결할 때 구분하기 위한 이름입니다.
            </div>
          </label>
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
              취소
            </button>
            <button type="submit" className="dv2-row-btn primary" disabled={saving}>
              {saving ? "저장 중…" : isOAuth ? "Shopify로 이동" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
