import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

const { GET: authGET, POST: authPOST } = handlers;

/**
 * Multi-domain (white-label reseller) host fix.
 *
 * Behind nginx, Next.js reports `request.url` with the internal bind address
 * (http://localhost:3000), NOT the public host. Auth.js builds the OAuth
 * `redirect_uri` from `request.url`'s origin, so without intervention every
 * provider callback pointed at localhost — and previously we masked this by
 * pinning AUTH_URL to homenshop.com, which then broke Google login from
 * reseller domains (the host-only PKCE cookie was set on e.g. homenshop.net
 * but the callback went to homenshop.com).
 *
 * We now reconstruct the request URL from the forwarded host/proto headers
 * (nginx sets `X-Forwarded-Host` / `X-Forwarded-Proto`) so the redirect_uri,
 * state, and PKCE cookie all live on the domain the user actually started on.
 * Each reseller login domain must be registered as an authorized redirect URI
 * in Google Cloud Console.
 */
function withForwardedHost(req: NextRequest): NextRequest {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return req;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const url = new URL(req.url);
  url.host = host; // setting host also clears any :3000 port
  url.protocol = `${proto}:`;
  if (url.toString() === req.url) return req;
  return new NextRequest(url.toString(), req);
}

export const GET = (req: NextRequest) => authGET(withForwardedHost(req));
export const POST = (req: NextRequest) => authPOST(withForwardedHost(req));
