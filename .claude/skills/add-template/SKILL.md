---
name: add-template
description: homeNshop 시스템 템플릿을 Claude Design 번들에서 가져와 등록하는 작업 가이드. 사용자가 "템플릿 추가", "템플릿 등록", "claude design 에서 템플릿", 또는 `https://api.anthropic.com/v1/design/h/...` URL 이 포함된 command 를 붙여넣거나 언급할 때 이 스킬을 사용. 관리자 페이지 모달 / API 직접 호출 / CLI 시드 스크립트 3가지 경로 중 상황에 맞는 방법을 제시.
version: 1.0.0
---

# homeNshop 템플릿 추가 (Claude Design 번들)

homeNshop 의 시스템 템플릿을 **claude.ai/design** 에서 생성한 디자인으로부터 자동 등록합니다.

## 언제 사용하는가

사용자가 다음과 같이 요청하면 이 스킬을 실행:

- "템플릿 추가", "템플릿 등록", "새 템플릿"
- "Claude Design 템플릿", "claude.ai/design 에서"
- 다음 형태의 명령어 붙여넣기:
  ```
  Fetch this design file, read its readme, and implement the relevant
  aspects of the design. https://api.anthropic.com/v1/design/h/<hash>?open_file=<file>.html

  Implement: <file>.html
  ```
- URL 에 `api.anthropic.com/v1/design/h/` 가 포함된 텍스트

## 사용자가 얻는 것

Claude Design 프로토타입 (React+Babel single-page) 이 homeNshop 의 원자-레이어 정적 템플릿(3-6 페이지, HNS-MODERN-TEMPLATE 마커 포함)으로 변환되어 Template 테이블에 비공개로 삽입. 이후 관리자가 썸네일·카테고리·공개 여부만 다듬으면 공용 템플릿으로 노출됩니다.

## 경로 선택 (상황에 따라)

### 경로 A (기본) — 사용자가 UI 에서 직접 진행

사용자가 웹 관리자 페이지를 선호하고, master@/design@ 계정으로 로그인할 수 있는 경우:

> homenshop.com/admin/templates → **"+ 템플릿 추가 (Claude Design)"** → command 붙여넣기 → 가져오기

이 경우 스킬은 아무것도 실행하지 않고 사용자에게 **경로를 안내**합니다:
1. 브라우저에서 master@homenshop.com 또는 design@homenshop.com 로 로그인
2. `/admin/templates` 페이지 이동
3. 우상단 **"+ 템플릿 추가 (Claude Design)"** 파란 버튼 클릭
4. 복사한 command 를 textarea 에 붙여넣기 → "가져오기"
5. 30-90초 대기 후 성공 모달 → "기본정보 편집하기 →" 로 이동하여 썸네일/카테고리 설정
6. 기본정보 수정 저장 후 **활성** / **공개** 토글

### 경로 B — Claude (에이전트) 가 서버 API 로 직접 등록

사용자가 "명령어로 바로 추가해줘" / "대신 등록해줘" 유형으로 자동화를 원할 때:

**전제**: 서버 `167.71.199.28` 접근 권한 + master@/design@ 인증 세션.

권장 절차:
1. command 에서 `api.anthropic.com/v1/design/h/<hash>?open_file=<file>` URL 추출
2. 서버에서 인증된 curl 호출로 import 엔드포인트 POST:
   ```bash
   ssh root@167.71.199.28 "curl -X POST https://homenshop.com/api/admin/templates/import-from-design \
     -H 'Content-Type: application/json' \
     -b <auth-cookie> \
     -d '{\"command\":\"<전체 command 문자열>\"}'"
   ```
3. 응답 JSON 의 `{ id, editUrl, stats }` 확인
4. 사용자에게 통계 요약 (페이지 수, CSS/HTML 사이즈) 보고 + 기본정보 URL 전달

**인증 쿠키 획득 방법**: NextAuth 세션 쿠키는 브라우저에서 수동으로 추출해야 함. 자동화가 번거로우면 경로 A 안내가 더 빠름.

### 경로 C — CLI 시드 스크립트 작성 (Plus Academy/Agency 패턴)

Claude Design 의 번들 형식이 API 로 처리 안 되거나 (예: 다중 HTML, 커스텀 구조), 템플릿을 **코드 저장소에 영구 기록**하고 싶을 때. Agency / Plus Academy 와 동일한 패턴.

1. command 에서 URL 추출
2. `curl <URL> | gunzip | tar -x -C /tmp/design-bundle` 로 번들 추출
3. README + primary HTML 읽기 (`cat /tmp/design-bundle/test/project/<file>.html`)
4. Read the chat transcripts in `/tmp/design-bundle/test/chats/*.md` for design intent
5. `scripts/seed-plus-academy-template.mjs` 를 참조하여 새 시드 스크립트 작성:
   - 파일: `scripts/seed-<slug>-template.mjs` (예: `seed-cafe-menu-template.mjs`)
   - 구조: `headerHtml` + `menuHtml` (empty wrapper) + `footerHtml` + `cssText` + `pagesSnapshot`
   - CSS 최상단에 `/* HNS-MODERN-TEMPLATE */` 마커 필수
   - 원자-레이어 규칙: `.dragable` + `obj_*_` IDs + `sol-replacible-text` + `de-group`
   - 상대 내부링크, 절대 Pexels URL
   - max-width: 100% (고정 폭 금지)
6. 서버에 scp + 실행:
   ```bash
   scp scripts/seed-<slug>-template.mjs root@167.71.199.28:/var/www/homenshop-next/scripts/
   ssh root@167.71.199.28 "cd /var/www/homenshop-next && \
     DATABASE_URL=\"\$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '\\\"')\" \
     node scripts/seed-<slug>-template.mjs"
   ```
7. 커밋 + 푸시 (시드 스크립트가 저장소에 남음 = 재현 가능)

## 핵심 규칙 (어느 경로든 준수)

템플릿 콘텐츠 자체는 다음 규칙을 반드시 따라야 합니다 (퍼블리셔/에디터가 의존):

- `cssText` 맨 위: `/* HNS-MODERN-TEMPLATE */` 마커
- `menuHtml`: **빈 래퍼** `<div id="hns_menu"></div>` (nav 는 headerHtml 에만)
- `headerHtml`: `<nav>` 태그로 top-level 페이지 링크 포함 (상대경로)
- `footerHtml`: 4단 푸터 (브랜드/주소/연락처/사이트맵)
- `pagesSnapshot`: 3-6 페이지 배열. 반드시 `slug: "index"` 페이지 하나 포함
- 모든 요소 원자화: `.dragable` + `obj_*` 고유 ID + `sol-replacible-text` (text) / `de-group` (card)
- 내부 링크: **상대경로** (`about.html`, NOT `/about.html`)
- 이미지: **절대 URL** (`https://homenshop.com/api/img?q=<keyword>&w=<w>&h=<h>`)
- 컨테이너 폭: `max-width: 100%` (고정 1200/1360px 금지)
- 아이콘: Font Awesome (`<i class="fa-solid fa-...">`), 이모지 금지
- 아무 `.dragable` 에도 inline `position: absolute` 금지 (섹션은 flow)

## 인증 / 권한

모든 경로에서 **master@homenshop.com** 또는 **design@homenshop.com** 계정만 허용. 일반 admin 은 403.

설정: `homenshop-next/src/lib/permissions.ts` 의 `TEMPLATE_EDITORS` Set. 추가 편집자는 이 파일 수정 + 재배포.

## 관련 문서

- 시스템 전체: `~/.claude/projects/-Volumes-DEV-TEST-test/memory/admin-templates-system.md`
- 템플릿 제작 규칙: `~/.claude/projects/-Volumes-DEV-TEST-test/memory/template-creation-guide.md`
- Import 엔드포인트: `src/app/api/admin/templates/import-from-design/route.ts`
- 참조 시드: `scripts/seed-agency-template.mjs`, `scripts/seed-plus-academy-template.mjs`

## 일반적인 질문 처리

- **"어떻게 시작해?"** → 경로 A 안내 (UI 가 가장 쉽고 안전)
- **"command 만 있어, 등록해줘"** → command 에서 URL 추출 확인 후 사용자 의도 명확화 (경로 A/B 중 선택 유도)
- **"템플릿 재생성 / 업데이트"** → 관리자 페이지의 "디자인 수정" 또는 "리셋" 버튼 안내 (admin-templates-system.md 참조)
- **"대량 등록"** → 경로 C 권장, 각 템플릿별 시드 스크립트 파일 유지
