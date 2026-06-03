import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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

  const tt = await getTranslations("templatesDash");

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template || template.userId !== session.user.id) {
    return (
      <ErrorScreen
        title={tt("editNotFoundTitle")}
        message={tt("editNotFoundMessage")}
        backLabel={tt("backToTemplates")}
      />
    );
  }

  if (!template.demoSiteId) {
    return (
      <ErrorScreen
        title={tt("editNoSourceTitle")}
        message={tt("editNoSourceMessage")}
        backLabel={tt("backToTemplates")}
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
        title={tt("editNoSiteTitle")}
        message={tt("editNoSiteMessage")}
        backLabel={tt("backToTemplates")}
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
        title={tt("editNoPageTitle")}
        message={tt("editNoPageMessage")}
        backLabel={tt("backToTemplates")}
      />
    );
  }

  redirect(`/dashboard/site/pages/${homePageId}/edit`);
}

function ErrorScreen({ title, message, backLabel }: { title: string; message: string; backLabel: string }) {
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
        {backLabel}
      </Link>
    </div>
  );
}
