# ARCHITECTURE — 생성형 AI 윤리교육 및 이수관리 웹앱

관련 문서: [PRD.md](./PRD.md), [DATABASE.md](./DATABASE.md), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

본 개정판은 사용자 확정 결정사항 17건을 반영한다. 주요 변경: Sheets 명단 동기화는 **관리자 수동 트리거**로, 이수현황 반영은 **완료 이벤트 자동 시도**로 설계하며 정기 배치(Cron)에 의존하지 않는다. 역할 판별은 Google Sheets [사용자정보] 탭(ADMIN/TEACHER)을 원본으로 하는 `app_users` 테이블 기준으로 한다. MVP는 단일 학교만 지원한다.

## 1. 개요

```
                         ┌───────────────────────────┐
                         │   Google Workspace (학교)  │
                         │  - Google OAuth (로그인)   │
                         │  - Google Sheets           │
                         │    [학생명단][학급정보]     │
                         │    [사용자정보][AI교육현황]  │
                         └───────────┬───────────────┘
                                     │
                     OAuth 로그인    │   Sheets API (읽기/쓰기)
                                     │
                         ┌───────────▼───────────────┐
                         │   Next.js App (Vercel)     │
                         │  - App Router / RSC        │
                         │  - Server Actions / Route  │
                         │    Handlers (API)          │
                         │  - 역할별 대시보드 UI       │
                         │  - 관리자 "수동 동기화" 버튼 │
                         └───────────┬───────────────┘
                                     │  Supabase JS (서버: service role,
                                     │  클라이언트: anon key + RLS)
                         ┌───────────▼───────────────┐
                         │        Supabase             │
                         │  - Postgres (RLS 적용)      │
                         │  - Auth (Google Provider)   │
                         │  - 학습 상세기록·이수판정 원본│
                         └───────────┬───────────────┘
                                     │
                         ┌───────────▼───────────────┐
                         │  Sync 실행 경로 (배치 아님)   │
                         │  1) 관리자 수동 클릭          │
                         │     → 명단/학급/사용자 Import │
                         │  2) 학생 COMPLETED 전환 이벤트│
                         │     → AI교육현황 Export 시도   │
                         │  → 결과를 sheets_sync_log에 기록│
                         │  → 실패 시 관리자가 수동 재시도 │
                         └────────────────────────────┘
```

## 2. 구성 요소

### 2.1 프런트엔드 / 백엔드 — Next.js (Vercel)

- Next.js (App Router) + TypeScript + Tailwind CSS.
- 역할별 라우트 분리: `/student/*`, `/teacher/*`, `/admin/*`. 각 라우트는 서버 컴포넌트/미들웨어에서 역할을 재검증한다 (URL 추측 접근 방지, 결정 #17).
- 서버 액션(Server Actions) 또는 Route Handler를 통해 Supabase에 접근한다.
- 관리자 전용 작업(콘텐츠 관리, 학년도 지정, Sheets 수동 동기화 트리거)은 서버 전용 라우트에서 `service_role` 키를 사용해 처리하고, 절대 클라이언트에 노출하지 않는다.

### 2.2 인증 및 역할 판별 — Google OAuth

- Supabase Auth의 Google Provider 사용, 학교 Workspace 도메인으로 로그인 제한.
- **역할 판별은 서버에서** 다음 순서로 수행한다 (결정 #17, 클라이언트 UI만으로 판단하지 않음):
  1. 로그인 이메일이 `app_users`에 있고 `role='ADMIN'` → 관리자.
  2. `app_users`에 있고 `role='TEACHER'` → 교사. 담당 학급은 `classes.homeroom_teacher_id`(현재 활성 학년도)로 조회 — 별도 설정 화면 없이 자동 연결.
  3. 위에 없고 `students.student_email`(현재 활성 학년도)과 일치 → 학생.
  4. 어디에도 없으면 접근 거부(온보딩 대기/문의 안내 화면).
- `app_users`는 학년도에 종속되지 않는 영구 계정이며, Google Sheets [사용자정보] 탭이 원본이다.

### 2.3 데이터베이스 — Supabase / PostgreSQL

- 학습 상세 기록(모듈 진행, 확인문제 시도, 최종평가 응시 이력, 서약)의 단일 원본.
- 콘텐츠, 학년도, 학년도-콘텐츠 지정, 명단 캐시(students/classes/app_users), 동기화 로그 저장.
- RLS로 역할별 접근을 DB 레벨에서 강제한다 (상세: DATABASE.md §4).

### 2.4 Google Sheets 연동

- **원본 역할 분리** (결정 #13, #14):
  - [학생명단]/[학급정보]/[사용자정보] → Sheets가 원본, Supabase(`students`/`classes`/`app_users`)는 캐시.
  - 학습 상세 기록·이수 판정 → Supabase가 원본, [AI교육현황]은 요약 미러.
- 서비스 계정(Service Account)으로 Google Sheets API에 접근 (학교 관리자가 시트를 서비스 계정과 공유).
- **Import (Sheets → Supabase)**: **정기 배치를 두지 않는다.** 관리자가 웹앱에서 "동기화" 버튼을 눌러야 실행되는 온디맨드 서버 액션이다 (결정 #15). 학생명단/학급정보/사용자정보를 하나의 동기화 실행으로 묶어 처리하되, 각 탭의 결과는 `sheets_sync_log`에 개별 기록한다. `student_code`(불변 자연키)를 기준으로 upsert하여, 반/번호 변경·전학 등도 기존 학습 기록을 유지한 채 반영된다 (DATABASE.md §2.2 매칭 규칙).
- **Export (Supabase → Sheets)**: 학생의 `student_completion_status.status`가 `COMPLETED`로 전환되는 순간 시스템이 자동으로 해당 학생 행을 [AI교육현황] 탭에 반영 시도한다 (결정 #15). 실패 시 `sheets_sync_log`에 실패 사유·재시도 횟수를 기록하고, 관리자가 동기화 관리 화면에서 수동으로 재시도할 수 있다. **Export 실패는 Supabase 내 이수 판정 결과에 어떤 영향도 주지 않는다** (판정 로직과 완전히 분리된 프로세스).
- Import/Export 모두 멱등성(idempotent)을 보장한다 (재시도해도 중복/유실 없음).

### 2.5 배포 — Vercel + GitHub

- GitHub 저장소 → Vercel 자동 배포 (main = production, PR = preview).
- 환경 변수(Supabase URL/키, Google OAuth/Service Account 크리덴셜)는 Vercel 환경 변수로 관리, 저장소에 커밋하지 않음.
- **MVP에서는 Sheets 동기화용 Vercel Cron을 필수로 두지 않는다** (수동 트리거 + 이벤트 트리거로 충분). 실패 건 자동 재시도 스윕(Cron 기반)은 향후 개선 사항으로만 고려한다.

## 3. 역할 기반 접근 제어(RBAC) 설계

- **원칙**: 클라이언트 UI에서 메뉴/버튼을 숨기는 것은 UX일 뿐이며 권한 판단의 근거가 될 수 없다. 모든 데이터 접근은 두 계층에서 검증한다.
  1. **애플리케이션 계층**: Server Action/Route Handler 진입 시 세션의 role과 scope(담당 학급 등)를 확인 후 쿼리를 강제로 그 scope로 제한한다.
  2. **데이터베이스 계층(RLS)**: Postgres RLS로 `auth.uid()`/이메일 기반 접근을 재검증한다.
- 학생: 본인 레코드만 조회.
- 교사: 자신에게 매핑된 현재 활성 학년도 학급의 학생만 조회 가능, 쓰기 권한 없음.
- 관리자: 학교 전체(MVP: 사실상 전체 데이터) 조회, 콘텐츠/학년도 지정/동기화 트리거에 대한 쓰기 권한 보유.
- 담당 학급/역할 판별 로직은 프런트엔드에 두지 않고 서버 세션 조회 + RLS 이중 검증으로 구현한다 (결정 #17).

## 4. 콘텐츠 확장성 및 이수 규칙 설계

- 콘텐츠(Content Package)는 모듈 목록 + 최종 평가 정의 + 서약 정의로 구성된 독립 엔터티이며 학년도를 모른다.
- 모듈의 확인 문제(check quiz)는 **학습 확인용 형성 평가**다. 오답 시 피드백을 제공하고 재시도할 수 있으며, 이수 판정에는 사용하지 않는다 (결정 #8).
- 최종 평가는 **재응시 횟수 제한이 없다.** 모든 응시 기록을 보존하며, 하나라도 합격 기준을 통과하면 조건을 충족한 것으로 간주한다 (결정 #7).
- AI 사용 서약은 콘텐츠가 아닌 **학년도-콘텐츠 지정(연간 프로그램)** 단위로 요구된다. 동일 콘텐츠 재사용 시에도 매년 새로 서약해야 한다 (결정 #9).
- 학년도는 `year_content_assignments`를 통해서만 콘텐츠와 연결되며, MVP는 학년도당 1건으로 제한한다 (결정 #1). 이수 판정 로직은 이 배정 정보를 동적으로 조회해 평가한다 (하드코딩 금지).

## 5. 동기화 실패 대비 설계

- Supabase가 이수 판정의 단일 진실 공급원. Sheets는 명단 원본(Import 대상)이자 이수현황 미러(Export 대상)로, 역할이 방향에 따라 다르다.
- 모든 Sheets 연동 시도는 `sheets_sync_log`(유형, 방향, 트리거 주체, 대상, 상태, 오류 메시지, 재시도 횟수, 타임스탬프)에 기록한다.
- **재시도 정책 (MVP)**: 자동 스케줄 재시도 대신, 관리자가 동기화 관리 화면에서 실패 건을 확인하고 수동으로 "재시도" 버튼을 눌러 재실행한다. Import(명단류)와 Export(AI교육현황) 모두 동일한 로그/재시도 UI를 공유한다.
- Import 실패 시에도 기존 캐시된 학생/학급/사용자 데이터는 보존되며, 마지막 성공 동기화 시각을 관리자에게 노출한다.
- Export 실패는 `student_completion_status`(및 하위 상세 기록)에 어떠한 쓰기도 하지 않는 별도 프로세스로 구현하여, 실패가 이수 기록 손실로 이어지지 않도록 한다.

## 6. 향후 확장 고려사항

- **멀티스쿨**: MVP는 단일 학교만 지원한다. 모든 테이블에 `school_id`를 포함해 향후 확장을 방해하지 않도록 하되, 현재 UI/RLS는 "학교가 하나뿐"이라는 전제로 단순화한다 (결정 #6).
- **콘텐츠 버전 관리**: 모듈 내용 수정 시 이미 이수한 기록의 정합성을 유지하기 위해, 콘텐츠는 게시(published) 이후 구조적 변경을 제한하거나 버전 필드를 두는 방식을 향후 검토한다.
- **동기화 자동화 강화**: MVP 이후 필요 시 Cron 기반 자동 재시도 스윕, 실시간에 가까운 Export 등을 추가할 수 있다 (현재는 요구사항에 없음).
