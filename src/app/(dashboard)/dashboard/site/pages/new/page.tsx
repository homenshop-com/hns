import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import DashboardShell from "../../../dashboard-shell";
import CreatePageForm from "./create-page-form";

export default async function NewPagePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id, isTemplateStorage: false },
  });

  if (!site) {
    redirect("/dashboard/site");
  }

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "내 홈페이지", href: "/dashboard/site" },
        { label: "페이지", href: "/dashboard/site/pages" },
        { label: "새 페이지" },
      ]}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href="/dashboard/site/pages" style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; 페이지 목록
          </Link>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <CreatePageForm siteId={site.id} />
        </div>
      </div>
    </DashboardShell>
  );
}
