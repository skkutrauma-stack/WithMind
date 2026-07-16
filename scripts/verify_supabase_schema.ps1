$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sqlPath = Join-Path $root 'supabase\supabase_app_schema_final.sql'
$guidePath = Join-Path $root 'supabase\supabase_database_design_final.md'
$screenPath = Join-Path $root 'docs\SCREEN_CHANGE_LIST.md'
$profilePath = Join-Path $root 'Bench\onboarding\profile.html'
$baselineScreenPath = Join-Path $root 'Bench\onboarding\baseline_assessment.html'
$agreementPath = Join-Path $root 'Bench\onboarding\agreement.html'
$safetyPath = Join-Path $root 'Bench\onboarding\safety_contact.html'
$checkinPath = Join-Path $root 'Bench\daily\checkin.html'

$failures = [System.Collections.Generic.List[string]]::new()

function Require-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    $failures.Add("Missing ${Label}: $Path")
    return $false
  }
  return $true
}

function Require-Match([string]$Text, [string]$Pattern, [string]$Label) {
  if ($Text -notmatch $Pattern) {
    $failures.Add("Missing contract: $Label")
  }
}

function Reject-Match([string]$Text, [string]$Pattern, [string]$Label) {
  if ($Text -match $Pattern) {
    $failures.Add("Obsolete contract remains: $Label")
  }
}

$hasSql = Require-File $sqlPath 'SQL installer'
$hasGuide = Require-File $guidePath 'usage guide'
$hasScreen = Require-File $screenPath 'screen change list'
$hasProfile = Require-File $profilePath 'profile screen'
$hasBaselineScreen = Require-File $baselineScreenPath 'baseline assessment screen'
$hasAgreement = Require-File $agreementPath 'agreement screen'
$hasSafety = Require-File $safetyPath 'safety contact screen'
$hasCheckin = Require-File $checkinPath 'EMA check-in screen'

if ($hasSql) {
  $sql = Get-Content -LiteralPath $sqlPath -Raw -Encoding UTF8
  Require-Match $sql 'create table if not exists public\.ema_session_emotions' 'multi-detail emotion table'
  Require-Match $sql 'selection_order smallint not null check \(selection_order between 1 and 3\)' 'emotion selection order 1..3'
  Require-Match $sql 'create or replace function public\.guard_ema_session_emotions' 'emotion count/category trigger'
  Require-Match $sql 'between 1 and 3 emotion details are required' 'EMA submit emotion-count validation'
  Require-Match $sql 'mood_score smallint not null check \(mood_score between 1 and 5\)' 'Baseline mood score'
  Require-Match $sql 'burden_score smallint not null check \(burden_score between 1 and 5\)' 'Baseline burden score'
  Require-Match $sql 'connection_score smallint not null check \(connection_score between 1 and 5\)' 'Baseline connection score'
  Reject-Match $sql 'sleep_quality smallint' 'old Baseline sleep field'
  Reject-Match $sql 'check \(lunch_time = time ''12:00''\)' 'fixed lunch time'
  Reject-Match $sql 'check \(evening_time = time ''21:00''\)' 'fixed evening time'
  Require-Match $sql 'contact_text text not null default ''''' 'single-string safety contact'
  Reject-Match $sql 'contacts jsonb' 'JSON safety contacts'
  Require-Match $sql 'create table if not exists public\.weekly_feedback' 'weekly feedback table'
  Require-Match $sql 'satisfaction_score smallint not null check \(satisfaction_score between 1 and 5\)' 'weekly satisfaction range'
  Require-Match $sql 'create or replace function public\.save_emi_response' 'EMI response draft-save function'
  Require-Match $sql 'gender_code text check \(gender_code in \(''male'', ''female'', ''private''\)\)' 'profile gender column'
  Require-Match $sql 'region_name text,' 'profile region column'
  Require-Match $sql 'gender_code is not null' 'required gender for completed registration'
  Require-Match $sql 'and region_name is not null' 'required region for completed registration'
  Require-Match $sql 'create or replace function public\.complete_registration\(\s*p_user_id uuid,\s*p_nickname text,\s*p_birth_date date,\s*p_education_code smallint,\s*p_region_name text,\s*p_gender_code text' 'registration completion signature'
  Require-Match $sql "\(5, '[^']+', 2\)" 'five-level education master'
  Require-Match $sql 'v_education_group smallint' 'classification education-group lookup'
  Reject-Match $sql 'v_education_code <= 1' 'classification direct education-code comparison'
  Require-Match $sql "\(1, 0, '[^']+', 1\)" 'zero-based loneliness option'
  Require-Match $sql "\(2, 0, '[^']+', 1\)" 'zero-based family-stress option'
  Require-Match $sql "\(4, 0, '[^']+', 1\)" 'zero-based coping option'
  Require-Match $sql "\(1, 'loneliness', 1, '[^']+', 'sum', 0, 9, true\)" 'zero-based loneliness range'
  Require-Match $sql "\(2, 'family_stress', 1, '[^']+', 'sum', 0, 3, true\)" 'zero-based family-stress range'
  Require-Match $sql "\(4, 'dysfunctional_coping', 1, '[^']+', 'sum', 0, 36, true\)" 'zero-based coping range'
  Require-Match $sql 'selected_question_2_no between 0 and 5' 'EMI unselected sentinel range'
  Require-Match $sql 'coalesce\(p_selected_question_2_no, 0\)' 'automatic EMI second-selection sentinel'
  Require-Match $sql 'when 0 then' 'EMI sentinel label branch'
  Require-Match $sql '''emotion_details'', v_emotions' 'LLM context emotion array'
  Require-Match $sql 'emotion_details_json' 'exported emotion array'

  $instrumentRows = [regex]::Matches(
    $sql,
    '(?m)^\s*\(1,\s*(?:[1-9]|[12][0-9]|3[01]),\s*(?:[1-9]|[12][0-9]|3[01]),\s*(?:[1-9]|[12][0-9]|3[01]),\s*true\)[,;]?\r?$'
  ).Count
  if ($instrumentRows -ne 31) {
    $failures.Add("Expected 31 active EMA instrument rows; found $instrumentRows")
  }

  $emaSessionBlock = [regex]::Match(
    $sql,
    '(?s)create table if not exists public\.ema_sessions \(.*?\n\);\s*create table if not exists public\.ema_session_emotions'
  ).Value
  Reject-Match $emaSessionBlock 'emotion_detail_id' 'single emotion detail in ema_sessions'

  $dollarQuoteCount = [regex]::Matches($sql, '\$\$').Count
  if (($dollarQuoteCount % 2) -ne 0) {
    $failures.Add("Unbalanced PL/pgSQL dollar quotes: $dollarQuoteCount")
  }
}

if ($hasGuide) {
  $guide = Get-Content -LiteralPath $guidePath -Raw -Encoding UTF8
  Require-Match $guide 'ema_session_emotions' 'guide multi-detail emotions'
  Require-Match $guide 'weekly_feedback' 'guide weekly feedback'
  Require-Match $guide 'save_emi_response' 'guide EMI save order'
  Require-Match $guide 'gender_code' 'guide profile gender'
  Require-Match $guide 'region_name' 'guide profile region'
  Require-Match $guide 'baseline_assessment\.html' 'guide onboarding baseline screen'
  Require-Match $guide 'q004' 'guide family-satisfaction EMA slot'
  Require-Match $guide 'selected_question_2_no = 0' 'guide EMI unselected sentinel'
}

if ($hasScreen) {
  $screen = Get-Content -LiteralPath $screenPath -Raw -Encoding UTF8
  Require-Match $screen 'q001.*q031' 'screen list EMA 31-item mapping'
  Require-Match $screen 'education_code' 'screen list education input'
  Require-Match $screen 'gender_code' 'screen list profile gender mapping'
  Require-Match $screen 'API.*SQL' 'screen list intentional no-op'
  Require-Match $screen 'region_name' 'screen list profile region mapping'
  Require-Match $screen 'baseline_assessment\.html' 'screen list onboarding baseline screen'
  Require-Match $screen 'selected_question_2_no = 0' 'screen list one-question EMI mapping'
  Require-Match $screen 'app_lock_settings\.lock_method' 'screen list deferred app-lock method'
}

if ($hasProfile) {
  $profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8
  Require-Match $profile 'education-option" type="button" data-value="1"' 'profile elementary education option'
  Require-Match $profile 'education-option" type="button" data-value="2"' 'profile middle-school education option'
  Require-Match $profile 'education-option" type="button" data-value="3"' 'profile high-school education option'
  Require-Match $profile 'education-option" type="button" data-value="4"' 'profile university education option'
  Require-Match $profile 'education-option" type="button" data-value="5"' 'profile graduate education option'
  Require-Match $profile 'education-group' 'profile education dropdown'
}

if ($hasBaselineScreen) {
  $baselineScreen = Get-Content -LiteralPath $baselineScreenPath -Raw -Encoding UTF8
  Require-Match $baselineScreen 'mood_score' 'baseline mood payload key'
  Require-Match $baselineScreen 'burden_score' 'baseline burden payload key'
  Require-Match $baselineScreen 'connection_score' 'baseline connection payload key'
  Require-Match $baselineScreen 'baselineAssessment' 'baseline prototype payload storage'

  $baselineValueButtons = [regex]::Matches($baselineScreen, 'data-value="[1-5]"').Count
  if ($baselineValueButtons -ne 15) {
    $failures.Add("Expected 15 baseline scale buttons; found $baselineValueButtons")
  }
}

if ($hasAgreement) {
  $agreement = Get-Content -LiteralPath $agreementPath -Raw -Encoding UTF8
  Require-Match $agreement 'baseline_assessment\.html' 'agreement to baseline route'
}

if ($hasSafety) {
  $safety = Get-Content -LiteralPath $safetyPath -Raw -Encoding UTF8
  Require-Match $safety 'baseline_assessment\.html' 'safety back to baseline route'
}

if ($hasCheckin) {
  $checkin = Get-Content -LiteralPath $checkinPath -Raw -Encoding UTF8
  Require-Match $checkin "id: 'q04'.*points: 4" 'EMA family-satisfaction question at slot 4'
  Require-Match $checkin "id: 'q31'" 'EMA final question at slot 31'

  $screenQuestionCount = [regex]::Matches($checkin, "id: 'q[0-9]{2}'").Count
  if ($screenQuestionCount -ne 31) {
    $failures.Add("Expected 31 EMA screen questions; found $screenQuestionCount")
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host 'Supabase schema contract verification passed.'
