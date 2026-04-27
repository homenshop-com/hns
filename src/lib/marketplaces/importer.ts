import { prisma } from "@/lib/db";
import type { OrderChannel } from "@/generated/prisma/client";
import type { NormalizedOrder } from "./types";

/**
 * Persist a NormalizedOrder produced by a marketplace adapter.
 *
 * Responsibilities (kept out of adapters so logic is uniform):
 *   - Idempotent upsert on (integrationId, externalOrderId) — re-running
 *     a sync that returns the same order won't create duplicates. Scoped
 *     by integrationId so two seller accounts on the same marketplace
 *     don't collide (different shops can produce identical order IDs).
 *   - Resolve buyer → Customer row (create if first time seen, scoped by
 *     integration).
 *   - Resolve external SKU → internal Product via ProductChannelMapping
 *     (best-effort; null productId is allowed so unmapped items still
 *     import and the seller can map later).
 *
 * Returns counts so the cron can log per-integration progress.
 */

export interface ImportContext {
  siteId: string;
  userId: string;
  channel: OrderChannel;
  /// MarketplaceIntegration.id — required for marketplace imports.
  integrationId: string;
}

export interface ImportSummary {
  imported: number;
  updated: number;
  failed: number;
}

function generateOrderNumber(channel: OrderChannel, externalOrderId: string): string {
  // Marketplace orders carry the channel in the order number so they're
  // distinguishable in the dashboard listing without a separate column lookup.
  const prefix = channel.slice(0, 3).toUpperCase();
  // Truncate long external IDs but keep them recognisable.
  const tail = externalOrderId.slice(-12).toUpperCase();
  return `${prefix}-${tail}`;
}

async function resolveCustomer(
  ctx: ImportContext,
  customer: NormalizedOrder["customer"],
): Promise<string | null> {
  if (!customer) return null;
  if (!customer.externalId && !customer.email && !customer.phone) return null;

  // Marketplace external ID is the strongest signal. Fall back to email/phone
  // for storefront-style imports that don't expose a buyer ID.
  if (customer.externalId) {
    const existing = await prisma.customer.findUnique({
      where: {
        integrationId_externalId: {
          integrationId: ctx.integrationId,
          externalId: customer.externalId,
        },
      },
    });
    if (existing) {
      // Refresh contact info if the marketplace gave us better data this time.
      if (
        (customer.email && customer.email !== existing.email) ||
        (customer.phone && customer.phone !== existing.phone) ||
        (customer.name && customer.name !== existing.name)
      ) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: {
            email: customer.email ?? existing.email,
            phone: customer.phone ?? existing.phone,
            name: customer.name ?? existing.name,
          },
        });
      }
      return existing.id;
    }
    const created = await prisma.customer.create({
      data: {
        siteId: ctx.siteId,
        channel: ctx.channel,
        integrationId: ctx.integrationId,
        externalId: customer.externalId,
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        name: customer.name ?? null,
      },
    });
    return created.id;
  }

  // No external ID — best-effort match by email then phone within this integration.
  if (customer.email) {
    const existing = await prisma.customer.findFirst({
      where: { integrationId: ctx.integrationId, email: customer.email },
    });
    if (existing) return existing.id;
  }
  const created = await prisma.customer.create({
    data: {
      siteId: ctx.siteId,
      channel: ctx.channel,
      integrationId: ctx.integrationId,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      name: customer.name ?? null,
    },
  });
  return created.id;
}

async function resolveProductIds(
  integrationId: string,
  externalSkus: string[],
): Promise<Map<string, string>> {
  if (externalSkus.length === 0) return new Map();
  const mappings = await prisma.productChannelMapping.findMany({
    where: { integrationId, externalSku: { in: externalSkus } },
    select: { externalSku: true, productId: true },
  });
  return new Map(mappings.map((m) => [m.externalSku, m.productId]));
}

export async function importOrder(
  ctx: ImportContext,
  order: NormalizedOrder,
): Promise<"imported" | "updated"> {
  const productMap = await resolveProductIds(
    ctx.integrationId,
    order.items.map((i) => i.externalSku).filter(Boolean),
  );

  const existing = await prisma.order.findUnique({
    where: {
      integrationId_externalOrderId: {
        integrationId: ctx.integrationId,
        externalOrderId: order.externalOrderId,
      },
    },
  });

  if (existing) {
    // Update mutable fields only — items + identity are immutable to keep
    // a clean audit trail. Status and shipping info can change as the
    // marketplace flows through fulfilment.
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: order.status,
        shippingName: order.shippingName ?? existing.shippingName,
        shippingPhone: order.shippingPhone ?? existing.shippingPhone,
        shippingAddr: order.shippingAddr ?? existing.shippingAddr,
        shippingMemo: order.shippingMemo ?? existing.shippingMemo,
        externalRawJson: order.raw as object,
      },
    });
    return "updated";
  }

  const customerId = await resolveCustomer(ctx, order.customer);

  await prisma.order.create({
    data: {
      userId: ctx.userId,
      siteId: ctx.siteId,
      channel: ctx.channel,
      integrationId: ctx.integrationId,
      externalOrderId: order.externalOrderId,
      externalRawJson: order.raw as object,
      orderNumber: generateOrderNumber(ctx.channel, order.externalOrderId),
      orderType: "PRODUCT",
      status: order.status,
      totalAmount: order.totalAmount,
      shippingName: order.shippingName ?? null,
      shippingPhone: order.shippingPhone ?? null,
      shippingAddr: order.shippingAddr ?? null,
      shippingMemo: order.shippingMemo ?? null,
      customerId,
      createdAt: order.placedAt,
      items: {
        create: order.items.map((it) => ({
          productId: productMap.get(it.externalSku) ?? null,
          externalSku: it.externalSku,
          externalName: it.externalName,
          quantity: it.quantity,
          price: it.price,
        })),
      },
    },
  });
  return "imported";
}

export async function importOrders(
  ctx: ImportContext,
  orders: NormalizedOrder[],
): Promise<ImportSummary> {
  let imported = 0;
  let updated = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      const result = await importOrder(ctx, order);
      if (result === "imported") imported++;
      else updated++;
    } catch (err) {
      console.error(
        `[importer] ${ctx.channel} order ${order.externalOrderId} failed:`,
        err,
      );
      failed++;
    }
  }
  return { imported, updated, failed };
}
