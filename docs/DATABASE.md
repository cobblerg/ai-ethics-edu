# DATABASE — 생성형 AI 윤리교육 및 이수관리 웹앱

관련 문서: [PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

DBMS: PostgreSQL (Supabase). 본 개정판은 사용자 확정 결정사항 17건을 반영한 스키마다.

## 1. 설계 원칙

- **자연키 vs 대리키**: Student ID(`YYYY-G-CC-NN`)는 Google Sheets [학생명단]에서 그대로 들여오는 학년도 종속적 자연키이며, **웹앱이 생성하지 않는다**. 모든 FK 관계는 UUID 대리키로 맺는다.
- **Student ID 불변성**: 한 번 임포트된 `student_code`는 해당 학년도 동안 절대 변경하지 않는다. 반/번호가 바뀌어도 `grade`/`class_no`/`number`/`class_id`만 갱신한다. (결정 #4)
- **학년도와 콘텐츠의 강한 결합 금지**: 콘텐츠 테이블에는 학년도 컬럼을 두지 않는다. 연결은 `year_content_assignments`를 통해서만 이루어진다. MVP는 학년도당 1개 지정. (결정 #1)
- **역할 계정과 학년도의 분리**: 교사/관리자(`app_users`)는 학년도에 종속되지 않는 영구 계정이다. 다만 "누가 어느 학급의 담임인가"는 `classes`를 통해 학년도별로 결정된다.
- **서약의 연 단위 종속**: AI 사용 서약은 콘텐츠가 아니라 **그 해의 학년도-콘텐츠 지정(연간 프로그램)**에 종속된다. 동일 콘텐츠가 재사용돼도 학생은 매년 다시 서약한다. (결정 #9)
- **Sheets ↔ Supabase 역할 분리**: `students`, `classes`, `app_users`는 Sheets가 원본이며 Supabase는 동기화된 캐시다 (`synced_at` 컬럼 보유). 학습 상세 기록·이수 판정 계열 테이블은 Supabase가 원본이다.
- **RLS 기본 거부**: 모든 테이블은 RLS를 활성화하고, 명시적 정책이 있는 접근만 허용한다.
- **단일 학교 MVP**: `school_id` 컬럼은 향후 확장을 위해 유지하되, MVP에서는 `schools` 테이블에 단일 행만 존재하고 관련 UI/필터링은 구현하지 않는다. (결정 #6)

## 2. 테이블 개요

### 2.1 조직/학년도

**schools**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| name | text | 학교명 |
| google_domain | text | Workspace 도메인 (로그인 제한용) |
| created_at | timestamptz | |

> MVP: 단일 행만 시드(seed)한다. 멀티스쿨 UI는 구현하지 않는다.

**academic_years**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK → schools | |
| year | int | 예: 2026 |
| start_date | date | 교육 프로그램 시작일 (결정 #10) |
| end_date | date | 교육 프로그램 종료일 (결정 #10) |
| is_active | bool | 현재 활성 학년도 여부 (관리자가 명시적으로 지정; 판단 편의를 위해 start/end_date를 참고하되 최종 활성 학년도는 이 플래그로 확정) |

unique(school_id, year)

### 2.2 명단/조직 (Sheets 원본, Supabase는 캐시)

**app_users** — 관리자·교사 통합 계정 테이블. Google Sheets [사용자정보] 탭이 원본.
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| email | text unique | 로그인 매칭 키 |
| name | text | |
| role | text | `ADMIN` \| `TEACHER` (최소 지원, 결정 #12) |
| synced_at | timestamptz | |

> 학년도에 종속되지 않는다 (교사/관리자 계정은 매년 유지). "담임 배정"은 `classes.homeroom_teacher_id`로 학년도별로 별도 표현한다.

**classes** — Google Sheets [학급정보] 탭이 원본.
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| academic_year_id | uuid FK | |
| grade | int | 학년 |
| class_no | int | 반 |
| teacher_name | text | 시트 표기값 그대로 보관(표시용) |
| teacher_email | text | 시트 표기값 |
| homeroom_teacher_id | uuid FK → app_users, nullable | `teacher_email`을 `app_users.email`(role=TEACHER)에 매칭해 채움. 매칭 실패 시 null (동기화 경고 대상) |
| synced_at | timestamptz | |

unique(academic_year_id, grade, class_no)

**students** — Google Sheets [학생명단] 탭이 원본.
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | 대리키 (내부 FK용, 학년도 내내 불변) |
| student_code | text | 자연키. Sheets에서 그대로 가져온 값(`YYYY-G-CC-NN`), **불변** |
| academic_year_id | uuid FK | |
| grade | int | 현재 값, 동기화 시 갱신 가능 |
| class_no | int | 현재 값, 동기화 시 갱신 가능 |
| number | int | 현재 값, 동기화 시 갱신 가능 |
| class_id | uuid FK → classes, nullable | 현재 (academic_year, grade, class_no) 기준 매칭된 학급. 반 변경 시 갱신 |
| name | text | |
| student_email | text | 로그인 매칭 키 |
| created_at | timestamptz | 최초 임포트(Student ID 부여) 시각 |
| synced_at | timestamptz | 마지막 동기화 시각 |

unique(student_code) — Sheets가 이미 학년도를 포함해 발급하므로 전역 유일
unique(academic_year_id, student_email)
index(student_email)

> **동기화 매칭 규칙**: 재동기화 시 `student_code`를 기준으로 기존 행을 찾아 `grade`/`class_no`/`number`/`class_id`/`name`만 갱신(upsert)한다. `student_code`가 시트에 없던 새 값이면 신규 행(신규 UUID)을 생성한다. 학기 중 반/번호 변경, 전학 처리는 이 규칙만으로 자연스럽게 지원된다 (결정 #11).
>
> **동일인 식별**: Student ID는 학년도마다 새로 발급되므로, "작년의 그 학생과 같은 사람"이라는 연결은 `student_email`(학교 지급 계정, 보통 졸업/전출 전까지 불변)로만 가능하다. 과거 이수 기록 조회 기능에 한해 참고용으로 사용한다.

### 2.3 콘텐츠 (학년도 독립)

**content_packages**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| name | text | 예: "Content A" |
| description | text | |
| status | text | draft / published / archived |
| created_at / updated_at | timestamptz | |

**content_modules**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| content_package_id | uuid FK | |
| order_index | int | 표시 순서 |
| title | text | 예: "생성형 AI란 무엇인가" |
| body | jsonb / text | 모듈 콘텐츠 |
| is_required | bool | 필수 모듈 여부 (기본 true) |
| check_quiz | jsonb, nullable | 확인 문제 정의 (문항/정답). **학습 확인용이며 이수 판정에는 사용하지 않는다.** 오답 시 피드백 제공 후 재시도 가능 (결정 #8) |

unique(content_package_id, order_index)

**content_final_assessments**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| content_package_id | uuid FK unique | 콘텐츠당 1개 최종 평가 |
| questions | jsonb | 문항 정의 |
| passing_score | numeric | 합격 기준 |

> `max_attempts` 없음 — **재응시 횟수 제한 없음** (결정 #7). 모든 응시는 `student_final_assessment_attempts`에 보존.

**content_pledges**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| content_package_id | uuid FK unique | 콘텐츠당 1개 서약 **문구** 정의 (재사용 가능한 텍스트) |
| pledge_text | text | |

> 서약 "문구"는 콘텐츠에 속하지만, 서약 "행위(서명)"는 아래 `student_pledges`에서 보듯 연간 지정(`year_content_assignments`)에 종속된다.

### 2.4 학년도-콘텐츠 지정

**year_content_assignments**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| academic_year_id | uuid FK unique | MVP: 학년도당 1건만 (결정 #1) |
| content_package_id | uuid FK | |
| assigned_by | uuid FK → app_users | |
| assigned_at | timestamptz | |

> 동일 `content_package_id`가 여러 `academic_year_id`에 재사용될 수 있다 (2026→A, 2027→A).

### 2.5 학습 상세 기록 (Supabase 원본)

**student_module_progress**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK → students | |
| content_module_id | uuid FK | |
| status | text | not_started / in_progress / completed |
| check_quiz_attempts | int | 확인 문제 시도 횟수 (재시도 지원) |
| check_quiz_last_correct | bool, nullable | 마지막 시도 정답 여부 (학습 확인용 표시, 게이트 아님) |
| completed_at | timestamptz, nullable | |

unique(student_id, content_module_id)

**student_final_assessment_attempts**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK | |
| content_final_assessment_id | uuid FK | |
| score | numeric | |
| passed | bool | |
| attempt_no | int | |
| attempted_at | timestamptz | |

> 모든 attempt를 삭제 없이 누적 저장한다 (결정 #7).

**student_pledges**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK | |
| year_content_assignment_id | uuid FK | **연간 프로그램 단위**로 서약을 요구하기 위해 콘텐츠가 아닌 연간 지정을 참조 (결정 #9) |
| content_pledge_id | uuid FK | 서명 시점에 사용된 서약 문구 참조 (감사 추적용) |
| agreed_at | timestamptz | |

unique(student_id, year_content_assignment_id) — 학생당 해당 학년도 프로그램에 대해 1회만 서약. 동일 콘텐츠가 다음 해 재사용돼도 `year_content_assignment_id`가 달라지므로 자동으로 재서약이 요구된다.

**student_completion_status** (집계/판정 결과 — 조회 성능 및 Sheets 반영용 캐시)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK unique | |
| academic_year_id | uuid FK | |
| year_content_assignment_id | uuid FK | |
| status | text | NOT_STARTED / IN_PROGRESS / COMPLETED |
| progress_percent | numeric | 교사 대시보드 진행률 표시용 |
| assessment_score | numeric, nullable | Sheets [AI교육현황] 노출용 대표 점수. **어느 시도의 점수를 쓸지는 미확정 — Decisions Needed 참고** |
| pledge_completed_at | timestamptz, nullable | |
| completed_at | timestamptz, nullable | |
| updated_at | timestamptz | |

> 진실 공급원은 상세 기록 테이블들이며, 이 테이블은 트리거 또는 애플리케이션 로직으로 재계산되는 읽기 최적화 캐시다.

### 2.6 Sheets 동기화 로그

**sheets_sync_log**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| sync_type | text | `ROSTER`(학생명단) / `CLASS`(학급정보) / `USERS`(사용자정보) / `COMPLETION_EXPORT`(AI교육현황) |
| direction | text | import / export |
| triggered_by | text | `manual_admin` / `system_event` |
| triggered_by_user_id | uuid FK → app_users, nullable | 수동 실행한 관리자 (system_event인 경우 null) |
| target | text | 대상 시트 범위 또는 레코드 식별자 |
| status | text | success / failed / retrying |
| error_message | text, nullable | |
| retry_count | int | |
| started_at / finished_at | timestamptz | |

- `ROSTER`/`CLASS`/`USERS`는 관리자의 수동 동기화 실행으로만 트리거된다 (결정 #15).
- `COMPLETION_EXPORT`는 학생이 `COMPLETED` 상태로 전환될 때 시스템이 자동으로 시도한다.
- 실패 시 관리자가 로그 화면에서 수동으로 재시도할 수 있다. **Export 실패는 `student_completion_status`나 상세 기록에 영향을 주지 않는다.**

## 3. Google Sheets 탭 ↔ Supabase 테이블 매핑

| Sheets 탭 | 대상 Supabase 테이블 | 원본 | 동기화 트리거 |
|---|---|---|---|
| 학생명단 | `students` | Sheets | 관리자 수동 |
| 학급정보 | `classes` (+ `homeroom_teacher_id` 매칭) | Sheets | 관리자 수동 |
| 사용자정보 | `app_users` | Sheets | 관리자 수동 |
| AI교육현황 | `student_completion_status` → Sheets 반영 | Supabase | 학생 COMPLETED 전환 시 자동 시도 (+ 관리자 수동 재시도) |

## 4. Row Level Security (RLS) 정책 개요

- **공통**: 모든 테이블 `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`. `service_role` 키를 쓰는 서버 전용 작업(동기화, 관리자 콘텐츠 CRUD)만 정책을 우회.
- **역할 판별 우선순위**: 로그인 이메일 기준으로 (1) `app_users`에서 `role='ADMIN'` → 관리자, (2) `app_users`에서 `role='TEACHER'` → 교사, (3) 해당 없으면 `students.student_email` 매칭(현재 활성 학년도) → 학생, (4) 모두 해당 없으면 접근 거부. (결정 #17 — 서버 측에서 판별)
- **students 조회**: `students.student_email`이 `auth.jwt()` 이메일과 일치하는 행만 SELECT (과거 기록 조회는 "본인 이메일과 일치하는 모든 연도" 허용하는 별도 정책).
- **student_module_progress / student_final_assessment_attempts / student_pledges 조회**: `student_id`가 위 조건을 만족하는 학생 소유일 때만 허용.
- **teachers(app_users role=TEACHER) 조회 범위**: `classes.homeroom_teacher_id`가 본인이고 `classes.academic_year_id`가 활성 학년도인 학급에 속한 `students` 및 진행 테이블만 SELECT. UPDATE/DELETE 정책 없음(조회 전용, 결정 #16).
- **admins(app_users role=ADMIN) 조회/쓰기 범위**: 학교 전체(MVP: 사실상 전체) SELECT. `content_packages`/`content_modules`/`content_final_assessments`/`content_pledges`/`year_content_assignments`/`academic_years`에 대한 INSERT/UPDATE는 관리자만 허용. Sheets 동기화 트리거(서버 액션)도 관리자만 호출 가능.
- **비로그인/미매핑 사용자**: 모든 정책 기본 거부.

## 5. 이수 판정 로직 (개념)

1. 학생의 `academic_year_id` → `year_content_assignments`로 배정된 `content_package_id` 및 `year_content_assignment_id` 조회.
2. 해당 콘텐츠의 `content_modules`(is_required=true) 목록과 `student_module_progress` 비교 → 전체 완료 여부. (확인 문제 정답 여부는 게이트 조건 아님)
3. `content_final_assessments.passing_score`와 `student_final_assessment_attempts` 중 **하나라도 통과(passed=true)한 시도가 있는지** 비교 → 통과 여부. (모든 시도 보존, 재응시 무제한)
4. `student_pledges`에 해당 `year_content_assignment_id`에 대한 서약이 존재하는지 → 서약 완료 여부.
5. 2~4 조합으로 상태 계산 후 `student_completion_status`에 반영:
   - 아무 것도 시작 안 함 → `NOT_STARTED`
   - 일부 진행 → `IN_PROGRESS`
   - 모두 충족 → `COMPLETED` (+ `completed_at` 기록, AI교육현황 Sheet 반영 자동 시도)

이 로직은 콘텐츠 정의를 동적으로 조회하여 모듈 개수/평가 기준이 달라져도 재사용 가능해야 한다.

## 6. Questions / Decisions Needed (DB 관점)

세부 항목은 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) 최하단 통합 목록 참고. 이번 개정에서 새로 발견된 항목:

- `student_completion_status.assessment_score`에 어떤 값을 넣을지 (최초 합격 시도 점수 / 최고 점수 / 최신 시도 점수) 미확정.
- AI교육현황 탭이 "완료된 학생만" 기록하는 원장(ledger)인지, 관리자 수동 동기화 시 미완료 학생의 진행률도 함께 갱신할지 미확정.
- `classes.teacher_email`이 `app_users`에 매칭되지 않을 때(오탈자, 미등록 등) 처리 정책 미확정 (자동 임시 생성 vs 동기화 경고만 표시).
