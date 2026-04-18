import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadImageWithResize } from "@/lib/storage";

/**
 * POST /api/templates/my/[id]/thumbnail
 *
 * multipart/form-data { file: File }
 *
 * Uploads a thumbnail for an owner's template into /uploads/templates/thumbnails/
 * (with resize), then sets Template.thumbnailUrl to the `medium` variant.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = template.userId === session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isAdmin = user?.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 필요" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  // Basic guardrails
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
  }
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드 가능 (png/jpg/webp/gif)" },
      { status: 400 }
    );
  }

  let urls: Awaited<ReturnType<typeof uploadImageWithResize>>;
  try {
    urls = await uploadImageWithResize(file, "templates/thumbnails");
  } catch (err) {
    console.error("Thumbnail upload failed:", err);
    return NextResponse.json({ error: "썸네일 업로드 실패" }, { status: 500 });
  }

  // Use the medium variant as the main thumbnail (fallback to original)
  const thumbnailUrl = urls.medium || urls.original;

  const updated = await prisma.template.update({
    where: { id },
    data: { thumbnailUrl },
    select: { id: true, thumbnailUrl: true },
  });

  return NextResponse.json({ template: updated, thumbnailUrl });
}
