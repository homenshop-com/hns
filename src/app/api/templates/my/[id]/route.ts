import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * PATCH /api/templates/my/[id]
 *
 * Lets the template owner (or ADMIN) rename it, change description, or
 * change the thumbnail URL. Use /thumbnail for file uploads.
 *
 * Request body: { name?, description?, thumbnailUrl?, category? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: {
    name?: unknown;
    description?: unknown;
    thumbnailUrl?: unknown;
    category?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Owner-or-admin gate
  const isOwner = template.userId === session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isAdmin = user?.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build update payload — only include fields that were actually supplied
  // and pass validation. `null` is a valid "clear" value for the nullable
  // string fields (description / thumbnailUrl).
  const data: {
    name?: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    category?: string;
  } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "이름이 비어 있습니다." }, { status: 400 });
    }
    if (body.name.trim().length > 100) {
      return NextResponse.json({ error: "이름은 100자 이하여야 합니다." }, { status: 400 });
    }
    data.name = body.name.trim();
  }

  if (body.description !== undefined) {
    if (body.description === null || body.description === "") {
      data.description = null;
    } else if (typeof body.description === "string") {
      data.description = body.description.trim().slice(0, 2000);
    } else {
      return NextResponse.json({ error: "description 형식이 잘못되었습니다." }, { status: 400 });
    }
  }

  if (body.thumbnailUrl !== undefined) {
    if (body.thumbnailUrl === null || body.thumbnailUrl === "") {
      data.thumbnailUrl = null;
    } else if (typeof body.thumbnailUrl === "string") {
      const url = body.thumbnailUrl.trim();
      // allow absolute /uploads/... paths and http(s) URLs only
      if (!/^(?:https?:\/\/|\/)/i.test(url)) {
        return NextResponse.json(
          { error: "썸네일 URL 형식이 잘못되었습니다." },
          { status: 400 }
        );
      }
      data.thumbnailUrl = url.slice(0, 500);
    } else {
      return NextResponse.json({ error: "thumbnailUrl 형식이 잘못되었습니다." }, { status: 400 });
    }
  }

  if (body.category !== undefined) {
    if (typeof body.category !== "string") {
      return NextResponse.json({ error: "category 형식이 잘못되었습니다." }, { status: 400 });
    }
    data.category = body.category.trim().slice(0, 50) || "custom";
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "변경할 필드가 없습니다." }, { status: 400 });
  }

  const updated = await prisma.template.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      category: true,
      isPublic: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ template: updated });
}
