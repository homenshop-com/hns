import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import SessionProvider from "@/components/SessionProvider";
import "./globals.css";
import "./landing.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Homenshop - Multilingual Website Builder for Korean Export SMEs",
    template: "%s | Homenshop",
  },
  description: "Multilingual website builder for Korean SMEs preparing for global export. Create product catalogs and company pages in English, Chinese, Japanese, Spanish — no coding required.",
  keywords: ["multilingual website builder", "Korean export SME", "다국어 홈페이지", "수출 중소기업 홈페이지", "product catalog website", "KOTRA website", "수출바우처 홈페이지", "해외 바이어 홈페이지", "홈페이지 제작", "홈페이지 빌더", "website builder Korea"],
  authors: [{ name: "Homenshop" }],
  creator: "Homenshop",
  publisher: "Homenshop",
  metadataBase: new URL("https://homenshop.com"),
  alternates: {
    canonical: "https://homenshop.com",
  },
  openGraph: {
    type: "website",
    siteName: "Homenshop",
    title: "Homenshop - Multilingual Website Builder for Korean Export SMEs",
    description: "Create product catalogs and company pages in buyer languages. No coding required. 100+ templates, mobile responsive.",
    url: "https://homenshop.com",
    locale: "ko_KR",
    alternateLocale: ["en_US", "ja_JP", "zh_CN"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Homenshop - Multilingual Website Builder for Export SMEs",
    description: "Create multilingual product catalogs for overseas buyers. No coding required.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider>{children}</SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
