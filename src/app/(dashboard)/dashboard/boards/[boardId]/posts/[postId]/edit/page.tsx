import { getTranslations } from "next-intl/server";
import DashboardShell from "../../../../../dashboard-shell";
import EditPostClient from "./edit-post-client";

export default async function EditPostPage() {
  const t = await getTranslations("boardsDash");
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("breadcrumbBoards"), href: "/dashboard/boards" },
        { label: t("breadcrumbEditPost") },
      ]}
    >
      <EditPostClient />
    </DashboardShell>
  );
}
