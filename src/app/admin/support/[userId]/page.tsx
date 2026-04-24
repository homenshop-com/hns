import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AdminChat from "./admin-chat";
import "../../../(dashboard)/dashboard/support/support-v2.css";

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

export default async function AdminSupportUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") redirect("/dashboard");

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true, createdAt: true, credits: true },
  });
  if (!user) notFound();

  const userName = user.name || user.email.split("@")[0];
  const userInitial = initialsFrom(userName)[0] || "U";

  return (
    <div className="dv2-app" style={{ display: "block", background: "transparent" }}>
      <div className="mb-4">
        <Link
          href="/admin/support"
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          &larr; 고객 지원 목록
        </Link>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-900">
          {userName} <span className="text-slate-400 font-normal text-sm ml-2">{user.email}</span>
        </h1>
        <div className="flex gap-2 text-xs text-slate-600 flex-wrap">
          {user.phone && (
            <span className="px-2 py-1 rounded bg-slate-100">📱 {user.phone}</span>
          )}
          <span className="px-2 py-1 rounded bg-violet-50 text-violet-700">
            크레딧 {user.credits.toLocaleString()} C
          </span>
          <span className="px-2 py-1 rounded bg-slate-100 font-mono">
            {user.id.slice(-10)}
          </span>
        </div>
      </div>

      <AdminChat
        userId={user.id}
        userInitial={userInitial}
        userName={userName}
        userEmail={user.email}
      />
    </div>
  );
}
