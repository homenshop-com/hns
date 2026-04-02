import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import AddDomainForm from "./add-domain-form";

export default async function DashboardDomainsPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const domains = await prisma.domain.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      site: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="dash-page">
      {/* HEADER */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">
              HomeNShop
            </Link>
            <span className="dash-logo-sub">도메인 관리</span>
          </div>
          <div className="dash-header-right">
            <span className="dash-user-info">{session.user.email}</span>
            <Link href="/dashboard" className="dash-header-btn">
              대시보드
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="dash-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 className="dash-title">도메인 관리</h1>
          <span style={{ fontSize: 13, color: "#868e96" }}>
            {domains.length}개의 도메인
          </span>
        </div>

        {/* Domain Table */}
        {domains.length > 0 ? (
          <div className="dash-table" style={{ marginBottom: 24 }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>도메인</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>상태</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>SSL</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>사이트</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>등록일</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((domain) => (
                  <tr key={domain.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td style={{ padding: "12px 20px", fontFamily: "monospace", fontSize: 13 }}>
                      {domain.domain}
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "center" }}>
                      <DomainStatusBadge status={domain.status} />
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "center" }}>
                      {domain.sslEnabled ? (
                        <span style={{ display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, background: "#f0fdf4", color: "#22c55e" }}>
                          활성
                        </span>
                      ) : (
                        <span style={{ display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, background: "#f8f9fa", color: "#868e96" }}>
                          비활성
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 20px", color: "#495057" }}>
                      {domain.site.name}
                    </td>
                    <td style={{ padding: "12px 20px", color: "#868e96" }}>
                      {domain.createdAt.toLocaleDateString("ko-KR")}
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "center" }}>
                      <DeleteDomainButton domainId={domain.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: "48px 24px", textAlign: "center", marginBottom: 24, color: "#868e96", fontSize: 14 }}>
            등록된 도메인이 없습니다.
          </div>
        )}

        {/* Add Domain Form */}
        <AddDomainForm />
      </main>

      {/* FOOTER */}
      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function DomainStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    PENDING: { bg: "#fffbeb", color: "#d97706" },
    ACTIVE: { bg: "#f0fdf4", color: "#22c55e" },
    EXPIRED: { bg: "#fef2f2", color: "#ef4444" },
  };

  const labels: Record<string, string> = {
    PENDING: "대기중",
    ACTIVE: "활성",
    EXPIRED: "만료",
  };

  const s = styles[status] || styles.PENDING;

  return (
    <span style={{ display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, background: s.bg, color: s.color }}>
      {labels[status] || status}
    </span>
  );
}

function DeleteDomainButton({ domainId }: { domainId: string }) {
  return (
    <form
      action={async () => {
        "use server";
        const session = await auth();
        if (!session) return;
        await prisma.domain.deleteMany({
          where: { id: domainId, userId: session.user.id },
        });
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/dashboard/domains");
      }}
    >
      <button
        type="submit"
        style={{ fontSize: 12, color: "#e03131", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
      >
        삭제
      </button>
    </form>
  );
}
