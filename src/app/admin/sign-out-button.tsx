"use client";

import { signOut } from "next-auth/react";

export default function AdminSignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="block w-full text-left text-sm text-red-700 hover:text-red-600 transition-colors"
    >
      로그아웃
    </button>
  );
}
