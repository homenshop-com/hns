# CLAUDE.md — Homenshop Next

## Project Overview
Homenshop.net 차세대 플랫폼. Legacy PHP → Next.js + TypeScript 마이그레이션.
사용자가 자신만의 웹사이트를 만들고 관리할 수 있는 e-commerce 플랫폼.

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **DB**: PostgreSQL 16 + Prisma ORM
- **Auth**: NextAuth.js (Auth.js v5)
- **CSS**: Tailwind CSS v4 + shadcn/ui
- **Testing**: Vitest + Testing Library
- **Deploy**: TBD (Vercel or Docker)

## Commands
- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드
- `npm test` — 테스트 실행
- `npm run db:generate` — Prisma 클라이언트 생성
- `npm run db:migrate` — DB 마이그레이션
- `npm run db:studio` — Prisma Studio (DB GUI)

## Directory Structure
```
src/
├── app/              # Next.js App Router (파일 기반 라우팅)
│   ├── (auth)/       # 인증 관련 페이지 (로그인, 회원가입)
│   ├── (dashboard)/  # 회원 대시보드 (사이트 관리)
│   ├── admin/        # 관리자 페이지
│   └── api/          # API Routes
├── components/       # 공유 UI 컴포넌트
│   └── ui/           # shadcn/ui 컴포넌트
├── lib/              # 비즈니스 로직, 유틸리티
│   └── db.ts         # Prisma 클라이언트 싱글턴
├── generated/        # Prisma 생성 파일 (git 제외)
└── tests/            # 테스트 파일
prisma/
└── schema.prisma     # DB 스키마 (Single Source of Truth)
```

## Conventions
- 한국어 UI, 영어 코드
- 컴포넌트: PascalCase, 파일: kebab-case
- DB 스키마 변경은 반드시 Prisma migration으로
- API Route에서 에러는 NextResponse.json()으로 반환
- 환경변수는 .env.local (git 제외)
