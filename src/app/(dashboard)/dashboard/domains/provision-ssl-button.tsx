"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Triggers background SSL provisioning for a domain.
 * Flips to "발급 중" and auto-polls for sslEnabled for ~2 minutes.
 */
export default function ProvisionSslButton({ domainId }: { domainId: string }) {
  const router = useRouter();
  const t = useTranslations("domainsDash");
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");

  async function start() {
    setError("");
    setState("running");
    try {
      const res = await fetch(`/api/domains/${domainId}/provision-ssl`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("sslRequestFailed"));

      let tries = 0;
      const poll = () => {
        tries += 1;
        router.refresh();
        if (tries < 24) setTimeout(poll, 5000);
        else setState("idle");
      };
      setTimeout(poll, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setState("error");
    }
  }

  if (state === "running") {
    return (
      <span
        className="dm2-badge issuing"
        title={t("sslIssuingTooltip")}
      >
        <svg width={10} height={10}><use href="#i-shield" /></svg>
        {t("sslIssuing")}
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
        {t("retry")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title={t("sslIssueTooltip")}
      className="dm2-badge issuing"
      style={{ cursor: "pointer" }}
    >
      <svg width={10} height={10}><use href="#i-lock" /></svg>
      {t("sslIssue")}
    </button>
  );
}
