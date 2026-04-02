import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (adminUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const domain = await prisma.domain.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      site: { select: { id: true, name: true } },
    },
  });

  if (!domain) {
    return NextResponse.json(
      { error: "도메인을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json(domain);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (adminUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status, sslEnabled } = body;

  const updateData: Record<string, unknown> = {};

  if (status) {
    const validStatuses = ["PENDING", "ACTIVE", "EXPIRED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "유효하지 않은 상태입니다." },
        { status: 400 }
      );
    }
    updateData.status = status;
  }

  if (typeof sslEnabled === "boolean") {
    updateData.sslEnabled = sslEnabled;
  }

  const updated = await prisma.domain.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, email: true, name: true } },
      site: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}
