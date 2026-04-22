import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import TemplateEditForm from "./template-edit-form";
import { auth } from "@/lib/auth";
import { canEditTemplates } from "@/lib/permissions";

export default async function AdminTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!canEditTemplates(session?.user?.email)) {
    redirect("/admin");
  }

  const { id } = await params;
  const template = await prisma.template.findUnique({
    where: { id },
    select: {
      id: true, name: true, path: true, thumbnailUrl: true, category: true,
      price: true, keywords: true, description: true, isActive: true,
      isPublic: true, sortOrder: true, clicks: true, userId: true,
      demoSiteId: true, createdAt: true, updatedAt: true,
    },
  });
  if (!template) notFound();

  // Stats from the Template blobs — shown as informational metrics only.
  const stats = await prisma.template.findUnique({
    where: { id },
    select: {
      headerHtml: true, menuHtml: true, footerHtml: true, cssText: true,
      pagesSnapshot: true,
    },
  });
  const pageCount = Array.isArray(stats?.pagesSnapshot)
    ? (stats!.pagesSnapshot as unknown[]).length
    : 0;

  return (
    <>
      <header className="mb-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link href="/admin/templates" className="hover:text-[#405189]">템플릿 관리</Link>
          <span>›</span>
          <span>{template.name}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">{template.name}</h1>
        <p className="text-sm text-slate-500 mt-1 font-mono">
          {template.id} · {template.userId ? "유저 템플릿" : "시스템 템플릿"}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <TemplateEditForm
          template={{
            id: template.id,
            name: template.name,
            description: template.description ?? "",
            keywords: template.keywords ?? "",
            category: template.category ?? "",
            thumbnailUrl: template.thumbnailUrl ?? "",
            sortOrder: template.sortOrder,
            price: template.price,
            isActive: template.isActive,
            isPublic: template.isPublic,
          }}
        />

        <aside className="space-y-4">
          <section className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              콘텐츠 통계
            </h3>
            <dl className="text-xs text-slate-600 space-y-1.5">
              <div className="flex justify-between">
                <dt>페이지</dt>
                <dd className="font-mono text-slate-800">{pageCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>헤더</dt>
                <dd className="font-mono text-slate-800">{stats?.headerHtml?.length ?? 0} chars</dd>
              </div>
              <div className="flex justify-between">
                <dt>메뉴</dt>
                <dd className="font-mono text-slate-800">{stats?.menuHtml?.length ?? 0} chars</dd>
              </div>
              <div className="flex justify-between">
                <dt>푸터</dt>
                <dd className="font-mono text-slate-800">{stats?.footerHtml?.length ?? 0} chars</dd>
              </div>
              <div className="flex justify-between">
                <dt>CSS</dt>
                <dd className="font-mono text-slate-800">{stats?.cssText?.length ?? 0} chars</dd>
              </div>
              <div className="flex justify-between">
                <dt>클릭 수</dt>
                <dd className="font-mono text-slate-800">{template.clicks.toLocaleString()}</dd>
              </div>
            </dl>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              디자인 연결
            </h3>
            {template.demoSiteId ? (
              <>
                <p className="text-xs text-slate-600 mb-3">
                  디자인 편집용 스토리지 사이트가 연결되어 있습니다. 목록 페이지에서 <b>디자인 수정</b>으로 편집 후 <b>적용</b>을 누르세요.
                </p>
                <Link
                  href={`/admin/sites/${template.demoSiteId}`}
                  className="inline-block text-xs text-[#405189] hover:underline"
                >
                  연결된 사이트 보기 ›
                </Link>
              </>
            ) : (
              <p className="text-xs text-slate-600">
                아직 디자인 편집을 시작하지 않았습니다. 목록의 <b>디자인 수정</b>을 누르면 스토리지 사이트가 자동 생성됩니다.
              </p>
            )}
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              타임스탬프
            </h3>
            <dl className="text-xs text-slate-600 space-y-1.5">
              <div>
                <dt className="text-slate-400">생성</dt>
                <dd className="font-mono">{template.createdAt.toISOString().slice(0, 19).replace("T", " ")}</dd>
              </div>
              <div>
                <dt className="text-slate-400">수정</dt>
                <dd className="font-mono">{template.updatedAt.toISOString().slice(0, 19).replace("T", " ")}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
