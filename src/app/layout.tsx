import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import SessionProvider from "@/components/SessionProvider";
import "./globals.css";
import "./landing.css";
// Font Awesome 6 Free — replaces emoji icons in landing + about + AI sites.
// Import the CSS only (not the JS kit) so SSR renders icons server-side
// and the bundle stays small (icons are webfont glyphs).
import "@fortawesome/fontawesome-free/css/all.min.css";

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
        {/* Korean web fonts catalog — drives the design editor's font picker.
            Single Google Fonts request bundles all 24 families (display=swap
            so render is never blocked while a face downloads). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Cute+Font&family=Do+Hyeon&family=East+Sea+Dokdo&family=Gaegu:wght@300;400;700&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Gugi&family=Hi+Melody&family=IBM+Plex+Sans+KR:wght@300;400;500;600;700&family=Jeju+Gothic&family=Jeju+Hallasan&family=Jeju+Myeongjo&family=Jua&family=Nanum+Brush+Script&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Gothic+Coding:wght@400;700&family=Nanum+Myeongjo:wght@400;700;800&family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Serif+KR:wght@300;400;500;700;900&family=Poor+Story&family=Single+Day&family=Song+Myung&family=Stylish&family=Sunflower:wght@300;500;700&family=Yeon+Sung&family=JetBrains+Mono:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap"
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
