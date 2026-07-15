$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sqlPath = Join-Path $root 'supabase\supabase_app_schema_final.sql'
$guidePath = Join-Path $root 'supabase\supabase_database_design_final.md'
$screenPath = Join-Path $root 'docs\SCREEN_CHANGE_LIST.md'

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
  Require-Match $sql '''emotion_details'', v_emotions' 'LLM context emotion array'
  Require-Match $sql 'emotion_details_json' 'exported emotion array'

  $instrumentRows = [regex]::Matches(
    $sql,
    '(?m)^\s*\(1,\s*(?:[1-9]|[12][0-9]|3[01]),\s*(?:[1-9]|[12][0-9]|3[01]),\s*(?:[1-9]|[12][0-9]|3[01]),\s*true\)[,;]?$'
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
}

if ($hasScreen) {
  $screen = Get-Content -LiteralPath $screenPath -Raw -Encoding UTF8
  Require-Match $screen 'q001.*q031' 'screen list EMA 31-item mapping'
  Require-Match $screen 'education_code' 'screen list education input'
  Require-Match $screen 'API.*SQL' 'screen list intentional no-op'
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host 'Supabase schema contract verification passed.'
