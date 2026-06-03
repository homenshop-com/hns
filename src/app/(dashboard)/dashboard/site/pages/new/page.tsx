import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import Link from "next/link";
import DashboardShell from "../../../dashboard-shell";
import CreatePageForm from "./create-page-form";

export default async function NewPagePage() {
  const session = await auth();
  const t = await getTranslations("sitePages");

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
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("breadcrumbSite"), href: "/dashboard/site" },
        { label: t("breadcrumbPages"), href: "/dashboard/site/pages" },
        { label: t("breadcrumbNewPage") },
      ]}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href="/dashboard/site/pages" style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; {t("backToPageList")}
          </Link>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <CreatePageForm siteId={site.id} />
        </div>
      </div>
    </DashboardShell>
  );
}
