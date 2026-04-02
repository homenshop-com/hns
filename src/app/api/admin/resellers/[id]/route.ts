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

  const reseller = await prisma.reseller.findUnique({
    where: { id },
  });

  if (!reseller) {
    return NextResponse.json(
      { error: "리셀러를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json(reseller);
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
  const { domain, siteName, logo, copyright, analytics, isActive } = body;

  // If domain changed, check uniqueness
  if (domain) {
    const existing = await prisma.reseller.findUnique({
      where: { domain },
    });
    if (existing && existing.id !== id) {
      return NextResponse.json(
        { error: "이미 사용 중인 도메인입니다." },
        { status: 409 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (domain !== undefined) updateData.domain = domain;
  if (siteName !== undefined) updateData.siteName = siteName;
  if (logo !== undefined) updateData.logo = logo || null;
  if (copyright !== undefined) updateData.copyright = copyright || null;
  if (analytics !== undefined) updateData.analytics = analytics || null;
  if (typeof isActive === "boolean") updateData.isActive = isActive;

  const updated = await prisma.reseller.update({
    where: { id },
    data: updateData,
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

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (adminUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  await prisma.reseller.delete({ where: { id } });

  return NextResponse.json({ message: "리셀러가 삭제되었습니다." });
}
