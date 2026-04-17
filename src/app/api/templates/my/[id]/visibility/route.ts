import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * PATCH /api/templates/my/[id]/visibility
 *
 * Toggles the owner's template between private ("나의 템플릿") and public
 * ("공개 템플릿"). Only the owner (or ADMIN) can change this.
 *
 * Request body: { isPublic: boolean }
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

  let body: { isPublic?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.isPublic !== "boolean") {
    return NextResponse.json(
      { error: "isPublic (boolean) is required" },
      { status: 400 }
    );
  }

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Owner-or-admin check
  const isOwner = template.userId === session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isAdmin = user?.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.template.update({
    where: { id },
    data: { isPublic: body.isPublic },
    select: { id: true, name: true, isPublic: true, updatedAt: true },
  });

  return NextResponse.json({ template: updated });
}
