import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import PricingPage from "@/app/pricing/page";
import { PREFIXED_LOCALES, alternatesFor } from "@/lib/seo-locales";
import type { Locale } from "@/i18n/routing";

export const dynamicParams = false;
export function generateStaticParams() {
  return PREFIXED_LOCALES.map((lang) => ({ lang }));
}

function assertLocale(lang: string): asserts lang is Locale {
  if (!(PREFIXED_LOCALES as readonly string[]).includes(lang)) notFound();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  assertLocale(lang);
  const t = await getTranslations({ locale: lang, namespace: "pricing" });
  return {
    title: t("pageTitle"),
    description: t("metaDescription"),
    alternates: alternatesFor("/pricing", lang),
    openGraph: {
      type: "website",
      siteName: "homeNshop",
      title: t("pageTitle"),
      description: t("metaDescription"),
    },
  };
}

export default async function LocalizedPricing({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  assertLocale(lang);
  return <PricingPage />;
}
