import DashboardShell from "../../dashboard-shell";
import PostsClient from "./posts-client";

export default function BoardPostsPage() {
  return (
    <DashboardShell
      active="boards"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "게시판", href: "/dashboard/boards" },
        { label: "게시물 관리" },
      ]}
    >
      <PostsClient />
    </DashboardShell>
  );
}
