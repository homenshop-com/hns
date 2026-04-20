/**
 * DNS verification endpoint.
 *
 * Resolves A records for the apex domain and the `www` subdomain and
 * reports whether they point to our server IP (167.71.199.28). Used by
 * the domain-add form to validate DNS setup *before* the user commits
 * to registration — so a "대기중" row isn't created when the root
 * cause is just a missing or wrong A record at the registrar.
 *
 * Uses Node's built-in `dns` module (no external service). Results are
 * not cached — DNS TTLs would already be in play, and the user clicks
 * this at most once per domain.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { promises as dns } from "dns";

const SERVER_IP = "167.71.199.28";
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

async function resolveA(host: string): Promise<{ ips: string[]; error: string | null }> {
  try {
    const ips = await dns.resolve4(host);
    return { ips, error: null };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code ?? "ERR";
    // ENOTFOUND / ENODATA = no record. Translate to friendly message.
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { ips: [], error: "레코드를 찾을 수 없습니다" };
    }
    return { ips: [], error: `조회 실패 (${code})` };
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain } = await request.json();
  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "도메인을 입력해주세요." }, { status: 400 });
  }

  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!DOMAIN_REGEX.test(normalized)) {
    return NextResponse.json(
      { error: "올바른 도메인 형식이 아닙니다. (예: example.com)" },
      { status: 400 },
    );
  }

  const [apex, www] = await Promise.all([
    resolveA(normalized),
    resolveA(`www.${normalized}`),
  ]);

  const apexOk = apex.ips.includes(SERVER_IP);
  const wwwOk = www.ips.includes(SERVER_IP);
  const allOk = apexOk && wwwOk;

  return NextResponse.json({
    domain: normalized,
    serverIp: SERVER_IP,
    allOk,
    apex: {
      host: normalized,
      ips: apex.ips,
      ok: apexOk,
      error: apex.error,
    },
    www: {
      host: `www.${normalized}`,
      ips: www.ips,
      ok: wwwOk,
      error: www.error,
    },
  });
}
