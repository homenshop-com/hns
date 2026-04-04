"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ProductForm from "../product-form";

export default function NewProductPage() {
  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">HomeNShop</Link>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">Dashboard</Link>
            <Link href="/dashboard/profile" className="dash-header-btn">Profile</Link>
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="dash-header-btn">Logout</button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="mb-6">
          <Link
            href="/dashboard/products"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; 상품 목록
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6">상품 등록</h2>

        <ProductForm mode="create" />
      </main>
    </div>
  );
}
