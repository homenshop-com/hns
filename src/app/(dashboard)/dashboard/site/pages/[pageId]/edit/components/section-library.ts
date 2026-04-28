/**
 * section-library.ts — pre-built multi-element section presets for the
 * LeftPalette "섹션 블록" list. Each preset is an HTML string that follows
 * the AI-site-generation atomic-layering rules (obj_sec_ wrapper with
 * dragable + sol-replacible-text children), so the scene parser recognizes
 * every text / image / button as its own layer and the LayerPanel can
 * select + edit them individually.
 *
 * Why HTML strings instead of JSON ASTs: the section gets appended to the
 * #hns_body innerHTML and then reconciled into the scene graph by the
 * existing importHtml() pipeline — same mechanism that loads the page
 * from the DB. No new data format.
 *
 * IDs embed a random suffix so repeat insertions on the same page don't
 * collide.
 */

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** A ready-to-insert section preset shown in the LeftPalette. */
export interface SectionPreset {
  /** Stable key used for search / analytics. */
  id: string;
  /** i18n key under `editor.sectionPresets.*` for the palette label. */
  labelKey: string;
  /** Font Awesome icon class (without the `fa-` prefix). */
  icon: string;
  /** Build the HTML fragment. Called once per insert. */
  build(): string;
}

const IMG = (q: string, w: number, h: number) =>
  `https://homenshop.com/api/img?q=${encodeURIComponent(q)}&w=${w}&h=${h}`;

export const SECTION_PRESETS: SectionPreset[] = [
  /* ═══════════════════════════ HERO OVERLAY ═══════════════════════════ */
  {
    id: "hero-overlay",
    labelKey: "heroOverlay",
    icon: "fa-table-columns",
    build() {
      const sec = uid("obj_sec");
      const bg = uid("obj_img");
      const t = uid("obj_title");
      const s = uid("obj_text");
      const b1 = uid("obj_btn");
      const b2 = uid("obj_btn");
      return `
<div class="dragable" id="${sec}" style="position:relative;min-height:600px;overflow:hidden;margin:0 0 40px 0;background:#111;">
  <div class="dragable" id="${bg}" style="position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;">
    <img src="${IMG("modern professional workspace", 1920, 700)}" alt="배경" style="width:100%;height:100%;object-fit:cover;" />
  </div>
  <div style="position:absolute;inset:0;z-index:1;background:linear-gradient(120deg,rgba(10,26,60,.75) 40%,rgba(10,26,60,.2) 100%);pointer-events:none;"></div>
  <div class="dragable sol-replacible-text" id="${t}" style="position:absolute;left:80px;top:200px;width:640px;z-index:2;color:#fff;"><h1 style="font-size:3rem;line-height:1.15;margin:0;letter-spacing:-.02em;font-weight:700;">여기에 큰 제목을<br/>입력하세요</h1></div>
  <div class="dragable sol-replacible-text" id="${s}" style="position:absolute;left:80px;top:340px;width:540px;z-index:2;color:rgba(255,255,255,.88);"><p style="font-size:1.1rem;line-height:1.6;margin:0;">고객에게 전달하고 싶은 핵심 메시지를 간결하게 적어주세요. 가독성 높은 문구가 전환율을 높입니다.</p></div>
  <div class="dragable" id="${b1}" style="position:absolute;left:80px;top:470px;z-index:2;"><a href="#" style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:#5be5b3;color:#062117;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;"><i class="fa-solid fa-rocket"></i>바로 시작하기</a></div>
  <div class="dragable" id="${b2}" style="position:absolute;left:270px;top:470px;z-index:2;"><a href="#" style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.6);border-radius:8px;font-weight:600;text-decoration:none;font-size:15px;">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a></div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ SPLIT (이미지 + 콘텐츠) ════════════════ */
  {
    id: "split-content",
    labelKey: "splitContent",
    icon: "fa-panorama",
    build() {
      const sec = uid("obj_sec");
      const img = uid("obj_img");
      const t = uid("obj_title");
      const p = uid("obj_text");
      const c1 = uid("obj_text");
      const c2 = uid("obj_text");
      const c3 = uid("obj_text");
      const btn = uid("obj_btn");
      return `
<div class="dragable" id="${sec}" style="padding:80px 24px;background:#fafafa;margin:0 0 40px 0;">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;max-width:1200px;margin:0 auto;">
    <div class="dragable" id="${img}"><img src="${IMG("business team collaboration", 900, 600)}" alt="이미지" style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:16px;" /></div>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="dragable sol-replacible-text" id="${t}"><h2 style="font-size:2rem;line-height:1.2;margin:0;color:#111;">여기에 섹션 제목</h2></div>
      <div class="dragable sol-replacible-text" id="${p}"><p style="color:#555;margin:0;line-height:1.7;">이미지와 텍스트를 나란히 배치하는 대표적인 섹션입니다. 제품이나 서비스의 특장점을 설명할 때 효과적입니다.</p></div>
      <div class="dragable sol-replacible-text" id="${c1}"><p style="margin:0;color:#222;"><i class="fa-solid fa-circle-check" style="color:#3ccf97;margin-right:8px;"></i>전문성과 신뢰를 한 번에</p></div>
      <div class="dragable sol-replacible-text" id="${c2}"><p style="margin:0;color:#222;"><i class="fa-solid fa-circle-check" style="color:#3ccf97;margin-right:8px;"></i>빠르고 정확한 서비스</p></div>
      <div class="dragable sol-replacible-text" id="${c3}"><p style="margin:0;color:#222;"><i class="fa-solid fa-circle-check" style="color:#3ccf97;margin-right:8px;"></i>고객 만족도 98%</p></div>
      <div class="dragable" id="${btn}" style="margin-top:8px;"><a href="#" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#111;color:#fff;border-radius:6px;font-weight:600;text-decoration:none;">자세히 알아보기 <i class="fa-solid fa-arrow-right"></i></a></div>
    </div>
  </div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ 3-COL FEATURES ════════════════════════ */
  {
    id: "features-3col",
    labelKey: "features3col",
    icon: "fa-grip",
    build() {
      const sec = uid("obj_sec");
      const t = uid("obj_title");
      const cards = [
        ["fa-bolt",    "빠른 속도",   "업계 최고 수준의 처리 속도로 시간을 절약합니다."],
        ["fa-shield",  "안전한 보안", "엔드투엔드 암호화로 데이터를 안전하게 보호합니다."],
        ["fa-heart",   "따뜻한 케어", "고객 한 분 한 분 세심하게 응대합니다."],
      ];
      const cardHtml = cards.map(([icon, title, body]) => {
        const c = uid("obj_card");
        const ct = uid("obj_cardtitle");
        const cb = uid("obj_cardtext");
        return `
      <div class="dragable de-group" id="${c}" style="padding:32px;border-radius:12px;background:#fff;border:1px solid #e5e7eb;">
        <div style="width:48px;height:48px;border-radius:10px;background:rgba(91,229,179,.15);display:grid;place-items:center;margin-bottom:20px;"><i class="fa-solid ${icon}" style="font-size:22px;color:#3ccf97;"></i></div>
        <div class="dragable sol-replacible-text" id="${ct}"><h3 style="font-size:1.125rem;margin:0 0 8px;color:#111;">${title}</h3></div>
        <div class="dragable sol-replacible-text" id="${cb}"><p style="color:#555;margin:0;line-height:1.65;font-size:14px;">${body}</p></div>
      </div>`;
      }).join("");
      return `
<div class="dragable" id="${sec}" style="padding:80px 24px;margin:0 0 40px 0;">
  <div style="max-width:1200px;margin:0 auto;">
    <div class="dragable sol-replacible-text" id="${t}" style="text-align:center;margin-bottom:48px;"><h2 style="font-size:2rem;margin:0;color:#111;">이 섹션의 핵심 가치</h2></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">${cardHtml}</div>
  </div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ GALLERY 3-COL ══════════════════════════ */
  {
    id: "gallery-grid",
    labelKey: "galleryGrid",
    icon: "fa-images",
    build() {
      const sec = uid("obj_sec");
      const t = uid("obj_title");
      const seeds = ["coffee shop interior", "product display", "team portrait", "happy customer", "workspace detail", "abstract pattern"];
      const items = seeds.map((q) => {
        const id = uid("obj_img");
        return `      <div class="dragable" id="${id}"><img src="${IMG(q, 600, 400)}" alt="${q}" style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:10px;" /></div>`;
      }).join("\n");
      return `
<div class="dragable" id="${sec}" style="padding:80px 24px;margin:0 0 40px 0;background:#fafafa;">
  <div style="max-width:1200px;margin:0 auto;">
    <div class="dragable sol-replacible-text" id="${t}" style="text-align:center;margin-bottom:40px;"><h2 style="font-size:2rem;margin:0;color:#111;">갤러리</h2></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
${items}
    </div>
  </div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ STATS 4-COL ════════════════════════════ */
  {
    id: "stats-4col",
    labelKey: "stats4col",
    icon: "fa-chart-line",
    build() {
      const sec = uid("obj_sec");
      const stats = [
        ["fa-users", "8,500+", "누적 고객"],
        ["fa-star",  "4.9",    "평균 평점 (5점 만점)"],
        ["fa-award", "20+",    "업력 (년)"],
        ["fa-globe", "30+",    "서비스 지역"],
      ];
      const cols = stats.map(([icon, num, label]) => {
        const s = uid("obj_stat");
        const n = uid("obj_text");
        const l = uid("obj_text");
        return `
      <div class="dragable de-group" id="${s}" style="text-align:center;">
        <i class="fa-solid ${icon}" style="font-size:32px;color:#e89a78;margin-bottom:12px;"></i>
        <div class="dragable sol-replacible-text" id="${n}"><div style="font-size:2.5rem;font-weight:800;color:#fff;line-height:1;">${num}</div></div>
        <div class="dragable sol-replacible-text" id="${l}"><div style="color:rgba(255,255,255,.7);font-size:14px;margin-top:4px;">${label}</div></div>
      </div>`;
      }).join("");
      return `
<div class="dragable" id="${sec}" style="padding:72px 24px;margin:0 0 40px 0;background:#1a3a6b;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;">${cols}</div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ CTA BAND ═══════════════════════════════ */
  {
    id: "cta-band",
    labelKey: "ctaBand",
    icon: "fa-bullhorn",
    build() {
      const sec = uid("obj_sec");
      const t = uid("obj_title");
      const p = uid("obj_text");
      const b = uid("obj_btn");
      return `
<div class="dragable" id="${sec}" style="padding:80px 24px;margin:0 0 40px 0;background:linear-gradient(135deg,#5be5b3,#3ccf97);">
  <div style="max-width:800px;margin:0 auto;text-align:center;">
    <div class="dragable sol-replacible-text" id="${t}"><h2 style="font-size:2.25rem;margin:0 0 16px;color:#062117;">오늘 바로 시작해 보세요</h2></div>
    <div class="dragable sol-replacible-text" id="${p}"><p style="color:rgba(6,33,23,.8);margin:0 0 32px;font-size:1.1rem;line-height:1.6;">무료 체험으로 7일간 모든 기능을 사용해 보실 수 있습니다.</p></div>
    <div class="dragable" id="${b}"><a href="#" style="display:inline-flex;align-items:center;gap:8px;padding:16px 32px;background:#062117;color:#fff;border-radius:8px;font-weight:700;text-decoration:none;font-size:16px;">무료로 시작하기 <i class="fa-solid fa-arrow-right"></i></a></div>
  </div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ CONTACT FORM ═══════════════════════════ */
  {
    id: "contact-form",
    labelKey: "contactForm",
    icon: "fa-square-pen",
    build() {
      const sec = uid("obj_sec");
      const t = uid("obj_title");
      const p = uid("obj_text");
      return `
<div class="dragable" id="${sec}" style="padding:80px 24px;margin:0 0 40px 0;">
  <div style="max-width:600px;margin:0 auto;">
    <div class="dragable sol-replacible-text" id="${t}" style="text-align:center;margin-bottom:12px;"><h2 style="font-size:2rem;margin:0;color:#111;">문의하기</h2></div>
    <div class="dragable sol-replacible-text" id="${p}" style="text-align:center;margin-bottom:40px;"><p style="color:#555;margin:0;">궁금하신 점을 남겨주시면 빠르게 답변드리겠습니다.</p></div>
    <form style="display:flex;flex-direction:column;gap:14px;">
      <input type="text" placeholder="이름" style="padding:12px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;"/>
      <input type="email" placeholder="이메일" style="padding:12px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;"/>
      <input type="tel" placeholder="연락처" style="padding:12px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;"/>
      <textarea placeholder="문의 내용" rows="5" style="padding:12px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;resize:vertical;"></textarea>
      <button type="button" style="padding:14px 24px;background:#111;color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer;font-size:15px;">문의 보내기</button>
    </form>
  </div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ TESTIMONIALS ═══════════════════════════ */
  {
    id: "testimonials",
    labelKey: "testimonials",
    icon: "fa-star",
    build() {
      const sec = uid("obj_sec");
      const t = uid("obj_title");
      const quotes = [
        ["김민지", "디자이너",   "정말 편리하게 사용하고 있어요. 기대 이상으로 만족스럽습니다."],
        ["이지훈", "대표",       "전문성과 친절함을 모두 갖춘 서비스입니다. 강력 추천합니다."],
        ["박수진", "마케터",    "결과물이 깔끔하고 응대도 빨라요. 다음에도 꼭 이용할게요."],
      ];
      const cards = quotes.map(([name, role, body]) => {
        const c = uid("obj_card");
        const q = uid("obj_text");
        const meta = uid("obj_text");
        return `
      <div class="dragable de-group" id="${c}" style="padding:32px;border-radius:12px;background:#fff;border:1px solid #eee;box-shadow:0 2px 8px rgba(0,0,0,.04);">
        <div style="color:#f4b66a;margin-bottom:12px;"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i></div>
        <div class="dragable sol-replacible-text" id="${q}"><p style="color:#333;margin:0 0 16px;line-height:1.7;">"${body}"</p></div>
        <div class="dragable sol-replacible-text" id="${meta}"><div style="color:#666;font-size:13px;"><b style="color:#111;">${name}</b> · ${role}</div></div>
      </div>`;
      }).join("");
      return `
<div class="dragable" id="${sec}" style="padding:80px 24px;margin:0 0 40px 0;background:#fafafa;">
  <div style="max-width:1200px;margin:0 auto;">
    <div class="dragable sol-replacible-text" id="${t}" style="text-align:center;margin-bottom:40px;"><h2 style="font-size:2rem;margin:0;color:#111;">고객 후기</h2></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">${cards}</div>
  </div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ NAV HEADER ═════════════════════════════ */
  {
    id: "nav-header",
    labelKey: "navHeader",
    icon: "fa-bars",
    build() {
      const sec = uid("obj_sec");
      return `
<div class="dragable" id="${sec}" style="padding:18px 32px;background:#fff;border-bottom:1px solid #eee;margin:0 0 40px 0;">
  <div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#5be5b3,#3ccf97);display:grid;place-items:center;color:#062117;font-weight:800;">h</div>
      <div style="font-weight:700;color:#111;font-size:1.1rem;">브랜드명</div>
    </div>
    <nav style="display:flex;gap:28px;">
      <a href="#" style="color:#333;text-decoration:none;font-size:14px;font-weight:500;">홈</a>
      <a href="#" style="color:#333;text-decoration:none;font-size:14px;font-weight:500;">서비스</a>
      <a href="#" style="color:#333;text-decoration:none;font-size:14px;font-weight:500;">포트폴리오</a>
      <a href="#" style="color:#333;text-decoration:none;font-size:14px;font-weight:500;">문의</a>
    </nav>
    <a href="#" style="padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">시작하기</a>
  </div>
</div>`.trim();
    },
  },

  /* ═══════════════════════════ FOOTER ═════════════════════════════════ */
  {
    id: "footer",
    labelKey: "footer",
    icon: "fa-align-justify",
    build() {
      const sec = uid("obj_sec");
      return `
<div class="dragable" id="${sec}" style="padding:64px 24px 24px;background:#0d1c36;color:rgba(255,255,255,.75);">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:32px;padding-bottom:32px;border-bottom:1px solid rgba(255,255,255,.1);">
    <div>
      <div style="color:#fff;font-weight:700;margin-bottom:12px;">브랜드명</div>
      <p style="font-size:13px;line-height:1.7;margin:0;">고객 중심의 서비스로 더 나은 가치를 전달합니다.</p>
    </div>
    <div>
      <h4 style="color:#fff;font-size:14px;margin:0 0 14px;">서비스</h4>
      <ul style="list-style:none;padding:0;margin:0;font-size:13px;line-height:2;"><li><a href="#" style="color:rgba(255,255,255,.65);text-decoration:none;">기능</a></li><li><a href="#" style="color:rgba(255,255,255,.65);text-decoration:none;">가격</a></li><li><a href="#" style="color:rgba(255,255,255,.65);text-decoration:none;">문의</a></li></ul>
    </div>
    <div>
      <h4 style="color:#fff;font-size:14px;margin:0 0 14px;">회사</h4>
      <ul style="list-style:none;padding:0;margin:0;font-size:13px;line-height:2;"><li><a href="#" style="color:rgba(255,255,255,.65);text-decoration:none;">소개</a></li><li><a href="#" style="color:rgba(255,255,255,.65);text-decoration:none;">채용</a></li><li><a href="#" style="color:rgba(255,255,255,.65);text-decoration:none;">블로그</a></li></ul>
    </div>
    <div>
      <h4 style="color:#fff;font-size:14px;margin:0 0 14px;">연락처</h4>
      <div style="font-size:13px;line-height:1.9;"><div><i class="fa-solid fa-envelope" style="margin-right:8px;color:#5be5b3;"></i>help@example.com</div><div><i class="fa-solid fa-phone" style="margin-right:8px;color:#5be5b3;"></i>02-000-0000</div></div>
    </div>
  </div>
  <div style="max-width:1200px;margin:24px auto 0;text-align:center;font-size:12px;color:rgba(255,255,255,.4);">&copy; 2026 Brand. All rights reserved.</div>
</div>`.trim();
    },
  },
];

export function findPreset(id: string): SectionPreset | undefined {
  return SECTION_PRESETS.find((p) => p.id === id);
}
