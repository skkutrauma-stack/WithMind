# 마음곁 Supabase 데이터베이스 설치·사용 설명서

이 문서는 현재 `Bench` 화면 흐름을 기준으로 정리한 Supabase 초안의 설치 및 연동 지침입니다. 아직 실제 Supabase 프로젝트에는 적용하지 않은 상태이며, 설치 파일은 `supabase_app_schema_final.sql` 하나입니다.

## 1. 이번 확정 반영 사항

- EMA 활성 문항은 31개이며, 원본 응답은 `ema_sessions.q001`~`q031`에 저장합니다. `q032`~`q100`은 이후 도구 버전을 위한 예비 슬롯입니다.
- 사용자가 고른 세부감정은 `ema_session_emotions`에 1~3개까지 선택 순서와 함께 저장합니다.
- 프로필은 `education_code`(최종학력)와 `region_name`(거주지역)을 저장합니다. 학력은 화면의 5개 선택지와 동일합니다.
- EMA 결과 유형은 화면의 임의 유형이 아니라 `classification_types`와 `ema_classifications`를 기준으로 표시합니다.
- baseline은 기분, 버거움, 연결감 3개 점수로 저장합니다.
- 알림 시각은 사용자가 설정한 `time` 값을 그대로 저장합니다.
- 안전 연락처는 JSON 배열이 아니라 `safety_plans.contact_text` 문자열 하나로 저장합니다.
- 주간 만족도와 의견은 `weekly_feedback`에 주차별로 저장합니다.
- EMA 분석 성찰은 `ema_reflection_sessions`, 게슈탈트 기반 EMI는 `emi_sessions`에 분리 저장합니다.
- 설정 화면의 “기록 전체 삭제” 동작은 제품 사양상 실제 DB 삭제 API를 호출하지 않습니다. 이 SQL에는 사용자 기록 일괄 삭제 함수가 없습니다.

## 2. 설치 방법

1. Supabase 프로젝트를 만든 뒤 SQL Editor를 엽니다.
2. `supabase_app_schema_final.sql` 전체를 한 번 실행합니다.
3. Authentication에서 실제 관리자 사용자를 만든 뒤 파일 맨 아래 예시대로 `grant_app_admin_by_email`을 실행합니다.
4. Storage에 `character-images` 공개 버킷이 생성됐는지 확인하고 `types/type_01.png`~`type_06.png`를 업로드합니다.
5. 프런트엔드에는 `service_role` 키를 절대 넣지 않습니다. 아래 쓰기 함수는 Edge Function 또는 별도 서버에서 호출합니다.

스크립트는 트랜잭션으로 실행되며 테이블, 함수, RLS, 기준정보와 EMA 31문항 v1을 함께 설치합니다.

## 3. 공통 원칙

- `auth.users.id`와 `profiles.user_id`는 같은 UUID입니다.
- 사용자 활동은 `activity_flows`의 `flow_id` 하나로 연결합니다.
- 앱 클라이언트는 본인 데이터 읽기만 수행하고, 중요한 생성·제출은 서버 전용 함수를 호출합니다.
- 완료된 활동과 AI 결과는 수정/삭제할 수 없도록 보호합니다.
- 화면 전환용 임시 값은 로컬 상태로 쓸 수 있지만, 제출 완료 여부의 기준은 DB 상태입니다.

## 4. 가입과 초기 설정

Auth 가입이 끝나면 서버에서 다음 함수를 호출합니다.

```sql
select public.complete_registration(
  p_user_id        := 'AUTH_USER_UUID',
  p_nickname       := '마음이',
  p_birth_date     := date '2000-01-01',
  p_education_code := 4,
  p_region_name    := '서울특별시'
);
```

`education_code`는 `education_levels` 기준정보의 값을 사용합니다.

| education_code | 화면 표시 | 분류 그룹 |
|---:|---|---:|
| 1 | 초등학교 | 1 |
| 2 | 중학교 | 1 |
| 3 | 고등학교 | 1 |
| 4 | 대학교 | 2 |
| 5 | 대학원 이상 | 2 |

`region_name`은 `profile.html`에서 선택한 광역시·도 이름을 그대로 전달합니다. 초안 프로필에서는 비어 있을 수 있지만 가입 완료 시 학력과 거주지역이 모두 필요합니다.

가입·동의 다음에는 `Bench/onboarding/baseline_assessment.html`에서 초기 baseline을 입력합니다. 화면 흐름은 `agreement.html → baseline_assessment.html → safety_contact.html → alert.html`입니다. 서버는 baseline 활동을 만든 뒤 세 점수를 저장하고 제출합니다.

```sql
select public.start_activity_flow('AUTH_USER_UUID', 'baseline', null);

insert into public.baseline_assessments (
  flow_id, user_id, mood_score, burden_score, connection_score
)
values ('BASELINE_FLOW_UUID', 'AUTH_USER_UUID', 4, 3, 2);

select public.submit_baseline('BASELINE_FLOW_UUID');
```

세 값은 모두 1~5이며 화면 키와 DB 컬럼 이름은 동일합니다. 기분과 연결감은 점수가 높을수록 긍정 방향이고, 버거움은 점수가 높을수록 더 버거운 상태입니다.

## 5. 안전 계획과 알림 설정

연락처는 하나의 문자열로 보냅니다. 여러 연락처를 입력하게 하더라도 화면에서 한 문자열로 합쳐 저장합니다.

```sql
select public.start_activity_flow('AUTH_USER_UUID', 'safety_plan', null);

insert into public.safety_plans (
  user_id, flow_id, warning_signs, calming_methods, contact_text
)
values (
  'AUTH_USER_UUID', 'SAFETY_FLOW_UUID',
  '잠이 오지 않음',
  '산책하기',
  '보호자 010-1234-5678 / 상담기관 1234-5678'
)
on conflict (user_id) do update
set warning_signs = excluded.warning_signs,
    calming_methods = excluded.calming_methods,
    contact_text = excluded.contact_text;
```

알림은 화면에서 선택한 시간을 `time`으로 그대로 보냅니다. 기본값만 12:00, 21:00이고 고정 제약은 없습니다.

```sql
select public.start_activity_flow('AUTH_USER_UUID', 'notification_settings', null);

insert into public.notification_settings (
  user_id, flow_id, lunch_enabled, lunch_time,
  evening_enabled, evening_time, timezone
)
values (
  'AUTH_USER_UUID', 'NOTIFICATION_FLOW_UUID',
  true, time '11:35', true, time '20:10', 'Asia/Seoul'
)
on conflict (user_id) do update
set lunch_enabled = excluded.lunch_enabled,
    lunch_time = excluded.lunch_time,
    evening_enabled = excluded.evening_enabled,
    evening_time = excluded.evening_time,
    timezone = excluded.timezone;
```

## 6. EMA 저장 흐름

### 6.1 활동 생성

```sql
select public.start_activity_flow('AUTH_USER_UUID', 'ema', null);
```

서버가 반환한 `flow_id`를 이후 모든 EMA 요청에 사용합니다. 활성 도구 버전은 `ema_instrument_versions`에서 확인하며 현재 v1은 31문항입니다.

### 6.2 감정과 31문항 저장

대분류 하나를 `ema_sessions.emotion_category_id`에, 세부감정 1~3개를 `ema_session_emotions`에 저장합니다. `q004`는 가정생활 만족도이며 최종학력은 EMA 응답이 아니라 `profiles.education_code`에서 별도로 가져옵니다.

```sql
insert into public.ema_sessions (
  flow_id, user_id, instrument_version_id, emotion_category_id,
  q001, q002, q003, q004
  -- 같은 방식으로 q031까지 열을 추가
)
values (
  'EMA_FLOW_UUID', 'AUTH_USER_UUID', 1, 6,
  2, 3, 1, 0
  -- 같은 방식으로 q031까지 값을 추가
);

delete from public.ema_session_emotions
where flow_id = 'EMA_FLOW_UUID';

insert into public.ema_session_emotions
  (flow_id, user_id, emotion_detail_id, selection_order)
values
  ('EMA_FLOW_UUID', 'AUTH_USER_UUID', 601, 1),
  ('EMA_FLOW_UUID', 'AUTH_USER_UUID', 602, 2),
  ('EMA_FLOW_UUID', 'AUTH_USER_UUID', 604, 3);
```

모든 세부감정은 선택한 대분류에 속해야 합니다. 제출 시 필수 31문항, 척도 점수, 세부감정 1~3개를 다시 검증합니다.

화면의 원형 선택 인덱스를 그대로 저장합니다. 외로움·가정생활 만족도·역기능적 대처 4점 문항은 `0~3`, PHQ-15 3점 문항은 `0~2`입니다. 척도 합계 범위는 외로움 `0~9`, 가정 스트레스 `0~3`, 신체화 `0~30`, 역기능적 대처 `0~36`입니다.

### 6.3 척도 점수와 제출

현재 화면에서 산출한 척도 합계를 `ema_scale_scores`에 저장합니다. 서버의 `submit_ema`는 문항 응답으로 같은 점수를 다시 계산해 불일치를 거부하고, 6개 유형 중 하나를 `ema_classifications`에 저장합니다.

```sql
insert into public.ema_scale_scores (
  flow_id, user_id, scoring_version_id,
  scale01, scale02, scale03, scale04
)
values (
  'EMA_FLOW_UUID', 'AUTH_USER_UUID', 1,
  4, 3, 2, 12
);
```

실제 합계는 활성 instrument의 문항-척도 매핑에 따라 단순 합산하며, 위 숫자는 호출 형태를 보여주는 예시일 뿐입니다.

```sql
select public.submit_ema('EMA_FLOW_UUID');
```

반환값은 확정된 `type_id`입니다. 결과 화면은 이 값을 임의로 다시 판정하지 말고 다음 정보를 조회해 반영합니다.

```sql
select c.type_id, t.node_code, t.internal_type_name,
       t.character_name, t.image_bucket, t.image_path
from public.ema_classifications c
join public.classification_types t on t.type_id = c.type_id
where c.flow_id = 'EMA_FLOW_UUID';
```

### 6.4 EMA AI 분석

Edge Function은 `get_ema_llm_context(flow_id)`로 현재 flow의 감정 목록, 31문항, 척도 점수, 확정 유형을 가져옵니다. 컨텍스트의 핵심 키는 다음과 같습니다.

- `emotion_category`
- `emotion_details` (선택 순서대로 정렬된 배열)
- `ema_responses`
- `ema_scale_scores`
- `classification`

LLM 결과는 검증 후 `save_ema_ai_result`로 저장합니다. 과거 flow나 baseline을 프롬프트에 섞지 않습니다.

## 7. EMA 성찰과 EMI 매핑

화면과 DB의 권장 순서는 다음과 같습니다.

1. EMA 제출 및 유형 확정
2. EMA AI 분석 특성 3개와 코멘트 저장
3. `start_ema_reflection_flow(user_id, source_ema_flow_id)` 호출
4. AI가 만든 개방형 질문 1개를 `save_ema_reflection_question`으로 저장
5. 사용자의 자유 응답을 `save_ema_reflection_response`로 저장
6. `submit_ema_reflection` 호출
7. 화면에서 게슈탈트 유형을 1개 이상 선택
8. `start_emi_flow(user_id, source_reflection_flow_id, gestalt_type_ids)` 호출
9. `get_emi_llm_context`로 현재 EMA+성찰+선택 유형을 가져와 질문 5개 생성
10. `save_emi_questions`로 질문 5개 저장
11. 사용자가 질문 1개 또는 서로 다른 질문 2개를 선택하고 하나의 통합 응답을 작성
12. `save_emi_response`로 선택 번호와 응답 저장
13. `submit_emi` 후 AI 코멘트를 생성해 `save_emi_ai_result`로 저장

사용자 응답 저장 예시는 다음과 같습니다.

```sql
select public.save_emi_response(
  p_flow_id := 'EMI_FLOW_UUID',
  p_selected_question_1_no := 1,
  p_selected_question_2_no := null,
  p_combined_response := '선택한 질문을 생각하며 작성한 사용자의 성찰 내용'
);

select public.submit_emi('EMI_FLOW_UUID');
```

두 번째 질문을 고르지 않으면 `save_emi_response`가 `selected_question_2_no = 0`을 자동 저장합니다. `0`은 “선택 안함”을 뜻합니다. 최종 제출에는 첫 번째 질문 1개와 비어 있지 않은 통합 응답이 필요하며, 두 번째 질문을 고른 경우 첫 번째와 달라야 합니다.

## 8. 주간 만족도와 의견

한 사용자는 한 주에 한 건을 저장하며 같은 주에 다시 저장하면 갱신됩니다. `week_start`는 월요일이어야 하고 만족도는 1~5입니다.

```sql
select public.save_weekly_feedback(
  p_user_id := 'AUTH_USER_UUID',
  p_week_start := date '2026-07-13',
  p_satisfaction_score := 4,
  p_opinion_text := '이번 주 감정 기록이 도움이 되었어요.'
);
```

## 9. 주요 테이블 빠른 참조

| 목적 | 테이블 |
|---|---|
| 사용자 기본정보·학력·거주지역 | `profiles`, `education_levels` |
| 기분·버거움·연결감 baseline | `baseline_assessments` |
| 안전 연락처 문자열 | `safety_plans.contact_text` |
| 사용자 알림 시각 | `notification_settings` |
| EMA 원응답 | `ema_sessions` |
| 세부감정 최대 3개 | `ema_session_emotions` |
| 척도 점수·유형 | `ema_scale_scores`, `ema_classifications` |
| EMA AI 분석 | `ema_ai_results` |
| EMA 분석 후 자유 성찰 | `ema_reflection_sessions` |
| 게슈탈트 기반 질문·통합응답 | `emi_sessions` |
| EMI AI 코멘트 | `emi_ai_results` |
| 주간 만족도·의견 | `weekly_feedback` |
| 관리자 EMA 추출 | `v_ema_export` |

`v_ema_export.emotion_details_json`은 최대 3개 세부감정을 선택 순서가 포함된 JSON 배열로 제공합니다.

## 10. 운영 전 확인사항

- 프런트엔드 번들에 `service_role` 키가 없는지 확인합니다.
- Edge Function에서 로그인 사용자와 `p_user_id`/flow 소유자가 같은지 확인합니다.
- EMA 화면이 활성 instrument의 31문항을 모두 렌더링하고 누락 응답을 막는지 확인합니다.
- `q004`가 가정생활 만족도이고 4점 문항 응답이 `0~3`으로 저장되는지 확인합니다.
- 가입 완료 시 `education_code`와 `region_name`이 모두 저장되는지 확인합니다.
- EMI 질문을 하나만 고르면 두 번째 선택 번호가 `0`으로 저장되는지 확인합니다.
- 결과 화면이 `ema_classifications.type_id`를 기준으로 유형·캐릭터를 표시하는지 확인합니다.
- 세부감정 네 번째 선택을 화면에서 막고 DB 오류도 사용자 친화적으로 처리합니다.
- 알림 시간이 사용자가 고른 값 그대로 재조회되는지 확인합니다.
- 주간 피드백의 월요일 `week_start` 계산이 사용자 시간대 기준인지 확인합니다.
- `v_ema_export`에서 31문항, 세부감정 배열, 성찰 응답이 함께 추출되는지 확인합니다.
