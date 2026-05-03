import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import ClaimForm from "./claim-form";

/**
 * Claim confirmation page shown right after registration when the user's
 * verified phone number matches an admin-created prospect placeholder.
 *
 * We resolve everything server-side (site preview, prospect ownership,
 * phone match) so the form has read-only data to show and only needs the
 * user's accept/decline action. If anything's off (no session, mismatched
 * phone, already claimed) we redirect to /dashboard rather than showing
 * an error — registration already succeeded, so a missing claim is just
 * a less-good outcome, not a failure.
 */
export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; shopId?: string; name?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const siteId = params.siteId;
  if (!siteId) {
    redirect("/dashboard");
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true, phoneVerifiedAt: true, shopId: true },
  });
  // If the caller has no verified phone or already owns a site, there's
  // nothing they can claim — drop them on the dashboard.
  if (!me?.phone || !me.phoneVerifiedAt || me.shopId) {
    redirect("/dashboard");
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      user: { select: { isProspect: true, phone: true, name: true } },
      pages: {
        where: { isHome: true },
        select: { title: true, slug: true },
        take: 1,
      },
      _count: { select: { pages: true } },
    },
  });

  // Two valid claim patterns:
  //   (A) Site.prospectPhone matches the caller's verified phone — site
  //       can live under any admin/master account.
  //   (B) Site is owned by a User.isProspect placeholder whose phone
  //       matches — legacy pattern from /admin/prospects/new.
  const reservedPhone = site?.prospectPhone ?? site?.user.phone ?? null;
  const isClaimable =
    !!site &&
    (!!site.prospectPhone || site.user.isProspect) &&
    reservedPhone === me.phone;

  if (!site || !isClaimable) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-8">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
              🎁 미리 준비된 사이트
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              회원님을 위한 사이트가 준비되어 있습니다
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              관리자가 회원님의 핸드폰 번호로 사이트를 미리 만들어 두었습니다.
              아래 사이트를 인계받으면 30일 무료 이용 기간이 새로 시작됩니다.
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">사이트 이름</span>
              <span className="font-medium text-slate-900">{site.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">shopId</span>
              <span className="font-mono text-slate-800">{site.shopId}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">언어</span>
              <span className="text-slate-800">
                {site.defaultLanguage.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">페이지 수</span>
              <span className="text-slate-800">{site._count.pages}개</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">미리보기</span>
              <a
                href={`https://${site.tempDomain}/${site.shopId}/${site.defaultLanguage}/`}
                target="_blank"
                rel="noreferrer"
                className="text-[#405189] hover:underline"
              >
                새 창에서 열기 ↗
              </a>
            </div>
          </div>

          <ClaimForm siteId={site.id} shopId={site.shopId} />

          <p className="mt-4 text-xs text-slate-500 leading-relaxed">
            인계받지 않으면 빈 계정으로 시작되며, 이 사이트는 그대로 유지됩니다.
            관리자에게 문의하여 다시 연결할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
