# Google Analytics 연동 설정 가이드

homenshop.com 의 트래픽을 GA4 로 수집하고, 그 데이터를 `/admin` 대시보드에서 실시간으로 표시하는 절차입니다.

측정 ID: **`G-0T4G3H3PL0`** (homenshop.com 자산)

---

## 1. gtag.js (사이트 측정) — 완료

`src/app/layout.tsx` 에서 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 환경변수가 설정되어 있으면 자동으로 gtag.js 가 모든 페이지 `<head>` 직후 (next/script `afterInteractive` 전략) 로 삽입됩니다.

```bash
# .env.local
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-0T4G3H3PL0
```

배포 후 24 ~ 48 시간 이내에 GA4 콘솔 → 보고서 → 실시간 에서 트래픽이 잡히는지 확인하세요.

---

## 2. Data API (대시보드 연동) — 추가 설정 필요

대시보드 화면 안에서 활성 사용자 · 페이지뷰 · 실시간 사용자 · 상위 페이지 표를 보려면 **서비스 계정** 으로 Data API 를 호출해야 합니다.

### 2-1. Google Cloud 프로젝트 / API 활성화

1. https://console.cloud.google.com/ 접속 → 기존 프로젝트 선택 (또는 신규 생성: 권장 이름 `homenshop-analytics`).
2. 좌측 메뉴 → **API 및 서비스 → 라이브러리** → `Google Analytics Data API` 검색 → **사용 설정**.

### 2-2. 서비스 계정 생성 + 키 발급

1. **IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기**.
   - 이름: `homenshop-ga-reader`
   - 역할: (지정하지 않음 — GA 쪽에서 권한 부여)
2. 생성된 서비스 계정 클릭 → **키 → 새 키 만들기 → JSON** → 다운로드.
3. 다운로드된 JSON 파일을 텍스트 편집기로 열어 **전체 내용을 한 줄로** 변환 (JSON 그대로면 OK; 개행 그대로 `.env` 에 넣어도 dotenv가 처리하지만 보통 한 줄 권장).

### 2-3. GA4 프로퍼티에 서비스 계정 추가

1. https://analytics.google.com/ → 좌측 하단 **관리(Admin)**.
2. **프로퍼티 → 프로퍼티 액세스 관리** → 우측 `+` → **사용자 추가**.
3. 이메일: 서비스 계정 이메일 (`xxxxx@xxxxx.iam.gserviceaccount.com`) 입력.
4. 역할: **뷰어(Viewer)** 만 선택 → 추가.

### 2-4. Property ID 확인

GA4 콘솔 → 관리 → **프로퍼티 → 프로퍼티 세부정보** → 우측 상단 `PROPERTY ID` 값 (예: `123456789`, 9~10 자리 숫자).

> ⚠️ 측정 ID (`G-XXXXXXXXXX`) 와 Property ID (숫자) 는 다릅니다. Data API 는 **숫자 Property ID** 만 사용.

### 2-5. 환경변수 설정

```bash
# .env.local — 운영 서버에도 동일하게 추가
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-0T4G3H3PL0
GA_PROPERTY_ID=123456789
GA_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"homenshop-ga-reader@....iam.gserviceaccount.com","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

> 💡 `GA_SERVICE_ACCOUNT_JSON` 는 따옴표로 감싸지 마세요 — dotenv 가 그대로 한 변수로 인식합니다. JSON 안의 `\n` (private_key 안) 도 그대로 두면 `JSON.parse` 가 처리합니다.

### 2-6. 서버 재시작

```bash
# 로컬
npm run dev

# 운영 (pm2 cluster — 무중단 reload)
pm2 reload homenshop-next
```

`/admin` 대시보드 상단에 GA 패널이 나타나고 1 분 주기로 실시간 사용자가 자동 갱신됩니다.

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| 패널이 "GA_PROPERTY_ID 미설정" 표시 | `.env.local` 에 `GA_PROPERTY_ID` 누락 → 추가 후 서버 재시작 |
| `PERMISSION_DENIED` 메시지 | GA4 프로퍼티에 서비스 계정 이메일이 Viewer 로 추가되지 않음 (2-3 단계 다시 확인) |
| `GA_SERVICE_ACCOUNT_JSON parse error` | JSON 가 유효하지 않음 — 다운로드한 키 파일 내용을 그대로 한 줄로 넣었는지 확인 |
| 페이지뷰가 0 | gtag.js 가 아직 트래픽을 수집 못 했음 — 처음 24h 정도 걸림. `https://homenshop.com/` 에서 브라우저 DevTools → Network → `gtag/js` 요청이 200 인지 확인 |
| 실시간 사용자만 0 | 정상 — 최근 30분 안에 방문자가 없을 때 |

---

## 보안 노트

- `GA_SERVICE_ACCOUNT_JSON` 은 절대 클라이언트 번들에 노출되면 안 됩니다 (`NEXT_PUBLIC_` 접두사를 붙이지 않은 이유). `src/lib/analytics.ts` 는 서버 컴포넌트와 API 라우트에서만 import 됩니다.
- API 라우트 `/api/admin/analytics` 는 `auth()` + `role === "ADMIN"` 검사로 보호됩니다.
- 서비스 계정에는 GA4 뷰어 권한만 부여 — 데이터 쓰기는 불가능.
