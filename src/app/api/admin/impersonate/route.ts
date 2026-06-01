import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encode } from "next-auth/jwt";
import { getAdminAccess } from "@/lib/admin-access";

function getBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return "https://homenshop.com";
}

// POST — impersonate a user (admin → customer)
export async function POST(request: NextRequest) {
  const access = await getAdminAccess();
  const baseUrl = getBaseUrl(request);

  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Reseller operators may only impersonate members attributed to them
  // (and never an ADMIN/RESELLER account).
  if (access.kind === "reseller") {
    if (targetUser.resellerId !== access.resellerId || targetUser.role !== "MEMBER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const secret = process.env.AUTH_SECRET!;
  const token = await encode({
    token: {
      sub: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
      shopId: targetUser.shopId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4,
    },
    secret,
    salt: "authjs.session-token",
  });

  const isSecure = baseUrl.startsWith("https");
  const cookieName = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";

  // Backup admin session token from the request cookie
  const adminToken = request.cookies.get(cookieName)?.value || "";

  const response = NextResponse.json({ ok: true, redirectUrl: `${baseUrl}/dashboard` });

  // Set the impersonated user's session
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });

  // Backup admin session so we can restore later
  response.cookies.set("admin-session-backup", adminToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });

  // Store impersonation flag (non-httpOnly so client JS can read it)
  response.cookies.set("impersonating", targetUser.email || targetUser.id, {
    httpOnly: false,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });

  return response;
}

// DELETE — stop impersonation (restore admin session)
export async function DELETE(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const isSecure = baseUrl.startsWith("https");
  const cookieName = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";

  const adminToken = request.cookies.get("admin-session-backup")?.value;
  if (!adminToken) {
    return NextResponse.json({ error: "No admin session to restore" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, redirectUrl: `${baseUrl}/admin/sites` });

  // Restore admin session
  response.cookies.set(cookieName, adminToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  // Clear impersonation cookies
  response.cookies.delete("admin-session-backup");
  response.cookies.delete("impersonating");

  return response;
}
