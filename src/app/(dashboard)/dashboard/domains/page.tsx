import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AddDomainForm from "./add-domain-form";
import ProvisionSslButton from "./provision-ssl-button";

export default async function DashboardDomainsPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("domainsPage");
  const td = await getTranslations("dashboard");

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
              homeNshop
            </Link>
            <span className="dash-logo-sub">{t("title")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">
              {td("dashboard")}
            </Link>
            <Link href="/dashboard/profile" className="dash-header-btn">
              {td("memberInfo")}
            </Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="dash-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 className="dash-title">{t("title")}</h1>
          <span style={{ fontSize: 13, color: "#868e96" }}>
            {domains.length}{t("domainCount")}
          </span>
        </div>

        {/* Domain Table */}
        {domains.length > 0 ? (
          <div className="dash-table" style={{ marginBottom: 24 }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>{t("colDomain")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>{t("colStatus")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>{t("colSsl")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>{t("colSite")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 700, color: "#495057" }}>{t("colDate")}</th>
                  <th style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: "#495057" }}>{t("colManage")}</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((domain) => (
                  <tr key={domain.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td style={{ padding: "12px 20px", fontFamily: "monospace", fontSize: 13 }}>
                      {domain.domain}
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "center" }}>
                      <DomainStatusBadge status={domain.status} labels={{
                        PENDING: t("statusPending"),
                        ACTIVE: t("statusActive"),
                        EXPIRED: t("statusExpired"),
                      }} />
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "center" }}>
                      {domain.sslEnabled ? (
                        <span style={{ display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, background: "#f0fdf4", color: "#22c55e" }}>
                          {t("sslActive")}
                        </span>
                      ) : domain.status === "ACTIVE" ? (
                        <ProvisionSslButton domainId={domain.id} />
                      ) : (
                        <span style={{ display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, background: "#f8f9fa", color: "#868e96" }}>
                          {t("sslInactive")}
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
                      <DeleteDomainButton domainId={domain.id} label={t("delete")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: "48px 24px", textAlign: "center", marginBottom: 24, color: "#868e96", fontSize: 14 }}>
            {t("noDomains")}
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

function DomainStatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const styles: Record<string, { bg: string; color: string }> = {
    PENDING: { bg: "#fffbeb", color: "#d97706" },
    ACTIVE: { bg: "#f0fdf4", color: "#22c55e" },
    EXPIRED: { bg: "#fef2f2", color: "#ef4444" },
  };

  const s = styles[status] || styles.PENDING;

  return (
    <span style={{ display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, background: s.bg, color: s.color }}>
      {labels[status] || status}
    </span>
  );
}

function DeleteDomainButton({ domainId, label }: { domainId: string; label: string }) {
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
        {label}
      </button>
    </form>
  );
}
