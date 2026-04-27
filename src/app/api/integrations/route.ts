import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/secrets";
import { getAdapter } from "@/lib/marketplaces/registry";
import type { OrderChannel } from "@/generated/prisma/client";
import type { MarketplaceCredentials } from "@/lib/marketplaces/types";

/**
 * Marketplace integration management — multi-account aware.
 *
 * GET    /api/integrations?siteId=...        — list ALL integrations
 *                                               for the site (multiple per
 *                                               channel allowed)
 * POST   /api/integrations                   — create new account
 *   body: { siteId, channel, label, credentials, integrationId? }
 *   if integrationId is set, updates that one (re-auth / key rotation)
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

async function assertIntegrationOwner(integrationId: string, userId: string) {
  const integ = await prisma.marketplaceIntegration.findUnique({
    where: { id: integrationId },
    include: { site: { select: { userId: true } } },
  });
  if (!integ || integ.site.userId !== userId) throw new Error("FORBIDDEN");
  return integ;
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
      label: true,
      displayName: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      // Never expose credentials over the API.
    },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
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
    label?: string;
    credentials?: MarketplaceCredentials;
    /// If provided, updates the existing row (re-auth / key rotation).
    /// Otherwise creates a new row — multiple per channel are allowed.
    integrationId?: string;
  };
  const { siteId, channel, label, credentials, integrationId } = body;
  if (!siteId || !channel || !credentials || !label?.trim()) {
    return NextResponse.json(
      { error: "siteId, channel, label, credentials required" },
      { status: 400 },
    );
  }
  if (!VALID_CHANNELS.includes(channel as OrderChannel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  try {
    await assertSiteOwner(siteId, session.user.id);
    if (integrationId) {
      const existing = await assertIntegrationOwner(integrationId, session.user.id);
      if (existing.siteId !== siteId || existing.channel !== channel) {
        return NextResponse.json(
          { error: "integrationId mismatch with siteId/channel" },
          { status: 400 },
        );
      }
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adapter = getAdapter(channel as OrderChannel);
  if (!adapter) {
    return NextResponse.json({ error: "No adapter" }, { status: 400 });
  }

  // Validate credentials against the live API before persisting.
  // For stub adapters we still allow saving so the seller can pre-fill keys.
  const verify = adapter.implemented
    ? await adapter.verifyCredentials(credentials)
    : { ok: false, message: "adapter not implemented" };

  const status = verify.ok ? "ACTIVE" : (adapter.implemented ? "ERROR" : "DISCONNECTED");

  if (integrationId) {
    await prisma.marketplaceIntegration.update({
      where: { id: integrationId },
      data: {
        label: label.trim(),
        credentials: encryptJson(credentials),
        status,
        lastError: verify.ok ? null : verify.message ?? "verification failed",
      },
    });
    return NextResponse.json({ ok: true, integrationId, status, message: verify.message });
  }
  const created = await prisma.marketplaceIntegration.create({
    data: {
      siteId,
      channel: channel as OrderChannel,
      label: label.trim(),
      credentials: encryptJson(credentials),
      status,
      lastError: verify.ok ? null : verify.message ?? null,
    },
  });
  return NextResponse.json({
    ok: true,
    integrationId: created.id,
    status,
    message: verify.message,
  });
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
  try {
    await assertIntegrationOwner(integrationId, session.user.id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.marketplaceIntegration.delete({ where: { id: integrationId } });
  return NextResponse.json({ ok: true });
}
