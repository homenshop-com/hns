import { getTranslations } from "next-intl/server";
import DashboardShell from "../../dashboard-shell";
import PostsClient from "./posts-client";

export default async function BoardPostsPage() {
  const t = await getTranslations("boardsDash");
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("breadcrumbBoards"), href: "/dashboard/boards" },
        { label: t("breadcrumbPostManage") },
      ]}
    >
      <PostsClient />
    </DashboardShell>
  );
}
