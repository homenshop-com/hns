"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Triggers background SSL provisioning for a domain.
 * The API spawns a detached shell script (certbot + nginx reload);
 * the button flips to a "발급 중" state and auto-polls for sslEnabled
 * for ~2 minutes so the user sees the green badge without manual refresh.
 */
export default function ProvisionSslButton({ domainId }: { domainId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");

  async function start() {
    setError("");
    setState("running");
    try {
      const res = await fetch(`/api/domains/${domainId}/provision-ssl`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SSL 발급 요청 실패");

      // Poll every 5s for up to 2 min — script typically takes 20–40s.
      let tries = 0;
      const poll = () => {
        tries += 1;
        router.refresh();
        if (tries < 24) setTimeout(poll, 5000);
        else setState("idle"); // let the refresh show whatever the DB has
      };
      setTimeout(poll, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      setState("error");
    }
  }

  if (state === "running") {
    return (
      <span
        title="certbot이 인증서를 발급하고 nginx를 재시작하는 중입니다. 페이지가 자동으로 갱신됩니다."
        style={{
          display: "inline-block",
          padding: "2px 10px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 20,
          background: "#fefce8",
          color: "#a16207",
        }}
      >
        🔄 발급 중…
      </span>
    );
  }

  if (state === "error") {
    return (
      <button
        onClick={start}
        title={error}
        style={{
          padding: "2px 10px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 20,
          background: "#fef2f2",
          color: "#ef4444",
          border: "1px solid #fecaca",
          cursor: "pointer",
        }}
      >
        ⚠️ 재시도
      </button>
    );
  }

  return (
    <button
      onClick={start}
      title="Let's Encrypt 인증서를 자동 발급하고 HTTPS를 활성화합니다."
      style={{
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 20,
        background: "#eef4fc",
        color: "#2c5fa0",
        border: "1px solid #c6daf7",
        cursor: "pointer",
      }}
    >
      🔒 SSL 발급
    </button>
  );
}
