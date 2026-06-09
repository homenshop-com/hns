/**
 * /dashboard/site/[siteId]/hmf — 레거시 헤더/풋터 전용 편집기 진입점.
 *
 * 헤더/풋터 편집 기능이 페이지 에디터로 통합되었으므로,
 * 이 URL로 접근하면 해당 사이트의 첫 번째 페이지 에디터로 redirect 한다.
 * 에디터는 ?mode=hmf 파라미터를 받아 헤더/풋터 편집 모드로 초기화된다.
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getManageScope, canManage } from "@/lib/site-access";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function HmfEditorPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      userId: true,
      defaultLanguage: true,
      user: { select: { resellerId: true } },
    },
  });

  const scope = await getManageScope();
  if (
    !site ||
    !scope ||
    !canManage(scope, {
      userId: site.userId,
      ownerResellerId: site.user.resellerId,
    })
  ) {
    redirect("/dashboard");
  }

  // Find first page of the site (default language, lowest sortOrder)
  const firstPage = await prisma.page.findFirst({
    where: { siteId, lang: site.defaultLanguage },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });

  if (!firstPage) {
    // No pages yet — redirect to site management
    redirect(`/dashboard/site/${siteId}/manage`);
  }

  redirect(`/dashboard/site/pages/${firstPage.id}/edit?mode=hmf`);
}
