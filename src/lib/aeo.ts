/**
 * AEO(Answer Engine Optimization) 콘텐츠 블록.
 *
 * 페이지별로 구조화된 답변형 콘텐츠(FAQ·HowTo·핵심요약·정의)를 저장하고,
 * 퍼블리시 시 (1) JSON-LD(FAQPage/HowTo/DefinedTerm) (2) 가시 섹션으로 렌더한다.
 * AI 답변 엔진이 그대로 발췌·인용하기 쉬운 형태가 목적.
 *
 * 저장 위치: Page.aeoBlocks (JSON 배열). 저작 UI: SEO 대시보드 'AEO 콘텐츠' 탭.
 */

import {
  buildFaqJsonLd,
  buildHowToJsonLd,
  buildDefinedTermJsonLd,
} from "@/lib/seo-jsonld";

export type AeoBlock =
  | { type: "faq"; items: Array<{ q: string; a: string }> }
  | { type: "howto"; name: string; steps: Array<{ name?: string; text: string }> }
  | { type: "tldr"; title?: string; points: string[] }
  | { type: "definition"; term: string; definition: string };

const LABELS: Record<string, Record<string, string>> = {
  faq: { ko: "자주 묻는 질문", en: "Frequently asked questions", ja: "よくある質問", "zh-cn": "常见问题", "zh-tw": "常見問題", es: "Preguntas frecuentes" },
  tldr: { ko: "핵심 요약", en: "Key takeaways", ja: "要点まとめ", "zh-cn": "要点总结", "zh-tw": "重點摘要", es: "Puntos clave" },
};
function label(kind: string, lang: string): string {
  const m = LABELS[kind] || {};
  return m[lang] || m.en || Object.values(m)[0] || kind;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 임의의 JSON 값을 검증된 AeoBlock[] 로 정규화한다(빈/불완전 블록 제거).
 * DB·API 입력 모두 이 함수를 통과시켜 신뢰 가능한 형태만 다룬다.
 */
export function normalizeAeoBlocks(raw: unknown): AeoBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: AeoBlock[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") continue;
    const t = (b as { type?: unknown }).type;
    if (t === "faq") {
      const items = Array.isArray((b as { items?: unknown }).items)
        ? ((b as { items: unknown[] }).items
            .map((it) => ({
              q: String((it as { q?: unknown })?.q ?? "").trim(),
              a: String((it as { a?: unknown })?.a ?? "").trim(),
            }))
            .filter((it) => it.q && it.a))
        : [];
      if (items.length) out.push({ type: "faq", items });
    } else if (t === "howto") {
      const name = String((b as { name?: unknown }).name ?? "").trim();
      const steps = Array.isArray((b as { steps?: unknown }).steps)
        ? ((b as { steps: unknown[] }).steps
            .map((s) => ({
              name: String((s as { name?: unknown })?.name ?? "").trim() || undefined,
              text: String((s as { text?: unknown })?.text ?? "").trim(),
            }))
            .filter((s) => s.text))
        : [];
      if (name && steps.length) out.push({ type: "howto", name, steps });
    } else if (t === "tldr") {
      const title = String((b as { title?: unknown }).title ?? "").trim() || undefined;
      const points = Array.isArray((b as { points?: unknown }).points)
        ? ((b as { points: unknown[] }).points.map((p) => String(p ?? "").trim()).filter(Boolean))
        : [];
      if (points.length) out.push({ type: "tldr", title, points });
    } else if (t === "definition") {
      const term = String((b as { term?: unknown }).term ?? "").trim();
      const definition = String((b as { definition?: unknown }).definition ?? "").trim();
      if (term && definition) out.push({ type: "definition", term, definition });
    }
  }
  return out;
}

/** JSON-LD 객체 배열 (FAQPage / HowTo / DefinedTerm). TL;DR은 가시 콘텐츠만. */
export function buildAeoJsonLd(blocks: AeoBlock[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const b of blocks) {
    if (b.type === "faq") {
      out.push(buildFaqJsonLd(b.items.map((i) => ({ question: i.q, answer: i.a }))));
    } else if (b.type === "howto") {
      out.push(buildHowToJsonLd({ name: b.name, steps: b.steps }));
    } else if (b.type === "definition") {
      out.push(buildDefinedTermJsonLd({ term: b.term, definition: b.definition }));
    }
  }
  return out;
}

/**
 * 가시 섹션 HTML. 퍼블리시된 페이지(외부 CSS 없음)에서도 단정하게 보이도록
 * 인라인 스타일 사용. absolute 레이아웃과 충돌하지 않게 normal-flow(relative)
 * 컨테이너로 감싸고 본문 absolute 콘텐츠 아래에 append 한다.
 */
export function renderAeoHtml(blocks: AeoBlock[], lang: string): string {
  if (!blocks.length) return "";
  const sections: string[] = [];

  for (const b of blocks) {
    if (b.type === "faq") {
      const items = b.items
        .map(
          (it) =>
            `<div class="aeo-faq-item" data-faq-q="${esc(it.q)}" data-faq-a="${esc(it.a)}" style="margin:0 0 14px;border-bottom:1px solid #eee;padding-bottom:14px;">` +
            `<h3 style="margin:0 0 6px;font-size:16px;font-weight:600;">${esc(it.q)}</h3>` +
            `<div style="margin:0;font-size:14px;line-height:1.7;color:#444;">${esc(it.a)}</div></div>`,
        )
        .join("");
      sections.push(
        `<section class="aeo-faq" style="margin:0 0 28px;"><h2 style="font-size:19px;font-weight:700;margin:0 0 14px;">${esc(label("faq", lang))}</h2>${items}</section>`,
      );
    } else if (b.type === "howto") {
      const steps = b.steps
        .map(
          (s) =>
            `<li style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#444;">` +
            (s.name ? `<strong style="color:#222;">${esc(s.name)}</strong> — ` : "") +
            `${esc(s.text)}</li>`,
        )
        .join("");
      sections.push(
        `<section class="aeo-howto" style="margin:0 0 28px;"><h2 style="font-size:19px;font-weight:700;margin:0 0 14px;">${esc(b.name)}</h2><ol style="margin:0;padding-left:20px;">${steps}</ol></section>`,
      );
    } else if (b.type === "tldr") {
      const pts = b.points
        .map((p) => `<li style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#333;">${esc(p)}</li>`)
        .join("");
      sections.push(
        `<section class="aeo-tldr" style="margin:0 0 28px;background:#f6f8fc;border-radius:12px;padding:16px 20px;">` +
          `<h2 style="font-size:16px;font-weight:700;margin:0 0 10px;color:#1a2b4a;">${esc(b.title || label("tldr", lang))}</h2>` +
          `<ul style="margin:0;padding-left:18px;">${pts}</ul></section>`,
      );
    } else if (b.type === "definition") {
      sections.push(
        `<section class="aeo-def" style="margin:0 0 22px;"><h3 style="font-size:16px;font-weight:700;margin:0 0 6px;">${esc(b.term)}</h3>` +
          `<p style="margin:0;font-size:14px;line-height:1.7;color:#444;">${esc(b.definition)}</p></section>`,
      );
    }
  }

  return (
    `<div class="aeo-blocks" style="max-width:820px;margin:40px auto 0;position:relative;clear:both;padding:24px 16px 0;font-family:inherit;border-top:1px solid #ececec;">` +
    sections.join("") +
    `</div>`
  );
}
