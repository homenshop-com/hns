"use client";

import { useState } from "react";

type FaqItem = { q: string; a: string };

export default function FaqList({
  items,
  defaultOpen = 1,
}: {
  items: FaqItem[];
  defaultOpen?: number;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);

  return (
    <div className="cr2-faq-list">
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setOpen(open === i ? null : i)}
          className={`cr2-faq-q${open === i ? " open" : ""}`}
          aria-expanded={open === i}
        >
          <div style={{ flex: 1 }}>
            <div className="q">{item.q}</div>
            <div className="a">{item.a}</div>
          </div>
          <svg className="chev" width={12} height={12}>
            <use href="#i-chev-right" />
          </svg>
        </button>
      ))}
    </div>
  );
}
