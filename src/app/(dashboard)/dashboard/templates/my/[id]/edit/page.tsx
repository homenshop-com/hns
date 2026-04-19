import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Clicking "디자인 수정" on a user's own template lands here. The route
 * resolves the template's source site + its home page, checks ownership,
 * then forwards to the existing design editor.
 *
 * Shows a friendly error card if the template is detached from a site
 * (older snapshot without demoSiteId, or the source site was deleted).
 */
export default async function EditMyTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template || template.userId !== session.user.id) {
    return (
      <ErrorScreen
        title="템플릿을 찾을 수 없습니다"
        message="본인 소유의 템플릿만 수정할 수 있습니다."
      />
    );
  }

  if (!template.demoSiteId) {
    return (
      <ErrorScreen
        title="이 템플릿은 원본 사이트 정보가 없습니다"
        message="이전에 저장된 템플릿이라 연결된 사이트가 기록되지 않았습니다. 기존 사이트에서 편집 후 '나의 템플릿으로 저장'을 다시 실행해 주세요."
      />
    );
  }

  const site = await prisma.site.findUnique({
    where: { id: template.demoSiteId },
    include: {
      pages: {
        where: { isHome: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!site || site.userId !== session.user.id) {
    return (
      <ErrorScreen
        title="원본 사이트를 찾을 수 없습니다"
        message="원본 사이트가 삭제되었거나 접근 권한이 없습니다."
      />
    );
  }

  // Prefer the home page; fall back to any page of the site.
  let homePageId: string | undefined = site.pages[0]?.id;
  if (!homePageId) {
    const anyPage = await prisma.page.findFirst({
      where: { siteId: site.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    homePageId = anyPage?.id;
  }

  if (!homePageId) {
    return (
      <ErrorScreen
        title="편집할 페이지가 없습니다"
        message="원본 사이트에 페이지가 없습니다."
      />
    );
  }

  redirect(`/dashboard/site/pages/${homePageId}/edit`);
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: 24, background: "#fff", borderRadius: 10, boxShadow: "0 2px 20px rgba(0,0,0,0.06)" }}>
      <h2 style={{ margin: 0, marginBottom: 10, fontSize: 18, fontWeight: 700, color: "#991b1b" }}>
        {title}
      </h2>
      <p style={{ margin: 0, marginBottom: 20, fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
        {message}
      </p>
      <Link
        href="/dashboard/templates"
        style={{
          display: "inline-block",
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          background: "#228be6",
          color: "#fff",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        템플릿 목록으로
      </Link>
    </div>
  );
}
