import type { OrderChannel } from "@/generated/prisma/client";
import type { MarketplaceAdapter } from "./types";
import { shopifyAdapter } from "./shopify";
import { coupangAdapter } from "./coupang";
import { amazonAdapter } from "./amazon";
import { qoo10Adapter } from "./qoo10";
import { rakutenAdapter } from "./rakuten";
import { tiktokshopAdapter } from "./tiktokshop";

/**
 * Single source of truth for marketplace adapters.
 *
 * Add a new marketplace by:
 *   1. Adding a value to the OrderChannel enum in schema.prisma.
 *   2. Implementing src/lib/marketplaces/<channel>.ts (see types.ts).
 *   3. Registering it here.
 */

const adapters: Record<OrderChannel, MarketplaceAdapter | null> = {
  STOREFRONT: null, // native — no adapter
  SHOPIFY: shopifyAdapter,
  COUPANG: coupangAdapter,
  AMAZON: amazonAdapter,
  QOO10: qoo10Adapter,
  RAKUTEN: rakutenAdapter,
  TIKTOKSHOP: tiktokshopAdapter,
};

export function getAdapter(channel: OrderChannel): MarketplaceAdapter | null {
  return adapters[channel];
}

/** All adapters except STOREFRONT — used by the integrations UI. */
export function listAdapters(): MarketplaceAdapter[] {
  return Object.values(adapters).filter(
    (a): a is MarketplaceAdapter => a !== null,
  );
}
