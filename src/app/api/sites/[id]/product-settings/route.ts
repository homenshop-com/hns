import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { itemsPerRow, totalRows, thumbWidth, thumbHeight, detailWidth, buttonMode, searchEnabled, boardSearchEnabled } = body;

  // buttonMode controls the CTA buttons rendered on the product detail page:
  //   "sales"   — [구매하기] + [바로구매]  (general retail)
  //   "inquiry" — [Send inquiry]           (export / B2B sites)
  //   "none"    — no buttons (display-only catalog)
  const validModes = ["sales", "inquiry", "none"] as const;
  type ButtonMode = typeof validModes[number];
  const safeButtonMode: ButtonMode = validModes.includes(buttonMode as ButtonMode)
    ? (buttonMode as ButtonMode)
    : "sales";

  const settings = {
    itemsPerRow: Math.max(1, Math.min(10, Number(itemsPerRow) || 4)),
    totalRows: Math.max(1, Math.min(50, Number(totalRows) || 10)),
    thumbWidth: Math.max(50, Math.min(500, Number(thumbWidth) || 135)),
    thumbHeight: Math.max(50, Math.min(500, Number(thumbHeight) || 135)),
    detailWidth: Math.max(100, Math.min(1200, Number(detailWidth) || 500)),
    buttonMode: safeButtonMode,
    // Opt-in unified search box (products + board) in the published header.
    searchEnabled: searchEnabled === true,
    // Whether the search includes board posts. Defaults to true so the search
    // covers both products and board unless the owner narrows it.
    boardSearchEnabled: boardSearchEnabled !== false,
  };

  await prisma.site.update({
    where: { id },
    data: { productSettings: settings },
  });

  return NextResponse.json({ ok: true, settings });
}
