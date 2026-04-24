"use client";

import { useEffect, useState } from "react";

/**
 * Polls /api/support/unread every 30s and renders an unread indicator
 * on top of the chat bell. Two render variants:
 *
 *   variant="dot"   — small red dot (for compact icon buttons)
 *   variant="count" — pill with count (for sidebar labels)
 *
 * Returns null while count is 0 so the indicator completely disappears.
 */
export default function SupportUnreadIndicator({
  variant = "dot",
  initialCount = 0,
}: {
  variant?: "dot" | "count";
  initialCount?: number;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch("/api/support/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCount(Number(data.count) || 0);
      } catch {
        // silent — network blip, retry on next tick
      }
    }
    fetchCount();
    const t = setInterval(fetchCount, 30_000);
    // Refresh when user returns to the tab.
    const onVis = () => { if (document.visibilityState === "visible") fetchCount(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (count <= 0) return null;

  if (variant === "count") {
    return (
      <span
        style={{
          marginLeft: "auto",
          background: "#ef4a5c",
          color: "#fff",
          borderRadius: 10,
          padding: "1px 7px",
          fontSize: 10.5,
          fontWeight: 600,
          lineHeight: 1.5,
        }}
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  }

  // dot variant — absolutely positioned over the parent icon button
  return (
    <span
      style={{
        position: "absolute",
        top: 7,
        right: 8,
        width: 7,
        height: 7,
        background: "#ef4a5c",
        borderRadius: "50%",
        border: "2px solid #fff",
        pointerEvents: "none",
      }}
      aria-label={`읽지 않은 메시지 ${count}개`}
      title={`읽지 않은 지원 메시지 ${count}개`}
    />
  );
}
