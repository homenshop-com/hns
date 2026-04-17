"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

/**
 * Shown on customer dashboards when an admin is impersonating them via the
 * master-password flow. The signal is a localStorage flag set by the admin
 * panel's "Login" button (src/app/admin/sites/sites-table.tsx).
 *
 * "관리자로 돌아가기" signs the current (customer) session out and returns
 * to /login. Because the admin's real session was never replaced in the
 * original admin tab (master password login happens in a new tab with its
 * own form submit), the admin typically still has a live session there and
 * can keep working. This button only cleans up the new tab.
 */
export default function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState("");

  useEffect(() => {
    try {
      const val = localStorage.getItem("impersonating");
      if (val) setImpersonating(val);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  if (!impersonating) return null;

  async function returnToAdmin() {
    try {
      localStorage.removeItem("impersonating");
    } catch {
      /* ignore */
    }
    await signOut({ redirect: false });
    window.location.href = "/login";
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "#f59e0b", color: "#000", padding: "8px 16px",
      display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
      fontSize: 14, fontWeight: 600,
    }}>
      <span>관리자 모드: {impersonating} 계정으로 로그인 중</span>
      <button
        onClick={returnToAdmin}
        style={{
          background: "#000", color: "#fff", border: "none",
          padding: "4px 16px", borderRadius: 4, cursor: "pointer",
          fontSize: 13, fontWeight: 600,
        }}
      >
        관리자로 돌아가기
      </button>
    </div>
  );
}
