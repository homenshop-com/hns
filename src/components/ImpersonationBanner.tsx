"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

/**
 * Shown on customer dashboards when an operator is impersonating them. The
 * signal is a localStorage flag set by the admin panel's "Login" button
 * (src/app/admin/sites/sites-table.tsx).
 *
 * Two impersonation mechanisms feed this banner:
 *  1. Master-password flow (full admins): a new-tab /login with the master
 *     password auto-filled. The admin's real session was never replaced in
 *     the original tab, so "return" just signs THIS session out → /login.
 *  2. Impersonate API (reseller operators): /api/admin/impersonate swaps the
 *     session cookie in-place and backs up the operator's session in an
 *     admin-session-backup cookie. "return" must restore that backup via
 *     DELETE rather than signing out (which would drop the reseller session).
 *
 * "관리자로 돌아가기" therefore tries the DELETE restore first; if there is no
 * backup (master-password flow → 400) it falls back to signOut → /login.
 */
export default function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState("");

  useEffect(() => {
    let val = "";
    try {
      val = localStorage.getItem("impersonating") || "";
    } catch {
      /* ignore storage errors */
    }
    if (!val) return;

    // The localStorage flag persists across logout/login, so on its own it
    // would keep showing the banner even after the operator returned to their
    // OWN account. Validate against the REAL session: only show the banner when
    // the currently-logged-in email actually matches the impersonated email.
    // Any mismatch (or no session) means the flag is stale → clear it.
    let cancelled = false;
    (async () => {
      try {
        const session = await fetch("/api/auth/session").then((r) => r.json());
        const currentEmail = session?.user?.email || "";
        if (cancelled) return;
        if (currentEmail && currentEmail === val) {
          setImpersonating(val);
        } else {
          try {
            localStorage.removeItem("impersonating");
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* network error — leave the banner hidden, don't false-positive */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!impersonating) return null;

  async function returnToAdmin() {
    try {
      localStorage.removeItem("impersonating");
    } catch {
      /* ignore */
    }
    // Impersonate-API flow: restore the backed-up operator (reseller/admin)
    // session and go to wherever the API points us (their /admin/sites).
    try {
      const res = await fetch("/api/admin/impersonate", { method: "DELETE" });
      if (res.ok) {
        const data = (await res.json()) as { redirectUrl?: string };
        window.location.href = data.redirectUrl || "/admin/sites";
        return;
      }
    } catch {
      /* fall through to sign-out */
    }
    // Master-password flow (no backup to restore): just drop this session.
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
