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
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
