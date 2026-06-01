import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminAccess } from "@/lib/admin-access";

// Returns true if the caller may operate on this site (full admin, or the
// reseller the site's owner is attributed to). Returns false otherwise.
async function canAccessSite(siteId: string): Promise<boolean> {
  const access = await getAdminAccess();
  if (!access) return false;
  if (access.kind === "admin") return true;
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { user: { select: { resellerId: true } } },
  });
  return !!site && site.user.resellerId === access.resellerId;
}

const VALID_ACCOUNT_TYPES = new Set(["0", "1", "2", "9"]);

/**
 * PATCH /api/admin/sites/[id]
 *
 * Update admin-only fields on a Site. Currently supports:
 *   · expiresAt — ISO string | null (null = 무기한 / 만료 해제)
 *   · accountType — "0" | "1" | "2" | "9"
 *
 * Bodies can mix fields. Partial updates. Returns the updated site.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canAccessSite(id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    expiresAt?: string | null;
    accountType?: string;
  };

  const data: { expiresAt?: Date | null; accountType?: string } = {};

  if ("expiresAt" in body) {
    if (body.expiresAt === null || body.expiresAt === "") {
      data.expiresAt = null;
    } else if (typeof body.expiresAt === "string") {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
      }
      data.expiresAt = d;
    }
  }

  if ("accountType" in body) {
    if (!VALID_ACCOUNT_TYPES.has(body.accountType || "")) {
      return NextResponse.json({ error: "Invalid accountType" }, { status: 400 });
    }
    data.accountType = body.accountType;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const site = await prisma.site.update({
      where: { id },
      data,
      select: {
        id: true,
        shopId: true,
        accountType: true,
        expiresAt: true,
        published: true,
      },
    });
    return NextResponse.json(site);
  } catch (err) {
    console.error("[admin/sites PATCH]", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
