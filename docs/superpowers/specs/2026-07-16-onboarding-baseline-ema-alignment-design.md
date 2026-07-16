# Onboarding, Baseline, EMA, and EMI Alignment Design

**Date:** 2026-07-16

## Goal

Align the current onboarding screens and the Supabase installer without changing the established visual language. Add the missing profile and baseline inputs, preserve the six-type EMA classification pipeline, and allow a one-question EMI response.

## Scope

### Profile screen

- Keep the existing gender, birth-date, and region controls.
- Add spacing below the region selector consistent with the spacing used between the existing input groups.
- Add a final-education dropdown using the same visual and interaction pattern as the region dropdown.
- Display these five choices:
  1. 초등학교
  2. 중학교
  3. 고등학교
  4. 대학교
  5. 대학원 이상
- Store a stable numeric `education_code` and the selected Korean region name.

### Profile database contract

- Expand `education_levels` to the five screen choices.
- Preserve the existing two-way classification split through `classification_group`:
  - Group 1: 초등학교, 중학교, 고등학교
  - Group 2: 대학교, 대학원 이상
- Add `profiles.region_name` and pass it through auth metadata and `complete_registration`.
- A completed registration requires nickname, birth date, education, and region.
- EMA classification must use `education_levels.classification_group`, not assumptions about the numeric education code.

### Baseline assessment screen

- Add `Bench/onboarding/baseline_assessment.html`.
- Follow the current 390 x 844 onboarding shell, Jua/Pretendard typography, rounded white cards, lavender gradient, and existing button treatment.
- Show all three required questions on one page:
  - 기분: 1 = 매우 불편함, 5 = 매우 편안함
  - 버거움: 1 = 전혀 버겁지 않음, 5 = 매우 버거움
  - 연결감: 1 = 매우 혼자인 느낌, 5 = 매우 연결된 느낌
- Use five individually tappable dots per question. The selected state uses a visible ring and accessible `aria-checked` state.
- Keep the next button disabled until all three values are selected.
- Save the prototype payload as `mood_score`, `burden_score`, and `connection_score` so the later Supabase integration can use it without renaming.

### Onboarding navigation

Use this sequence:

`agreement.html -> baseline_assessment.html -> safety_contact.html -> alert.html -> home`

- Agreement completion navigates to the new baseline screen.
- Baseline back navigates to agreement; completion navigates to safety contact.
- Safety-contact back navigates to baseline; its existing forward navigation to alert remains.

### EMA instrument

- Keep the existing 30 screen questions.
- Insert `가정생활에 얼마나 만족하십니까?` as question 4.
- Shift the current screen questions 4-30 to slots 5-31.
- The final instrument remains 31 EMA questions; education remains separate profile data.
- Four-point controls store the complete zero-based frontend range `0, 1, 2, 3`.
- Three-point PHQ controls continue to store `0, 1, 2`.
- Adjust the four-point response master data, theoretical scale ranges, and classification thresholds by the corresponding constant offsets so zero-based storage produces the same classification decisions as the former 1-4 scoring:
  - Loneliness sum and threshold shift by 3.
  - Family-stress sum and threshold shift by 1.
  - Dysfunctional-coping sum and threshold shift by 12.
  - Somatization remains unchanged.

### EMI one-question response

- Keep `selected_question_1_no` as a required selected question at final submission.
- Use `selected_question_2_no = 0` as the stored sentinel for `선택 안함`.
- If the caller sends a null second selection while the first selection is valid, `save_emi_response` stores `0` automatically.
- Final submission accepts either one question (`q2 = 0`) or two distinct questions (`q2 = 1..5`).
- LLM context and exports render the sentinel as `선택 안함` rather than attempting to resolve a second question.
- A non-empty combined response remains required.

### Deferred issues

Do not change these screens in this task:

- Notification-time editing
- App-lock method selection

Record both items as deferred screen/DB integration work in the existing screen change list.

## Files

- `Bench/onboarding/profile.html`
- `Bench/onboarding/agreement.html`
- `Bench/onboarding/baseline_assessment.html` (new)
- `Bench/onboarding/safety_contact.html`
- `Bench/daily/checkin.html`
- `supabase/supabase_app_schema_final.sql`
- `supabase/supabase_database_design_final.md`
- `docs/SCREEN_CHANGE_LIST.md`
- Alignment verification script(s) under `scripts/`

## Verification

- Verify the profile screen exposes all five education values and preserves all 17 region values.
- Verify the onboarding route chain in both forward and backward directions.
- Verify the baseline screen requires three 1-5 values and emits the DB field names.
- Verify the EMA screen has exactly 31 questions with family satisfaction at slot 4.
- Verify four-point screen values and SQL option values are both 0-3.
- Verify the zero-based scale ranges and classification thresholds are offset-equivalent to the former rules.
- Verify EMI accepts one selected question using the zero sentinel and still rejects zero selected questions or duplicate two-question selections.
- Run the repository Supabase contract verifier and targeted screen-alignment checks.

## Non-goals

- No live Supabase project creation or migration execution.
- No Supabase or LLM calls from HTML in this task.
- No visual redesign outside the requested education control and new baseline page.
- No notification-time picker or app-lock method UI in this task.
