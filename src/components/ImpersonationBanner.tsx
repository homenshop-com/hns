"use client";

import { useEffect, useState } from "react";

export default function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState("");

  useEffect(() => {
    const val = localStorage.getItem("impersonating");
    if (val) setImpersonating(val);
  }, []);

  if (!impersonating) return null;

  function returnToAdmin() {
    localStorage.removeItem("impersonating");
    window.location.href = "/login?email=master@homenshop.com";
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
