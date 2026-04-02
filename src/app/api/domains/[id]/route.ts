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

  const { id } = await params;

  const domain = await prisma.domain.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!domain) {
    return NextResponse.json(
      { error: "도메인을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Only owner or admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (domain.userId !== session.user.id && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const { id } = await params;

  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain) {
    return NextResponse.json(
      { error: "도메인을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Only owner or admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (domain.userId !== session.user.id && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    // Only admin can change status
    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "상태 변경은 관리자만 가능합니다." },
        { status: 403 }
      );
    }
    updateData.status = status;
  }

  if (typeof sslEnabled === "boolean") {
    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "SSL 설정 변경은 관리자만 가능합니다." },
        { status: 403 }
      );
    }
    updateData.sslEnabled = sslEnabled;
  }

  const updated = await prisma.domain.update({
    where: { id },
    data: updateData,
    include: {
      site: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain) {
    return NextResponse.json(
      { error: "도메인을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Only owner or admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (domain.userId !== session.user.id && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.domain.delete({ where: { id } });

  return NextResponse.json({ message: "도메인이 삭제되었습니다." });
}
