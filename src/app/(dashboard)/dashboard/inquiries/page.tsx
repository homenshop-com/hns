import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardShell from "../dashboard-shell";
import InquiryRow from "./inquiry-row";

const STATUS_TABS: { code: string | null; label: string }[] = [
  { code: null,       label: "전체" },
  { code: "NEW",      label: "신규" },
  { code: "READ",     label: "확인" },
  { code: "REPLIED",  label: "회신" },
  { code: "ARCHIVED", label: "보관" },
];

const SOURCE_TABS: { code: string | null; label: string }[] = [
  { code: null,      label: "모두" },
  { code: "contact", label: "일반 문의" },
  { code: "product", label: "상품 문의" },
];

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; siteId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { status, source, siteId } = await searchParams;

  // User's sites — used for the per-site filter chip
  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    select: { id: true, shopId: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  if (sites.length === 0) {
    return (
      <DashboardShell active="boards" breadcrumbs={[{ label: "홈", href: "/dashboard" }, { label: "문의 · 예약" }]}>
        <div style={{ padding: 64, textAlign: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ fontSize: 16, color: "#374151", marginBottom: 8 }}>아직 사이트가 없습니다.</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>홈페이지를 먼저 만들면 문의 폼 제출 내역이 여기에 모입니다.</div>
          <Link href="/dashboard/templates" style={{ display: "inline-block", padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#2563eb", borderRadius: 6, textDecoration: "none" }}>
            홈페이지 만들기
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const where: {
    status?: string;
    source?: string;
    siteId?: string;
    site: { userId: string };
  } = { site: { userId: session.user.id } };
  if (status && ["NEW", "READ", "REPLIED", "ARCHIVED"].includes(status)) where.status = status;
  if (source && ["contact", "product"].includes(source)) where.source = source;
  if (siteId && sites.some((s) => s.id === siteId)) where.siteId = siteId;

  const inquiries = await prisma.inquiry.findMany({
    where,
    select: {
      id: true,
      siteId: true,
      source: true,
      productName: true,
      productLegacyId: true,
      productId: true,
      pageUrl: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      message: true,
      status: true,
      replySubject: true,
      replyBody: true,
      repliedAt: true,
      createdAt: true,
      site: { select: { name: true, shopId: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  // Status counts for tab badges (entire user, before status filter)
  const counts = await prisma.inquiry.groupBy({
    by: ["status"],
    where: {
      site: { userId: session.user.id },
      ...(source && ["contact", "product"].includes(source) ? { source } : {}),
      ...(siteId && sites.some((s) => s.id === siteId) ? { siteId } : {}),
    },
    _count: { _all: true },
  });
  const totalCount = counts.reduce((acc, c) => acc + c._count._all, 0);
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  function buildHref(opts: { status?: string | null; source?: string | null; siteId?: string | null }) {
    const params = new URLSearchParams();
    const finalStatus = opts.status === undefined ? status : opts.status;
    const finalSource = opts.source === undefined ? source : opts.source;
    const finalSiteId = opts.siteId === undefined ? siteId : opts.siteId;
    if (finalStatus) params.set("status", finalStatus);
    if (finalSource) params.set("source", finalSource);
    if (finalSiteId) params.set("siteId", finalSiteId);
    const qs = params.toString();
    return qs ? `/dashboard/inquiries?${qs}` : "/dashboard/inquiries";
  }

  return (
    <DashboardShell active="inquiries" breadcrumbs={[{ label: "홈", href: "/dashboard" }, { label: "문의 · 예약" }]}>
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>문의 · 예약</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            홈페이지의 문의 폼·상품 문의 버튼으로 들어온 모든 요청. 신규 항목은 노란 배경으로 표시됩니다.
          </p>
        </div>

        {/* Filters */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <FilterRow label="상태">
            {STATUS_TABS.map((t) => {
              const active = (status || null) === t.code;
              const count = t.code === null ? totalCount : (countByStatus[t.code] ?? 0);
              return (
                <Link key={t.code ?? "all"} href={buildHref({ status: t.code })} style={chipStyle(active)}>
                  {t.label}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{count}</span>
                </Link>
              );
            })}
          </FilterRow>
          <FilterRow label="유형">
            {SOURCE_TABS.map((t) => {
              const active = (source || null) === t.code;
              return (
                <Link key={t.code ?? "all"} href={buildHref({ source: t.code })} style={chipStyle(active)}>
                  {t.label}
                </Link>
              );
            })}
          </FilterRow>
          {sites.length > 1 && (
            <FilterRow label="사이트">
              <Link href={buildHref({ siteId: null })} style={chipStyle(!siteId)}>전체</Link>
              {sites.map((s) => {
                const active = siteId === s.id;
                return (
                  <Link key={s.id} href={buildHref({ siteId: s.id })} style={chipStyle(active)}>
                    {s.name}
                    <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7, fontFamily: "monospace" }}>{s.shopId}</span>
                  </Link>
                );
              })}
            </FilterRow>
          )}
        </div>

        {/* List */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr 130px 130px 100px 32px",
            gap: 16,
            padding: "12px 20px",
            background: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
            fontSize: 11,
            fontWeight: 600,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            <div>상태</div>
            <div>이름 · 미리보기</div>
            <div>연락처</div>
            <div>사이트</div>
            <div>접수일</div>
            <div></div>
          </div>
          {inquiries.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
              조건에 맞는 문의가 없습니다.
            </div>
          ) : (
            inquiries.map((inq) => (
              <InquiryRow
                key={inq.id}
                inquiry={{
                  id: inq.id,
                  siteId: inq.siteId,
                  siteName: inq.site.name,
                  siteShopId: inq.site.shopId,
                  source: inq.source,
                  productName: inq.productName,
                  productLegacyId: inq.productLegacyId,
                  productId: inq.productId,
                  pageUrl: inq.pageUrl,
                  name: inq.name,
                  email: inq.email,
                  phone: inq.phone,
                  company: inq.company,
                  message: inq.message,
                  status: inq.status,
                  replySubject: inq.replySubject,
                  replyBody: inq.replyBody,
                  repliedAt: inq.repliedAt ? inq.repliedAt.toISOString() : null,
                  createdAt: inq.createdAt.toISOString(),
                }}
              />
            ))
          )}
        </div>
        {inquiries.length === 200 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
            최근 200건만 표시됩니다. 필터를 좁혀서 검색하세요.
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 50 }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    color: active ? "#fff" : "#374151",
    background: active ? "#111827" : "#f3f4f6",
    border: `1px solid ${active ? "#111827" : "#e5e7eb"}`,
    borderRadius: 999,
    textDecoration: "none",
  };
}
