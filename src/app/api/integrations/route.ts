import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/secrets";
import { getAdapter } from "@/lib/marketplaces/registry";
import type { OrderChannel } from "@/generated/prisma/client";
import type { MarketplaceCredentials } from "@/lib/marketplaces/types";

/**
 * Marketplace integration management.
 *
 * GET    /api/integrations?siteId=...        — list integrations for the site
 * POST   /api/integrations                   — create / replace credentials
 * DELETE /api/integrations?integrationId=... — remove an integration
 *
 * Authorization: caller must own the site (Site.userId === session.user.id).
 */

const VALID_CHANNELS: OrderChannel[] = [
  "SHOPIFY",
  "COUPANG",
  "AMAZON",
  "QOO10",
  "RAKUTEN",
  "TIKTOKSHOP",
];

async function assertSiteOwner(siteId: string, userId: string) {
  const site = await prisma.site.findFirst({
    where: { id: siteId, userId },
    select: { id: true },
  });
  if (!site) throw new Error("FORBIDDEN");
  return site;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  try {
    await assertSiteOwner(siteId, session.user.id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const integrations = await prisma.marketplaceIntegration.findMany({
    where: { siteId },
    select: {
      id: true,
      channel: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      // Never expose credentials over the API.
    },
  });
  return NextResponse.json({ integrations });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    siteId?: string;
    channel?: string;
    credentials?: MarketplaceCredentials;
  };
  const { siteId, channel, credentials } = body;
  if (!siteId || !channel || !credentials) {
    return NextResponse.json(
      { error: "siteId, channel, credentials required" },
      { status: 400 },
    );
  }
  if (!VALID_CHANNELS.includes(channel as OrderChannel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  try {
    await assertSiteOwner(siteId, session.user.id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adapter = getAdapter(channel as OrderChannel);
  if (!adapter) {
    return NextResponse.json({ error: "No adapter" }, { status: 400 });
  }

  // Validate credentials against the live API before persisting.
  // For stub adapters (implemented:false) we still allow saving so the
  // seller can pre-fill keys; status stays DISCONNECTED until the adapter
  // is implemented.
  const verify = adapter.implemented
    ? await adapter.verifyCredentials(credentials)
    : { ok: false, message: "adapter not implemented" };

  const status = verify.ok ? "ACTIVE" : (adapter.implemented ? "ERROR" : "DISCONNECTED");

  const existing = await prisma.marketplaceIntegration.findUnique({
    where: { siteId_channel: { siteId, channel: channel as OrderChannel } },
  });
  if (existing) {
    await prisma.marketplaceIntegration.update({
      where: { id: existing.id },
      data: {
        credentials: encryptJson(credentials),
        status,
        lastError: verify.ok ? null : verify.message ?? "verification failed",
      },
    });
  } else {
    await prisma.marketplaceIntegration.create({
      data: {
        siteId,
        channel: channel as OrderChannel,
        credentials: encryptJson(credentials),
        status,
        lastError: verify.ok ? null : verify.message ?? null,
      },
    });
  }
  return NextResponse.json({ ok: true, status, message: verify.message });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const integrationId = request.nextUrl.searchParams.get("integrationId");
  if (!integrationId) {
    return NextResponse.json({ error: "integrationId required" }, { status: 400 });
  }
  const integration = await prisma.marketplaceIntegration.findUnique({
    where: { id: integrationId },
    include: { site: { select: { userId: true } } },
  });
  if (!integration || integration.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.marketplaceIntegration.delete({ where: { id: integrationId } });
  return NextResponse.json({ ok: true });
}
