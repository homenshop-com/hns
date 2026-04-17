"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  shopId: string | null;
  createdAt: string;
}

export default function MemberTable({ users, search }: { users: Member[]; search: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const nonAdminUsers = users.filter((u) => u.role !== "ADMIN");
  const allSelected = nonAdminUsers.length > 0 && nonAdminUsers.every((u) => selected.has(u.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nonAdminUsers.map((u) => u.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}명의 회원을 삭제하시겠습니까?\n모든 사이트, 페이지, 상품, 게시판, 주문 데이터가 영구 삭제됩니다.`)) return;
    if (!confirm(`정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "삭제 실패");
        return;
      }
      const data = await res.json();
      alert(`${data.deleted}명의 회원이 삭제되었습니다.`);
      setSelected(new Set());
      router.refresh();
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-red-50 border border-red-500/20 px-4 py-3">
          <span className="text-sm text-red-700">
            {selected.size}명 선택됨
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? "삭제중..." : "선택 삭제"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-slate-600 hover:text-slate-700"
          >
            선택 해제
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-[#405189] w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">이름</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">이메일</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">역할</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">상태</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">Account ID</th>
              <th className="px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">가입일</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selected.has(user.id) ? "bg-[#405189]/5" : ""}`}
              >
                <td className="px-3 py-3">
                  {user.role !== "ADMIN" ? (
                    <input
                      type="checkbox"
                      checked={selected.has(user.id)}
                      onChange={() => toggle(user.id)}
                      className="accent-[#405189] w-4 h-4 cursor-pointer"
                    />
                  ) : (
                    <span className="text-slate-600 text-xs">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/members/${user.id}`}
                    className="text-[#405189] hover:text-[#405189]"
                  >
                    {user.name || "-"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.status} />
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                  {user.shopId ? (
                    <a
                      href={`https://home.homenshop.com/${user.shopId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#405189] hover:text-[#405189]"
                    >
                      {user.shopId} ↗
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-slate-600"
                >
                  {search
                    ? `"${search}" 검색 결과가 없습니다.`
                    : "등록된 회원이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    ADMIN: "bg-[#405189]/10 text-[#405189] ring-1 ring-inset ring-blue-600/20",
    RESELLER: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-purple-600/20",
    MEMBER: "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/20",
  };

  return (
    <span
      className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${colors[role] || colors.MEMBER}`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
    SUSPENDED: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
    DELETED: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
  };

  const labels: Record<string, string> = {
    ACTIVE: "활성",
    SUSPENDED: "정지",
    DELETED: "삭제",
  };

  return (
    <span
      className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${colors[status] || colors.ACTIVE}`}
    >
      {labels[status] || status}
    </span>
  );
}
