# IMPLEMENTATION PLAN — 생성형 AI 윤리교육 및 이수관리 웹앱

관련 문서: [PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md)

본 개정판은 사용자 확정 결정사항 17건(2차 검토)을 반영한다. **아직 Next.js 프로젝트 생성, 패키지 설치, DB 생성, 애플리케이션 코드 작성은 시작하지 않았다.** 이 계획은 작은 단계로 나누어져 있으며, 각 단계는 이전 단계 완료를 전제로 한다.

## Phase 0 — 프로젝트 초기화

### Step 0.1 프로젝트 스캐폴딩

- **목표**: Next.js + TypeScript + Tailwind 기본 골격 생성, 저장소/배포 연결.
- **수정할 파일**: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `README.md`
- **구현 내용**: `create-next-app`(App Router, TS, Tailwind, ESLint)으로 초기화, GitHub 저장소 생성 및 초기 커밋, Vercel 프로젝트 연결(빌드만 확인).
- **테스트 방법**: `npm run dev` 로컬 기동 확인, `npm run build` 성공 확인.
- **완료 조건**: 로컬 기동 및 Vercel 프리뷰 배포 정상.

### Step 0.2 환경 변수 및 시크릿 관리 체계

- **목표**: Supabase/Google 관련 크리덴셜을 안전하게 다룰 구조 확립.
- **수정할 파일**: `.env.example`, `.env.local`(gitignore 처리)
- **구현 내용**: Supabase URL/anon key/service role key, Google OAuth client id/secret, Google Sheets 서비스 계정 키, 대상 스프레드시트 ID 등 정의.
- **테스트 방법**: 예시 값으로 앱이 크래시 없이 기동되는지 확인.
- **완료 조건**: `.env.example`이 실제 필요한 모든 키를 포함, 민감정보 미커밋.

## Phase 1 — 데이터베이스 기반

### Step 1.1 조직/학년도/명단 스키마 마이그레이션

- **목표**: DATABASE.md §2.1~2.2의 `schools`, `academic_years`, `app_users`, `classes`, `students` 테이블 생성.
- **수정할 파일**: `supabase/migrations/0001_core_tables.sql`
- **구현 내용**: 테이블/인덱스/unique 제약 생성 (`students.student_code` unique, `academic_years.start_date/end_date` 포함). RLS는 활성화만 하고 정책은 비워둠(기본 거부).
- **테스트 방법**: 마이그레이션 적용 후 샘플 insert로 unique 제약(특히 `student_code` 불변성 전제) 확인.
- **완료 조건**: 모든 테이블이 RLS enabled 상태로 생성되고 무정책 상태에서 anon 접근이 전부 거부됨.

### Step 1.2 콘텐츠 스키마 마이그레이션

- **목표**: 콘텐츠 및 학년도-콘텐츠 지정 테이블 생성.
- **수정할 파일**: `supabase/migrations/0002_content_tables.sql` (content_packages, content_modules, content_final_assessments, content_pledges, year_content_assignments)
- **구현 내용**: DATABASE.md §2.3~2.4 구조 반영. `content_final_assessments`에 `max_attempts` 컬럼을 두지 않음(무제한). `year_content_assignments.academic_year_id`에 unique 제약(학년도당 1건).
- **테스트 방법**: 동일 `content_package_id`를 두 개의 `academic_year_id`에 지정하는 시나리오를 수동 insert로 검증. 동일 학년도에 2건 지정 시 제약 위반 확인.
- **완료 조건**: 콘텐츠 재사용 시나리오는 성공, 학년도당 중복 지정은 실패.

### Step 1.3 학습 기록 스키마 마이그레이션

- **목표**: 학습 상세 기록 및 이수 상태 캐시 테이블 생성.
- **수정할 파일**: `supabase/migrations/0003_progress_tables.sql` (student_module_progress, student_final_assessment_attempts, student_pledges, student_completion_status)
- **구현 내용**: DATABASE.md §2.5 구조 반영. `student_pledges`는 `year_content_assignment_id` 기준 unique 제약(콘텐츠가 아님에 주의).
- **테스트 방법**: 같은 콘텐츠가 2개 학년도에 지정된 상황을 가정해, 같은 학생이 두 학년도 각각에서 서약 가능한지(서로 다른 `year_content_assignment_id`이므로 각각 1건씩 허용) 시나리오 테스트.
- **완료 조건**: 연간 재서약 시나리오가 제약 위반 없이 동작.

### Step 1.4 동기화 로그 스키마

- **목표**: `sheets_sync_log` 테이블 생성.
- **수정할 파일**: `supabase/migrations/0004_sync_log.sql`
- **구현 내용**: DATABASE.md §2.6 구조 반영 (`sync_type`, `direction`, `triggered_by` 포함).
- **테스트 방법**: 4가지 sync_type 각각에 대한 더미 로그 insert/조회.
- **완료 조건**: 로그 테이블이 정상 동작.

### Step 1.5 RLS 정책 작성

- **목표**: DATABASE.md §4 원칙에 따른 실제 RLS 정책 작성.
- **수정할 파일**: `supabase/migrations/0005_rls_policies.sql`
- **구현 내용**: `app_users` 기반 역할 판별 helper 함수, 학생/교사/관리자 각 역할별 SELECT/INSERT 정책 작성.
- **테스트 방법**: Supabase 테스트 유저(각 역할) 세션으로 다른 역할의 데이터 조회 시도 → 거부되는지 확인.
- **완료 조건**: 역할별 접근 범위가 DATABASE.md §4와 일치함을 테스트로 증명.

## Phase 2 — 인증 및 역할 판별

### Step 2.1 Google OAuth 연동 (Supabase Auth)

- **목표**: 학교 Google 계정으로 로그인 가능하게 한다.
- **수정할 파일**: `app/login/page.tsx`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`
- **구현 내용**: Supabase Auth Google Provider 설정, 로그인 버튼, 콜백 처리, 세션 확인.
- **테스트 방법**: 테스트용 Google 계정으로 로그인 → Supabase 세션 생성 확인.
- **완료 조건**: 로그인/로그아웃이 정상 동작.

### Step 2.2 도메인 제한 및 서버 측 역할 판별

- **목표**: 학교 도메인 외 계정 차단, 로그인 이메일로 역할(ADMIN/TEACHER/학생) 판별 — **클라이언트가 아닌 서버에서 수행** (결정 #17).
- **수정할 파일**: `lib/auth/resolveRole.ts`, `middleware.ts`, `app/(role-router)/page.tsx`
- **구현 내용**: 이메일 도메인 검증, `app_users`(ADMIN→TEACHER) → `students`(현재 활성 학년도) 순으로 서버에서 매핑 조회, 미매핑 시 안내 화면으로 리다이렉트. 교사의 경우 담당 학급도 이 시점에 서버에서 함께 조회.
- **테스트 방법**: 각 역할 더미 계정으로 로그인 후 올바른 대시보드로 라우팅되는지 확인. 클라이언트에서 role 값을 직접 조작해 API를 호출해도 서버가 재검증해 거부하는지 확인.
- **완료 조건**: 3개 역할 + 미매핑 케이스가 모두 의도대로 분기되고, 서버 재검증이 클라이언트 조작을 차단함.

## Phase 3 — Google Sheets 연동 (Import, 관리자 수동 트리거)

### Step 3.1 Sheets 읽기 클라이언트 구현

- **목표**: 서비스 계정으로 스프레드시트의 [학생명단]/[학급정보]/[사용자정보] 3개 탭을 읽는 유틸 작성.
- **수정할 파일**: `lib/sheets/client.ts`, `lib/sheets/readRoster.ts`, `lib/sheets/readClasses.ts`, `lib/sheets/readUsers.ts`
- **구현 내용**: Google Sheets API 인증(서비스 계정), 각 탭의 지정 컬럼 파싱 (DATABASE.md §3 매핑표 기준).
- **테스트 방법**: 테스트용 스프레드시트로 로컬 스크립트 실행, 파싱 결과 확인.
- **완료 조건**: 3개 탭 모두 타입 안전한 구조로 파싱됨.

### Step 3.2 명단 Import 로직 (upsert, student_code 기준)

- **목표**: 파싱된 데이터를 Supabase(`app_users`/`classes`/`students`)에 upsert.
- **수정할 파일**: `lib/sheets/syncRoster.ts`
- **구현 내용**: `app_users`는 email 기준, `classes`는 (academic_year, grade, class_no) 기준, `students`는 **`student_code` 기준**(불변 자연키) upsert. 신규 `student_code`는 새 행 생성, 기존 `student_code`는 grade/class_no/number/class_id/name만 갱신. `classes.teacher_email`을 `app_users`와 매칭해 `homeroom_teacher_id` 채움(매칭 실패 시 경고 로그).
- **테스트 방법**: 테스트 시트에서 학생 반/번호 변경 → 재동기화 후 기존 학습 기록(더미로 미리 넣어둔 student_module_progress)이 동일 학생 UUID에 유지되는지 확인 (결정 #4, #11 핵심 검증).
- **완료 조건**: 반복 실행해도 중복 행 없이(멱등) 최신 상태로 수렴하고, 반/번호 변경 후에도 기존 학습 기록이 끊기지 않음.

### Step 3.3 관리자 수동 동기화 UI 및 트리거

- **목표**: 관리자가 웹앱에서 버튼 클릭으로 3개 탭 동기화를 실행 (정기 배치 없음, 결정 #15).
- **수정할 파일**: `app/admin/sync/page.tsx`, `app/actions/syncRoster.ts`
- **구현 내용**: "동기화 실행" 버튼 → 서버 액션 호출 → 3개 Import 순차 실행 → 각 결과를 `sheets_sync_log`에 개별 기록 → 실행 결과 요약(성공/실패 건수) 화면 표시.
- **테스트 방법**: 관리자 계정으로 버튼 클릭 → 결과 요약 확인. 비관리자 계정으로 동일 액션 호출 시 거부 확인.
- **완료 조건**: 관리자만 실행 가능하고, 실행 결과가 로그와 화면에 정확히 반영됨.

## Phase 4 — 관리자: 콘텐츠 관리

### Step 4.1 콘텐츠 CRUD (모듈 단위)

- **목표**: 관리자가 콘텐츠 패키지와 모듈을 생성/수정할 수 있는 화면.
- **수정할 파일**: `app/admin/content/page.tsx`, `app/admin/content/[id]/page.tsx`, `app/actions/content.ts`
- **구현 내용**: content_packages/content_modules CRUD 서버 액션, 관리자 권한 검증(서버 측).
- **테스트 방법**: 관리자 계정으로 콘텐츠/모듈 생성 → DB 반영 확인. 비관리자 계정으로 동일 액션 호출 시 거부 확인.
- **완료 조건**: 콘텐츠 A(6개 모듈)를 UI로 등록 가능.

### Step 4.2 확인 문제(형성 평가) / 최종 평가(무제한 응시) / 서약 편집

- **목표**: 모듈별 확인 문제, 콘텐츠별 최종 평가, 서약 텍스트 편집 기능.
- **수정할 파일**: `app/admin/content/[id]/quiz/page.tsx`, `app/admin/content/[id]/assessment/page.tsx`, `app/admin/content/[id]/pledge/page.tsx`, `app/actions/content.ts`
- **구현 내용**: 확인 문제는 정답/오답 피드백 문구를 포함한 jsonb 구조로 편집(합격 기준 없음, 학습 확인용). 최종 평가는 `passing_score`만 입력(응시 횟수 제한 필드 없음). 서약은 문구(pledge_text)만 등록.
- **테스트 방법**: 문항 저장 후 새로고침 시 데이터 유지 확인.
- **완료 조건**: Content A의 확인 문제/최종 평가/서약이 모두 등록 가능.

### Step 4.3 학년도별 콘텐츠 지정 (1건) 및 기간 설정

- **목표**: 관리자가 학년도에 콘텐츠를 1개 지정(재지정 포함)하고 `start_date`/`end_date`를 설정.
- **수정할 파일**: `app/admin/years/page.tsx`, `app/actions/yearContent.ts`
- **구현 내용**: `academic_years` 생성/수정(연도, start_date, end_date, is_active), `year_content_assignments` upsert(학년도당 1건 강제). 동일 콘텐츠를 여러 학년도에 지정 가능함을 UI로 확인.
- **테스트 방법**: 2026→Content A, 2027→Content A 지정 시나리오 및 2027 내 콘텐츠를 B로 교체하는 시나리오 테스트.
- **완료 조건**: 두 시나리오 모두 오류 없이 동작하고, 학년도당 2건 지정 시도는 차단됨.

## Phase 5 — 학생 학습 플로우

### Step 5.1 학생 대시보드 - 배정된 콘텐츠 확인

- **목표**: 로그인한 학생이 현재 학년도에 배정된 콘텐츠와 모듈 목록을 확인.
- **수정할 파일**: `app/student/page.tsx`, `lib/data/studentContent.ts`
- **구현 내용**: 학생의 academic_year → year_content_assignments → content_modules 조회, 진행 상태 표시.
- **테스트 방법**: 더미 학생 계정으로 로그인 후 모듈 목록/상태 표시 확인.
- **완료 조건**: 학생 본인에게 배정된 콘텐츠만 노출됨(RLS로도 검증).

### Step 5.2 모듈 학습 화면 + 확인 문제 (재시도/피드백)

- **목표**: 모듈 콘텐츠 열람 및 확인 문제 제출, 오답 시 피드백 후 재시도.
- **수정할 파일**: `app/student/modules/[moduleId]/page.tsx`, `app/actions/moduleProgress.ts`
- **구현 내용**: 모듈 body 렌더링, 확인 문제 제출 시 오답이면 피드백 표시 및 재시도 허용(`check_quiz_attempts` 증가), 학습을 마치면(정답 도달 또는 콘텐츠 열람 완료) `student_module_progress.status='completed'`로 upsert.
- **테스트 방법**: 오답 → 피드백 → 재시도 → 정답 → 완료 흐름 테스트. 6개 모듈 순차 완료 시나리오 테스트.
- **완료 조건**: 확인 문제 결과가 이수 판정에 영향을 주지 않으면서(형성 평가), 모듈 완료 상태는 정확히 저장됨.

### Step 5.3 최종 평가 (무제한 재응시)

- **목표**: 필수 모듈 완료 후 최종 평가에 응시, 몇 번이든 재응시 가능.
- **수정할 파일**: `app/student/assessment/page.tsx`, `app/actions/finalAssessment.ts`
- **구현 내용**: 필수 모듈 미완료 시 접근 차단(서버 검증), 매 응시마다 `student_final_assessment_attempts`에 새 행 insert(삭제/덮어쓰기 없음), 합격 기준 비교.
- **테스트 방법**: 모듈 미완료 상태에서 접근 시도(거부 확인), 불합격 후 재응시(여러 번) → 모든 시도가 기록으로 남는지 확인, 합격 시도 발생 확인.
- **완료 조건**: 합격 기준 통과 여부가 정확히 기록되고, 응시 이력이 전부 보존됨.

### Step 5.4 AI 사용 서약 (연간 지정 단위)

- **목표**: 최종 평가 통과 후 서약 동의, **해당 학년도 연간 지정(year_content_assignment) 단위로 요구**.
- **수정할 파일**: `app/student/pledge/page.tsx`, `app/actions/pledge.ts`
- **구현 내용**: 서약 텍스트 표시, 동의 클릭 시 `student_pledges`에 `year_content_assignment_id` 기준 insert(중복 방지).
- **테스트 방법**: 같은 콘텐츠가 2개 학년도에 지정된 더미 상황에서, 각 학년도 학생 레코드가 독립적으로 서약을 요구받는지 확인 (결정 #9 핵심 검증).
- **완료 조건**: 서약 완료 기록이 연간 지정 단위로 정확히 저장되고, 콘텐츠 재사용 시에도 재서약이 요구됨.

### Step 5.5 이수 상태 판정 로직 구현

- **목표**: DATABASE.md §5 로직을 구현하여 `student_completion_status`를 갱신.
- **수정할 파일**: `lib/completion/evaluate.ts`
- **구현 내용**: 모듈 완료/최종평가 합격(하나라도)/서약 완료 이벤트 발생 시마다 상태 재계산. `COMPLETED`로 전환되는 순간 Phase 8의 Export 트리거를 호출.
- **테스트 방법**: 세 조건을 각각 하나씩 충족시키며 상태가 NOT_STARTED → IN_PROGRESS → COMPLETED로 전이하는지 단위 테스트.
- **완료 조건**: 조건 조합별 상태 전이가 모두 기대대로 동작(자동화 테스트 포함).

### Step 5.6 학생 이수 현황 / 과거 기록 조회

- **목표**: 학생이 현재 상태와 과거 학년도 기록을 조회.
- **수정할 파일**: `app/student/history/page.tsx`
- **구현 내용**: 동일 `student_email` 기준 과거 `student_completion_status` 조회.
- **테스트 방법**: 2개 학년도 더미 데이터로 이력 표시 확인.
- **완료 조건**: 본인 기록만, 연도별로 정확히 표시됨.

## Phase 6 — 담임교사 대시보드

### Step 6.1 담당 학급 자동 연결 조회 (서버 검증 포함)

- **목표**: 로그인 즉시 담당 학급 판별 및 데이터 조회, 판별은 서버에서 수행.
- **수정할 파일**: `app/teacher/page.tsx`, `lib/data/teacherClass.ts`
- **구현 내용**: 현재 활성 학년도 기준 `classes.homeroom_teacher_id = 본인` 조회(서버), 별도 설정 화면 없음.
- **테스트 방법**: 교사 계정 로그인 → 추가 클릭 없이 학급 데이터 로딩 확인(1클릭 이내). 다른 교사의 학급 ID를 URL에 직접 넣어 접근 시도 → 서버/RLS에서 거부되는지 확인 (결정 #17 검증).
- **완료 조건**: 로그인 → 대시보드 진입까지 추가 설정 단계 없음, 타 학급 접근이 서버 단에서 차단됨.

### Step 6.2 학급 현황 요약 및 학생별 목록

- **목표**: 전체 학생 수/완료/학습중/미시작/이수율 요약 + 학생별 진행률·상태 리스트.
- **수정할 파일**: `app/teacher/page.tsx`, `components/teacher/ClassSummary.tsx`, `components/teacher/StudentList.tsx`
- **구현 내용**: `student_completion_status` 집계.
- **테스트 방법**: 다양한 상태 조합의 더미 학생 데이터로 집계 수치 검증.
- **완료 조건**: 집계 수치가 실제 데이터와 일치.

### Step 6.3 필터 기능 (전체 / 이수완료 / 미이수)

- **목표**: 전체 / 이수 완료 / 미이수 필터. **미이수 = NOT_STARTED + IN_PROGRESS** (결정 #2, #16).
- **수정할 파일**: `components/teacher/StudentFilter.tsx`
- **구현 내용**: 서버 또는 클라이언트 필터로 status IN (NOT_STARTED, IN_PROGRESS)를 "미이수"로 그룹핑.
- **테스트 방법**: 세 상태가 섞인 더미 데이터로 "미이수" 필터가 NOT_STARTED와 IN_PROGRESS를 모두 포함하는지 확인.
- **완료 조건**: 3개 필터 모두 정확히 동작.

## Phase 7 — 학교 관리자 대시보드 (단일 학교 MVP)

### Step 7.1 학교 전체 현황

- **목표**: 학교 전체 이수 현황 요약. (멀티스쿨 선택 UI 없음, 결정 #6)
- **수정할 파일**: `app/admin/dashboard/page.tsx`
- **구현 내용**: 전체 학생 대비 완료율 등 집계.
- **테스트 방법**: 더미 전교 데이터로 수치 검증.
- **완료 조건**: 요약 수치 정확.

### Step 7.2 학년별/학급별 드릴다운

- **목표**: 학년 → 학급 단위로 현황 드릴다운.
- **수정할 파일**: `app/admin/dashboard/[grade]/page.tsx`, `app/admin/dashboard/[grade]/[classNo]/page.tsx`
- **구현 내용**: 집계 쿼리 파라미터화.
- **테스트 방법**: 여러 학년/학급 데이터로 각 레벨 집계 검증.
- **완료 조건**: 드릴다운 경로별 데이터가 상위 합계와 일치.

## Phase 8 — Google Sheets 반영 (Export, 완료 이벤트 트리거)

### Step 8.1 이수 완료 시 AI교육현황 Export 로직

- **목표**: 학생이 `COMPLETED`로 전환되는 순간 [AI교육현황] 탭에 반영 시도.
- **수정할 파일**: `lib/sheets/exportCompletion.ts`, `lib/completion/evaluate.ts`(전환 시점 호출)
- **구현 내용**: `student_completion_status` → Sheets 행 upsert(academic_year+student_id 기준), 실패 시 `sheets_sync_log`(sync_type=COMPLETION_EXPORT, triggered_by=system_event)에 기록.
- **테스트 방법**: 학생이 조건을 모두 충족해 COMPLETED로 전환되는 시나리오에서 Sheets 반영 확인. Sheets API 강제 실패 후 Supabase의 `student_completion_status`가 그대로 유지되는지 확인 (핵심 검증: 결정 #15의 "Sheets 실패가 Supabase 기록에 영향 없음").
- **완료 조건**: Export 실패가 Supabase 데이터에 어떠한 변경도 일으키지 않음이 테스트로 증명됨.

### Step 8.2 동기화 모니터링 및 수동 재시도 UI (관리자)

- **목표**: 관리자가 Import/Export 동기화 상태(마지막 성공 시각, 실패 건수)를 확인하고 수동 재시도.
- **수정할 파일**: `app/admin/sync/page.tsx` (Step 3.3과 통합), `app/actions/retrySyncLog.ts`
- **구현 내용**: `sheets_sync_log` 조회 화면(4가지 sync_type 구분), 실패 건별 "재시도" 버튼.
- **테스트 방법**: 실패 로그가 있는 상태에서 화면에 노출되는지, 수동 재시도가 동작하는지 확인.
- **완료 조건**: 동기화 실패가 관리자에게 가시적으로 드러나고, 재시도로 복구 가능.

## Phase 9 — 보안/품질 강화

### Step 9.1 RLS 자동화 테스트

- **목표**: 역할별 접근 제어가 실제로 차단되는지 회귀 테스트.
- **수정할 파일**: `tests/rls/*.test.ts`
- **구현 내용**: 각 역할 테스트 유저로 타 역할 데이터 접근 시도 → 거부 검증.
- **테스트 방법**: CI에서 자동 실행.
- **완료 조건**: 모든 케이스 통과.

### Step 9.2 서버 측 권한/담당학급 재검증 점검

- **목표**: 클라이언트 우회 시나리오(직접 API 호출, role 위조 등)에서도 권한이 지켜지는지 점검 (결정 #17 최종 확인).
- **수정할 파일**: 관련 Route Handler/Server Action 전반 리뷰(신규 파일 없음)
- **구현 내용**: 각 서버 진입점에서 세션 role/scope 검증 누락 여부 점검 및 보완.
- **테스트 방법**: 교사 세션으로 관리자 API 직접 호출, 학생 세션으로 타 학생 데이터 조회 API 직접 호출, 교사 세션으로 타 학급 데이터 조회 API 직접 호출 등 침투 테스트성 시나리오.
- **완료 조건**: 모든 시나리오에서 거부됨.

## Phase 10 — 배포 및 파일럿

### Step 10.1 프로덕션 배포 파이프라인

- **목표**: main 브랜치 배포 자동화, 환경변수 프로덕션 설정.
- **수정할 파일**: `.github/workflows/ci.yml`, `vercel.json`
- **구현 내용**: 빌드/타입체크/테스트 CI, Vercel 프로덕션 배포 연결. (Sheets 동기화용 Cron 불필요, §ARCHITECTURE.md §2.5)
- **테스트 방법**: PR 생성 시 CI 통과 및 프리뷰 배포 확인.
- **완료 조건**: main 머지 시 자동 배포.

### Step 10.2 파일럿 QA (1개 학급 대상)

- **목표**: 실제 학급 데이터(또는 익명화된 유사 데이터)로 전체 플로우 검증.
- **수정할 파일**: 없음(QA 단계)
- **구현 내용**: 관리자 수동 동기화 → 학생 로그인→학습(재시도 포함)→평가(재응시 포함)→서약 → 교사 확인(필터 포함) → 관리자 확인 → 완료 이벤트 Sheets 반영까지 End-to-End 점검.
- **테스트 방법**: 체크리스트 기반 수동 QA.
- **완료 조건**: 전체 플로우에서 치명적 결함 없음, PRD §12 성공 지표 충족.

---

## Questions / Decisions Needed

### Decided (2차 검토, 사용자 확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 학년도당 콘텐츠 지정 개수 | MVP는 1개. 동일 콘텐츠 여러 학년도 재사용 가능 |
| 2 | "미이수" 필터 정의 | NOT_STARTED + IN_PROGRESS |
| 3 | Student ID 형식 | `YYYY-G-CC-NN` (예: 2026-2-03-12) |
| 4 | Student ID 변경 여부 | 학년도 내 불변. 반/번호만 갱신, 학습 기록은 동일 UUID 유지 |
| 5 | 내부 관계 키 | UUID |
| 6 | 멀티스쿨 지원 | MVP는 단일 학교. 스키마만 확장 가능하게 유지 |
| 7 | 최종 평가 재응시 | 무제한, 모든 attempt 보존 |
| 8 | 확인 문제 성격 | 형성 평가(피드백+재시도), 이수 판정과 무관. 최종 판정은 최종 평가 기준 사용 |
| 9 | 서약의 종속 단위 | 콘텐츠가 아닌 해당 학년도 연간 프로그램(연간 지정) 단위. 매년 재서약 |
| 10 | 학년도 기간 설정 | `academic_years.start_date` / `end_date` 제공 |
| 11 | 학기 중 전학/반변경 | Sheets 수정 후 재동기화, 학습 기록 유지, Student ID 불변 |
| 12 | Google Sheets 구조 | 단일 스프레드시트, 4개 탭(학생명단/학급정보/사용자정보/AI교육현황), 컬럼 확정 |
| 13 | 명단류 원본 | Google Sheets |
| 14 | 학습기록/이수판정 원본 | Supabase |
| 15 | 동기화 정책 | 명단류(3개 탭)는 관리자 수동 실행, AI교육현황은 완료 이벤트 시 자동 시도. 실패는 로그+재시도, Supabase 기록에 영향 없음 |
| 16 | 교사 대시보드 | 조회 전용(등록/수정/삭제 없음), 로그인 후 설정 없이 자동 접근, 전체/완료/미이수 필터 |
| 17 | 역할/담당학급 판별 | 서버 측 검증 필수 (클라이언트 단독 판단 금지) |

### 남아 있는 Questions / Decisions Needed (이번 개정에서 새로 발견)

1. **Sheets [AI교육현황] 탭의 `assessment_score` 대표값 기준**: 학생이 여러 번 응시할 수 있으므로(결정 #7), 이 컬럼에 반영할 점수가 "최초로 합격한 시도의 점수", "전체 시도 중 최고 점수", "가장 최근 시도 점수" 중 무엇인지 명시가 필요하다.
2. **[AI교육현황] 탭의 갱신 범위**: 결정 #15는 "학생이 최종 이수하면 반영을 시도한다"로 되어 있어 COMPLETED 시점에만 트리거되는 것으로 해석했다. 그런데 탭 컬럼에 `progress`(진행률), `status`(상태)가 포함되어 있어, NOT_STARTED/IN_PROGRESS 학생도 관리자 수동 동기화 시 탭에 함께 노출/갱신해야 하는지, 아니면 이 탭은 "완료자 전용 원장"으로만 운영할지 확인이 필요하다.
3. **[학급정보]의 `teacher_email`이 [사용자정보]에 없을 때 처리**: 학급정보 탭에 적힌 담임 이메일이 사용자정보 탭(ADMIN/TEACHER)에 등록되어 있지 않으면 `classes.homeroom_teacher_id`를 채울 수 없다. 이 경우 동기화를 경고로만 표시하고 계속 진행할지, 동기화 자체를 차단할지 결정이 필요하다.
4. **Student ID 자릿수 규칙의 경계값**: `CC`(반), `NN`(번호)는 예시상 2자리 zero-padding으로 보이나(예: `03`, `12`), 10반 이상 또는 100번 이상인 경우의 자릿수 처리 규칙은 별도 확인 없이 "Sheets에 이미 기입된 문자열을 그대로 사용"하는 것으로 가정했다(웹앱이 ID를 생성하지 않으므로 실제로는 문제되지 않을 가능성이 높음). 문제가 없다고 판단되면 별도 결정 없이 진행 가능.

## Phase 0 착수 준비 상태

Phase 0(프로젝트 스캐폴딩)은 위 "남아 있는 Questions" 항목의 영향을 받지 않는다 (프로젝트 초기화·환경변수 체계 수립에는 해당 결정이 필요하지 않음). 따라서 **문서 승인 시 Phase 0은 바로 착수 가능**하다. 다만 위 3개 미결 항목은 각각 Phase 8(Export 로직/스키마 컬럼)과 Phase 3(Import 매칭 로직) 착수 전에는 확정이 필요하다.
