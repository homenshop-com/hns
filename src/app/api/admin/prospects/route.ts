import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  parseTemplatePages,
  readTemplateCss,
  rewriteAssetUrls,
} from "@/lib/template-parser";
import { trialExpiryFromNow } from "@/lib/site-expiration";
import { normalizePhoneDigits } from "@/lib/sms";
import crypto from "crypto";
import { parsePageParam } from "@/lib/pagination";

const PAGE_SIZE = 20;
const SYNTHETIC_EMAIL_DOMAIN = "homenshop.local";

async function requireAdmin() {
  const session = await auth();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (user?.role !== "ADMIN") return null;
  return user;
}

// GET /api/admin/prospects — list prospect placeholders (paginated)
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const page = parsePageParam(searchParams.get("page"));
  const search = searchParams.get("search") || "";
  const includeClaimed = searchParams.get("includeClaimed") === "1";

  const where: Prisma.UserWhereInput = includeClaimed
    ? { OR: [{ isProspect: true }, { claimedAt: { not: null } }] }
    : { isProspect: true };

  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: normalizePhoneDigits(search) || search } },
          { shopId: { contains: search, mode: "insensitive" } },
          { prospectNote: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        shopId: true,
        isProspect: true,
        claimedAt: true,
        prospectNote: true,
        createdAt: true,
        sites: {
          select: {
            id: true,
            shopId: true,
            name: true,
            published: true,
            expiresAt: true,
          },
          take: 1,
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      claimedAt: u.claimedAt?.toISOString() ?? null,
      sites: u.sites.map((s) => ({
        ...s,
        expiresAt: s.expiresAt?.toISOString() ?? null,
      })),
    })),
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  });
}

interface CreateBody {
  phone: string;
  name: string;
  shopId: string;
  templateId?: string | null;
  defaultLanguage?: string;
  prospectNote?: string;
  /** Trial length in days. Defaults to 30. The real expiresAt is reset
   *  again to +30 days at claim time, but admins can extend the
   *  pre-claim window (e.g. for slow-moving deals). */
  trialDays?: number;
}

// POST /api/admin/prospects — create a prospect placeholder + site
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = normalizePhoneDigits(body.phone ?? "");
  const name = (body.name ?? "").trim();
  const shopId = (body.shopId ?? "").trim().toLowerCase();
  const lang = body.defaultLanguage || "ko";
  const note = body.prospectNote?.trim() || null;
  const trialDays =
    typeof body.trialDays === "number" && body.trialDays > 0 && body.trialDays <= 365
      ? body.trialDays
      : 30;

  if (!phone || phone.length < 9 || phone.length > 15) {
    return NextResponse.json(
      { error: "유효한 핸드폰 번호를 입력해주세요." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "고객/상호명을 입력해주세요." },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(shopId)) {
    return NextResponse.json(
      { error: "shopId는 6~14자리 영문/숫자/- 형식이어야 합니다." },
      { status: 400 },
    );
  }

  // Reject if any existing prospect already holds this phone — having
  // two would make the auto-claim ambiguous (which site does the customer
  // get?). Admin must explicitly delete the older prospect first.
  const phoneClash = await prisma.user.findFirst({
    where: { isProspect: true, phone },
    select: { id: true, shopId: true },
  });
  if (phoneClash) {
    return NextResponse.json(
      {
        error: `이 핸드폰 번호는 이미 잠재고객(${phoneClash.shopId ?? "?"})에 등록되어 있습니다.`,
      },
      { status: 409 },
    );
  }

  // shopId must be globally unique on Site, and the synthetic email
  // must also not collide.
  const siteClash = await prisma.site.findUnique({ where: { shopId } });
  if (siteClash) {
    return NextResponse.json(
      { error: "이미 사용중인 shopId입니다." },
      { status: 409 },
    );
  }
  const syntheticEmail = `prospect+${shopId}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const emailClash = await prisma.user.findUnique({
    where: { email: syntheticEmail },
  });
  if (emailClash) {
    return NextResponse.json(
      { error: "이 shopId로 이전에 생성된 placeholder가 있습니다. 먼저 정리해주세요." },
      { status: 409 },
    );
  }

  // If a template is provided, snapshot its pages/css the same way
  // /api/sites/create-from-template does. Inline rather than refactoring
  // to a shared helper to keep blast radius small.
  let templateData: {
    template: { id: string; path: string | null; name: string };
    cssText: string | null;
    headerHtml: string | null;
    menuHtml: string | null;
    footerHtml: string | null;
    pageData: Prisma.PageCreateWithoutSiteInput[];
  } | null = null;

  if (body.templateId) {
    const template = await prisma.template.findUnique({
      where: { id: body.templateId },
    });
    if (!template || !template.isActive) {
      return NextResponse.json(
        { error: "템플릿을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const hasDbCss = !!(template.cssText && template.cssText.length > 0);
    const cssText = hasDbCss
      ? template.cssText
      : template.path
        ? readTemplateCss(template.path)
        : null;

    type SnapshotPage = {
      slug: string;
      title: string;
      content: unknown;
      css?: string | null;
      lang?: string;
      sortOrder?: number;
      isHome?: boolean;
      showInMenu?: boolean;
    };
    const snapshot = Array.isArray(template.pagesSnapshot)
      ? (template.pagesSnapshot as unknown as SnapshotPage[])
      : null;

    let pageData: Prisma.PageCreateWithoutSiteInput[] = [];
    if (snapshot && snapshot.length > 0) {
      pageData = snapshot.map((p, index) => ({
        title: p.title,
        slug: p.slug,
        lang: p.lang ?? lang,
        isHome: p.isHome ?? p.slug === "index",
        showInMenu: p.showInMenu ?? true,
        sortOrder: p.sortOrder ?? index,
        content: (p.content ?? { html: "" }) as Prisma.InputJsonValue,
        css: p.css ?? null,
      }));
    } else if (template.path) {
      const templatePages = parseTemplatePages(template.path);
      pageData = templatePages.map((page, index) => ({
        title: page.title,
        slug: page.slug,
        isHome: page.slug === "index",
        showInMenu: page.showInMenu !== false,
        sortOrder: index,
        content: {
          html: rewriteAssetUrls(page.bodyHtml, template.path!),
        } as Prisma.InputJsonValue,
      }));
    }

    templateData = {
      template: { id: template.id, path: template.path, name: template.name },
      cssText: cssText ?? null,
      headerHtml: template.headerHtml ?? null,
      menuHtml: template.menuHtml ?? null,
      footerHtml: template.footerHtml ?? null,
      pageData,
    };
  }

  // Random unguessable password — placeholder cannot be logged into.
  // Prefixed for trace clarity in DB dumps.
  const placeholderPwd = `prospect-${crypto.randomBytes(16).toString("hex")}`;
  const hashedPassword = await bcrypt.hash(placeholderPwd, 10);

  const expiresAt = trialExpiryFromNow(trialDays);

  // Create user + site in one transaction. Deliberately skip the
  // signup-bonus credit grant (credits should land on the real user
  // after they claim, not on a throwaway placeholder).
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: syntheticEmail,
        password: hashedPassword,
        name,
        phone,
        isProspect: true,
        prospectCreatedBy: admin.id,
        prospectNote: note,
        // Don't claim shopId on the User row — we leave it null and only
        // assign it when the real user claims. Keeps the unique constraint
        // free for the eventual claimant.
        shopId: null,
      },
    });

    const site = await tx.site.create({
      data: {
        userId: user.id,
        shopId,
        name,
        defaultLanguage: lang,
        accountType: "0",
        expiresAt,
        templateId: templateData?.template.id ?? null,
        templatePath: templateData?.template.path ?? null,
        headerHtml: templateData?.headerHtml ?? null,
        menuHtml: templateData?.menuHtml ?? null,
        footerHtml: templateData?.footerHtml ?? null,
        cssText: templateData?.cssText ?? null,
        pages:
          templateData && templateData.pageData.length > 0
            ? { create: templateData.pageData }
            : undefined,
      },
    });

    return { user, site };
  });

  return NextResponse.json(
    {
      ok: true,
      userId: result.user.id,
      siteId: result.site.id,
      shopId: result.site.shopId,
      expiresAt: result.site.expiresAt,
    },
    { status: 201 },
  );
}
