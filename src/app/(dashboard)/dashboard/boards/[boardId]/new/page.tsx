import DashboardShell from "../../../dashboard-shell";
import NewPostClient from "./new-post-client";

export default function NewPostPage() {
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "게시판", href: "/dashboard/boards" },
        { label: "글쓰기" },
      ]}
    >
      <NewPostClient />
    </DashboardShell>
  );
}
