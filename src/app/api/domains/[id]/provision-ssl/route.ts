/**
 * Trigger Let's Encrypt SSL provisioning for a domain.
 *
 * Spawns /root/scripts/provision-domain-ssl.sh in the background
 * (detached, stdio ignored) so the HTTP request returns immediately.
 * The script issues a cert via certbot, writes the HTTPS nginx vhost,
 * reloads nginx, and flips Domain.sslEnabled=true in Postgres when
 * done. On failure it leaves sslEnabled=false and writes details to
 * /var/log/provision-ssl-<domain>.log.
 *
 * Poll by re-reading the domain list (sslEnabled field) — the client
 * does this via router.refresh() after clicking "SSL 발급".
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spawn } from "child_process";

const SCRIPT_PATH = "/root/scripts/provision-domain-ssl.sh";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const domain = await prisma.domain.findUnique({
    where: { id },
    include: {
      site: {
        select: { id: true, shopId: true, userId: true, defaultLanguage: true },
      },
    },
  });

  if (!domain) {
    return NextResponse.json({ error: "도메인을 찾을 수 없습니다." }, { status: 404 });
  }
  if (domain.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (domain.sslEnabled) {
    return NextResponse.json(
      { error: "이미 SSL 인증서가 발급되어 있습니다." },
      { status: 409 },
    );
  }

  // Fire-and-forget. Script takes 10–60s (DNS + certbot + nginx reload),
  // which blows past nginx's default 60s proxy_read_timeout for /api/.
  // Detach so the shell can exit while the script keeps running.
  const child = spawn(
    SCRIPT_PATH,
    [domain.domain, domain.site.shopId, domain.site.defaultLanguage || "en"],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, DB_PASSWORD: process.env.DB_PASSWORD || "HnsApp2026Secure" },
    },
  );
  child.unref();

  return NextResponse.json({
    started: true,
    domain: domain.domain,
    message: "SSL 인증서 발급을 시작했습니다. 1~2분 후 페이지를 새로고침하세요.",
  });
}
