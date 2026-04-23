"use client";

import { useState } from "react";

export default function CopyButton({ value, title = "복사" }: { value: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers / non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title}
      aria-label={title}
      style={{
        background: copied ? "#12b886" : "transparent",
        border: "1px solid",
        borderColor: copied ? "#12b886" : "#ced4da",
        color: copied ? "#fff" : "#495057",
        borderRadius: 4,
        padding: "2px 6px",
        marginLeft: 6,
        cursor: "pointer",
        fontSize: 11,
        lineHeight: 1,
        verticalAlign: "middle",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        transition: "all 0.15s",
      }}
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          복사됨
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 5V3.5C11 2.67157 10.3284 2 9.5 2H3.5C2.67157 2 2 2.67157 2 3.5V9.5C2 10.3284 2.67157 11 3.5 11H5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          복사
        </>
      )}
    </button>
  );
}
