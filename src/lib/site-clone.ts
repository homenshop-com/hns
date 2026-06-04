/**
 * Full, faithful "계정 100% 복제" — duplicate an existing Site into a brand
 * new shopId, copying every design + content row exactly.
 *
 * What gets copied (everything that defines how the site looks & reads):
 *   Site scalars (header/menu/footer/CSS, SEO, GA, public business info),
 *   Pages (+ self-referential parent hierarchy), SiteHmf per-language chrome,
 *   BoardCategory / BoardPost (+ replies) / BoardComment / BoardPlugin,
 *   Product / ProductCategory / ProductPlugin.
 *
 * What is deliberately NOT copied (ownership / runtime / commercial state):
 *   domains, orders, customers, marketplace integrations, inquiries,
 *   subscriptions, reseller-landing link, prospect fields, SEO-audit caches,
 *   reminder bookkeeping.
 *
 * Asset URLs: the published renderer builds image paths from the site's own
 * shopId (…/{shopId}/uploaded/…), and legacy pages embed /{shopId}/… absolute
 * paths. So every text/JSON field has its `/{oldShopId}/` path segment
 * rewritten to `/{newShopId}/`. Pair this with copying the upload folders on
 * the server (the API route does that, best-effort) for a self-contained clone.
 *
 * IDs are pre-generated so self-referential FKs (page.parentId,
 * post.parentId, comment.parentId) and cross-table FKs (post.categoryId,
 * plugin.categoryId) can be remapped and inserted with bulk createMany.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export type CloneResult =
  | { ok: true; site: { id: string; shopId: string; name: string } }
  | { ok: false; status: number; error: string };

const newId = () => randomUUID();

/** Global, regex-free replace of the `/{oldShopId}/` path segment. */
function rewriteText(t: string | null, oldId: string, newId: string): string | null {
  if (t == null) return null;
  return t.split(`/${oldId}/`).join(`/${newId}/`);
}

/** Rewrite a JSON value's embedded shopId paths; undefined when null/absent. */
function rewriteJson(
  v: Prisma.JsonValue | null,
  oldId: string,
  newId: string,
): Prisma.InputJsonValue | undefined {
  if (v == null) return undefined;
  const s = JSON.stringify(v);
  return JSON.parse(s.split(`/${oldId}/`).join(`/${newId}/`)) as Prisma.InputJsonValue;
}

function jsonOrUndef(v: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined {
  return v == null ? undefined : (v as Prisma.InputJsonValue);
}

export async function cloneSite(opts: {
  sourceSiteId: string;
  newShopId: string;
  newName?: string;
  /** Owner for the clone. Defaults to the source site's owner. */
  targetUserId?: string;
}): Promise<CloneResult> {
  const sourceSiteId = opts.sourceSiteId;
  const newShopId = (opts.newShopId || "").trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(newShopId)) {
    return { ok: false, status: 400, error: "shopId 형식이 올바르지 않습니다 (소문자·숫자·하이픈, 6~14자)." };
  }

  const taken = await prisma.site.findUnique({ where: { shopId: newShopId }, select: { id: true } });
  if (taken) {
    return { ok: false, status: 409, error: "이미 사용 중인 shopId 입니다." };
  }

  const source = await prisma.site.findUnique({
    where: { id: sourceSiteId },
    include: {
      pages: true,
      hmfTranslations: true,
      boardCategories: true,
      boardPosts: true,
      boardPlugins: true,
      products: true,
      productCategories: true,
      productPlugins: true,
    },
  });
  if (!source) {
    return { ok: false, status: 404, error: "원본 사이트를 찾을 수 없습니다." };
  }

  const targetUserId = opts.targetUserId || source.userId;
  if (opts.targetUserId) {
    const u = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!u) return { ok: false, status: 404, error: "대상 회원을 찾을 수 없습니다." };
  }

  const oldShopId = source.shopId;

  // Comments hang off posts (no direct siteId), fetch by source post ids.
  const sourcePostIds = source.boardPosts.map((p) => p.id);
  const comments = sourcePostIds.length
    ? await prisma.boardComment.findMany({ where: { postId: { in: sourcePostIds } } })
    : [];

  // ── Pre-generate ids so every FK can be remapped before insert ──
  const newSiteId = newId();
  const pageIdMap = new Map(source.pages.map((p) => [p.id, newId()]));
  const catIdMap = new Map(source.boardCategories.map((c) => [c.id, newId()]));
  const postIdMap = new Map(source.boardPosts.map((p) => [p.id, newId()]));
  const commentIdMap = new Map(comments.map((c) => [c.id, newId()]));

  const rwT = (t: string | null) => rewriteText(t, oldShopId, newShopId);
  const rwJ = (v: Prisma.JsonValue | null) => rewriteJson(v, oldShopId, newShopId);

  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(
    async (tx) => {
      // 1. Site
      await tx.site.create({
        data: {
          id: newSiteId,
          userId: targetUserId,
          shopId: newShopId,
          name: opts.newName?.trim() || source.name,
          description: source.description,
          defaultLanguage: source.defaultLanguage,
          languages: source.languages,
          templateId: source.templateId,
          templatePath: source.templatePath,
          headerHtml: rwT(source.headerHtml),
          menuHtml: rwT(source.menuHtml),
          footerHtml: rwT(source.footerHtml),
          cssText: rwT(source.cssText),
          published: source.published,
          // Clone lands as an active paid account so it's immediately usable
          // (never inherits an expired/free state that would gate the page).
          accountType: "1",
          expiresAt,
          googleAnalyticsId: source.googleAnalyticsId,
          googleAnalyticsPropertyId: source.googleAnalyticsPropertyId,
          googleVerification: source.googleVerification,
          productSettings: jsonOrUndef(source.productSettings),
          tempDomain: source.tempDomain,
          contactEmail: source.contactEmail,
          publicEmail: source.publicEmail,
          publicPhone: source.publicPhone,
          publicAddress: source.publicAddress,
          logoUrl: rwT(source.logoUrl),
          seoMeta: jsonOrUndef(source.seoMeta),
          isTemplateStorage: false,
          // NOT copied: prospectPhone/Note, seoAudit*, lastReminderDay.
        },
      });

      // 2. Pages (self-referential parentId — ids pre-mapped)
      if (source.pages.length) {
        await tx.page.createMany({
          data: source.pages.map((p) => ({
            id: pageIdMap.get(p.id)!,
            siteId: newSiteId,
            title: p.title,
            slug: p.slug,
            lang: p.lang,
            content: rwJ(p.content) ?? Prisma.JsonNull,
            css: rwT(p.css),
            sortOrder: p.sortOrder,
            isHome: p.isHome,
            parentId: p.parentId ? pageIdMap.get(p.parentId) ?? null : null,
            depth: p.depth,
            showInMenu: p.showInMenu,
            menuTitle: p.menuTitle,
            menuType: p.menuType,
            externalUrl: p.externalUrl,
            seoTitle: p.seoTitle,
            seoDescription: p.seoDescription,
            seoKeywords: p.seoKeywords,
            ogImage: rwT(p.ogImage),
          })),
        });
      }

      // 3. Per-language header/menu/footer
      if (source.hmfTranslations.length) {
        await tx.siteHmf.createMany({
          data: source.hmfTranslations.map((h) => ({
            id: newId(),
            siteId: newSiteId,
            lang: h.lang,
            headerHtml: rwT(h.headerHtml),
            menuHtml: rwT(h.menuHtml),
            footerHtml: rwT(h.footerHtml),
          })),
        });
      }

      // 4. Board categories
      if (source.boardCategories.length) {
        await tx.boardCategory.createMany({
          data: source.boardCategories.map((c) => ({
            id: catIdMap.get(c.id)!,
            siteId: newSiteId,
            legacyId: c.legacyId,
            lang: c.lang,
            name: c.name,
            defaultKey: c.defaultKey,
            replyMode: c.replyMode,
            writeMode: c.writeMode,
            rowsPerPage: c.rowsPerPage,
            titleLen: c.titleLen,
            imgWidth: c.imgWidth,
            imgHeight: c.imgHeight,
            listStyle: c.listStyle,
          })),
        });
      }

      // 5. Board posts (categoryId + self-referential parentId remapped)
      if (source.boardPosts.length) {
        await tx.boardPost.createMany({
          data: source.boardPosts.map((p) => ({
            id: postIdMap.get(p.id)!,
            siteId: newSiteId,
            categoryId: p.categoryId ? catIdMap.get(p.categoryId) ?? null : null,
            legacyId: p.legacyId,
            lang: p.lang,
            author: p.author,
            title: p.title,
            content: rwT(p.content) ?? "",
            photos: rwT(p.photos),
            views: p.views,
            isNotice: p.isNotice,
            isPublic: p.isPublic,
            parentId: p.parentId ? postIdMap.get(p.parentId) ?? null : null,
            regdate: p.regdate,
          })),
        });
      }

      // 6. Board comments (postId + self-referential parentId remapped)
      if (comments.length) {
        await tx.boardComment.createMany({
          data: comments.map((c) => ({
            id: commentIdMap.get(c.id)!,
            postId: postIdMap.get(c.postId)!,
            author: c.author,
            content: rwT(c.content) ?? "",
            parentId: c.parentId ? commentIdMap.get(c.parentId) ?? null : null,
          })),
        });
      }

      // 7. Board plugins (categoryId remapped)
      if (source.boardPlugins.length) {
        await tx.boardPlugin.createMany({
          data: source.boardPlugins.map((b) => ({
            id: newId(),
            siteId: newSiteId,
            page: b.page,
            divId: b.divId,
            categoryId: b.categoryId ? catIdMap.get(b.categoryId) ?? null : null,
            legacyCatId: b.legacyCatId,
            nums: b.nums,
            titleLen: b.titleLen,
            dateStyle: b.dateStyle,
            displayStyle: b.displayStyle,
            imgWidth: b.imgWidth,
            imgHeight: b.imgHeight,
            skinFile: b.skinFile,
          })),
        });
      }

      // 8. Product categories
      if (source.productCategories.length) {
        await tx.productCategory.createMany({
          data: source.productCategories.map((c) => ({
            id: newId(),
            siteId: newSiteId,
            legacyId: c.legacyId,
            lang: c.lang,
            name: c.name,
            defaultKey: c.defaultKey,
            parentLegacyId: c.parentLegacyId,
            depth: c.depth,
            listStyle: c.listStyle,
            rows: c.rows,
            imgWidth: c.imgWidth,
            imgHeight: c.imgHeight,
            titleLen: c.titleLen,
            textLen: c.textLen,
          })),
        });
      }

      // 9. Products
      if (source.products.length) {
        await tx.product.createMany({
          data: source.products.map((p) => ({
            id: newId(),
            siteId: newSiteId,
            legacyId: p.legacyId,
            lang: p.lang,
            name: p.name,
            description: rwT(p.description),
            price: p.price,
            salePrice: p.salePrice,
            stock: p.stock,
            category: p.category,
            images: rwJ(p.images) ?? Prisma.JsonNull,
            photos: rwT(p.photos),
            specification: rwT(p.specification),
            status: p.status,
            sortOrder: p.sortOrder,
          })),
        });
      }

      // 10. Product plugins
      if (source.productPlugins.length) {
        await tx.productPlugin.createMany({
          data: source.productPlugins.map((p) => ({
            id: newId(),
            siteId: newSiteId,
            lang: p.lang,
            page: p.page,
            divId: p.divId,
            legacyCatId: p.legacyCatId,
            nums: p.nums,
            titleLen: p.titleLen,
            imgWidth: p.imgWidth,
            imgHeight: p.imgHeight,
            skinFile: p.skinFile,
          })),
        });
      }
    },
    { timeout: 60_000 },
  );

  return {
    ok: true,
    site: { id: newSiteId, shopId: newShopId, name: opts.newName?.trim() || source.name },
  };
}
