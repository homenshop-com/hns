"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImportFromDesignModal from "./import-from-design-modal";

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  price: number;
  thumbnailUrl: string;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  clicks: number;
  isSystem: boolean;
  hasDemoSite: boolean;
  updatedAt: string;
}

export default function TemplatesTable({
  templates,
  totalCount,
}: {
  templates: TemplateRow[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  perPage: number;
  buildUrlBase: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Record<string, number>>({});
  const [importOpen, setImportOpen] = useState(false);

  async function openDesignEditor(id: string, reset = false) {
    if (busyId) return;
    if (reset && !confirm(
      "템플릿에서 최신 디자인을 다시 불러옵니다.\n\n" +
      "연결된 디자인 사이트의 현재 내용은 모두 삭제되고, 원본 템플릿의 " +
      "헤더·메뉴·푸터·CSS·페이지 스냅샷으로 새로 채워집니다.\n\n" +
      "저장되지 않은 편집 사항이 있다면 손실됩니다. 계속할까요?"
    )) return;
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/admin/templates/${id}/design-edit${reset ? "?reset=1" : ""}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`디자인 수정 준비 실패: ${err.error ?? res.status}`);
        return;
      }
      const data = await res.json();
      if (data.editUrl) {
        window.open(data.editUrl, "_blank", "noopener");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function syncFromSite(id: string, name: string) {
    if (busyId) return;
    if (!confirm(
      `"${name}" 템플릿에 디자인 편집 사항을 적용할까요?\n\n` +
      `연결된 디자인 사이트의 헤더·메뉴·푸터·CSS·페이지 스냅샷을 원본 템플릿으로 복사합니다.\n` +
      `이미 이 템플릿으로 생성된 사이트는 기존 스냅샷을 그대로 유지합니다 (영향 없음).`
    )) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/templates/${id}/sync-from-site`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`적용 실패: ${err.error ?? res.status}`);
        return;
      }
      const data = await res.json();
      setSyncedAt((m) => ({ ...m, [id]: Date.now() }));
      alert(
        `적용 완료: ${name}\n` +
        `페이지 ${data.stats?.pages ?? 0}개 · ` +
        `CSS ${data.stats?.cssChars ?? 0}자 · ` +
        `헤더 ${data.stats?.headerChars ?? 0}자`
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleField(id: string, field: "isActive" | "isPublic", next: boolean) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`저장 실패: ${err.error ?? res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (busyId) return;
    if (!confirm(`"${name}" 템플릿을 삭제할까요?\n기존 생성 사이트는 영향받지 않지만 템플릿 목록에서 사라집니다.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`삭제 실패: ${err.error ?? res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 text-sm text-slate-500 flex justify-between items-center">
        <span>총 <b className="text-slate-800">{totalCount.toLocaleString()}</b>개</span>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#405189] text-white text-xs font-medium rounded-md hover:bg-[#405189]/90 transition-colors"
          title="claude.ai/design 에서 Copy command 로 복사한 명령어를 붙여넣어 새 템플릿으로 가져옵니다"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          템플릿 추가 (Claude Design)
        </button>
      </div>
      {importOpen && (
        <ImportFromDesignModal onClose={() => setImportOpen(false)} />
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3 w-[80px]">썸네일</th>
            <th className="px-4 py-3">이름 · 카테고리</th>
            <th className="px-4 py-3 w-[100px]">구분</th>
            <th className="px-4 py-3 w-[110px]">가격</th>
            <th className="px-4 py-3 w-[100px]">상태</th>
            <th className="px-4 py-3 w-[90px] text-right">순서</th>
            <th className="px-4 py-3 w-[90px] text-right">클릭수</th>
            <th className="px-4 py-3 w-[360px] text-right">작업</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {templates.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                표시할 템플릿이 없습니다.
              </td>
            </tr>
          ) : (
            templates.map((t) => (
              <tr key={t.id} className={busyId === t.id ? "opacity-50" : ""}>
                <td className="px-4 py-3">
                  {t.thumbnailUrl ? (
                    <img
                      src={t.thumbnailUrl}
                      alt=""
                      className="w-14 h-10 object-cover rounded border border-slate-200 bg-slate-100"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-14 h-10 rounded bg-slate-100 border border-slate-200 grid place-items-center text-slate-300 text-[10px]">—</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t.category || <span className="text-slate-300">카테고리 없음</span>}
                  </div>
                  {syncedAt[t.id] && (
                    <div className="text-[11px] text-emerald-600 mt-1">✓ 방금 적용됨</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                    t.isSystem
                      ? "bg-[#405189]/10 text-[#405189]"
                      : "bg-purple-50 text-purple-700"
                  }`}>
                    {t.isSystem ? "시스템" : "유저"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {t.price === 0 ? (
                    <span className="text-emerald-600 font-medium">무료</span>
                  ) : (
                    <span className="text-slate-800 font-medium">
                      ₩{t.price.toLocaleString()}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 text-[11px]">
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => toggleField(t.id, "isActive", !t.isActive)}
                      className={`px-2 py-0.5 rounded text-left ${
                        t.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-400 line-through"
                      }`}
                      title="클릭으로 활성/비활성 전환"
                    >
                      {t.isActive ? "활성" : "비활성"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => toggleField(t.id, "isPublic", !t.isPublic)}
                      className={`px-2 py-0.5 rounded text-left ${
                        t.isPublic
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                      title="사용자 템플릿을 공용에 노출할지"
                    >
                      {t.isPublic ? "공개" : "비공개"}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">{t.sortOrder}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">{t.clicks.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end flex-wrap">
                    <Link
                      href={`/admin/templates/${t.id}`}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50"
                    >
                      기본정보
                    </Link>
                    <button
                      type="button"
                      onClick={() => openDesignEditor(t.id)}
                      disabled={busyId !== null}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-[#405189] rounded hover:bg-[#405189]/90 disabled:opacity-50"
                    >
                      {t.hasDemoSite ? "디자인 수정" : "디자인 수정 ▸ 생성"}
                    </button>
                    {t.hasDemoSite && (
                      <>
                        <button
                          type="button"
                          onClick={() => openDesignEditor(t.id, true)}
                          disabled={busyId !== null}
                          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50"
                          title="원본 템플릿의 최신 스냅샷으로 디자인 사이트를 다시 채웁니다 (편집 내용 손실)"
                        >
                          리셋
                        </button>
                        <button
                          type="button"
                          onClick={() => syncFromSite(t.id, t.name)}
                          disabled={busyId !== null}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50"
                          title="편집한 디자인을 원본 템플릿에 적용"
                        >
                          적용
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(t.id, t.name)}
                      disabled={busyId !== null}
                      className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
