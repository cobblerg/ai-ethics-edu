# AI 윤리교육 및 이수관리 웹앱

중학생 대상 생성형 AI 윤리교육 이수를 관리하는 웹앱. Next.js + TypeScript + Tailwind CSS + Supabase 기반.

설계 문서(기준 문서)는 `docs/` 폴더를 참고한다.

- [docs/PRD.md](./docs/PRD.md) — 제품 요구사항
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 시스템 아키텍처
- [docs/DATABASE.md](./docs/DATABASE.md) — 데이터베이스 스키마
- [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) — 단계별 구현 계획 (현재 Phase 0 완료)

## 개발 환경 준비

```bash
npm install
cp .env.example .env.local   # 실제 값은 팀 내부 채널에서 별도 전달받아 채운다
npm run dev
```

`http://localhost:3000` 에서 확인.

## 검증 명령

```bash
npm run lint     # ESLint
npx tsc --noEmit # TypeScript 타입 체크
npm run build    # 프로덕션 빌드
```

## 환경 변수

`.env.example` 참고. Supabase, Google Workspace 도메인, Google Sheets 서비스 계정 관련 값이 필요하며, 실제 값은 절대 저장소에 커밋하지 않는다 (`.env*`는 `.gitignore`에 등록되어 있음).
