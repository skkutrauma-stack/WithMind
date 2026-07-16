# Onboarding Baseline EMA Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profile education and region persistence, insert an onboarding baseline assessment, align the 31-item zero-based EMA, and permit one-question EMI submissions.

**Architecture:** Keep the existing standalone HTML prototype and new-project Supabase installer. Extend the static PowerShell verifier first, then make narrow HTML, SQL, and documentation changes. Preserve the existing six-type classification decisions by offsetting four-point ranges and thresholds rather than changing the decision tree.

**Tech Stack:** HTML, CSS, vanilla JavaScript, PostgreSQL, PL/pgSQL, Markdown, PowerShell static verification

---

### Task 1: Add failing alignment contract checks

**Files:**
- Modify: `scripts/verify_supabase_schema.ps1`

- [ ] **Step 1: Add file paths and screen checks**

Add paths for `profile.html`, `baseline_assessment.html`, `agreement.html`, `safety_contact.html`, and `checkin.html`. Require these contracts:

```powershell
$profilePath = Join-Path $root 'Bench\onboarding\profile.html'
$baselineScreenPath = Join-Path $root 'Bench\onboarding\baseline_assessment.html'
$agreementPath = Join-Path $root 'Bench\onboarding\agreement.html'
$safetyPath = Join-Path $root 'Bench\onboarding\safety_contact.html'
$checkinPath = Join-Path $root 'Bench\daily\checkin.html'

Require-Match $profile 'data-value="1">초등학교' 'profile elementary education option'
Require-Match $profile 'data-value="5">대학원 이상' 'profile graduate education option'
Require-Match $baselineScreen 'mood_score' 'baseline mood payload key'
Require-Match $baselineScreen 'burden_score' 'baseline burden payload key'
Require-Match $baselineScreen 'connection_score' 'baseline connection payload key'
Require-Match $agreement 'baseline_assessment\.html' 'agreement to baseline route'
Require-Match $safety 'baseline_assessment\.html' 'safety back to baseline route'
```

- [ ] **Step 2: Add SQL checks**

Require `profiles.region_name`, five education rows, zero-based four-point options, classification-group lookup, and the EMI zero sentinel:

```powershell
Require-Match $sql 'region_name text,' 'profile region column'
Require-Match $sql 'and region_name is not null' 'required region for completed registration'
Require-Match $sql "\(5, '대학원 이상', 2\)" 'five-level education master'
Require-Match $sql 'v_education_group smallint' 'classification education-group lookup'
Require-Match $sql "\(1, 0, '전혀 아니다', 1\)" 'zero-based loneliness option'
Require-Match $sql 'selected_question_2_no between 0 and 5' 'EMI unselected sentinel range'
Require-Match $sql 'coalesce\(p_selected_question_2_no, 0\)' 'automatic EMI second-selection sentinel'
Require-Match $sql "when 0 then '선택 안함'" 'EMI sentinel label'
```

- [ ] **Step 3: Run the verifier and confirm RED**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_supabase_schema.ps1
```

Expected: exit code 1 with missing baseline screen and missing new profile/EMA/EMI contracts.

- [ ] **Step 4: Commit the failing contract checks**

```powershell
git add scripts/verify_supabase_schema.ps1
git commit -m "test: define onboarding and assessment alignment contracts"
```

### Task 2: Extend profile input and profile schema

**Files:**
- Modify: `Bench/onboarding/profile.html`
- Modify: `supabase/supabase_app_schema_final.sql`

- [ ] **Step 1: Add the education dropdown using the region pattern**

Add an `.education-group` directly below the region group. Give the region group bottom spacing and use these exact options:

```html
<label class="education-label">최종 학력</label>
<div class="education-group" data-open="false">
  <button class="education-trigger" type="button" aria-label="최종 학력 선택">
    <span class="education-display">최종 학력</span>
  </button>
  <div class="education-menu" role="listbox" aria-label="최종 학력 목록">
    <button class="education-option" type="button" data-value="1">초등학교</button>
    <button class="education-option" type="button" data-value="2">중학교</button>
    <button class="education-option" type="button" data-value="3">고등학교</button>
    <button class="education-option" type="button" data-value="4">대학교</button>
    <button class="education-option" type="button" data-value="5">대학원 이상</button>
  </div>
</div>
```

Use the existing region trigger/menu styles and JavaScript interaction. Close the education menu when the document is clicked or another dropdown opens.

- [ ] **Step 2: Expand education master data and persist region**

Use these master rows:

```sql
values
  (1, '초등학교', 1),
  (2, '중학교', 1),
  (3, '고등학교', 1),
  (4, '대학교', 2),
  (5, '대학원 이상', 2)
```

Add nullable `region_name text` so a newly created draft profile can exist before the profile screen is submitted. Ingest `region_name` from auth metadata when present, add `p_region_name text` to `complete_registration`, and require a nonblank region in the completed-registration constraint and function.

- [ ] **Step 3: Make EMA classification use the education group**

Replace direct `education_code <= 1` decisions with a lookup:

```sql
select el.classification_group
  into v_education_group
  from public.profiles p
  join public.education_levels el on el.education_code = p.education_code
 where p.user_id = v_flow.user_id;
```

Use `v_education_group = 1` and `v_education_group = 2` in the two family-stress branches.

- [ ] **Step 4: Run targeted checks**

```powershell
rg -n "초등학교|중학교|고등학교|대학교|대학원 이상" Bench/onboarding/profile.html supabase/supabase_app_schema_final.sql
rg -n "region_name|v_education_group" supabase/supabase_app_schema_final.sql
```

Expected: all five education labels in both files, `region_name` in the profile insert/update paths, and no classification branch comparing `education_code` numerically.

- [ ] **Step 5: Commit profile alignment**

```powershell
git add Bench/onboarding/profile.html supabase/supabase_app_schema_final.sql
git commit -m "feat: collect education and region during onboarding"
```

### Task 3: Add onboarding baseline assessment and navigation

**Files:**
- Create: `Bench/onboarding/baseline_assessment.html`
- Modify: `Bench/onboarding/agreement.html`
- Modify: `Bench/onboarding/safety_contact.html`

- [ ] **Step 1: Create the baseline screen shell**

Use the current 390 x 844 onboarding frame. Render three cards with these data keys and endpoint labels:

```html
<section class="assessment-card" data-key="mood_score" data-value="">
  <h2>지금 기분은 어때?</h2>
  <div class="scale-labels"><span>매우 불편함</span><span>매우 편안함</span></div>
</section>
<section class="assessment-card" data-key="burden_score" data-value="">
  <h2>요즘 얼마나 버겁게 느껴져?</h2>
  <div class="scale-labels"><span>전혀 버겁지 않음</span><span>매우 버거움</span></div>
</section>
<section class="assessment-card" data-key="connection_score" data-value="">
  <h2>사람들과 얼마나 연결되어 있다고 느껴?</h2>
  <div class="scale-labels"><span>매우 혼자인 느낌</span><span>매우 연결된 느낌</span></div>
</section>
```

Each card receives five buttons with `data-value="1"` through `data-value="5"`, `role="radio"`, and `aria-checked`.

- [ ] **Step 2: Implement required selection behavior**

On selection, update the card value, visual ring, and ARIA state. Enable the continue button only when all three cards have a value. Save this exact payload before navigation:

```javascript
const payload = {
  mood_score: Number(document.querySelector('[data-key="mood_score"]').dataset.value),
  burden_score: Number(document.querySelector('[data-key="burden_score"]').dataset.value),
  connection_score: Number(document.querySelector('[data-key="connection_score"]').dataset.value)
};
localStorage.setItem('baselineAssessment', JSON.stringify(payload));
location.href = './safety_contact.html';
```

- [ ] **Step 3: Update navigation**

- Change agreement completion to `./baseline_assessment.html`.
- Set baseline back to `./agreement.html`.
- Change safety-contact back to `./baseline_assessment.html`.
- Keep safety-contact forward navigation to `./alert.html`.

- [ ] **Step 4: Run route and payload checks**

```powershell
rg -n "baseline_assessment\.html|safety_contact\.html|agreement\.html" Bench/onboarding/agreement.html Bench/onboarding/baseline_assessment.html Bench/onboarding/safety_contact.html
rg -n "mood_score|burden_score|connection_score|baselineAssessment" Bench/onboarding/baseline_assessment.html
```

Expected: the approved forward/back route chain and all three DB payload names.

- [ ] **Step 5: Commit baseline screen**

```powershell
git add Bench/onboarding/agreement.html Bench/onboarding/baseline_assessment.html Bench/onboarding/safety_contact.html
git commit -m "feat: add onboarding baseline assessment"
```

### Task 4: Align EMA to 31 zero-based questions

**Files:**
- Modify: `Bench/daily/checkin.html`
- Modify: `supabase/supabase_app_schema_final.sql`

- [ ] **Step 1: Insert the family-satisfaction screen question**

Insert this after the three loneliness questions:

```javascript
{ id: 'q04', text: '지금 현재, 가정생활에 얼마나 만족하십니까?', points: 4,
  left: '만족', right: '불만족' },
```

Rename the former q04-q30 IDs to q05-q31. Keep the existing text and three/four-point controls otherwise unchanged.

- [ ] **Step 2: Convert four-point SQL options to zero-based values**

For option sets 1, 2, and 4, use score values `0,1,2,3`. Change their question min/max metadata to `0,3`. Keep PHQ option set 3 at `0,1,2`.

Set scale ranges to:

```sql
(1, 'loneliness', 1, '외로움', 'sum', 0, 9, true),
(2, 'family_stress', 1, '가정 스트레스', 'sum', 0, 3, true),
(3, 'somatization_phq15', 1, '신체화 PHQ-15', 'sum', 0, 30, true),
(4, 'dysfunctional_coping', 1, '역기능적 대처', 'sum', 0, 36, true)
```

- [ ] **Step 3: Offset classification thresholds without changing decisions**

Use these equivalent zero-based rules in both the algorithm JSON and `submit_ema`:

```text
loneliness <= 2 and family_stress <= 1 -> type 1
loneliness <= 2 and family_stress > 1 and education_group = 1 -> type 2
loneliness <= 2 and family_stress > 1 and education_group = 2 -> type 3
loneliness > 2 and somatization <= 3 -> type 4
loneliness > 2 and somatization > 3 and dysfunctional_coping <= 3 -> type 5
loneliness > 2 and somatization > 3 and dysfunctional_coping > 3 -> type 6
```

- [ ] **Step 4: Run EMA checks**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_supabase_schema.ps1
```

Expected at this checkpoint: any remaining failures concern the EMI or documentation contracts; EMA question, option, range, and classification checks pass.

- [ ] **Step 5: Commit EMA alignment**

```powershell
git add Bench/daily/checkin.html supabase/supabase_app_schema_final.sql
git commit -m "fix: align EMA questions and zero-based responses"
```

### Task 5: Permit one-question EMI submission

**Files:**
- Modify: `supabase/supabase_app_schema_final.sql`

- [ ] **Step 1: Add the zero sentinel contract**

Change `selected_question_2_no` to allow `0..5` and default to `0`. Restrict the distinct constraint to actual second questions:

```sql
selected_question_2_no smallint not null default 0
  check (selected_question_2_no between 0 and 5),
constraint emi_selected_questions_distinct_ck check (
  selected_question_2_no = 0
  or selected_question_1_no is null
  or selected_question_1_no <> selected_question_2_no
)
```

- [ ] **Step 2: Normalize null second selections during save**

Use `coalesce(p_selected_question_2_no, 0)` for validation and persistence. Reject q2 only when it is outside 0-5 or duplicates q1 while nonzero.

- [ ] **Step 3: Permit one selected question at final submit**

Require q1 in 1-5. Accept q2=0 or a distinct q2 in 1-5. Keep the combined-response requirement.

- [ ] **Step 4: Render the sentinel in LLM context**

Add this branch to the second-question mapping:

```sql
v_selected_q2 := case v_emi.selected_question_2_no
  when 0 then '선택 안함'
  when 1 then v_emi.question_1
  when 2 then v_emi.question_2
  when 3 then v_emi.question_3
  when 4 then v_emi.question_4
  when 5 then v_emi.question_5
end;
```

- [ ] **Step 5: Run the verifier**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_supabase_schema.ps1
```

Expected: only documentation checks may remain.

- [ ] **Step 6: Commit EMI alignment**

```powershell
git add supabase/supabase_app_schema_final.sql
git commit -m "feat: support single-question EMI responses"
```

### Task 6: Update usage guidance and deferred issue record

**Files:**
- Modify: `supabase/supabase_database_design_final.md`
- Modify: `docs/SCREEN_CHANGE_LIST.md`

- [ ] **Step 1: Update the database guide**

Document `region_name`, five education codes, the onboarding baseline payload, the 31-question EMA with q004 family satisfaction, zero-based four-point responses, and q2=0 meaning `선택 안함`.

- [ ] **Step 2: Update the screen change list**

Mark profile education/region, onboarding baseline, EMA q004, and one-question EMI as implemented. Keep these items explicitly pending without changing their screens:

```markdown
- [ ] 알림 시간 편집 UI 및 저장값 재조회
- [ ] 앱 잠금 방식(PIN/생체인증) 선택 UI
```

- [ ] **Step 3: Run documentation checks**

```powershell
rg -n "region_name|초등학교|가정생활|0~3|선택 안함" supabase/supabase_database_design_final.md docs/SCREEN_CHANGE_LIST.md
```

Expected: each revised contract is described and both deferred issues remain visibly unchecked.

- [ ] **Step 4: Commit documentation**

```powershell
git add supabase/supabase_database_design_final.md docs/SCREEN_CHANGE_LIST.md
git commit -m "docs: update onboarding and assessment contracts"
```

### Task 7: Full verification

**Files:**
- Verify: all files in Tasks 1-6

- [ ] **Step 1: Run the full schema/screen verifier**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_supabase_schema.ps1
```

Expected: `Supabase schema contract verification passed.` and exit code 0.

- [ ] **Step 2: Check HTML and SQL contract counts**

```powershell
rg -n "id: 'q[0-9]{2}'" Bench/daily/checkin.html
rg -n "data-value=\"[1-5]\"" Bench/onboarding/baseline_assessment.html
```

Expected: 31 EMA question definitions and 15 baseline scale buttons.

- [ ] **Step 3: Check patch integrity**

```powershell
git diff --check HEAD~5..HEAD
git status --short
```

Expected: no whitespace errors and only intentionally uncommitted plan-tracking changes, if any.

- [ ] **Step 4: Review the final diff against the approved design**

Confirm every Scope and Verification bullet in `docs/superpowers/specs/2026-07-16-onboarding-baseline-ema-alignment-design.md` has direct code, SQL, documentation, or test evidence.
