import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { promises as dns } from "dns";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const SERVER_IP = "167.71.199.28";

async function resolvesToServer(host: string): Promise<boolean> {
  try {
    const ips = await dns.resolve4(host);
    return ips.includes(SERVER_IP);
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = (await getManageScope()) ?? { userId: session.user.id, resellerId: null };

  const domains = await prisma.domain.findMany({
    where: { site: manageableSiteWhere(scope) },
    orderBy: { createdAt: "desc" },
    include: {
      site: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json(domains);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { domain, siteId: bodySiteId } = body;

  if (!domain || typeof domain !== "string") {
    return NextResponse.json(
      { error: "도메인을 입력해주세요." },
      { status: 400 }
    );
  }

  const normalizedDomain = domain.trim().toLowerCase();

  if (!DOMAIN_REGEX.test(normalizedDomain)) {
    return NextResponse.json(
      { error: "올바른 도메인 형식이 아닙니다. (예: example.com)" },
      { status: 400 }
    );
  }

  // Check uniqueness
  const existing = await prisma.domain.findUnique({
    where: { domain: normalizedDomain },
  });

  if (existing) {
    return NextResponse.json(
      { error: "이미 등록된 도메인입니다." },
      { status: 409 }
    );
  }

  // Resolve target site:
  //   · If caller provided a siteId (from the site-settings page, or a reseller
  //     managing a customer site), bind to THAT site after verifying the
  //     current scope may manage it (owner OR reseller-attributed customer).
  //   · Otherwise, fall back to the caller's own first real site (legacy
  //     single-site behavior). Users with multiple sites should always come in
  //     with an explicit siteId — the generic domains page now requires it too.
  const scope = (await getManageScope()) ?? { userId: session.user.id, resellerId: null };
  const siteScopeWhere = manageableSiteWhere(scope);

  let site;
  if (bodySiteId && typeof bodySiteId === "string") {
    site = await prisma.site.findFirst({
      where: {
        id: bodySiteId,
        ...siteScopeWhere,
        isTemplateStorage: false,
      },
    });
    if (!site) {
      return NextResponse.json(
        { error: "선택한 사이트를 찾을 수 없거나 권한이 없습니다." },
        { status: 403 }
      );
    }
  } else {
    site = await prisma.site.findFirst({
      where: { userId: session.user.id, isTemplateStorage: false },
    });
  }

  if (!site) {
    return NextResponse.json(
      { error: "먼저 사이트를 생성해주세요." },
      { status: 400 }
    );
  }

  // Auto-activate if at least one A record (@ or www) already points to us.
  // The add-form runs the same verify-dns check before POSTing, so in the
  // normal path we've already confirmed connectivity — no reason to park
  // the row in "대기중" when the user will just wait for an admin nudge.
  const [apexOk, wwwOk] = await Promise.all([
    resolvesToServer(normalizedDomain),
    resolvesToServer(`www.${normalizedDomain}`),
  ]);
  const initialStatus = apexOk || wwwOk ? "ACTIVE" : "PENDING";

  const newDomain = await prisma.domain.create({
    data: {
      domain: normalizedDomain,
      siteId: site.id,
      // Attribute the domain to the SITE OWNER, not the operator. When a
      // reseller adds a domain on a customer's behalf it must belong to the
      // customer so ownership/billing stays correct after handoff.
      userId: site.userId,
      status: initialStatus,
    },
    include: {
      site: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json(newDomain, { status: 201 });
}
