import DashboardShell from "../../dashboard-shell";
import CategoriesClient from "./categories-client";

export default function BoardCategoriesPage() {
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "게시판", href: "/dashboard/boards" },
        { label: "카테고리 관리" },
      ]}
    >
      <CategoriesClient />
    </DashboardShell>
  );
}
