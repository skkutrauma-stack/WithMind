# Supabase 화면 정합성 개정 설계

## 목표

현재 Supabase가 비어 있는 상태에서 한 번에 설치할 수 있는 전체 SQL과 사용 설명서를 제공한다. 화면 HTML은 수정하지 않고, 이후 화면 작업자가 따라야 할 변경 사항을 별도 목록으로 제공한다.

## 확정된 기준

- EMA는 기존 DB의 31문항, 4개 척도, 6유형 분류 구조를 유지한다.
- 한 EMA에서는 같은 대분류에 속한 세부감정을 1개 이상 3개 이하로 저장한다.
- 회원가입 화면은 DB 분류에 필요한 학력을 수집하도록 바꾼다.
- 화면의 유형과 캐릭터는 `classification_types`를 기준으로 표시한다.
- Baseline은 기분, 버거움, 연결감 각 1~5점으로 저장한다.
- 기록 전체 삭제 UI는 실제 삭제를 수행하지 않으며 DB 삭제 기능도 추가하지 않는다.
- 점심·저녁 알림 시간은 고정하지 않고 사용자가 정한 시간을 저장한다.
- 안전계획 연락처는 화면 입력 그대로 단일 문자열로 저장한다.
- 주간 만족도 1~5점과 의견을 주차별로 저장한다.

## 데이터 구조

`ema_sessions`는 대분류와 31문항 응답을 보관하고, 세부감정은 `ema_session_emotions`가 보관한다. 연결 행은 `selection_order` 1~3을 가지며, 트리거와 제출 함수가 개수와 대분류 일치를 검증한다. LLM context와 관리자 export는 세부감정을 JSON 배열로 반환한다.

`baseline_assessments`는 `mood_score`, `burden_score`, `connection_score`를 저장한다. 기존 30일 제출 간격은 유지한다.

`notification_settings`는 점심·저녁 활성 여부와 시간을 유지하되 시간 고정 CHECK를 제거한다. `safety_plans`는 `contact_text` 한 컬럼을 사용한다.

`weekly_feedback`는 사용자, 해당 주 월요일, 만족도, 의견을 저장하며 사용자·주차 조합을 유일하게 제한한다.

## 성찰·EMI 화면 매핑

1. 감정 대분류 및 세부감정 최대 3개 선택
2. EMA 31문항 응답 및 제출
3. DB 분류 유형과 캐릭터 표시, EMA AI 분석 표시
4. EMA 분석 성찰 질문 1개 표시 및 상황·경험 응답 저장
5. 게슈탈트 유형 복수선택
6. LLM 질문 5개 표시
7. 질문 2개 선택 및 통합 응답 중간저장
8. EMI 제출 및 최종 AI 코멘트 표시

질문 선택과 통합 응답은 새 `save_emi_response()` 함수로 저장한다.

## 산출물

- `supabase/supabase_app_schema_final.sql`: 신규 프로젝트 전체 설치 SQL
- `supabase/supabase_database_design_final.md`: 설치·운영·호출 설명서
- `docs/SCREEN_CHANGE_LIST.md`: 화면별 수정 목록
- `scripts/verify_supabase_schema.ps1`: 정적 계약 검증
