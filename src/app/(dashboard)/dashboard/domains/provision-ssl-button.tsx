"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Triggers background SSL provisioning for a domain.
 * Flips to "발급 중" and auto-polls for sslEnabled for ~2 minutes.
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

      let tries = 0;
      const poll = () => {
        tries += 1;
        router.refresh();
        if (tries < 24) setTimeout(poll, 5000);
        else setState("idle");
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
        className="dm2-badge issuing"
        title="certbot이 인증서를 발급하고 nginx를 재시작하는 중입니다. 페이지가 자동으로 갱신됩니다."
      >
        <svg width={10} height={10}><use href="#i-shield" /></svg>
        SSL 발급 중
      </span>
    );
  }

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={start}
        title={error}
        className="dm2-badge error"
        style={{ cursor: "pointer" }}
      >
        <svg width={10} height={10}><use href="#i-warn" /></svg>
        재시도
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Let's Encrypt 인증서를 자동 발급하고 HTTPS를 활성화합니다."
      className="dm2-badge issuing"
      style={{ cursor: "pointer" }}
    >
      <svg width={10} height={10}><use href="#i-lock" /></svg>
      SSL 발급
    </button>
  );
}
