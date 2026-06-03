"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function CopyDnsValueButton({ value }: { value: string }) {
  const t = useTranslations("domainsDash");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? t("copied") : t("copy")}
      aria-label={copied ? t("copied") : t("copy")}
      className={`copy${copied ? " ok" : ""}`}
    >
      <svg width={13} height={13}>
        <use href={`#${copied ? "i-check" : "i-copy"}`} />
      </svg>
    </button>
  );
}
