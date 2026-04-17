"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SiteRow {
  id: string;
  shopId: string;
  accountType: string;
  email: string;
  domain: string;
  expiresAt: string | null;
  updatedAt: string;
  createdAt: string;
  pageCount: number;
  userId: string;
}

const ACCOUNT_TYPES: Record<string, { label: string; color: string }> = {
  "0": { label: "Free", color: "bg-cyan-500/10 text-cyan-400" },
  "1": { label: "Paid", color: "bg-emerald-500/10 text-emerald-400" },
  "2": { label: "Test", color: "bg-amber-500/10 text-amber-400" },
  "9": { label: "Expired", color: "bg-red-500/10 text-red-400" },
};

export default function SitesTable({
  sites,
  totalCount,
  currentPage,
  totalPages,
  perPage,
  buildUrlBase,
}: {
  sites: SiteRow[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  perPage: number;
  buildUrlBase: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const allChecked = sites.length > 0 && selected.size === sites.length;

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(sites.map(s => s.id)));
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;

    const selectedSites = sites.filter(s => selected.has(s.id));
    const shopIds = selectedSites.map(s => s.shopId).join(", ");
    const msg = `다음 ${selected.size}개 사이트를 삭제하시겠습니까?\n\n${shopIds}\n\n⚠️ 관련된 모든 페이지, 게시물, 상품 데이터가 함께 삭제됩니다.`;

    if (!confirm(msg)) return;
    if (!confirm(`정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

    const res = await fetch("/api/admin/sites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });

    if (res.ok) {
      const data = await res.json();
      setSelected(new Set());
      startTransition(() => router.refresh());
      alert(`${data.deleted}개 사이트가 삭제되었습니다.`);
    } else {
      alert("삭제 실패");
    }
  }

  function pageUrl(p: number) {
    return `${buildUrlBase}&page=${p}`;
  }

  return (
    <div className="bg-[#1e293b]/80 rounded-xl border border-slate-700/30">
      <div className="p-4 border-b border-slate-700/30 flex justify-between items-center">
        <span className="font-semibold text-slate-200">Results ({totalCount} total)</span>
        {selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-400 font-medium">{selected.size}개 선택</span>
            <button
              onClick={bulkDelete}
              disabled={isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {isPending ? "삭제중..." : "선택 삭제"}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md border border-slate-600/40 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800/40"
            >
              선택 해제
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/20 bg-slate-800/30 text-left">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                />
              </th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">NO</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">TYPE</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">EMAIL</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">DOMAIN</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">SITE ID</th>
              <th className="px-4 py-3 font-medium text-slate-500 text-center">
                <span className="text-red-400">EXP DATE</span>
              </th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">LAST UPDATE</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">REGISTERED</th>
              <th className="px-4 py-3 font-medium text-slate-500 text-right">DETAIL</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site, i) => {
              const no = totalCount - (currentPage - 1) * perPage - i;
              const typeInfo = ACCOUNT_TYPES[site.accountType] || ACCOUNT_TYPES["0"];
              const isExpired = site.expiresAt && new Date(site.expiresAt) < new Date();
              return (
                <tr
                  key={site.id}
                  className={`border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30 ${selected.has(site.id) ? "bg-cyan-500/5" : ""}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(site.id)}
                      onChange={() => toggle(site.id)}
                      className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{no}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{site.email}</td>
                  <td className="px-4 py-3">
                    {site.domain ? (
                      <a href={`https://${site.domain}`} target="_blank" rel="noopener" className="text-cyan-400 hover:text-cyan-300 hover:underline">
                        {site.domain}
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`https://home.homenshop.com/${site.shopId}`} target="_blank" rel="noopener" className="text-cyan-400 hover:text-cyan-300 hover:underline">
                      {site.shopId}
                    </a>
                  </td>
                  <td className={`px-4 py-3 text-center font-medium ${isExpired ? "text-red-400" : "text-emerald-400"}`}>
                    {site.expiresAt ? new Date(site.expiresAt).toLocaleDateString("ko-KR") : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(site.updatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(site.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/sites/${site.id}`}
                      className="inline-block bg-cyan-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-cyan-600"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => {
                        // Mark impersonation for the banner to pick up, then
                        // open /login in a new tab — the login page will
                        // fetch the master password from /api/admin/master-password
                        // (admin session only) and auto-fill.
                        try {
                          localStorage.setItem("impersonating", site.email);
                        } catch {
                          /* ignore storage errors (e.g. Safari private mode) */
                        }
                        window.open(
                          `/login?email=${encodeURIComponent(site.email)}`,
                          "_blank",
                          "noopener"
                        );
                      }}
                      className="bg-amber-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-amber-600 ml-1"
                    >
                      Login
                    </button>
                    <button
                      onClick={() => {
                        const url = `https://homenshop.com/login?email=${encodeURIComponent(site.email)}`;
                        navigator.clipboard.writeText(url);
                        const el = document.getElementById(`copy-ok-${site.id}`);
                        if (el) { el.style.opacity = "1"; setTimeout(() => { el.style.opacity = "0"; }, 1500); }
                      }}
                      title={`${site.email} 로그인 링크 복사`}
                      className="relative text-slate-400 hover:text-cyan-400 ml-1 align-middle"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      <span id={`copy-ok-${site.id}`} className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 transition-opacity pointer-events-none">Copied!</span>
                    </button>
                  </td>
                </tr>
              );
            })}
            {sites.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 p-4 border-t border-slate-700/30">
          {currentPage > 1 && (
            <Link href={pageUrl(currentPage - 1)} className="px-3 py-1 rounded text-sm border border-slate-700/30 hover:bg-slate-800/30 text-slate-400">
              Prev
            </Link>
          )}
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const start = Math.max(1, Math.min(currentPage - 5, totalPages - 9));
            const p = start + i;
            if (p > totalPages) return null;
            return (
              <Link
                key={p}
                href={pageUrl(p)}
                className={`px-3 py-1 rounded text-sm ${p === currentPage ? "bg-cyan-500 text-white" : "border border-slate-700/30 hover:bg-slate-800/30 text-slate-400"}`}
              >
                {p}
              </Link>
            );
          })}
          {currentPage < totalPages && (
            <Link href={pageUrl(currentPage + 1)} className="px-3 py-1 rounded text-sm border border-slate-700/30 hover:bg-slate-800/30 text-slate-400">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
