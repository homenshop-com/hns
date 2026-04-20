import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import SessionProvider from "@/components/SessionProvider";
import "./globals.css";
import "./landing.css";

// Pretendard is loaded via a CDN <link> in <head>. It's the Korean-
// optimized variable font used by Toss / Naver / Kakao and pairs well
// with our Toss-inspired typography scale in globals.css.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "homeNshop - Multilingual Website Builder for Korean Export SMEs",
    template: "%s | homeNshop",
  },
  description: "Multilingual website builder for Korean SMEs preparing for global export. Create product catalogs and company pages in English, Chinese, Japanese, Spanish — no coding required.",
  keywords: ["multilingual website builder", "Korean export SME", "다국어 홈페이지", "수출 중소기업 홈페이지", "product catalog website", "KOTRA website", "수출바우처 홈페이지", "해외 바이어 홈페이지", "홈페이지 제작", "홈페이지 빌더", "website builder Korea"],
  authors: [{ name: "homeNshop" }],
  creator: "homeNshop",
  publisher: "homeNshop",
  metadataBase: new URL("https://homenshop.com"),
  alternates: {
    canonical: "https://homenshop.com",
  },
  openGraph: {
    type: "website",
    siteName: "homeNshop",
    title: "homeNshop - Multilingual Website Builder for Korean Export SMEs",
    description: "Create product catalogs and company pages in buyer languages. No coding required. 100+ templates, mobile responsive.",
    url: "https://homenshop.com",
    locale: "ko_KR",
    alternateLocale: ["en_US", "ja_JP", "zh_CN"],
  },
  twitter: {
    card: "summary_large_image",
    title: "homeNshop - Multilingual Website Builder for Export SMEs",
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
      <head>
        {/* Pretendard Variable — Korean-optimized font (Toss / Naver standard) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body
        className={`${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider>{children}</SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
