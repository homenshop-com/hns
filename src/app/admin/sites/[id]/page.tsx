import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { spawn } from "child_process";
import { getTempDomain } from "@/lib/temp-domains";
import { normalizePhoneDigits, formatKoreanPhone } from "@/lib/sms";
import { auth } from "@/lib/auth";
import SeoAuditPanel, { type AuditResultShape } from "@/components/SeoAuditPanel";
import { CREDIT_COSTS } from "@/lib/credits";

const ACCOUNT_TYPES: Record<string, string> = { "0": "Free", "1": "Paid", "2": "Test", "9": "Expired" };

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const PROVISION_SCRIPT = "/root/scripts/provision-domain-ssl.sh";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") throw new Error("Forbidden");
}

async function updateSite(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const accountType = (formData.get("accountType") as string) || "0";
  const expiresAt = formData.get("expiresAt") as string;
  const name = formData.get("name") as string;
  const shopId = formData.get("shopId") as string;
  // Prospect phone — when set, the customer who later registers with a
  // matching OTP-verified phone will be offered the claim flow.
  const prospectPhoneRaw = (formData.get("prospectPhone") as string) || "";
  const prospectPhone = prospectPhoneRaw.trim()
    ? normalizePhoneDigits(prospectPhoneRaw)
    : null;
  const prospectNote = ((formData.get("prospectNote") as string) || "").trim() || null;

  await prisma.site.update({
    where: { id },
    data: {
      accountType,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      name: name || undefined,
      shopId: shopId || undefined,
      prospectPhone,
      prospectNote,
    },
  });
  redirect(`/admin/sites/${id}`);
}

async function extendSite(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const months = parseInt(formData.get("months") as string, 10);

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return;

  const base = site.expiresAt && site.expiresAt > new Date() ? site.expiresAt : new Date();
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + months);

  await prisma.site.update({
    where: { id },
    data: { expiresAt: newExpiry, accountType: "1" },
  });
  redirect(`/admin/sites/${id}`);
}

async function deleteSite(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await prisma.site.delete({ where: { id } });
  redirect("/admin/sites");
}

// Add a new custom domain to this site, OR transfer an existing one
// from another site/owner over to this site. Used by the admin to
// reassign domains between accounts in a single operation — the form
// in the Domains card calls this. Owner is auto-aligned to the site's
// owner so the user-facing /dashboard/domains page sees the move too.
async function addOrReassignDomain(formData: FormData) {
  "use server";
  await requireAdmin();
  const siteId = formData.get("siteId") as string;
  const raw = ((formData.get("domain") as string) || "").trim().toLowerCase();
  if (!raw || !DOMAIN_REGEX.test(raw)) {
    redirect(`/admin/sites/${siteId}?domainError=${encodeURIComponent("올바른 도메인 형식이 아닙니다.")}`);
  }
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, userId: true },
  });
  if (!site) redirect("/admin/sites");

  const existing = await prisma.domain.findUnique({ where: { domain: raw } });
  if (existing) {
    if (existing.siteId === site!.id) {
      redirect(`/admin/sites/${siteId}?domainError=${encodeURIComponent("이미 이 사이트에 연결된 도메인입니다.")}`);
    }
    // Transfer: keep cert/SSL state; just rebind site + owner. Nginx
    // vhost still points at the old shopId until "Nginx 재구성" is run.
    await prisma.domain.update({
      where: { id: existing.id },
      data: { siteId: site!.id, userId: site!.userId },
    });
    redirect(`/admin/sites/${siteId}?domainNotice=${encodeURIComponent(`${raw} 인계 완료. Nginx 재구성을 실행하세요.`)}`);
  }

  await prisma.domain.create({
    data: {
      domain: raw,
      siteId: site!.id,
      userId: site!.userId,
      status: "PENDING",
    },
  });
  redirect(`/admin/sites/${siteId}?domainNotice=${encodeURIComponent(`${raw} 추가됨. DNS A → 167.71.199.28 설정 후 SSL 발급.`)}`);
}

async function removeDomainFromSite(formData: FormData) {
  "use server";
  await requireAdmin();
  const siteId = formData.get("siteId") as string;
  const domainId = formData.get("domainId") as string;
  await prisma.domain.delete({ where: { id: domainId } });
  redirect(`/admin/sites/${siteId}?domainNotice=${encodeURIComponent("도메인이 삭제되었습니다.")}`);
}

// Re-run the provision script so the nginx vhost is rewritten with the
// site's CURRENT shopId/lang. certbot is called with --keep-until-expiring
// so a valid cert is reused; only the .conf gets rewritten and nginx -s
// reload picks up the new proxy_pass target. There is a ~5–15s window
// during which the domain serves an HTTP-only "provisioning" placeholder.
async function regenerateDomainNginx(formData: FormData) {
  "use server";
  await requireAdmin();
  const siteId = formData.get("siteId") as string;
  const domainId = formData.get("domainId") as string;

  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: { site: { select: { shopId: true, defaultLanguage: true } } },
  });
  if (!domain) {
    redirect(`/admin/sites/${siteId}?domainError=${encodeURIComponent("도메인을 찾을 수 없습니다.")}`);
  }

  const child = spawn(
    PROVISION_SCRIPT,
    [domain!.domain, domain!.site.shopId, domain!.site.defaultLanguage || "en"],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, DB_PASSWORD: process.env.DB_PASSWORD || "HnsApp2026Secure" },
    },
  );
  child.unref();

  redirect(`/admin/sites/${siteId}?domainNotice=${encodeURIComponent(`${domain!.domain} Nginx 재구성 시작. 1~2분 후 새로고침.`)}`);
}

export default async function AdminSiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ domainError?: string; domainNotice?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const domainError = sp.domainError || "";
  const domainNotice = sp.domainNotice || "";

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      domains: true,
      pages: {
        select: {
          id: true,
          title: true,
          slug: true,
          isHome: true,
          lang: true,
          seoAuditAt: true,
          seoAuditResult: true,
        },
        orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!site) notFound();

  // Filter pages to the site's default language so the panel doesn't
  // show duplicate "Home (ko)" + "Home (en)" entries for multilingual
  // sites. Per-language audit can be added later.
  const auditPages = site.pages
    .filter((p) => p.lang === site.defaultLanguage)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      isHome: p.isHome,
      lang: p.lang,
      seoAuditAt: p.seoAuditAt ? p.seoAuditAt.toISOString() : null,
      seoAuditResult: (p.seoAuditResult as AuditResultShape | null) ?? null,
    }));

  const isExpired = site.expiresAt && new Date(site.expiresAt) < new Date();
  const prospectPhoneDisplay = site.prospectPhone
    ? formatKoreanPhone(site.prospectPhone)
    : "";

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/sites" className="text-[#3182f6] hover:text-[#3182f6] text-sm">&larr; Back to list</Link>
        <h1 className="text-xl font-bold text-slate-900">Account Detail: {site.shopId}</h1>
        <span className={`inline-block rounded-md px-3 py-1 text-xs font-medium ${
          isExpired ? "bg-red-50 text-red-700" : site.accountType === '1' ? "bg-emerald-50 text-emerald-700" : "bg-[#3182f6]/10 text-[#3182f6]"
        }`}>
          {ACCOUNT_TYPES[site.accountType] || "Free"} {isExpired && "(Expired)"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Account Info</h2>
          <form action={updateSite}>
            <input type="hidden" name="id" value={site.id} />
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Account ID</label>
                <div className="flex gap-2 items-center">
                  <input name="shopId" defaultValue={site.shopId} className="flex-1 border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800" />
                  <a href={`https://${getTempDomain(site)}/${site.shopId}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#3182f6] hover:bg-white hover:text-[#3182f6] transition-colors">Open ↗</a>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Site Name</label>
                <input name="name" defaultValue={site.name} className="w-full border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Owner</label>
                <Link href={`/admin/members/${site.user.id}`} className="text-[#3182f6] hover:text-[#3182f6]">
                  {site.user.email}
                </Link>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Account Type</label>
                <select name="accountType" defaultValue={site.accountType} className="w-full border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
                  <option value="0">0 - Free</option>
                  <option value="1">1 - Paid</option>
                  <option value="2">2 - Test</option>
                  <option value="9">9 - Expired</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Expiration Date</label>
                <input type="date" name="expiresAt" defaultValue={site.expiresAt ? site.expiresAt.toISOString().split("T")[0] : ""} className="w-full border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800" />
              </div>

              {/* Prospect Phone — pre-set the real customer's phone so they
                  can claim this site automatically at registration time. */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 -mx-1">
                <label className="block text-xs font-medium text-amber-800 mb-1">
                  실제 소유자 핸드폰 <span className="font-normal text-slate-500">(잠재고객 인계용)</span>
                </label>
                <input
                  name="prospectPhone"
                  type="tel"
                  defaultValue={prospectPhoneDisplay}
                  placeholder="010-1234-5678"
                  className="w-full border border-amber-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800"
                />
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  이 번호로 OTP 인증 후 회원가입하면 사이트가 자동 인계됩니다 (만료일 +30일 재설정).
                  비워두면 일반 사이트로 처리됩니다.
                </p>
                <label className="block text-xs font-medium text-amber-800 mt-3 mb-1">
                  관리자 메모
                </label>
                <textarea
                  name="prospectNote"
                  rows={2}
                  defaultValue={site.prospectNote ?? ""}
                  placeholder="소개자, 영업 상태, 후속 일정 등"
                  className="w-full border border-amber-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800"
                />
                {site.prospectPhone && (
                  <p className="mt-2 text-[11px] text-amber-700">
                    📞 현재 등록된 번호: <span className="font-mono">{prospectPhoneDisplay}</span> — 인계 대기 중
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-slate-500">
                <div>
                  <span className="text-xs">Created:</span><br />
                  {site.createdAt.toLocaleString("ko-KR")}
                </div>
                <div>
                  <span className="text-xs">Updated:</span><br />
                  {site.updatedAt.toLocaleString("ko-KR")}
                </div>
              </div>
              <button type="submit" className="bg-[#3182f6] text-white px-6 py-2 rounded text-sm font-medium hover:bg-[#364574]">
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Extend & Actions */}
        <div className="space-y-6">
          {/* Extend */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Extend Account</h2>
            <form action={extendSite} className="flex items-end gap-4">
              <input type="hidden" name="id" value={site.id} />
              <div>
                <label className="block text-xs text-slate-500 mb-1">Period</label>
                <select name="months" className="border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
                  <option value="1">1 month</option>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12" selected>1 year</option>
                  <option value="24">2 years</option>
                  <option value="36">3 years</option>
                </select>
              </div>
              <button type="submit" className="bg-emerald-500 text-white px-6 py-2 rounded text-sm font-medium hover:bg-emerald-600">
                Extend
              </button>
            </form>
          </div>

          {/* Domains */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Domains ({site.domains.length})</h2>

            {domainError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{domainError}</div>
            )}
            {domainNotice && (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{domainNotice}</div>
            )}

            {site.domains.length > 0 ? (
              <ul className="space-y-2 mb-4">
                {site.domains.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#3182f6] hover:underline font-mono truncate block">
                        {d.domain} ↗
                      </a>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                        <span className={`inline-block rounded px-1.5 py-0.5 ${
                          d.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700"
                          : d.status === "EXPIRED" ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                        }`}>{d.status}</span>
                        <span className={`inline-block rounded px-1.5 py-0.5 ${
                          d.sslEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}>SSL {d.sslEnabled ? "ON" : "OFF"}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <form action={regenerateDomainNginx}>
                        <input type="hidden" name="siteId" value={site.id} />
                        <input type="hidden" name="domainId" value={d.id} />
                        <button type="submit" className="rounded-md border border-[#3182f6]/30 bg-[#3182f6]/5 px-2 py-1 text-[11px] text-[#3182f6] hover:bg-[#3182f6]/10" title="이 도메인의 nginx vhost를 현재 shopId로 재작성합니다 (~5~15초)">Nginx 재구성</button>
                      </form>
                      <form action={removeDomainFromSite}>
                        <input type="hidden" name="siteId" value={site.id} />
                        <input type="hidden" name="domainId" value={d.id} />
                        <button type="submit" className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100" title="DB에서 도메인 매핑을 삭제합니다 (nginx 파일은 별도 삭제 필요)">삭제</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600 mb-4">No custom domains</p>
            )}

            <form action={addOrReassignDomain} className="border-t border-slate-100 pt-4">
              <input type="hidden" name="siteId" value={site.id} />
              <label className="block text-xs text-slate-500 mb-1">도메인 추가 / 인계</label>
              <div className="flex gap-2">
                <input
                  name="domain"
                  type="text"
                  required
                  placeholder="example.com"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                />
                <button type="submit" className="rounded-lg bg-[#3182f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574]">
                  연결
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                다른 사이트에 이미 등록된 도메인을 입력하면 이 사이트로 인계됩니다 (소유자도 자동 변경).
                인계 후 <span className="font-medium">Nginx 재구성</span>을 눌러 vhost를 새 shopId로 새로 씁니다.
              </p>
            </form>
          </div>

          {/* Pages */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Pages ({site.pages.length})</h2>
            <ul className="space-y-1">
              {site.pages.map((p) => (
                <li key={p.id} className="text-sm text-slate-600">
                  {p.title} <span className="text-slate-600">({p.slug})</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Delete */}
          <div className="bg-white rounded-xl border border-red-500/30 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-2 text-red-700">Danger Zone</h2>
            <p className="text-sm text-slate-500 mb-4">This will permanently delete the site and all its pages, products, and boards.</p>
            <form action={deleteSite}>
              <input type="hidden" name="id" value={site.id} />
              <button type="submit" className="bg-red-500 text-white px-6 py-2 rounded text-sm font-medium hover:bg-red-600">
                Delete Account
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* SEO/GEO Audit (full-width, admin = free) */}
      <div className="mt-6">
        <SeoAuditPanel
          siteId={site.id}
          mode="admin"
          costCredits={CREDIT_COSTS.AI_SEO_AUDIT}
          optimizeCostCredits={CREDIT_COSTS.AI_SEO_OPTIMIZE}
          balance={0}
          pages={auditPages}
        />
      </div>
    </div>
  );
}
