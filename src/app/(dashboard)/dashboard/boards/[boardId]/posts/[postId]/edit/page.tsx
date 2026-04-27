import DashboardShell from "../../../../../dashboard-shell";
import EditPostClient from "./edit-post-client";

export default function EditPostPage() {
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "게시판", href: "/dashboard/boards" },
        { label: "게시글 수정" },
      ]}
    >
      <EditPostClient />
    </DashboardShell>
  );
}
