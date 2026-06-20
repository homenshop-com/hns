/**
 * IndexNow — 검색엔진(Bing/Yandex/Naver)에 변경된 URL을 즉시 통지.
 * Bing이 Copilot을, Naver가 한국 검색을 구동하므로 AEO/SEO 신선도에 직접 기여.
 *
 * 수동 트리거(사이트맵 새로고침 버튼)와 자동 트리거(페이지 저장/퍼블리시)가
 * 이 모듈을 공유한다. 키는 INDEXNOW_KEY 환경변수 + /indexnow-key.txt 라우트.
 */

import { prisma } from "@/lib/db";

// IndexNow 엔드포인트. 모두 POST {host, key, keyLocation, urlList} 수용.
const INDEXNOW_TARGETS: Array<{ name: string; url: string }> = [
  { name: "Bing", url: "https://www.bing.com/indexnow" },
  { name: "Yandex", url: "https://yandex.com/indexnow" },
  { name: "Naver", url: "https://searchadvisor.naver.com/indexnow" },
];

export interface IndexNowSubmission {
  target: string;
  ok: boolean;
  status: number;
  error?: string;
}

/** 단일 host의 URL 목록을 IndexNow 타깃들에 제출. */
export async function pingIndexNow(
  host: string,
  key: string,
  urls: string[],
): Promise<IndexNowSubmission[]> {
  const results: IndexNowSubmission[] = [];
  if (!host || !key || urls.length === 0) return results;
  const body = JSON.stringify({
    host,
    key,
    keyLocation: `https://${host}/indexnow-key.txt`,
    urlList: urls.slice(0, 10000), // IndexNow는 요청당 10k 상한
  });
  await Promise.all(
    INDEXNOW_TARGETS.map(async (t) => {
      try {
        const res = await fetch(t.url, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
          signal: AbortSignal.timeout(8000),
        });
        results.push({ target: t.name, ok: res.ok, status: res.status });
      } catch (e) {
        results.push({ target: t.name, ok: false, status: 0, error: String((e as Error).message || e) });
      }
    }),
  );
  return results;
}

/** IndexNow가 구성됐는지(키 존재). */
export function isIndexNowConfigured(): boolean {
  return Boolean(process.env.INDEXNOW_KEY);
}

interface PageLike {
  slug: string;
  isHome: boolean;
  lang: string;
}

function pageUrl(baseUrl: string, p: PageLike): string {
  return p.isHome ? `${baseUrl}/${p.lang}/` : `${baseUrl}/${p.lang}/${p.slug}.html`;
}

/**
 * 페이지 저장/퍼블리시 시 자동 통지(fire-and-forget 권장).
 * 활성 커스텀 도메인 + INDEXNOW_KEY가 있을 때만 제출한다(없으면 no-op).
 * 호출부: `void notifyIndexNowForSite(siteId, pages).catch(() => {})`.
 */
export async function notifyIndexNowForSite(
  siteId: string,
  pages: PageLike[],
): Promise<IndexNowSubmission[]> {
  const key = process.env.INDEXNOW_KEY || "";
  if (!key || pages.length === 0) return [];

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      domains: {
        where: { status: "ACTIVE" },
        select: { domain: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const host = site?.domains[0]?.domain;
  if (!host) return []; // 커스텀 도메인 없는 사이트는 IndexNow 대상 아님

  const baseUrl = `https://${host}`;
  const urls = Array.from(new Set(pages.map((p) => pageUrl(baseUrl, p))));
  return pingIndexNow(host, key, urls);
}
