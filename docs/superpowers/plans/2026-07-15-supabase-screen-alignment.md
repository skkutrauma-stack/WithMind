# Supabase Screen Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a new-project Supabase SQL installer, usage guide, and screen-change list aligned with the approved WithMind flow.

**Architecture:** Preserve the versioned 31-item EMA and six-type classification pipeline. Normalize multi-selected emotion details into a child table, minimally revise Baseline/settings/safety-plan contracts, add weekly feedback, and expose a dedicated EMI draft-save function.

**Tech Stack:** PostgreSQL, Supabase Auth/RLS/Storage, PL/pgSQL, Markdown, PowerShell static verification

---

### Task 1: Contract verification

**Files:**
- Create: `scripts/verify_supabase_schema.ps1`

- [x] Write checks for every approved schema contract and required documentation artifact.
- [x] Run `powershell -ExecutionPolicy Bypass -File scripts/verify_supabase_schema.ps1` before adding the SQL and confirm failure reports the missing installer.

### Task 2: Full SQL installer

**Files:**
- Create: `supabase/supabase_app_schema_final.sql`

- [x] Copy the supplied new-project installer as the baseline.
- [x] Replace the single emotion-detail foreign key with `ema_session_emotions` and 1-to-3 validation.
- [x] Update EMA submission, LLM context, and export for the emotion array.
- [x] Replace Baseline fields with three 1-to-5 scores.
- [x] Allow configured notification times and replace contact JSON with a single string.
- [x] Add `weekly_feedback` and `save_emi_response()` with RLS and function grants.

### Task 3: Documentation

**Files:**
- Create: `supabase/supabase_database_design_final.md`
- Create: `docs/SCREEN_CHANGE_LIST.md`

- [x] Rewrite the usage guide around the revised tables and server-side call order.
- [x] List every screen change without editing HTML.

### Task 4: Verification

**Files:**
- Verify: `supabase/supabase_app_schema_final.sql`
- Verify: `supabase/supabase_database_design_final.md`
- Verify: `docs/SCREEN_CHANGE_LIST.md`

- [x] Run the PowerShell contract verifier and require exit code 0.
- [x] Search for removed single-detail, fixed-time, old Baseline, and JSON-contact contracts and require no hits.
- [x] Inspect `git diff --check`, `git diff --stat`, and `git status --short`.
