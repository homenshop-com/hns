import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/img?q={keywords}&w={width}&h={height}
 *
 * Returns a 302 redirect to a real, semantically-matched image for the given
 * keyword(s). Used by AI-generated HTML so prompts like "sky image" actually
 * produce a sky image (unlike picsum.photos/seed/* which hashes the keyword).
 *
 * Flow:
 *   1. Normalize keyword + pick orientation from w×h ratio.
 *   2. Lookup ImageCache (siteId-agnostic; images are universal).
 *   3. On miss, query Pexels API (if PEXELS_API_KEY set), cache, return.
 *   4. On Pexels miss or no-key: fall back to picsum.photos (random) so the
 *      page never has a broken image.
 *
 * Cached in DB forever (keyword→URL rarely needs to change). Also served
 * with Cache-Control: public, max-age=604800 so CDN/browser caches the
 * redirect for 7 days. Forced refresh: DELETE row from ImageCache.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawQ = (url.searchParams.get("q") || "").trim();
  const w = clampDim(url.searchParams.get("w"), 1600);
  const h = clampDim(url.searchParams.get("h"), 900);

  // Normalize keyword: lowercase, ascii-ish, spaces collapsed.
  const keyword = rawQ
    .toLowerCase()
    .replace(/[+_]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  // If no keyword provided, just passthrough to picsum (legacy behavior).
  if (!keyword) {
    return NextResponse.redirect(`https://picsum.photos/${w}/${h}`, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  const orientation = orientationFor(w, h);

  // Cache lookup
  try {
    const cached = await prisma.imageCache.findUnique({
      where: { keyword_orientation: { keyword, orientation } },
    });
    if (cached) {
      // Best-effort hit count (fire-and-forget; don't block redirect)
      prisma.imageCache
        .update({ where: { id: cached.id }, data: { hits: { increment: 1 } } })
        .catch(() => {});
      return NextResponse.redirect(cached.url, {
        status: 302,
        headers: { "Cache-Control": "public, max-age=604800" },
      });
    }
  } catch (err) {
    console.error("[/api/img] cache lookup failed:", err);
  }

  // Pexels search
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    try {
      const searchUrl = new URL("https://api.pexels.com/v1/search");
      searchUrl.searchParams.set("query", keyword);
      searchUrl.searchParams.set("per_page", "3");
      searchUrl.searchParams.set("orientation", orientation);

      const res = await fetch(searchUrl.toString(), {
        headers: { Authorization: pexelsKey },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = (await res.json()) as PexelsResponse;
        const photo = data.photos?.[0];
        if (photo) {
          // Prefer sizes that match the requested dimensions.
          const imageUrl = pickPexelsSize(photo, w, h);
          // Cache for next time (fire-and-forget upsert).
          prisma.imageCache
            .upsert({
              where: { keyword_orientation: { keyword, orientation } },
              create: {
                keyword,
                orientation,
                url: imageUrl,
                photographer: photo.photographer || null,
                sourceUrl: photo.url || null,
                provider: "pexels",
              },
              update: {
                url: imageUrl,
                photographer: photo.photographer || null,
                sourceUrl: photo.url || null,
                provider: "pexels",
              },
            })
            .catch((e) => console.error("[/api/img] cache upsert failed:", e));

          return NextResponse.redirect(imageUrl, {
            status: 302,
            headers: { "Cache-Control": "public, max-age=604800" },
          });
        }
      } else {
        console.error("[/api/img] Pexels API error:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[/api/img] Pexels fetch failed:", err);
    }
  }

  // Fallback: picsum with seed so the same keyword stays stable until we
  // have a real Pexels hit. Still random, but at least deterministic.
  const fallbackUrl = `https://picsum.photos/seed/${encodeURIComponent(keyword)}/${w}/${h}`;
  return NextResponse.redirect(fallbackUrl, {
    status: 302,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

/* ───────── helpers ───────── */

function clampDim(v: string | null, fallback: number): number {
  const n = parseInt(v || "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, 16), 4000);
}

function orientationFor(w: number, h: number): "landscape" | "portrait" | "square" {
  const ratio = w / h;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
  };
}
interface PexelsResponse {
  photos?: PexelsPhoto[];
}

function pickPexelsSize(photo: PexelsPhoto, w: number, _h: number): string {
  // Pexels named sizes (approx long-edge):
  //   original: as uploaded (often >3000px)
  //   large2x:  ~1880px
  //   large:    ~940px
  //   medium:   ~350px
  //   small:    ~130px
  if (w >= 1600) return photo.src.large2x || photo.src.original;
  if (w >= 900) return photo.src.large2x || photo.src.large;
  if (w >= 400) return photo.src.large;
  return photo.src.medium;
}
