# Supabase and Frontend Integration Design

## Goal

Connect the current static `Bench` HTML screens to Supabase without changing the
established visual design. The completed system must authenticate users, store
every in-scope user input, restore draft and completed data from the database,
run the four approved OpenAI workflows with `gpt-5.4-mini`, and render database
and LLM results into the existing result areas.

Notification-time editing and app-lock configuration are explicitly excluded.
The settings screen's record-deletion interaction remains non-destructive by
product decision.

## Current-State Findings

- No file under `Bench` initializes a Supabase client or calls an Edge Function.
- Normal authenticated users currently have no direct table read or write path;
  table SELECT policies allow only application administrators.
- Privileged workflow RPCs are granted only to `service_role`.
- Daily EMA and EMI values are currently passed through `localStorage`,
  `sessionStorage`, and URL query parameters.
- `profile.html` collects gender, but `public.profiles` has no matching column.
- Result pages display fixed character, question, record, and AI-comment text.

These constraints make a server API necessary. RLS will remain strict rather
than being relaxed to make the static pages write directly to tables.

## Architecture

### Browser layer

Add shared browser modules under `Bench/js/`:

```text
Bench/js/
  supabase-config.js
  supabase-client.js
  app-api.js
  flow-state.js
  page-status.js
  pages/
    account.js
    login.js
    profile.js
    agreement.js
    baseline-assessment.js
    safety-contact.js
    emotion-selection.js
    checkin.js
    mood-character.js
    mood-type.js
    hardness-check.js
    journal.js
    ai-comment.js
    records.js
    feedback.js
```

The static pages load only their corresponding module. Existing HTML structure,
CSS, dimensions, colors, spacing, images, and navigation remain intact. Changes
to HTML are limited to stable element IDs or data attributes, removal of inline
navigation that would race an asynchronous save, module script tags, and dynamic
text/image targets.

`supabase-config.js` contains only the project URL and browser-safe publishable
key. It never contains an OpenAI key, Supabase secret key, service-role key, or
user credential.

### Server layer

Retain the approved four LLM Edge Functions:

- `ema-interpret`
- `ema-reflection-question`
- `emi-generate-questions`
- `emi-comment`

Add one authenticated `app-api` Edge Function. Its entry point is a small action
router; domain handlers live in `_shared/app/` so registration, consent,
baseline, safety, EMA drafts, reflection responses, records, and feedback remain
independent and testable.

Every Edge Function authenticates the bearer token, derives `user_id` from the
verified session, and ignores any client-supplied user ID. Privileged database
access uses Supabase server credentials only after authentication and ownership
checks.

### Database changes

Add `profiles.gender_code` with the accepted values `male`, `female`, and
`private`. A completed profile requires a gender value. Update
`complete_registration` to accept and save this field.

All other screen fields already have database destinations. Existing RLS stays
strict; normal-user table access is not broadened. The application API performs
user-scoped reads and server-only writes.

The migration and the full-install SQL file must stay equivalent so a new
project and the current hosted project produce the same schema.

## Authentication Flow

### Sign-up

`account.html` calls Supabase Auth `signUp` with email and password and passes
the nickname as user metadata. The Auth trigger creates the draft profile. The
page prevents duplicate submission and uses its existing inline error area for
validation, Auth errors, and email-confirmation instructions.

If the project requires email confirmation and no session is returned, the page
does not continue to `profile.html`; it tells the user to confirm and then log
in. The implementation does not silently disable email confirmation.

### Login and guards

`login.html` uses `signInWithPassword`. Pages that require a user session redirect
to the existing login page when no valid session exists. A completed user who
opens onboarding is routed to the existing home page; a draft user resumes the
first incomplete onboarding stage returned by `app-api`.

## Application API Actions

The request body uses `{ "action": "domain.operation", "payload": {...} }`.
Responses use `{ "data": ..., "request_id": ... }` or the shared error envelope.

### Onboarding

- `registration.complete`: nickname, gender, birth date, education code, region
- `onboarding.status`: completed stages and next route
- `consent.accept`: active versions for all four required consent types
- `baseline.submit`: mood, burden, and connection scores
- `safety-plan.save`: warning signs, calming methods, and one contact string

Consent, baseline, and safety actions create or resume the appropriate draft
flow, persist the screen values, and mark the flow completed only after all
required rows have been saved. Repeated identical requests return the existing
completed result.

The safety-plan skip button performs no write and continues to the existing
alert page. Alert settings are not saved in this task.

### EMA draft and submission

- `ema.start`: category key and one to three ordered emotion-detail IDs
- `ema.get`: current draft or completed flow state
- `ema.save-answers`: nullable 31-value answer array for a draft flow
- `ema.submit`: validate all answers, compute scale scores, call `submit_ema`, and
  return the database classification
- `ema.result`: classification, character metadata, and stored EMA AI result

`ema.start` creates the activity flow and draft `ema_sessions` row as soon as the
subcategory page advances. Only the returned `flow_id` is kept between pages.

`checkin.html` restores existing draft answers from `ema.get`. Each response
change queues a serialized draft save; navigation and final submission wait for
the pending save. The server validates each score against the active instrument
option set. Final scale scores are derived from database instrument metadata,
not trusted client totals.

### Reflection and EMI support

- `reflection.get`: generated question and source EMA result
- `reflection.save-response`: persist the free-text response before navigation
- `emi.get`: generated questions, selected numbers, combined response, and state

`mood-type.html` saves the reflection response before moving to
`hardness-check.html`. Therefore `emi-generate-questions` receives only the
reflection flow ID and Gestalt IDs; sensitive reflection text is not copied
through browser storage.

### Records and feedback

- `records.list`: user-owned EMA, EMI, or baseline records filtered by calendar
  month and year
- `feedback.save`: Monday week start, satisfaction 1-5, and opinion text
- `profile.get`: nickname and completed profile fields for existing displays

Record responses contain only the fields used by the current screens. The
service client always filters by the authenticated user before returning data.

## Screen-to-Database Mapping

| Screen | Input or output | Database or server destination |
|---|---|---|
| `onboarding/account.html` | email, password, nickname | Supabase Auth + draft `profiles` |
| `onboarding/login.html` | email, password | Supabase Auth session |
| `onboarding/profile.html` | gender, birth date, region, education | `profiles` |
| `onboarding/agreement.html` | four acceptances | `consent_sessions` |
| `onboarding/baseline_assessment.html` | three 1-5 scores | `baseline_assessments` |
| `onboarding/safety_contact.html` | signs, calming methods, contact | `safety_plans` |
| emotion category/subcategory pages | category and ordered details | `ema_sessions`, `ema_session_emotions` |
| `daily/checkin.html` | q001-q031 | `ema_sessions`, `ema_scale_scores`, `ema_classifications` |
| `daily/mood-character.html` | character and EMA analysis output | `classification_types`, `ema_ai_results` |
| `daily/mood-type.html` | generated question and user response | `ema_reflection_sessions` |
| `daily/hardness-check.html` | one Gestalt selection | `emi_sessions.gestalt_type_ids` |
| `daily/journal.html` | generated questions, selection, response | `emi_sessions` |
| `daily/ai-comment.html` | final comment output | `emi_ai_results` |
| record pages | month-filtered stored results | user-scoped server read |
| `etc/feedback.html` | satisfaction and opinion | `weekly_feedback` |

`alert.html`, app-lock controls, and destructive record deletion have no database
write in this scope.

## Daily Flow

```text
emotion category and details
  -> app-api ema.start
  -> checkin draft saves and ema.submit
  -> ema-interpret
  -> ema-reflection-question
  -> mood-character renders classification and analysis
  -> mood-type renders question and app-api saves response
  -> hardness-check calls emi-generate-questions
  -> journal renders five questions and calls emi-comment
  -> ai-comment renders stored final result
```

Only flow IDs are retained for cross-page state. EMA answers, reflection text,
selected question text, combined responses, and LLM output are removed from URL
parameters and application-managed local storage. Supabase Auth may use its
standard browser session persistence.

## Rendering Without Design Changes

Existing fixed content becomes a loading placeholder until the server returns.
The implementation changes text, image `src`/`alt`, disabled state, and existing
visibility only. It does not add cards, alter layout dimensions, change colors,
or rewrite typography.

- `mood-character.html` uses DB character name/image and existing paragraph
  areas for the stored analysis.
- `mood-type.html` uses the existing question text element for the generated
  reflection question.
- `journal.html` replaces the five fixed labels with the stored generated
  questions.
- `ai-comment.html` replaces the fixed comment with `emi_ai_results.ai_comment`.
- Record pages replace example values with month-filtered user records and make
  record text non-editable.

## Error Handling and Recovery

All save buttons enter a pending disabled state and navigate only after a
successful response. Existing text areas or message elements display concise
errors; where no dedicated message exists, a non-layout-changing status string
uses an existing descriptive text target.

Expected handling:

- `401`: clear invalid session and route to login
- `403`: show access error without leaking whether another user's flow exists
- `400`: preserve inputs and show validation guidance
- `409`: fetch current flow state and resume when idempotent
- `429`: keep the page and allow retry after a short delay
- `500/502`: preserve flow ID, show retry state, and never mark the flow complete

LLM functions and server writes are idempotent. Reloading a result page fetches
the stored result rather than generating a second immutable row.

## Supabase Project Configuration

For project `wmeknyvxkvhsuuvswdnb`:

1. Authenticate the Supabase CLI and link the repository.
2. Verify the remote schema before applying the gender migration.
3. Register `OPENAI_API_KEY` as an Edge Function secret without printing or
   committing its value.
4. Deploy `app-api` and the four LLM functions.
5. Obtain the browser-safe project publishable key for frontend configuration.
6. Verify the Auth site URL and redirect allowlist for the deployed application.

Dashboard email/password credentials are not written to files or shell history.
If the CLI cannot use an existing authenticated session, deployment requires an
interactive login or a separately generated Supabase personal access token.

## Verification

### Static and automated checks

- No OpenAI, service-role, dashboard, or user credential appears in tracked
  files.
- Schema verification covers gender, all four prompts, required RPCs, RLS, and
  the 31-question active instrument.
- Unit tests cover authentication, ownership, validation, prompt substitution,
  strict structured output, idempotency, and error mapping.
- Frontend tests cover payload extraction and dynamic rendering without snapshot
  changes to layout/style attributes.

### Hosted flow checks

- Sign up or sign in with a non-admin test user.
- Complete profile, consent, baseline, and optional safety plan.
- Reload a partially answered EMA and confirm draft restoration.
- Complete the four LLM stages and confirm one stored result per flow.
- Complete EMI with one selected question and confirm second selection `0`.
- Submit and update the same week's feedback.
- Open EMA, EMI, and baseline records for the selected month.
- Confirm another user's flow ID returns `403` and no data.
- Confirm alert and app-lock interactions perform no writes.

## Out of Scope

- Visual redesign or new UI components
- Notification time persistence
- App-lock persistence
- Actual record deletion
- Changing the approved EMA 31-item content or scoring
- Adding historical or baseline context to LLM prompts
