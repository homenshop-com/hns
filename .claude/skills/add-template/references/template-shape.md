# Template DB Shape (참조용)

`Template` 모델에 삽입할 필드. API/시드 양쪽에서 동일한 구조로 저장됩니다.

## 필수 필드

```ts
{
  id: `tpl_<slug>_<timestamp>`,    // 예: "tpl_plusac_mo9ybshr"
  name: string,                    // 사용자 노출 이름 (30자 이내 권장)
  path: `system/<slug>-<timestamp>`, // 고유, 디스크 파일 없어도 됨
  category: "business" | "education" | "portfolio" | "imported" | ...,
  price: 0,                        // 무료 = 0, 유료 = 원화 정수
  keywords: "쉼표,구분,검색용",
  description: "설명 (~200자)",
  isActive: true,
  isPublic: false,                 // 공용 탭 노출은 별도 토글
  sortOrder: 0,                    // 작을수록 최상단
  userId: null,                    // 시스템 템플릿
  demoSiteId: null,                // 관리자가 "디자인 수정" 클릭 시 자동 링크
  thumbnailUrl: "https://homenshop.com/api/img?q=...",

  /* ─── 컨텐츠 블롭 (편집기/퍼블리셔 공유) ─── */
  cssText: `/* HNS-MODERN-TEMPLATE */
/* HNS-THEME-TOKENS:START */
:root { ... }
/* HNS-THEME-TOKENS:END */
body { ... }
.my-class { ... }
@media (max-width: 768px) { ... }`,

  headerHtml: `<div class="pa-topbar">...</div>
<div class="pa-gnb">
  <div class="pa-gnb-inner">
    <a class="pa-brand" href="index.html">...</a>
    <nav class="pa-nav">
      <a href="index.html">홈</a>
      <a href="about.html">소개</a>
      ...
    </nav>
    <a href="contact.html" class="pa-cta-btn">문의</a>
  </div>
</div>`,

  menuHtml: `<div id="hns_menu"></div>`,   // 고정, 항상 이 값

  footerHtml: `<div class="pa-footer">
  <div class="pa-footer-inner">
    <div>브랜드 + 소개</div>
    <div>주소</div>
    <div>연락처</div>
    <div>사이트맵</div>
  </div>
  <div class="pa-footer-bottom">© 2026 ...</div>
</div>`,

  pagesSnapshot: [
    {
      slug: "index",
      title: "홈",
      lang: "ko",
      isHome: true,
      showInMenu: true,
      sortOrder: 0,
      content: { html: "<div class=\"dragable\" id=\"obj_sec_...\">...</div>" },
      css: null,
    },
    { slug: "about",    title: "소개", ..., sortOrder: 1, ... },
    { slug: "services", title: "서비스", ..., sortOrder: 2, ... },
    { slug: "contact",  title: "문의", ..., sortOrder: 3, ... },
    // 3-6 개. slug:"index" 필수.
  ],
}
```

## 원자-레이어 규칙 (bodyHtml 필수)

모든 편집 가능 요소는 `.dragable` 래퍼 + 고유 `obj_*` ID:

```html
<!-- ID 접두사 컨벤션 -->
obj_sec_     → 섹션 래퍼
obj_title_   → 제목 (h1/h2/h3)
obj_text_    → 단락/라벨
obj_img_     → 이미지 래퍼
obj_btn_     → 버튼/링크
obj_card_    → 카드 그룹 (de-group 필수)

<!-- 텍스트 레이어 -->
<div class="dragable sol-replacible-text" id="obj_text_xxx">
  <p>본문</p>
</div>

<!-- 카드 (여러 요소 묶음) -->
<div class="dragable de-group" id="obj_card_xxx">
  <div class="card-wrapper">
    <div class="dragable" id="obj_img_xxx"><img src="..." /></div>
    <div class="dragable sol-replacible-text" id="obj_title_xxx"><h3>제목</h3></div>
  </div>
</div>

<!-- 섹션 (하위에 자식 dragable 있으면 자동 섹션 판정) -->
<div class="dragable" id="obj_sec_xxx">
  <section class="hero">
    <div class="dragable sol-replacible-text" id="obj_title_xxx"><h1>큰 제목</h1></div>
    ...
  </section>
</div>
```

**금지사항**:
- 섹션 래퍼에 inline `position: absolute` / `position: fixed`
- 내부 링크 `/about.html` 같은 절대 경로 (상대 `about.html` 쓸 것)
- 이미지 `/api/img` 상대경로 (절대 `https://homenshop.com/api/img?q=...`)
- `<nav>` 를 menuHtml 에 중복 (퍼블리셔/에디터가 자동 dedup 대상)
- picsum.photos/seed 같은 해시-시드 이미지
- max-width: 1200px/1360px 고정 컨테이너 (max-width: 100% 사용)
- 이모지 아이콘 (Font Awesome `<i class="fa-solid ...">` 사용)

## 검증 체크리스트 (시드 스크립트 작성 후)

- [ ] cssText 첫 줄: `/* HNS-MODERN-TEMPLATE */`
- [ ] headerHtml 에 `<nav>` 1개 + 모든 페이지 링크
- [ ] menuHtml === `<div id="hns_menu"></div>`
- [ ] pagesSnapshot 에 `slug: "index"` 정확히 1개
- [ ] 모든 페이지의 bodyHtml 에 `.dragable` + `obj_*` ID
- [ ] 모든 이미지 절대 URL, Font Awesome 아이콘
- [ ] 컨테이너 폭 `max-width: 100%`, `@media (max-width: 768px)` 블록 존재
- [ ] 내부 링크 상대경로
