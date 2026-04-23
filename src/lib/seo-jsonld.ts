/**
 * GEO (Generative Engine Optimization) JSON-LD helpers.
 * Produces schema.org structured data that AI engines (ChatGPT, Perplexity,
 * Claude, Google AI Overviews) read to extract facts and cite published sites.
 */

function plainText(html: string | null | undefined, maxLen = 5000): string {
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

export interface SiteInfo {
  name: string;
  description?: string | null;
  defaultLanguage: string;
  languages?: string[];
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  /** Optional extended Organization fields for richer AI-citation data. */
  alternateName?: string | null;
  foundingDate?: string | null;
  areaServed?: string | string[] | null;
  /** External identity URLs (blog, LinkedIn, Facebook etc.) */
  sameAs?: string[] | null;
  /** Short pitch shown verbatim when AI engines quote the brand. */
  slogan?: string | null;
}

export interface JsonLdContext {
  baseUrl: string;
  currentUrl: string;
  lang: string;
  site: SiteInfo;
}

export function buildWebSiteJsonLd(ctx: JsonLdContext) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: ctx.site.name,
    url: ctx.baseUrl,
    inLanguage: ctx.lang,
    ...(ctx.site.description ? { description: ctx.site.description } : {}),
  };
}

export function buildOrganizationJsonLd(ctx: JsonLdContext) {
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ctx.site.name,
    url: ctx.baseUrl,
  };
  if (ctx.site.alternateName) org.alternateName = ctx.site.alternateName;
  if (ctx.site.logoUrl) org.logo = ctx.site.logoUrl;
  if (ctx.site.description) org.description = ctx.site.description;
  if (ctx.site.slogan) org.slogan = ctx.site.slogan;
  if (ctx.site.foundingDate) org.foundingDate = ctx.site.foundingDate;
  if (ctx.site.areaServed) org.areaServed = ctx.site.areaServed;
  if (ctx.site.sameAs && ctx.site.sameAs.length > 0) org.sameAs = ctx.site.sameAs;
  const contact: Record<string, unknown> = {};
  if (ctx.site.contactEmail) contact.email = ctx.site.contactEmail;
  if (ctx.site.contactPhone) contact.telephone = ctx.site.contactPhone;
  if (Object.keys(contact).length > 0) {
    org.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer service",
      availableLanguage: (ctx.site.languages && ctx.site.languages.length > 0)
        ? ctx.site.languages.map((l) => (l === "ko" ? "Korean" : l === "en" ? "English" : l === "ja" ? "Japanese" : l))
        : ["Korean"],
      ...contact,
    };
  }
  if (ctx.site.address) {
    org.address = { "@type": "PostalAddress", streetAddress: ctx.site.address, addressCountry: "KR" };
  }
  return org;
}

export function buildBreadcrumbJsonLd(
  ctx: JsonLdContext,
  crumbs: Array<{ name: string; url: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export interface ProductLdInput {
  name: string;
  description?: string | null;
  specification?: string | null;
  price?: number | string | null;
  priceCurrency?: string;
  images: string[];
  category?: string | null;
  sku?: string | null;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
}

export function buildProductJsonLd(
  ctx: JsonLdContext,
  p: ProductLdInput
) {
  const desc = plainText(p.description || p.specification || "", 500);
  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url: ctx.currentUrl,
    ...(p.images.length > 0 ? { image: p.images } : {}),
    ...(desc ? { description: desc } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    brand: { "@type": "Brand", name: ctx.site.name },
  };

  const priceNum = typeof p.price === "string" ? parseFloat(p.price) : p.price;
  if (priceNum && priceNum > 0) {
    product.offers = {
      "@type": "Offer",
      price: priceNum,
      priceCurrency: p.priceCurrency || "USD",
      availability: `https://schema.org/${p.availability || "InStock"}`,
      url: ctx.currentUrl,
    };
  }
  return product;
}

export interface ArticleLdInput {
  title: string;
  content?: string | null;
  author?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  images?: string[];
  section?: string | null;
}

export function buildArticleJsonLd(
  ctx: JsonLdContext,
  a: ArticleLdInput
) {
  const desc = plainText(a.content, 500);
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    url: ctx.currentUrl,
    inLanguage: ctx.lang,
    ...(desc ? { description: desc } : {}),
    ...(a.images && a.images.length > 0 ? { image: a.images } : {}),
    ...(a.author ? { author: { "@type": "Person", name: a.author } } : {}),
    ...(a.datePublished ? { datePublished: a.datePublished } : {}),
    ...(a.dateModified || a.datePublished
      ? { dateModified: a.dateModified || a.datePublished }
      : {}),
    ...(a.section ? { articleSection: a.section } : {}),
    publisher: {
      "@type": "Organization",
      name: ctx.site.name,
      ...(ctx.site.logoUrl
        ? { logo: { "@type": "ImageObject", url: ctx.site.logoUrl } }
        : {}),
    },
  };
  return article;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

/** Render JSON-LD objects as an HTML string block suitable for <head>. */
export function renderJsonLdBlock(
  objects: Array<Record<string, unknown> | null | undefined>
): string {
  return objects
    .filter((o): o is Record<string, unknown> => !!o)
    .map(
      (o) =>
        `<script type="application/ld+json">${JSON.stringify(o).replace(
          /</g,
          "\\u003c"
        )}</script>`
    )
    .join("\n  ");
}

/**
 * Extract FAQ items from HTML body that uses H3/H4 question + following paragraph
 * pattern, or explicit [data-faq-q] / [data-faq-a] attributes.
 */
export function extractFaqFromHtml(html: string): FaqItem[] {
  if (!html) return [];
  const items: FaqItem[] = [];
  const attrPattern = /data-faq-q=["']([^"']+)["'][\s\S]*?data-faq-a=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = attrPattern.exec(html)) !== null) {
    items.push({ question: m[1], answer: m[2] });
  }
  return items;
}
