import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/robots/by-domain — Generate robots.txt based on Host header
export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/^www\./, "") || "";

  if (!host) {
    return new NextResponse("User-agent: *\nAllow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Find site by domain
  const domain = await prisma.domain.findFirst({
    where: { domain: host, status: "ACTIVE" },
    select: { siteId: true },
  });

  const sitemapUrl = domain
    ? `https://${host}/sitemap.xml`
    : null;

  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    "# Static assets",
    "Disallow: /api/",
    "Disallow: /dashboard/",
    "Disallow: /admin/",
    "Disallow: /_next/",
    "",
  ];

  if (sitemapUrl) {
    body.push(`Sitemap: ${sitemapUrl}`);
  }

  return new NextResponse(body.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
