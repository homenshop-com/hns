import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getManageScope, canManage } from "@/lib/site-access";

/**
 * Whether the current scope may MANAGE a domain (view/delete): the site owner,
 * a reseller operator for the attributed customer site, or an ADMIN. Privileged
 * mutations (status / sslEnabled) remain admin-only and are gated separately.
 */
async function canManageDomain(domain: {
  userId: string;
  site: { userId: string; user: { resellerId: string | null } };
}): Promise<boolean> {
  const scope = await getManageScope();
  if (!scope) return false;
  return canManage(scope, {
    userId: domain.site.userId,
    ownerResellerId: domain.site.user.resellerId,
  });
}

const DOMAIN_SCOPE_INCLUDE = {
  site: { select: { id: true, name: true, userId: true, user: { select: { resellerId: true } } } },
  user: { select: { id: true, email: true, name: true } },
} as const;

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
    include: DOMAIN_SCOPE_INCLUDE,
  });

  if (!domain) {
    return NextResponse.json(
      { error: "도메인을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Owner / reseller-for-customer / admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (user?.role !== "ADMIN" && !(await canManageDomain(domain))) {
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

  const domain = await prisma.domain.findUnique({
    where: { id },
    include: DOMAIN_SCOPE_INCLUDE,
  });
  if (!domain) {
    return NextResponse.json(
      { error: "도메인을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Owner / reseller-for-customer / admin may reach here; the actual
  // status/sslEnabled mutations below stay strictly admin-only.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (user?.role !== "ADMIN" && !(await canManageDomain(domain))) {
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
    include: DOMAIN_SCOPE_INCLUDE,
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

  const domain = await prisma.domain.findUnique({
    where: { id },
    include: DOMAIN_SCOPE_INCLUDE,
  });
  if (!domain) {
    return NextResponse.json(
      { error: "도메인을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Owner / reseller-for-customer / admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (user?.role !== "ADMIN" && !(await canManageDomain(domain))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.domain.delete({ where: { id } });

  return NextResponse.json({ message: "도메인이 삭제되었습니다." });
}
