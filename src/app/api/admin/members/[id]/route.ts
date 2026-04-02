import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const memberSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  sites: {
    select: {
      id: true,
      name: true,
      shopId: true,
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

async function checkAdmin(session: any) {
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "ADMIN" ? user : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!await checkAdmin(session)) {
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

  return NextResponse.json(member);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!await checkAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { role, status, name, phone, email } = body;

  const validRoles = ["ADMIN", "RESELLER", "MEMBER"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: "유효하지 않은 역할입니다." }, { status: 400 });
  }

  const validStatuses = ["ACTIVE", "SUSPENDED", "DELETED"];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "유효하지 않은 상태입니다." }, { status: 400 });
  }

  if (id === session!.user.id && role && role !== "ADMIN") {
    return NextResponse.json({ error: "자기 자신의 관리자 권한은 변경할 수 없습니다." }, { status: 400 });
  }

  // Check email uniqueness if changing
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 400 });
    }
  }

  const updateData: Record<string, string> = {};
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (email) updateData.email = email;

  const updatedMember = await prisma.user.update({
    where: { id },
    select: memberSelect,
    data: updateData,
  });

  return NextResponse.json(updatedMember);
}
