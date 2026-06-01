import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminAccess } from "@/lib/admin-access";

const memberSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  resellerId: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
  sites: {
    select: {
      id: true,
      name: true,
      shopId: true,
      tempDomain: true,
      published: true,
    },
  },
  _count: {
    select: {
      orders: true,
      domains: true,
    },
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const member = await prisma.user.findUnique({
    where: { id },
    select: memberSelect,
  });

  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다." }, { status: 404 });
  }

  if (access.kind === "reseller" && member.resellerId !== access.resellerId) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(member);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { role, status, name, phone, email, emailVerified } = body;

  const validRoles = ["ADMIN", "RESELLER", "MEMBER"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: "유효하지 않은 역할입니다." }, { status: 400 });
  }

  // Reseller operators may only edit their own attributed members, and may
  // not escalate a member to ADMIN/RESELLER tiers.
  if (access.kind === "reseller") {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { resellerId: true },
    });
    if (!target || target.resellerId !== access.resellerId) {
      return NextResponse.json({ error: "회원을 찾을 수 없습니다." }, { status: 404 });
    }
    if (role && role !== "MEMBER") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  const validStatuses = ["ACTIVE", "SUSPENDED", "DELETED"];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "유효하지 않은 상태입니다." }, { status: 400 });
  }

  if (id === access.userId && role && role !== "ADMIN") {
    return NextResponse.json({ error: "자기 자신의 관리자 권한은 변경할 수 없습니다." }, { status: 400 });
  }

  // Check email uniqueness if changing
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 400 });
    }
  }

  const updateData: Record<string, string | Date | null> = {};
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (email) updateData.email = email;
  if (emailVerified !== undefined) {
    updateData.emailVerified = emailVerified ? new Date() : null;
  }

  const updatedMember = await prisma.user.update({
    where: { id },
    select: memberSelect,
    data: updateData,
  });

  return NextResponse.json(updatedMember);
}
