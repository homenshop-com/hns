import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Build output directory, overridable via env so the deploy script
  // can build to a staging path (e.g. .next-staging) and atomically
  // swap it into place once the build succeeds. Without this, running
  // workers can try to load a client reference manifest that's mid-
  // rewrite and throw InvariantError 500s for the whole ~90s build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "home.homenshop.com",
      },
      {
        protocol: "https",
        hostname: "home.homenshop.net",
      },
      {
        protocol: "https",
        hostname: "www.homenshop.net",
      },
    ],
  },
  async headers() {
    // Safe, framework-wide hardening. A strict script-src CSP is intentionally
    // NOT applied: published user sites author their own inline HTML/JS, so a
    // global CSP would break them. Frame-blocking is scoped to the app console
    // (admin/dashboard) to prevent clickjacking without breaking legitimate
    // embedding of published customer pages.
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
    ];
    return [
      { source: "/:path*", headers: base },
      {
        source: "/admin/:path*",
        headers: [...base, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/dashboard/:path*",
        headers: [...base, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
