/**
 * GET /indexnow-key.txt
 *
 * Microsoft IndexNow requires a verification endpoint that returns the
 * site's key as plain text. We point `keyLocation` at this route from the
 * sitemap-refresh submission — any search engine that wants to verify the
 * key before accepting URLs can fetch it.
 *
 * Spec: https://www.indexnow.org/documentation
 *
 * Filename (path) doesn't need to match the key — the spec just says the
 * `keyLocation` URL must return the exact key string. Using a fixed path
 * means we can hard-code it in nginx custom-domain configs without
 * per-site knowledge.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const key = process.env.INDEXNOW_KEY || "";
  if (!key) {
    return new NextResponse("# IndexNow key not configured", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
