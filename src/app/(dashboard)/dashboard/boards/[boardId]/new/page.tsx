import { getTranslations } from "next-intl/server";
import DashboardShell from "../../../dashboard-shell";
import NewPostClient from "./new-post-client";

export default async function NewPostPage() {
  const t = await getTranslations("boardsDash");
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("breadcrumbBoards"), href: "/dashboard/boards" },
        { label: t("breadcrumbWrite") },
      ]}
    >
      <NewPostClient />
    </DashboardShell>
  );
}
