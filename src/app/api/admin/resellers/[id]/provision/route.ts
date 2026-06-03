import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/admin/resellers/[id]/provision
 *
 * Triggers nginx vhost + Let's Encrypt SSL provisioning for a reseller's
 * white-label domain by running the server-side script
 * `/root/scripts/provision-reseller-domain.sh <domain>`.
 *
 * This is a privileged server operation (writes nginx config, runs certbot,
 * reloads nginx), so it is restricted to FULL admins — never reseller-scoped
 * operators. The Next.js process runs as root via PM2 on the host, so it can
 * exec the script directly.
 *
 * The domain is read from the DB (not the request body) and re-validated
 * against a strict hostname regex before being passed to execFile (args array,
 * no shell), eliminating command-injection risk.
 */

const PROVISION_SCRIPT = "/root/scripts/provision-reseller-domain.sh";
// Strict hostname: labels of [a-z0-9-] separated by dots, TLD ≥ 2 letters.
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
// certbot HTTP-01 + nginx reload can take a while; give it headroom.
const TIMEOUT_MS = 110_000;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (adminUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const reseller = await prisma.reseller.findUnique({
    where: { id },
    select: { domain: true },
  });
  if (!reseller) {
    return NextResponse.json({ error: "리셀러를 찾을 수 없습니다." }, { status: 404 });
  }

  const domain = reseller.domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) {
    return NextResponse.json(
      { error: `유효하지 않은 도메인 형식입니다: ${domain}` },
      { status: 400 }
    );
  }

  const result = await new Promise<{
    ok: boolean;
    code: number | null;
    output: string;
  }>((resolve) => {
    execFile(
      "bash",
      [PROVISION_SCRIPT, domain],
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const output = `${stdout || ""}${stderr || ""}`.trim();
        if (err) {
          const code =
            typeof (err as { code?: unknown }).code === "number"
              ? ((err as { code: number }).code)
              : null;
          resolve({ ok: false, code, output });
        } else {
          resolve({ ok: true, code: 0, output });
        }
      }
    );
  });

  if (!result.ok) {
    // The script exits non-zero on DNS-not-pointed (2) and cert/nginx failures.
    // Surface its full output so the admin can see exactly what went wrong.
    return NextResponse.json(
      {
        error: "프로비저닝에 실패했습니다. 아래 로그를 확인하세요.",
        output: result.output || "(스크립트 출력 없음)",
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    domain,
    output: result.output,
  });
}
