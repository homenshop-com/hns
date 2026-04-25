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

  // Verify the user owns this site. Without this, knowing a siteId
  // would let any logged-in user see another site's uploads.
  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id },
    select: { id: true },
  });
  if (!site) {
    return NextResponse.json({ error: "사이트 권한 없음." }, { status: 403 });
  }

  const scopedDir = join(UPLOAD_DIR, "site-uploads", siteId);
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

  await collect(scopedDir, `${UPLOAD_URL}/site-uploads/${siteId}`);
  // Legacy fallback: include unscoped uploads only if the scoped folder
  // is empty (avoids cluttering newly-scoped sites with shared bucket).
  if (items.length === 0) {
    await collect(legacyDir, `${UPLOAD_URL}/site-uploads`);
  }

  items.sort((a, b) => b.mtime - a.mtime);
  return NextResponse.json({ items: items.slice(0, limit) });
}
