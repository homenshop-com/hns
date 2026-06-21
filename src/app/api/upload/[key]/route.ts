import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";
import { deleteFile } from "@/lib/storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    // Reject path traversal / absolute paths before they reach the storage
    // key — a raw `../` here could escape the uploads tree on FS storage.
    if (
      decodedKey.includes("..") ||
      decodedKey.startsWith("/") ||
      decodedKey.includes("\\")
    ) {
      return NextResponse.json({ error: "잘못된 키입니다." }, { status: 400 });
    }

    // Ownership check. Uploaded keys are `site-uploads/{shopId}/...`. Without
    // verifying the caller manages that site, ANY logged-in user could delete
    // another site's uploads just by knowing/guessing the key (IDOR).
    const m = decodedKey.match(/^site-uploads\/([^/]+)\//);
    if (!m) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }
    const shopId = m[1];
    const scope = await getManageScope();
    const site = await prisma.site.findFirst({
      where: {
        AND: [
          { OR: [{ shopId }, { id: shopId }] },
          scope ? manageableSiteWhere(scope) : { userId: session.user.id },
        ],
      },
      select: { id: true },
    });
    if (!site) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    const publicUrl = process.env.R2_PUBLIC_URL || "";
    const fullUrl = `${publicUrl}/${decodedKey}`;
    await deleteFile(fullUrl);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json(
      { error: "파일 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
