#!/usr/bin/env node
/**
 * Populate SEO + GEO (Generative Engine Optimization) metadata for the
 * unionled site. Sets:
 *
 *   Site level
 *   ──────────
 *     · description         — 150-char meta description used as og:description
 *                             and in WebSite/Organization JSON-LD
 *     · publicEmail/Phone   — exposed in Organization.contactPoint
 *     · publicAddress       — Organization.address (KR)
 *     · logoUrl             — Organization.logo (legacy h_logo_*.jpg)
 *     · seoMeta (JSON)      — alternateName, slogan, foundingDate,
 *                             areaServed, sameAs, keywords
 *
 *   Per-page level (for all 11 ko pages)
 *   ────────────────────────────────────
 *     · seoTitle            — "{pageTitle} | UNION LED 유니온엘이디 — LED 전광판 전문"
 *     · seoDescription      — page-specific (120-160 chars)
 *     · seoKeywords         — page-specific keyword set
 *     · ogImage             — page-appropriate og:image URL
 *
 * Why these help AI engines:
 *   · JSON-LD Organization schema → ChatGPT/Perplexity/Google AI Overviews
 *     quote the org name, phone, address, founding year verbatim
 *   · sameAs link to blog.naver.com/jgcheon → AI crosses reference and
 *     strengthens the entity's identity
 *   · Per-page seoDescription is what AI summarizes when citing
 *     specific pages (e.g., "UNION LED's 납품실적 page lists 3,200+
 *     installations including 관공서/증권/공장/호텔...")
 *   · areaServed=KR, language=ko → relevance for Korean searches
 *
 * Idempotent — safe to re-run.
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

const SITE_DESCRIPTION =
  "유니온엘이디 UNION LED — 2001년부터 25년간 전국 3,200+ 현장에 납품한 LED 전광판 전문 기업. 실내·옥외·주유소·풀컬러·특수형 전광판 설계·제작·시공 및 사후관리 원스톱. 관공서·학교·교회·상가 납품 전문.";

const PUBLIC_EMAIL   = "jgcheon@hanmail.net";
const PUBLIC_PHONE   = "+82-31-883-1017";
const PUBLIC_ADDRESS = "서울 마포구 양화로 73, 642 (본사) / 경기도 오산시 양산로 364 (공장·전시장)";
const LOGO_URL       = "https://home.homenshop.com/unionled/uploaded/files/h_logo_1259828261.jpg";

const SEO_META = {
  alternateName: "UNION LED · 유니온엘이디 · 유니온 LED",
  slogan: "스마트한 빛으로 미래를 밝힙니다",
  foundingDate: "2001-01-01",
  areaServed: ["KR", "South Korea", "대한민국"],
  sameAs: [
    "https://blog.naver.com/jgcheon",
    "https://unionled.asia",
    "https://home.homenshop.com/unionled/",
  ],
  businessType: "LocalBusiness",
  keywords:
    "LED 전광판,전광판,유니온엘이디,union led,실내 전광판,옥외 전광판,주유소 전광판,풀컬러 전광판,LED 채널,양면돌출 간판,특수형 전광판,관공서 전광판,교회 전광판,학교 전광판,LED 사이니지,전광판 제작,전광판 시공,전광판 견적,오산 전광판,경기 LED",
};

/* ──────────────────────────────────────────────────────────────
 * Per-page SEO. seoTitle gets the site name appended by consumer code,
 * here we just set the page-specific prefix.
 * ────────────────────────────────────────────────────────────── */
const PAGE_SEO = {
  index: {
    seoTitle: "UNION LED 유니온엘이디 — SINCE 2001 · LED 전광판 전문 · 전국 3,200+ 납품",
    seoDescription:
      "25년 LED 전광판 전문 기업 유니온엘이디. 실내·옥외·주유소·풀컬러·특수형 전광판 설계·제작·시공. 관공서·교회·학교·상가 납품 전문. 전국 3,200+ 현장 실적. 031-883-1017.",
    seoKeywords: "LED 전광판,유니온엘이디,전광판 전문,SINCE 2001,실내 전광판,옥외 전광판,주유소 전광판,풀컬러 전광판,전광판 시공",
    ogImage: LOGO_URL,
  },
  products: {
    seoTitle: "LED 전광판 제품 라인업 — UNION LED 유니온엘이디",
    seoDescription:
      "용도별 LED 전광판 전 제품군: 실내용·옥외·주유소·풀컬러·양면돌출·LED 채널·특수형·주문형. 피치(P4~P20)·밝기·방수등급(IP65) 선택 가능. 현장 맞춤 설계·제작·시공.",
    seoKeywords: "LED 전광판 종류,실내 전광판,옥외 전광판,주유소 가격 전광판,풀컬러 전광판,LED 채널,양면돌출 간판,특수형 전광판,주문형 전광판",
    ogImage: LOGO_URL,
  },
  cases: {
    seoTitle: "주요 설치 사례 — UNION LED 유니온엘이디",
    seoDescription:
      "대통령실 용산전광판, 한국도로공사, 주유소, 관공서, 교회, 학교 등 25년 LED 전광판 대표 설치 사례. 실내 풀컬러부터 대형 옥외 사이니지까지 3,200+ 시공 실적.",
    seoKeywords: "LED 전광판 설치 사례,전광판 시공 실적,대통령실 용산전광판,LED 납품 사례,전광판 사진",
    ogImage: LOGO_URL,
  },
  about: {
    seoTitle: "회사소개 — 유니온엘이디 UNION LED (SINCE 2001)",
    seoDescription:
      "유니온엘이디는 2001년 창립 이래 25년간 LED 전광판 설계·제작·시공·사후관리를 원스톱으로 제공해온 국내 전광판 전문 기업입니다. 경기도 오산시 공장·전시장 운영.",
    seoKeywords: "유니온엘이디,UNION LED,LED 전광판 전문 기업,SINCE 2001,전광판 제작 회사,오산 전광판",
    ogImage: LOGO_URL,
  },
  contact: {
    seoTitle: "견적·상담 문의 — UNION LED 유니온엘이디",
    seoDescription:
      "LED 전광판 무료 견적 및 상담 문의. TEL 031-883-1017, FAX 070-4042-1018, HP 010-3126-9939. 평일 09:00-19:00, 토요일 09:00-15:00. 본사 서울 마포구 · 공장 경기도 오산시.",
    seoKeywords: "LED 전광판 견적,전광판 상담,전광판 문의,031-883-1017,유니온엘이디 전화,UNION LED contact",
    ogImage: LOGO_URL,
  },
  portfolio: {
    seoTitle: "납품실적 — UNION LED 유니온엘이디 · 전국 3,200+ 현장",
    seoDescription:
      "25년간 유니온엘이디가 납품한 3,200+ 현장 실적. 관공서·증권·공장·호텔(820+), 학교·학원(640+), 병의원·약국(730+), 상가(520+), 교회(490+) 카테고리별 전체 고객사 명단.",
    seoKeywords: "유니온엘이디 납품실적,LED 전광판 고객사,관공서 LED 설치,학교 전광판 납품,교회 전광판 납품,병원 LED,대통령실 전광판",
    ogImage: LOGO_URL,
  },
  "about-history": {
    seoTitle: "연혁 — UNION LED 유니온엘이디 SINCE 2001",
    seoDescription:
      "2001년 창립 후 25년간의 유니온엘이디 연혁. LED 전광판 제조·납품 노하우, 주요 시공 사례, 기술 개발 과정.",
    seoKeywords: "유니온엘이디 연혁,UNION LED 히스토리,LED 전광판 회사 역사,2001 전광판",
    ogImage: LOGO_URL,
  },
  map: {
    seoTitle: "오시는 길 — UNION LED 유니온엘이디 (오산 공장·전시장)",
    seoDescription:
      "유니온엘이디 본사(서울 마포구 양화로 73, 642)·공장 및 전시장(경기도 오산시 양산로 364) 위치 안내. 실물 LED 전광판 전시 상담 가능.",
    seoKeywords: "유니온엘이디 위치,유니온엘이디 전시장,오산 LED 전광판,마포 LED,UNION LED location",
    ogImage: LOGO_URL,
  },
  whatisled: {
    seoTitle: "LED란 무엇인가 · LED 전광판 원리 — UNION LED",
    seoDescription:
      "LED(Light Emitting Diode) 원리, 수명, 전력 효율, RGB 풀컬러 구현 원리 등 LED 전광판 기초 지식 가이드. 광고용 모듈 구성과 DOT 방식 설명.",
    seoKeywords: "LED란,LED 원리,LED 전광판 원리,LED 수명,풀컬러 LED,LED DOT,LED 모듈",
    ogImage: LOGO_URL,
  },
  outdoor_spec: {
    seoTitle: "옥외 전광판 규격 — UNION LED 유니온엘이디",
    seoDescription:
      "옥외 LED 전광판 규격 가이드: 피치(P10/P16/P20) 선택, 밝기(nits), 방수등급(IP65), 가로·세로 조합 기준, 전원·통신 사양. 유니온엘이디 표준 규격 자료.",
    seoKeywords: "옥외 전광판 규격,LED 전광판 피치,P10,P16,P20,IP65 전광판,옥외 LED 밝기,옥외 사이니지 규격",
    ogImage: LOGO_URL,
  },
  indoor_spec: {
    seoTitle: "실내 전광판 규격 — UNION LED 유니온엘이디",
    seoDescription:
      "실내 LED 전광판 규격: 풀컬러 P4/P6/P10 모듈, 실내 밝기(600-1200nits), 프레임 사이즈, 컨트롤러 사양 표준 규격표.",
    seoKeywords: "실내 전광판 규격,실내 LED 피치,P4,P6 실내 전광판,실내 풀컬러 LED,교회 전광판 규격,학교 전광판 규격",
    ogImage: LOGO_URL,
  },
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  /* ─── 1. Site-level metadata ─── */
  await client.query(
    `UPDATE "Site"
        SET description    = $1,
            "publicEmail"  = $2,
            "publicPhone"  = $3,
            "publicAddress"= $4,
            "logoUrl"      = $5,
            "seoMeta"      = $6::jsonb,
            "updatedAt"    = NOW()
      WHERE id = $7`,
    [SITE_DESCRIPTION, PUBLIC_EMAIL, PUBLIC_PHONE, PUBLIC_ADDRESS, LOGO_URL,
     JSON.stringify(SEO_META), SITE_ID],
  );
  console.log(`✓ Site-level SEO set on unionled`);
  console.log(`    description    : ${SITE_DESCRIPTION.length} chars`);
  console.log(`    publicEmail    : ${PUBLIC_EMAIL}`);
  console.log(`    publicPhone    : ${PUBLIC_PHONE}`);
  console.log(`    publicAddress  : ${PUBLIC_ADDRESS.slice(0, 40)}...`);
  console.log(`    logoUrl        : ${LOGO_URL.slice(0, 60)}...`);
  console.log(`    seoMeta keys   : ${Object.keys(SEO_META).join(", ")}`);

  /* ─── 2. Per-page SEO ─── */
  console.log(`\n=== Per-page SEO ===`);
  let updated = 0;
  for (const [slug, seo] of Object.entries(PAGE_SEO)) {
    const r = await client.query(
      `UPDATE "Page"
          SET "seoTitle"      = $1,
              "seoDescription"= $2,
              "seoKeywords"   = $3,
              "ogImage"       = $4,
              "updatedAt"     = NOW()
        WHERE "siteId" = $5 AND lang = 'ko' AND slug = $6`,
      [seo.seoTitle, seo.seoDescription, seo.seoKeywords, seo.ogImage, SITE_ID, slug],
    );
    if (r.rowCount > 0) {
      updated++;
      console.log(`  ✓ ${slug.padEnd(18)} — title:${seo.seoTitle.length}c desc:${seo.seoDescription.length}c`);
    } else {
      console.log(`  ! ${slug.padEnd(18)} — page not found, skipped`);
    }
  }
  console.log(`\n  ${updated}/${Object.keys(PAGE_SEO).length} pages updated`);

  await client.end();
  console.log(`\n✓ done. Verify rendered meta tags / JSON-LD:`);
  console.log(`  curl -s 'https://home.homenshop.com/unionled/ko/' | grep -oE '<(title|meta|script type="application/ld\\+json")'`);
}

main().catch((e) => { console.error(e); process.exit(1); });
