import { getTranslations } from "next-intl/server";
import DashboardShell from "../../dashboard-shell";
import CategoriesClient from "./categories-client";

export default async function BoardCategoriesPage() {
  const t = await getTranslations("boardsDash");
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("breadcrumbBoards"), href: "/dashboard/boards" },
        { label: t("breadcrumbCategories") },
      ]}
    >
      <CategoriesClient />
    </DashboardShell>
  );
}
