import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import SignOutButton from "../sign-out-button";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { DashboardIconSprite, Icon } from "../dashboard-icons";
import SupportChat from "./support-chat";
import { getBalance } from "@/lib/credits";
import "../dashboard-v2.css";
import "./support-v2.css";

export const metadata = { title: "도움말 · 지원 — homeNshop" };

function initialsFrom(s: string): string {
  const clean = (s || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!clean) return "?";
  if (/^[A-Za-z0-9]+$/.test(clean)) return clean.slice(0, 2).toUpperCase();
  return clean.slice(0, 2);
}

export default async function SupportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, credits] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
    getBalance(session.user.id),
  ]);

  const displayName = user?.name || user?.email?.split("@")[0] || "게스트";
  const userInitial = initialsFrom(displayName)[0] || "U";

  return (
    <>
      <ImpersonationBanner />
      <DashboardIconSprite />
      <div className="dv2-app">
        {/* ───── SIDEBAR ───── */}
        <aside className="dv2-side">
          <Link href="/dashboard" className="dv2-brand" title="대시보드로"><div className="dv2-brand-mark">h</div><div className="dv2-brand-name">home<span className="ns">Nshop</span></div></Link>

          <div className="dv2-side-section">
            <div className="dv2-side-label">사이트 관리</div>
            <nav className="dv2-nav">
              <Link href="/dashboard">
                <span className="ic"><Icon id="i-home" /></span>
                <span className="label">대시보드</span>
              </Link>
              <Link href="/dashboard/domains">
                <span className="ic"><Icon id="i-globe" /></span>
                <span className="label">도메인 관리</span>
              </Link>
            </nav>
          </div>

          <div className="dv2-side-section">
            <div className="dv2-side-label">계정</div>
            <nav className="dv2-nav">
              <Link href="/dashboard/credits">
                <span className="ic"><Icon id="i-credit" /></span>
                <span className="label">AI 크레딧</span>
              </Link>
              <Link href="/dashboard/profile">
                <span className="ic"><Icon id="i-user" /></span>
                <span className="label">관리자 정보</span>
              </Link>
              <Link className="active" href="/dashboard/support">
                <span className="ic"><Icon id="i-chat" /></span>
                <span className="label">도움말 · 지원</span>
              </Link>
            </nav>
          </div>

          <div className="dv2-side-footer">
            <div className="dv2-coin-card">
              <div className="row">
                <div className="ball">C</div>
                <div>
                  <div className="num">
                    {credits.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>coin</span>
                  </div>
                  <div className="cap">AI 제작 · 편집에 사용</div>
                </div>
              </div>
              <Link className="go" href="/dashboard/credits">
                충전하기 <Icon id="i-chev-right" size={12} />
              </Link>
            </div>
          </div>
        </aside>

        {/* ───── MAIN ───── */}
        <div className="dv2-main">
          <div className="dv2-topbar">
            <div className="dv2-crumbs">
              <Link href="/dashboard">대시보드</Link>
              <span className="sep">/</span>
              <span className="cur">도움말 · 지원</span>
            </div>
            <div className="dv2-spacer" />
            <div className="dv2-topbar-actions">
              <Link href="/dashboard/profile" className="dv2-user" style={{ textDecoration: "none" }}>
                <div>
                  <div className="name">{displayName}</div>
                  <div className="role">Owner</div>
                </div>
                <div className="dv2-avatar">{initialsFrom(displayName)}</div>
              </Link>
              <SignOutButton />
            </div>
          </div>

          <div className="dv2-content">
            <div className="sp2-page-head">
              <h1 className="sp2-page-title">
                <svg width={22} height={22} style={{ color: "var(--ai, #7b5cff)" }}>
                  <use href="#i-chat" />
                </svg>
                도움말 · 지원
                <span className="status-dot" title="응답 가능" />
              </h1>
              <div className="sp2-page-sub">
                홈앤샵 시스템 이용하시면서 불편사항이 있으시면 메세지 주시면 확인 후 바로 조치토록 하겠습니다.
              </div>
            </div>
            <SupportChat userInitial={userInitial} />
          </div>
        </div>
      </div>
    </>
  );
}
