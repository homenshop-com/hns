"use client";

import { useState } from "react";

export default function CopyButton({ value, title = "복사" }: { value: string; title?: string }) {
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
      title={copied ? "복사됨" : title}
      aria-label={copied ? "복사됨" : title}
      className={`copy${copied ? " ok" : ""}`}
    >
      <svg width={14} height={14}>
        <use href={`#${copied ? "i-check" : "i-copy"}`} />
      </svg>
    </button>
  );
}
