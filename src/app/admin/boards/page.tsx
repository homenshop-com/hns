import { prisma } from "@/lib/db";
import Link from "next/link";
import BoardTable from "./board-table";
import { parsePageParam } from "@/lib/pagination";

const PAGE_SIZE = 30;

export default async function AdminBoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; siteId?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const siteFilter = params.siteId || undefined;
  const q = params.q?.trim() || undefined;

  const where: Record<string, unknown> = { parentId: null };
  if (siteFilter) where.siteId = siteFilter;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
    ];
  }

  const [posts, totalCount, sites] = await Promise.all([
    prisma.boardPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        author: true,
        createdAt: true,
        views: true,
        lang: true,
        siteId: true,
        category: { select: { name: true } },
        site: { select: { name: true, shopId: true } },
        _count: { select: { replies: true } },
      },
    }),
    prisma.boardPost.count({ where }),
    prisma.site.findMany({
      select: { id: true, name: true, shopId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Build base query string (without page)
  const qsParts: string[] = [];
  if (siteFilter) qsParts.push(`siteId=${siteFilter}`);
  if (q) qsParts.push(`q=${encodeURIComponent(q)}`);
  const qsBase = qsParts.length > 0 ? `?${qsParts.join("&")}` : "";

  // Serialize posts for client component
  const serializedPosts = posts.map(p => ({
    id: p.id,
    title: p.title,
    author: p.author,
    createdAt: p.createdAt.toISOString(),
    views: p.views,
    lang: p.lang,
    siteShopId: p.site?.shopId || "-",
    categoryName: p.category?.name || "-",
    replyCount: p._count.replies,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">게시판 관리</h1>
        <span className="text-sm text-slate-500">
          총 {totalCount.toLocaleString()}개 게시물
        </span>
      </div>

      {/* Site Filter */}
      <div className="mb-4 flex gap-1.5 items-center flex-wrap">
        <Link
          href="/admin/boards"
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            !siteFilter
              ? "bg-[#405189]/20 text-[#405189]"
              : "border border-slate-300 text-slate-600 hover:bg-slate-100"
          }`}
        >
          전체
        </Link>
        {sites.map((s) => (
          <Link
            key={s.id}
            href={`/admin/boards?siteId=${s.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              siteFilter === s.id
                ? "bg-[#405189]/20 text-[#405189]"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {s.name || s.shopId}
          </Link>
        ))}
      </div>

      {/* Search */}
      <form action="/admin/boards" method="GET" className="mb-4 flex gap-2 items-center">
        {siteFilter && <input type="hidden" name="siteId" value={siteFilter} />}
        <input
          type="text"
          name="q"
          defaultValue={q || ""}
          placeholder="제목 또는 작성자 검색..."
          className="flex-1 max-w-sm rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800 placeholder-slate-500 outline-none focus:border-[#405189]/50 focus:ring-1 focus:ring-[#405189]/30"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574]"
        >
          검색
        </button>
        {q && (
          <Link
            href={`/admin/boards${siteFilter ? `?siteId=${siteFilter}` : ""}`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            초기화
          </Link>
        )}
      </form>

      <BoardTable
        posts={serializedPosts}
        currentPage={page}
        totalPages={totalPages}
        qsBase={qsBase}
      />
    </div>
  );
}
