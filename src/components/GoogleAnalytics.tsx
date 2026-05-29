"use client";

/**
 * GoogleAnalytics — conditionally loads GA4 only on public-facing pages.
 *
 * Excluded paths (no tracking):
 *   /dashboard/*  — member dashboard (authenticated, internal)
 *   /admin/*      — system admin (authenticated, internal)
 *   /login        — auth pages
 *   /register
 *   /api/*        — API routes (never rendered in browser, but just in case)
 *
 * Only paths outside these prefixes (published sites, landing, etc.)
 * will fire pageview hits to GA4.
 */

import { usePathname } from "next/navigation";
import Script from "next/script";

const EXCLUDED_PREFIXES = [
  "/dashboard",
  "/admin",
  "/login",
  "/register",
  "/api",
];

interface GoogleAnalyticsProps {
  measurementId: string;
}

export default function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();

  if (!measurementId) return null;
  if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${measurementId}');`}
      </Script>
    </>
  );
}
