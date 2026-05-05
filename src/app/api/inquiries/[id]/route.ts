import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ALLOWED_STATUS = ["NEW", "READ", "REPLIED", "ARCHIVED"] as const;
type InquiryStatus = typeof ALLOWED_STATUS[number];

async function loadOwnedInquiry(userId: string, id: string) {
  const inq = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true, siteId: true, site: { select: { userId: true } } },
  });
  if (!inq || inq.site.userId !== userId) return null;
  return inq;
}

/** PATCH /api/inquiries/[id]  body: { status?: "NEW"|"READ"|"REPLIED"|"ARCHIVED" } */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await loadOwnedInquiry(session.user.id, id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const status = ALLOWED_STATUS.includes(body.status as InquiryStatus)
    ? (body.status as InquiryStatus)
    : null;
  if (!status) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const updated = await prisma.inquiry.update({
    where: { id },
    data: { status },
    select: { id: true, status: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, inquiry: updated });
}

/** DELETE /api/inquiries/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await loadOwnedInquiry(session.user.id, id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.inquiry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
