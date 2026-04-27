/**
 * Backfill Order.siteId from OrderItem.product.siteId.
 *
 * Run on server: npx tsx scripts/backfill-order-siteid.ts
 *
 * See header comment in scripts/backfill-order-siteid.mjs (kept for
 * reference). Prisma 7 generates TypeScript-only client; .mjs can't
 * import it without tsx, so the canonical script is .ts.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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
