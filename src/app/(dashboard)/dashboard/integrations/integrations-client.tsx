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

interface Integration {
  id: string;
  channel: Channel;
  label: string;
  displayName: string | null;
  status: "DISCONNECTED" | "ACTIVE" | "ERROR" | "PAUSED";
  lastSyncAt: string | null;
  lastError: string | null;
}

const CHANNEL_DESCRIPTIONS: Record<Channel, string> = {
  SHOPIFY: "Shopify 스토어 OAuth 연결, 주문 자동 동기화",
  COUPANG: "쿠팡 Wing 오픈마켓 API 키 등록",
  AMAZON: "Amazon SP-API LWA OAuth + IAM 연결",
  QOO10: "Qoo10 QSM API 키 등록 (KR/JP/SG)",
  RAKUTEN: "Rakuten Ichiba RMS WebService 연결",
  TIKTOKSHOP: "TikTok Shop Open Platform OAuth",
};

const CHANNEL_LOGO_BG: Record<Channel, string> = {
  SHOPIFY: "#5fa44b",
  COUPANG: "#e62e2e",
  AMAZON: "#232f3e",
  QOO10: "#e91e63",
  RAKUTEN: "#bf0000",
  TIKTOKSHOP: "#000000",
};

const STATUS_BADGE: Record<Integration["status"], { label: string; bg: string; fg: string }> = {
  ACTIVE: { label: "연결됨", bg: "#dcfce7", fg: "#166534" },
  ERROR: { label: "오류", bg: "#fee2e2", fg: "#991b1b" },
  PAUSED: { label: "일시정지", bg: "#fef3c7", fg: "#92400e" },
  DISCONNECTED: { label: "미연결", bg: "#f1f5f9", fg: "#64748b" },
};

export default function IntegrationsClient({
  siteId,
  adapters,
  integrations,
}: {
  siteId: string;
  adapters: Adapter[];
  integrations: Integration[];
}) {
  const router = useRouter();
  const [modalState, setModalState] = useState<{
    channel: Channel;
    integrationId?: string; // present = editing, absent = creating new
  } | null>(null);

  // Group integrations by channel for display.
  const byChannel = new Map<Channel, Integration[]>();
  for (const integ of integrations) {
    const list = byChannel.get(integ.channel) ?? [];
    list.push(integ);
    byChannel.set(integ.channel, list);
  }

  return (
    <section className="dv2-panel">
      <div className="dv2-panel-head">
        <h2>
          연결 가능한 마켓플레이스
          <span className="count">{adapters.length}개</span>
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
              onConnect={() => setModalState({ channel: a.channel })}
              onEdit={(id) => setModalState({ channel: a.channel, integrationId: id })}
              onDelete={async (id, label) => {
                if (!confirm(`"${label}" 계정 연동을 끊을까요?`)) return;
                const r = await fetch(`/api/integrations?integrationId=${id}`, {
                  method: "DELETE",
                });
                if (r.ok) router.refresh();
              }}
            />
          );
        })}
      </div>

      {modalState && (
        <ConnectModal
          siteId={siteId}
          channel={modalState.channel}
          integrationId={modalState.integrationId}
          existing={
            modalState.integrationId
              ? integrations.find((i) => i.id === modalState.integrationId) ?? null
              : null
          }
          adapter={adapters.find((a) => a.channel === modalState.channel)!}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function ChannelGroup({
  adapter,
  accounts,
  onConnect,
  onEdit,
  onDelete,
}: {
  adapter: Adapter;
  accounts: Integration[];
  onConnect: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, label: string) => void;
}) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }}>
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--line-2)",
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
                준비중
              </span>
            )}
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {accounts.length > 0 ? `· ${accounts.length}개 계정` : "· 미연결"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>
            {CHANNEL_DESCRIPTIONS[adapter.channel]}
          </div>
        </div>
        <button
          type="button"
          className="dv2-row-btn primary"
          onClick={onConnect}
          disabled={!adapter.implemented && accounts.length === 0}
          style={!adapter.implemented && accounts.length === 0 ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
          title={!adapter.implemented ? "추후 출시 예정 — 먼저 키 등록은 가능 (저장만)" : "이 마켓플레이스에 새 셀러 계정 연결"}
        >
          + 계정 추가
        </button>
      </div>

      {/* Account rows */}
      {accounts.length === 0 ? (
        <div
          style={{
            padding: "20px 16px",
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 12,
          }}
        >
          연결된 계정이 없습니다. 위 [+ 계정 추가]로 연결하세요.
        </div>
      ) : (
        <div>
          {accounts.map((a) => {
            const badge = STATUS_BADGE[a.status];
            return (
              <div
                key={a.id}
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid var(--line-2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
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
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {a.displayName && <span>{a.displayName}</span>}
                    {a.lastSyncAt && (
                      <span>최근 동기화: {new Date(a.lastSyncAt).toLocaleString("ko-KR")}</span>
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
                  재연결
                </button>
                <button
                  type="button"
                  className="dv2-row-btn"
                  style={{ color: "#dc2626" }}
                  onClick={() => onDelete(a.id, a.label)}
                >
                  연결 끊기
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
  siteId: string;
  channel: Channel;
  integrationId?: string;
  existing: Integration | null;
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
    { key: "shop", label: "Shop 도메인", placeholder: "yourstore.myshopify.com", hint: "Shopify 관리자 페이지에 표시되는 도메인" },
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

  // Shopify uses OAuth: kick off a redirect to /admin/oauth/authorize on submit.
  const isOAuth = channel === "SHOPIFY";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError("계정 이름(라벨)을 입력하세요. 예: 뷰티 계정 / 식품 계정");
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
          setError(data.error || "OAuth 설치 URL을 만들 수 없습니다.");
          setSaving(false);
          return;
        }
        window.location.href = data.url;
        return;
      }
      // Non-OAuth: POST to /api/integrations directly
      const r = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, channel, label: label.trim(), credentials: values, integrationId }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "저장에 실패했습니다.");
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
            준비중인 어댑터입니다. 키만 미리 저장할 수 있으며, 실제 동기화는
            정식 출시 후 자동으로 시작됩니다.
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
            <button type="button" className="dv2-row-btn" onClick={onClose}>취소</button>
            <button type="submit" className="dv2-row-btn primary" disabled={saving}>
              {saving ? "저장 중…" : isOAuth ? "Shopify로 이동" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
