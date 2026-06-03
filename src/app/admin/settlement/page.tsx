import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getHistory, getSummary } from "@/lib/reseller-revenue";

export const metadata = { title: "리셀러 정산 — homeNshop" };

const KIND_LABEL: Record<string, string> = {
  EARNING: "귀속 매출",
  PAYOUT: "출금",
  ADJUSTMENT: "조정",
};

/**
 * Reseller settlement — rendered INSIDE the admin console (AdminLayout) so the
 * operator keeps the scoped admin sidebar. The old member-dashboard route
 * (/dashboard/reseller) now redirects here to avoid the jarring sidebar swap.
 */
export default async function ResellerSettlementPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const reseller = await prisma.reseller.findUnique({
    where: { ownerUserId: session.user.id },
    select: { id: true, domain: true, siteName: true, revenueShareBps: true },
  });

  // Only reseller owners have settlement; full admins land back on the console.
  if (!reseller) redirect("/admin");

  const [summary, history] = await Promise.all([
    getSummary(reseller.id),
    getHistory(reseller.id, 100, 0),
  ]);

  const sharePercent = (reseller.revenueShareBps / 100).toFixed(0);

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
          리셀러 정산
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>
          {reseller.siteName} ({reseller.domain}) · 분배율 {sharePercent}%
        </p>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #dbeafe",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            미지급 잔액
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#3182f6" }}>
            {summary.balance.toLocaleString()}원
          </div>
        </div>
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            누적 귀속 매출
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            {summary.totalEarned.toLocaleString()}원
          </div>
        </div>
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            누적 출금
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            {summary.totalPaidOut.toLocaleString()}원
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        출금은 관리자가 계좌이체 후 기록합니다. 출금 요청은 고객센터로 문의해 주세요.
      </p>

      {/* History */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "10px 14px", fontWeight: 600 }}>일시</th>
                <th style={{ padding: "10px 14px", fontWeight: 600 }}>구분</th>
                <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>금액</th>
                <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>잔액</th>
                <th style={{ padding: "10px 14px", fontWeight: 600 }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "#94a3b8" }}>
                    정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          background:
                            row.kind === "EARNING"
                              ? "#ecfdf5"
                              : row.kind === "PAYOUT"
                                ? "#fffbeb"
                                : "#f1f5f9",
                          color:
                            row.kind === "EARNING"
                              ? "#047857"
                              : row.kind === "PAYOUT"
                                ? "#b45309"
                                : "#475569",
                        }}
                      >
                        {KIND_LABEL[row.kind] ?? row.kind}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        textAlign: "right",
                        fontWeight: 600,
                        color: row.amount >= 0 ? "#0f172a" : "#dc2626",
                      }}
                    >
                      {row.amount >= 0 ? "+" : ""}
                      {row.amount.toLocaleString()}원
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "#64748b" }}>
                      {row.balanceAfter.toLocaleString()}원
                    </td>
                    <td style={{ padding: "10px 14px", color: "#64748b" }}>
                      {row.kind === "EARNING" && row.orderAmount != null
                        ? `주문 ${row.orderAmount.toLocaleString()}원 × ${((row.shareBps ?? 0) / 100).toFixed(0)}%`
                        : row.note || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
