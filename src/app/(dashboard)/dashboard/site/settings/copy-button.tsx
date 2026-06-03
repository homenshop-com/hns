"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function CopyButton({ value, title }: { value: string; title?: string }) {
  const t = useTranslations("siteSettings");
  const [copied, setCopied] = useState(false);
  const baseTitle = title ?? t("copy");

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
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? t("copied") : baseTitle}
      aria-label={copied ? t("copied") : baseTitle}
      className={`copy${copied ? " ok" : ""}`}
    >
      <svg width={14} height={14}>
        <use href={`#${copied ? "i-check" : "i-copy"}`} />
      </svg>
    </button>
  );
}
