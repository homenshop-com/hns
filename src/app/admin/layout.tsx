import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import AdminSidebar from "./admin-sidebar";

const navItems = [
  { href: "/admin", label: "대시보드", icon: "dashboard" },
  { href: "/admin/members", label: "회원 관리", icon: "members" },
  { href: "/admin/sites", label: "계정 관리", icon: "sites" },
  { href: "/admin/orders", label: "주문 관리", icon: "orders" },
  { href: "/admin/domains", label: "도메인 관리", icon: "domains" },
  { href: "/admin/boards", label: "게시판 관리", icon: "boards" },
  { href: "/admin/resellers", label: "리셀러 관리", icon: "resellers" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex bg-[#0b1120] text-slate-300">
      <AdminSidebar email={session.user.email ?? ""} navItems={navItems} />
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
