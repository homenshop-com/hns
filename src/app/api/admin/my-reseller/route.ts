import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminAccess } from "@/lib/admin-access";

/**
 * Self-service reseller settings for a reseller operator.
 *
 * Unlike /api/admin/resellers/[id] (full-admin only), this endpoint always
 * operates on the *caller's own* reseller (admin-access.resellerId). It exposes
 * a strict whitelist of white-label/branding fields and never lets the operator
 * touch domain, revenue-share, owner mapping, active flag, or delete — those
 * stay platform-admin-only and are enforced here on the server, regardless of
 * what the client submits.
 */

// Fields a reseller operator is allowed to edit on their own record.
const EDITABLE = [
  "siteName",
  "logo",
  "copyright",
  "analytics",
  "metaTitle",
  "metaDescription",
  "metaKeywords",
] as const;

export async function GET() {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.kind !== "reseller") {
    return NextResponse.json(
      { error: "리셀러 운영자 전용 페이지입니다." },
      { status: 403 }
    );
  }

  const reseller = await prisma.reseller.findUnique({
    where: { id: access.resellerId },
    select: {
      id: true,
      domain: true,
      siteName: true,
      logo: true,
      copyright: true,
      analytics: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
      revenueShareBps: true,
      isActive: true,
    },
  });

  if (!reseller) {
    return NextResponse.json(
      { error: "리셀러를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json(reseller);
}

export async function PUT(request: NextRequest) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.kind !== "reseller") {
    return NextResponse.json(
      { error: "리셀러 운영자 전용 페이지입니다." },
      { status: 403 }
    );
  }

  const body = await request.json();

  // Build update strictly from the whitelist — anything else (domain,
  // revenueShareBps, ownerUserId, isActive, …) is silently ignored.
  const updateData: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) {
      const v = body[key];
      // siteName is required; the rest fall back to null when blanked.
      if (key === "siteName") {
        if (typeof v !== "string" || !v.trim()) {
          return NextResponse.json(
            { error: "사이트명은 필수입니다." },
            { status: 400 }
          );
        }
        updateData[key] = v.trim();
      } else {
        updateData[key] = typeof v === "string" && v.trim() ? v : null;
      }
    }
  }

  const updated = await prisma.reseller.update({
    where: { id: access.resellerId },
    data: updateData,
    select: {
      id: true,
      domain: true,
      siteName: true,
      logo: true,
      copyright: true,
      analytics: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
      revenueShareBps: true,
      isActive: true,
    },
  });

  return NextResponse.json(updated);
}
