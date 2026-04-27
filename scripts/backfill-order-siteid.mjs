#!/usr/bin/env node
/**
 * Backfill Order.siteId from OrderItem.product.siteId.
 *
 * Why: Phase 1 of the unified order management overhaul added siteId to
 * Order. Existing PRODUCT orders predate the column. We can recover it
 * because every OrderItem has a productId, and every Product has a siteId.
 *
 * Strategy:
 *   - For each PRODUCT order with siteId == null, look at its OrderItems.
 *   - All items in one order should belong to the same site (validated at
 *     creation time in /api/storefront/orders), so we take the first item's
 *     product.siteId and set it on the order.
 *   - Orders with no items (orphaned) are skipped and logged.
 *
 * CREDIT_PACK and SUBSCRIPTION orders are platform-level and stay siteId
 * null by design (subscriptionSiteId is the right pointer for SUBSCRIPTION).
 *
 * Run: node scripts/backfill-order-siteid.mjs
 */

// Note: scripts run via Node, not Next/TS. We use the @prisma/client package
// (not the per-project generated dir) because tsx isn't required here.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orphanOrders = await prisma.order.findMany({
    where: {
      siteId: null,
      orderType: "PRODUCT",
    },
    include: {
      items: {
        include: {
          product: { select: { siteId: true } },
        },
        take: 1,
      },
    },
  });

  console.log(`Found ${orphanOrders.length} PRODUCT orders without siteId.`);

  let updated = 0;
  let skipped = 0;
  for (const order of orphanOrders) {
    const firstItem = order.items[0];
    if (!firstItem || !firstItem.product) {
      console.warn(
        `Skipping ${order.id} (${order.orderNumber}) — no items / product`,
      );
      skipped++;
      continue;
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { siteId: firstItem.product.siteId },
    });
    updated++;
  }

  console.log(`Updated ${updated}, skipped ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
