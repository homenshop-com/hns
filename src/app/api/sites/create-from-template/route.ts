import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { instantiateSiteFromTemplate } from "@/lib/template-instantiate";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId, shopId, defaultLanguage } = await request.json();

  // Free-site quota (max 5) — exclude hidden template-storage sites.
  const siteCount = await prisma.site.count({
    where: { userId: session.user.id, isTemplateStorage: false },
  });
  if (siteCount >= 5) {
    return NextResponse.json(
      { error: "Maximum 5 free sites allowed" },
      { status: 409 }
    );
  }

  const result = await instantiateSiteFromTemplate({
    userId: session.user.id,
    templateId,
    shopId,
    defaultLanguage,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ site: result.site });
}
