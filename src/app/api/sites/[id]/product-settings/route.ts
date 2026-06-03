import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageSite } from "@/lib/site-access";

/**
 * Partial update for Site.productSettings (JSON column).
 *
 * The settings JSON now spans two logically distinct concerns:
 *   · Product display (itemsPerRow/totalRows/thumbW/thumbH/detailWidth/buttonMode)
 *   · Site-wide search (searchEnabled/boardSearchEnabled)
 *
 * They're saved by separate UI panels (ProductSettings vs SearchSettings),
 * so we merge per-field instead of overwriting — sending only the fields
 * the caller actually changed. Missing fields preserve their existing DB
 * value; legacy callers that still send the full product-display payload
 * keep working unchanged.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site || !(await canManageSite(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  // Concrete shape so Prisma's JSON column types accept it without casts.
  type Settings = {
    itemsPerRow?: number; totalRows?: number;
    thumbWidth?: number; thumbHeight?: number; detailWidth?: number;
    buttonMode?: "sales" | "inquiry" | "none";
    searchEnabled?: boolean; boardSearchEnabled?: boolean;
  };
  // Start from whatever's already saved so omitted fields are preserved.
  const existing = (site.productSettings ?? {}) as Settings;
  const merged: Settings = { ...existing };

  // Product display fields
  if (has("itemsPerRow")) merged.itemsPerRow = Math.max(1, Math.min(10, Number(body.itemsPerRow) || 4));
  if (has("totalRows"))   merged.totalRows   = Math.max(1, Math.min(50, Number(body.totalRows) || 10));
  if (has("thumbWidth"))  merged.thumbWidth  = Math.max(50, Math.min(500, Number(body.thumbWidth) || 135));
  if (has("thumbHeight")) merged.thumbHeight = Math.max(50, Math.min(500, Number(body.thumbHeight) || 135));
  if (has("detailWidth")) merged.detailWidth = Math.max(100, Math.min(1200, Number(body.detailWidth) || 500));

  if (has("buttonMode")) {
    // "sales"   — [구매하기] + [바로구매]  (general retail)
    // "inquiry" — [Send inquiry]           (export / B2B sites)
    // "none"    — no buttons (display-only catalog)
    const validModes = ["sales", "inquiry", "none"] as const;
    type ButtonMode = typeof validModes[number];
    merged.buttonMode = validModes.includes(body.buttonMode as ButtonMode)
      ? (body.buttonMode as ButtonMode)
      : "sales";
  }

  // Search fields
  if (has("searchEnabled"))      merged.searchEnabled      = body.searchEnabled === true;
  if (has("boardSearchEnabled")) merged.boardSearchEnabled = body.boardSearchEnabled !== false;

  await prisma.site.update({
    where: { id },
    data: { productSettings: merged },
  });

  return NextResponse.json({ ok: true, settings: merged });
}
