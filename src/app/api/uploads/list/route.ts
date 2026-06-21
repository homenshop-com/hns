/**
 * List recent uploads for a site — powers the design editor's 에셋 tab.
 *
 * Scope: requires session auth. Uploads are stored under
 *   {UPLOAD_DIR}/site-uploads/{siteId}/...
 * by the design-editor's `/api/upload` callers (Inspector image / bg
 * sections, CanvasOverlay replace button) when they pass `siteId`.
 *
 * Older uploads from before site scoping live at the unsloped path
 *   {UPLOAD_DIR}/site-uploads/...
 * — to keep the gallery useful for existing sites we fall back to that
 * folder when the site-specific one is empty.
 *
 * Returns up to `limit` items sorted newest-first by mtime.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";
import { readdir, stat } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/uploads";
const UPLOAD_URL = process.env.UPLOAD_URL || "/uploads";
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30") || 30, 100);

  if (!siteId || !/^[a-z0-9_-]+$/i.test(siteId)) {
    return NextResponse.json({ error: "siteId 누락 또는 형식 오류." }, { status: 400 });
  }

  // Verify the user owns this site + resolve to shopId. Without this,
  // knowing a siteId would let any logged-in user see another site's
  // uploads. Accepts either internal siteId (cuid) or shopId.
  const scope = await getManageScope();
  const site = await prisma.site.findFirst({
    where: {
      AND: [
        { OR: [{ id: siteId }, { shopId: siteId }] },
        scope ? manageableSiteWhere(scope) : { userId: session.user.id },
      ],
    },
    select: { id: true, shopId: true },
  });
  if (!site) {
    return NextResponse.json({ error: "사이트 권한 없음." }, { status: 403 });
  }

  // shopId-keyed folder (e.g. /uploads/site-uploads/ybsurplus-com/).
  // Falls back to siteId-keyed folder for sites not yet migrated — both
  // are scanned and merged. Migration script renames the old folder.
  const shopDir = join(UPLOAD_DIR, "site-uploads", site.shopId);
  const legacySiteDir = join(UPLOAD_DIR, "site-uploads", site.id);
  const legacyDir = join(UPLOAD_DIR, "site-uploads");

  type Item = { url: string; name: string; mtime: number; size: number };
  const items: Item[] = [];

  async function collect(dir: string, urlPrefix: string) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return; // dir doesn't exist yet — fine
    }
    for (const name of entries) {
      const lower = name.toLowerCase();
      const dot = lower.lastIndexOf(".");
      if (dot < 0 || !IMAGE_EXTS.has(lower.slice(dot))) continue;
      try {
        const full = join(dir, name);
        const st = await stat(full);
        if (!st.isFile()) continue;
        items.push({
          url: `${urlPrefix}/${name}`,
          name,
          mtime: st.mtimeMs,
          size: st.size,
        });
      } catch {
        // Skip unreadable entries.
      }
    }
  }

  await collect(shopDir, `${UPLOAD_URL}/site-uploads/${site.shopId}`);
  // Legacy: pre-migration siteId-keyed folder (cuid). Merge so old URLs
  // still surface in the asset picker until the migration script runs.
  await collect(legacySiteDir, `${UPLOAD_URL}/site-uploads/${site.id}`);
  // NOTE: we intentionally do NOT fall back to the shared, unscoped
  // `{UPLOAD_DIR}/site-uploads/` root. Loose pre-scoping image files there
  // belong to arbitrary users and cannot be attributed to this site, so
  // scanning it leaked OTHER accounts' uploads into this site's asset
  // library when the site's own folder was empty. An empty site now shows
  // an empty library — never another user's files. (`legacyDir` kept above
  // only as the documented parent path; deliberately unused.)
  void legacyDir;

  items.sort((a, b) => b.mtime - a.mtime);
  return NextResponse.json({ items: items.slice(0, limit) });
}
