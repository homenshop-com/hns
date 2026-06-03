import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import DashboardShell from "../dashboard-shell";
import InquiryRow from "./inquiry-row";

const STATUS_TABS: { code: string | null; labelKey: string }[] = [
  { code: null,       labelKey: "statusAll" },
  { code: "NEW",      labelKey: "statusNew" },
  { code: "READ",     labelKey: "statusRead" },
  { code: "REPLIED",  labelKey: "statusReplied" },
  { code: "ARCHIVED", labelKey: "statusArchived" },
];

const SOURCE_TABS: { code: string | null; labelKey: string }[] = [
  { code: null,      labelKey: "sourceAll" },
  { code: "contact", labelKey: "sourceContact" },
  { code: "product", labelKey: "sourceProduct" },
];

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; siteId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("inquiriesPage");

  const { status, source, siteId } = await searchParams;

  // User's sites — used for the per-site filter chip
  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    select: { id: true, shopId: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  if (sites.length === 0) {
    return (
      <DashboardShell active="boards" breadcrumbs={[{ label: t("breadcrumbHome"), href: "/dashboard" }, { label: t("title") }]}>
        <div style={{ padding: 64, textAlign: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ fontSize: 16, color: "#374151", marginBottom: 8 }}>{t("emptyNoSitesTitle")}</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>{t("emptyNoSitesDesc")}</div>
          <Link href="/dashboard/templates" style={{ display: "inline-block", padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#2563eb", borderRadius: 6, textDecoration: "none" }}>
            {t("createHomepage")}
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
    <DashboardShell active="inquiries" breadcrumbs={[{ label: t("breadcrumbHome"), href: "/dashboard" }, { label: t("title") }]}>
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>{t("title")}</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            {t("subtitle")}
          </p>
        </div>

        {/* Filters */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <FilterRow label={t("filterStatus")}>
            {STATUS_TABS.map((tab) => {
              const active = (status || null) === tab.code;
              const count = tab.code === null ? totalCount : (countByStatus[tab.code] ?? 0);
              return (
                <Link key={tab.code ?? "all"} href={buildHref({ status: tab.code })} style={chipStyle(active)}>
                  {t(tab.labelKey)}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{count}</span>
                </Link>
              );
            })}
          </FilterRow>
          <FilterRow label={t("filterType")}>
            {SOURCE_TABS.map((tab) => {
              const active = (source || null) === tab.code;
              return (
                <Link key={tab.code ?? "all"} href={buildHref({ source: tab.code })} style={chipStyle(active)}>
                  {t(tab.labelKey)}
                </Link>
              );
            })}
          </FilterRow>
          {sites.length > 1 && (
            <FilterRow label={t("filterSite")}>
              <Link href={buildHref({ siteId: null })} style={chipStyle(!siteId)}>{t("statusAll")}</Link>
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
            <div>{t("colStatus")}</div>
            <div>{t("colNamePreview")}</div>
            <div>{t("colContact")}</div>
            <div>{t("colSite")}</div>
            <div>{t("colReceivedAt")}</div>
            <div></div>
          </div>
          {inquiries.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
              {t("emptyNoResults")}
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
            {t("limitNote", { count: 200 })}
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
