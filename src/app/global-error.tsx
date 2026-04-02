"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
          <h2 style={{ fontSize: "24px", marginBottom: "16px" }}>오류가 발생했습니다</h2>
          <p style={{ color: "#666", marginBottom: "24px" }}>문제가 지속되면 관리자에게 문의하세요.</p>
          <button onClick={() => reset()} style={{ padding: "12px 24px", background: "#18181b", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
