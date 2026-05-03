import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTempDomain } from "@/lib/temp-domains";
import { normalizePhoneDigits, formatKoreanPhone } from "@/lib/sms";

const ACCOUNT_TYPES: Record<string, string> = { "0": "Free", "1": "Paid", "2": "Test", "9": "Expired" };

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

export default async function AdminSiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      domains: true,
      pages: { select: { id: true, title: true, slug: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (!site) notFound();

  const isExpired = site.expiresAt && new Date(site.expiresAt) < new Date();
  const prospectPhoneDisplay = site.prospectPhone
    ? formatKoreanPhone(site.prospectPhone)
    : "";

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/sites" className="text-[#405189] hover:text-[#405189] text-sm">&larr; Back to list</Link>
        <h1 className="text-xl font-bold text-slate-900">Account Detail: {site.shopId}</h1>
        <span className={`inline-block rounded-md px-3 py-1 text-xs font-medium ${
          isExpired ? "bg-red-50 text-red-700" : site.accountType === '1' ? "bg-emerald-50 text-emerald-700" : "bg-[#405189]/10 text-[#405189]"
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
                  <a href={`https://${getTempDomain(site)}/${site.shopId}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#405189] hover:bg-white hover:text-[#405189] transition-colors">Open ↗</a>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Site Name</label>
                <input name="name" defaultValue={site.name} className="w-full border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm text-slate-800" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Owner</label>
                <Link href={`/admin/members/${site.user.id}`} className="text-[#405189] hover:text-[#405189]">
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
              <button type="submit" className="bg-[#405189] text-white px-6 py-2 rounded text-sm font-medium hover:bg-[#364574]">
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
            {site.domains.length > 0 ? (
              <ul className="space-y-2">
                {site.domains.map((d) => (
                  <li key={d.id} className="text-sm"><a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer" className="text-[#405189] hover:text-[#405189]">{d.domain} ↗</a></li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No custom domains</p>
            )}
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
    </div>
  );
}
