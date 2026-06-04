import "server-only";
import { promises as fs } from "fs";
import { join } from "path";

/**
 * Best-effort server-side copy of a site's upload folders when cloning into a
 * new shopId. The published renderer builds image URLs from the site's own
 * shopId (…/{shopId}/uploaded/…), so a faithful clone needs the underlying
 * files duplicated alongside the DB clone (which rewrites the stored paths).
 *
 * Failure here NEVER undoes the DB clone — images can be re-copied later — so
 * every operation is guarded and the result simply reports what was copied.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/uploads";
const LEGACY_DATA_DIR =
  process.env.LEGACY_DATA_DIR || "/var/www/legacy-data/userdata";

/** Recursively copy src→dest when src exists. Never throws. */
async function copyIfExists(src: string, dest: string): Promise<boolean> {
  try {
    await fs.access(src);
  } catch {
    return false; // source absent (e.g. local dev) — skip silently
  }
  try {
    await fs.cp(src, dest, { recursive: true, force: false, errorOnExist: false });
    return true;
  } catch (e) {
    console.error("[clone] asset copy failed", src, "→", dest, e);
    return false;
  }
}

export type AssetsCopied = { legacy: boolean; siteUploads: boolean };

/** Copy both legacy + site-uploads folders for oldShopId → newShopId. */
export async function copySiteAssets(
  oldShopId: string,
  newShopId: string,
): Promise<AssetsCopied> {
  return {
    legacy: await copyIfExists(
      join(LEGACY_DATA_DIR, oldShopId),
      join(LEGACY_DATA_DIR, newShopId),
    ),
    siteUploads: await copyIfExists(
      join(UPLOAD_DIR, "site-uploads", oldShopId),
      join(UPLOAD_DIR, "site-uploads", newShopId),
    ),
  };
}
