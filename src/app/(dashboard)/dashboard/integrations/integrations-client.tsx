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
  const [openChannel, setOpenChannel] = useState<Channel | null>(null);

  const integrationByChannel = new Map(
    integrations.map((i) => [i.channel, i] as const),
  );

  return (
    <section className="dv2-panel">
      <div className="dv2-panel-head">
        <h2>
          연결 가능한 마켓플레이스
          <span className="count">{adapters.length}개</span>
        </h2>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
          padding: 18,
        }}
      >
        {adapters.map((a) => {
          const integ = integrationByChannel.get(a.channel);
          const status: Integration["status"] = integ?.status ?? "DISCONNECTED";
          const badge = STATUS_BADGE[status];
          return (
            <div
              key={a.channel}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 16,
                background: "#fff",
                position: "relative",
                opacity: a.implemented ? 1 : 0.85,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #3b5bff, #6e86ff)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {a.displayName.slice(0, 1)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.displayName}</div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "1px 8px",
                      borderRadius: 10,
                      background: badge.bg,
                      color: badge.fg,
                    }}
                  >
                    {badge.label}
                  </span>
                  {!a.implemented && (
                    <span
                      style={{
                        marginLeft: 6,
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
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", minHeight: 32, marginBottom: 10 }}>
                {CHANNEL_DESCRIPTIONS[a.channel]}
              </div>
              {integ?.lastSyncAt && (
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>
                  최근 동기화: {new Date(integ.lastSyncAt).toLocaleString("ko-KR")}
                </div>
              )}
              {integ?.lastError && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#991b1b",
                    background: "#fee2e2",
                    padding: "6px 8px",
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                >
                  {integ.lastError.slice(0, 120)}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="dv2-row-btn primary"
                  onClick={() => setOpenChannel(a.channel)}
                  disabled={!a.implemented && status === "DISCONNECTED"}
                  style={!a.implemented && status === "DISCONNECTED" ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                  title={!a.implemented ? "추후 출시 예정 — 먼저 키 등록은 가능 (저장만)" : undefined}
                >
                  {integ ? "재연결 / 키 변경" : "연결하기"}
                </button>
                {integ && (
                  <button
                    type="button"
                    className="dv2-row-btn"
                    onClick={async () => {
                      if (!confirm(`${a.displayName} 연동을 끊을까요?`)) return;
                      const r = await fetch(
                        `/api/integrations?integrationId=${integ.id}`,
                        { method: "DELETE" },
                      );
                      if (r.ok) router.refresh();
                    }}
                  >
                    연결 끊기
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openChannel && (
        <ConnectModal
          siteId={siteId}
          channel={openChannel}
          adapter={adapters.find((a) => a.channel === openChannel)!}
          onClose={() => setOpenChannel(null)}
          onSaved={() => {
            setOpenChannel(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

interface ConnectModalProps {
  siteId: string;
  channel: Channel;
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

function ConnectModal({ siteId, channel, adapter, onClose, onSaved }: ConnectModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = CHANNEL_FIELDS[channel];

  // Shopify uses OAuth: kick off a redirect to /admin/oauth/authorize on submit.
  const isOAuth = channel === "SHOPIFY";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isOAuth && channel === "SHOPIFY") {
        const shop = values.shop?.trim();
        if (!shop) {
          setError("Shop 도메인을 입력하세요.");
          setSaving(false);
          return;
        }
        // Build the install URL on the server-side template, replacing the placeholder.
        const r = await fetch("/api/integrations/shopify/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId, shop }),
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
        body: JSON.stringify({ siteId, channel, credentials: values }),
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
          width: "min(520px, 92vw)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: 18 }}>{adapter.displayName} 연결</h3>
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
