import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/secrets";
import { getAdapter } from "@/lib/marketplaces/registry";
import type { OrderChannel } from "@/generated/prisma/client";
import type { MarketplaceCredentials } from "@/lib/marketplaces/types";

/**
 * Marketplace integration management — user-scoped, multi-account.
 *
 * GET    /api/integrations                   — list ALL integrations
 *                                               for the current user
 * POST   /api/integrations                   — create / update an integration
 *   body: { channel, label, credentials, integrationId?, siteId? }
 *     siteId is optional — links the integration to a specific homenshop
 *     site for inventory/customer association, but is not required.
 *     integrationId is optional — when present, updates that row.
 * DELETE /api/integrations?integrationId=... — remove an integration
 *
 * Authorization: caller must own the integration / site referenced.
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
    select: { userId: true, channel: true, siteId: true, id: true },
  });
  if (!integ || integ.userId !== userId) throw new Error("FORBIDDEN");
  return integ;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Optional: filter by siteId if caller wants only those associated
  // with a specific site. Default returns all user-owned integrations.
  const siteId = request.nextUrl.searchParams.get("siteId");
  const where = siteId
    ? { userId: session.user.id, siteId }
    : { userId: session.user.id };
  const integrations = await prisma.marketplaceIntegration.findMany({
    where,
    select: {
      id: true,
      channel: true,
      label: true,
      displayName: true,
      siteId: true,
      site: { select: { name: true, shopId: true } },
      status: true,
      lastSyncAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
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
    channel?: string;
    label?: string;
    credentials?: MarketplaceCredentials;
    integrationId?: string;
    siteId?: string | null;
  };
  const { channel, label, credentials, integrationId, siteId } = body;
  if (!channel || !credentials || !label?.trim()) {
    return NextResponse.json(
      { error: "channel, label, credentials required" },
      { status: 400 },
    );
  }
  if (!VALID_CHANNELS.includes(channel as OrderChannel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  try {
    if (siteId) await assertSiteOwner(siteId, session.user.id);
    if (integrationId) {
      const existing = await assertIntegrationOwner(integrationId, session.user.id);
      if (existing.channel !== channel) {
        return NextResponse.json(
          { error: "channel mismatch with integrationId" },
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

  const verify = adapter.implemented
    ? await adapter.verifyCredentials(credentials)
    : { ok: false, message: "adapter not implemented" };

  const status = verify.ok ? "ACTIVE" : (adapter.implemented ? "ERROR" : "DISCONNECTED");

  if (integrationId) {
    await prisma.marketplaceIntegration.update({
      where: { id: integrationId },
      data: {
        label: label.trim(),
        siteId: siteId ?? null,
        credentials: encryptJson(credentials),
        status,
        lastError: verify.ok ? null : verify.message ?? "verification failed",
      },
    });
    return NextResponse.json({ ok: true, integrationId, status, message: verify.message });
  }
  const created = await prisma.marketplaceIntegration.create({
    data: {
      userId: session.user.id,
      siteId: siteId ?? null,
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
