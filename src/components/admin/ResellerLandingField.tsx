"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Reseller landing-page linker — shared by the reseller-owner settings page
 * (/admin/account) and the platform-admin reseller detail page
 * (/admin/resellers/[id]).
 *
 * It self-fetches the landing state from `endpoint` (GET) and links/unlinks
 * via the same endpoint (POST {siteId} / DELETE). The endpoint differs per
 * caller but the payload shape is identical:
 *   GET  → { domain, ownerUserId, landingSite, sites }
 *   POST → { landingSite }
 */

type SiteView = { id: string; shopId: string; name: string; published: boolean };
type LandingState = {
  domain: string;
  ownerUserId: string | null;
  landingSite: SiteView | null;
  sites: SiteView[];
};

export default function ResellerLandingField({
  endpoint,
}: {
  /** Landing API base, e.g. "/api/admin/my-reseller/landing". */
  endpoint: string;
}) {
  const [state, setState] = useState<LandingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "랜딩페이지 정보를 불러오지 못했습니다.");
      }
      const data: LandingState = await res.json();
      setState(data);
      setSelected(data.landingSite?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  async function link() {
    if (!selected) {
      setError("연동할 사이트를 선택해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "연동에 실패했습니다.");
      setNotice(
        "랜딩페이지를 연동했습니다. 도메인 적용까지 1~2분 정도 걸릴 수 있습니다."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "해지에 실패했습니다.");
      setNotice(
        "연동을 해지했습니다. 기본 랜딩페이지로 되돌립니다. (적용까지 1~2분)"
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const linked = state?.landingSite ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-1">랜딩페이지</h2>
        <p className="text-xs text-slate-400">
          리셀러 도메인 첫 화면에 보여줄 홈페이지를 직접 만들어 연결합니다.
          연결하지 않으면 기본 랜딩페이지가 표시됩니다.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : (
        <>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          {/* Currently linked site */}
          {linked && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {linked.name}
                    </span>
                    {linked.published ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        발행됨
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        미발행
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    @{linked.shopId}
                  </div>
                </div>
                {state && (
                  <a
                    href={`https://${state.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                  >
                    랜딩페이지 보기
                  </a>
                )}
              </div>
              {!linked.published && (
                <p className="mt-2 text-xs text-amber-600">
                  이 사이트는 아직 발행(게시)되지 않았습니다. 디자이너에서 발행해야
                  도메인에 정상 표시됩니다.
                </p>
              )}
            </div>
          )}

          {/* Selector + actions */}
          {state && state.sites.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">
                {linked ? "다른 사이트로 변경" : "연동할 사이트 선택"}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={busy}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value="">사이트 선택...</option>
                  {state.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (@{s.shopId})
                      {s.published ? "" : " — 미발행"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={link}
                  disabled={busy || !selected || selected === linked?.id}
                  className="shrink-0 rounded-lg bg-[#3182f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b64da] disabled:opacity-50 transition-colors"
                >
                  {busy ? "처리 중..." : linked ? "변경" : "연동"}
                </button>
                {linked && (
                  <button
                    type="button"
                    onClick={unlink}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    연동 해지
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {state && !state.ownerUserId
                ? "운영자 계정을 먼저 지정하면 사이트를 연동할 수 있습니다."
                : "아직 만든 사이트가 없습니다. 아래에서 새 홈페이지를 만들어 주세요."}
            </p>
          )}

          {/* Build a new landing page */}
          <div className="border-t border-slate-100 pt-3">
            <Link
              href="/dashboard/sites"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3182f6] px-4 py-2 text-sm font-medium text-[#3182f6] hover:bg-blue-50 transition-colors"
            >
              <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
              랜딩페이지 구축
            </Link>
            <p className="mt-2 text-xs text-slate-400">
              새 홈페이지를 만든 뒤 발행하면, 이 화면에서 선택해 도메인에 연결할 수
              있습니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
