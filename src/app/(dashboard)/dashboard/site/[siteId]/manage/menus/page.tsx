import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import MenuManagerClient from "./menu-manager-client";

export default async function MenuManagerPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          lang: true,
          sortOrder: true,
          isHome: true,
          parentId: true,
          showInMenu: true,
          menuTitle: true,
          menuType: true,
          externalUrl: true,
          seoTitle: true,
          seoDescription: true,
          seoKeywords: true,
          ogImage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!site || site.userId !== session.user.id) {
    redirect("/dashboard");
  }

  const siteLanguages = site.languages || ["ko"];

  return (
    <MenuManagerClient
      siteId={siteId}
      shopId={site.shopId}
      initialPages={site.pages}
      userName={session.user.name || ""}
      languages={siteLanguages}
      defaultLanguage={site.defaultLanguage}
    />
  );
}
