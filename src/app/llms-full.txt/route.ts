import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeAeoBlocks } from "@/lib/aeo";

/**
 * GET /llms-full.txt — llms.txt의 "전문(full)" 변형.
 * 큐레이션된 요약(llms.txt)과 달리, 각 페이지의 실제 본문 텍스트 + AEO 블록
 * (FAQ·HowTo·요약·정의) + 상품/게시판 목록을 그대로 임베드해 AI가 사이트
 * 콘텐츠를 한 파일에서 학습·인용할 수 있게 한다.
 * Spec: https://llmstxt.org/  (llms-full.txt 관례)
 *
 * 커스텀 도메인 Host 기준으로 사이트를 찾는다(llms.txt / sitemap by-domain 과 동일).
 */

function plainText(html: string | null | undefined, maxLen: number): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/^www\./, "") || "";
  const plain = (s: string) =>
    new NextResponse(s, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  if (!host) return plain("# Unknown host\n");

  const domain = await prisma.domain.findFirst({
    where: { domain: host, status: "ACTIVE" },
    select: { siteId: true },
  });
  if (!domain) return plain(`# ${host}\n\n> Site not registered.\n`);

  const site = await prisma.site.findUnique({
    where: { id: domain.siteId },
    include: {
      pages: {
        select: {
          slug: true,
          title: true,
          lang: true,
          isHome: true,
          showInMenu: true,
          sortOrder: true,
          content: true,
          aeoBlocks: true,
        },
        orderBy: [{ lang: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!site) return plain(`# ${host}\n\n> Site not found.\n`);

  const base = `https://${host}`;
  const primaryLang = site.defaultLanguage;
  const skip = new Set(["empty", "user", "users", "agreement"]);
  const pages = site.pages.filter(
    (p) => p.lang === primaryLang && p.showInMenu && !skip.has(p.slug.toLowerCase()),
  );

  const out: string[] = [];
  out.push(`# ${site.name}`);
  out.push("");
  out.push(`> ${site.description || `${site.name} — multilingual website published via homeNshop.`}`);
  out.push("");

  for (const p of pages) {
    const url = p.isHome ? `${base}/${primaryLang}/` : `${base}/${primaryLang}/${p.slug}.html`;
    out.push(`## ${p.title}`);
    out.push(`URL: ${url}`);
    out.push("");

    const html = (p.content as { html?: string } | null)?.html;
    const text = plainText(html, 1800);
    if (text) {
      out.push(text);
      out.push("");
    }

    for (const b of normalizeAeoBlocks(p.aeoBlocks)) {
      if (b.type === "faq") {
        out.push("### FAQ");
        for (const it of b.items) {
          out.push(`Q: ${it.q}`);
          out.push(`A: ${it.a}`);
        }
        out.push("");
      } else if (b.type === "howto") {
        out.push(`### ${b.name}`);
        b.steps.forEach((s, i) => out.push(`${i + 1}. ${s.name ? s.name + " — " : ""}${s.text}`));
        out.push("");
      } else if (b.type === "tldr") {
        out.push(`### ${b.title || "Key takeaways"}`);
        b.points.forEach((pt) => out.push(`- ${pt}`));
        out.push("");
      } else if (b.type === "definition") {
        out.push(`### ${b.term}`);
        out.push(b.definition);
        out.push("");
      }
    }
  }

  // 상품 목록 (이름 + 설명 요약, 최대 100)
  const products = await prisma.product.findMany({
    where: { siteId: site.id, lang: primaryLang },
    select: { legacyId: true, name: true, description: true },
    orderBy: { legacyId: "desc" },
    take: 100,
  });
  if (products.length) {
    out.push("## Products");
    out.push("");
    for (const pr of products) {
      const d = plainText(pr.description, 160);
      out.push(`- ${pr.name}${d ? ` — ${d}` : ""} (${base}/${primaryLang}/goods.html?action=read&id=${pr.legacyId})`);
    }
    out.push("");
  }

  // 게시판 글 제목 (최대 100)
  const posts = await prisma.boardPost.findMany({
    where: { siteId: site.id, parentId: null, lang: primaryLang },
    select: { legacyId: true, title: true },
    orderBy: { legacyId: "desc" },
    take: 100,
  });
  if (posts.length) {
    out.push("## Board posts");
    out.push("");
    for (const po of posts) {
      out.push(`- ${po.title} (${base}/${primaryLang}/board.html?action=read&id=${po.legacyId})`);
    }
    out.push("");
  }

  out.push("## Metadata");
  out.push("");
  out.push(`- Sitemap: ${base}/sitemap.xml`);
  out.push(`- Summary (llms.txt): ${base}/llms.txt`);
  out.push(`- Canonical domain: ${host}`);
  out.push(`- Published via: homeNshop (https://homenshop.net)`);
  out.push("");

  return new NextResponse(out.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
