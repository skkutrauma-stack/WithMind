# Supabase OpenAI Edge Functions Design

## Goal and Scope

Configure the Supabase project `wmeknyvxkvhsuuvswdnb` to call OpenAI with
`gpt-5.4-mini` for the four LLM operations already represented in the database.
The work includes registering the OpenAI key as an Edge Function secret,
implementing and deploying the four server functions, and verifying their
authentication and database contracts.

This scope does not modify any HTML, CSS, page navigation, or visual design.
Frontend invocation and rendering will be a separate task.

## Existing Database Contract

The implementation reuses the active rows in `public.llm_prompt_templates`:

1. `ema_interpretation`
2. `ema_reflection_question`
3. `emi_question_generation`
4. `emi_response_comment`

It also reuses the existing context builders and write RPCs. The Edge Functions
must not reconstruct EMA classification, read prior flows, or mix baseline data
into prompts.

## Architecture

Create four thin Edge Functions and a shared server-only module set:

```text
supabase/functions/
  _shared/
    auth.ts
    cors.ts
    errors.ts
    openai.ts
    prompts.ts
    supabase.ts
    types.ts
  ema-interpret/index.ts
  ema-reflection-question/index.ts
  emi-generate-questions/index.ts
  emi-comment/index.ts
```

Each public function performs only orchestration. Shared modules own user
authentication, the service-role Supabase client, active prompt loading,
template interpolation, OpenAI Responses API calls, structured-output parsing,
error normalization, and CORS headers.

The OpenAI model is fixed in server code as `gpt-5.4-mini`. The OpenAI key is
available only as `Deno.env.get("OPENAI_API_KEY")` and is never returned, logged,
or included in frontend files. Supabase-provided server credentials are read
only inside Edge Functions.

## Function Contracts and Data Flow

### `ema-interpret`

Input:

```json
{ "flow_id": "uuid" }
```

The function authenticates the caller, loads `get_ema_llm_context(flow_id)`,
verifies that `context.user_id` equals the authenticated user, loads the active
`ema_interpretation` prompt, substitutes the current-flow values, calls OpenAI,
and saves the validated result with `save_ema_ai_result`.

The EMA flow must already be in `processing` state. A successful response
contains the flow ID, prompt template ID, three characteristics, and AI comment.

### `ema-reflection-question`

Input:

```json
{ "source_ema_flow_id": "uuid" }
```

The function verifies ownership of the completed EMA result, creates or resumes
the reflection flow with `start_ema_reflection_flow`, loads
`get_ema_reflection_llm_context`, uses the active `ema_reflection_question`
prompt, generates exactly one question, and saves it with
`save_ema_reflection_question`.

The response contains the new reflection flow ID and generated question so a
future frontend task can render it without changing this server contract.

### `emi-generate-questions`

Input:

```json
{
  "source_reflection_flow_id": "uuid",
  "reflection_response": "non-empty string",
  "gestalt_type_ids": [1]
}
```

The function verifies reflection-flow ownership, stores the user's response with
`save_ema_reflection_response`, completes the reflection with
`submit_ema_reflection`, creates or resumes the EMI flow with `start_emi_flow`,
and loads `get_emi_llm_context`. It then uses the active
`emi_question_generation` prompt to generate exactly five questions and saves
them with `save_emi_questions`.

The response contains the EMI flow ID and the five generated questions.

### `emi-comment`

Input:

```json
{
  "flow_id": "uuid",
  "selected_question_1_no": 1,
  "selected_question_2_no": 0,
  "combined_response": "non-empty string"
}
```

The function verifies EMI-flow ownership, saves the one- or two-question
selection and combined response with `save_emi_response`, and changes the flow
to `processing` with `submit_emi`. It then loads `get_emi_llm_context`, uses the
active `emi_response_comment` prompt, generates one comment, and saves it with
`save_emi_ai_result`.

The response contains the EMI flow ID and final AI comment. A missing second
question is represented by `0`, matching the current database contract.

## Prompt and Structured Output Handling

For every operation, the server loads the newest active prompt row for the
required `prompt_type`, ordered by `version_no` descending. It verifies that all
names in `template_variables` have replacement values, replaces every
`{{variable_name}}` token, and rejects unresolved placeholders.

The OpenAI Responses API request uses the database `output_schema` as a strict
JSON Schema structured-output format. Before sending it, the server creates an
in-memory copy that adds `additionalProperties: false` to every object schema,
as required by OpenAI strict structured outputs. This compatibility conversion
does not update the stored prompt row. The server parses the model output as
JSON, validates the operation-specific required properties and cardinality, and
only then calls the database save RPC. User-generated strings are trimmed and
must be non-empty.

## Authentication and Authorization

Every request must include the signed-in user's Supabase bearer token. The
function resolves the user from that token and rejects missing or invalid tokens
with `401`.

The functions accept only `POST` and preflight `OPTIONS` requests. CORS allows
the authorization and content-type headers needed by a browser client; bearer
authentication and flow ownership checks remain mandatory regardless of
request origin.

Database write RPCs are granted to the service role, so the Edge Function uses a
server-only Supabase client after authentication. Before every privileged RPC,
the function compares the authenticated user ID with the context or session
owner. Ownership mismatch returns `403`. The frontend never receives a secret
or service-role key.

## Idempotency and Concurrency

Client retries must not create a second immutable AI result or a second child
flow.

- If the requested AI result already exists, return the stored result.
- If a reflection or EMI child flow exists in a resumable state, reuse it.
- If a concurrent request wins the final insert, re-read and return the stored
  result rather than reporting false failure.
- Reject state transitions that cannot be safely resumed.

This preserves the database's immutable-result and one-child-flow constraints
while allowing safe retries after a network timeout.

## Error Handling and Logging

Responses use a stable JSON envelope with `error.code`, `error.message`, and a
request ID. Expected status classes are:

- `400`: invalid JSON, values, or flow state
- `401`: missing or invalid user token
- `403`: authenticated user does not own the flow
- `404`: requested flow or required database record is absent
- `409`: non-resumable duplicate or state conflict
- `500`: missing server configuration or unexpected database failure
- `502`: OpenAI failure, refusal, timeout, or invalid structured output

Logs may include request ID, operation, flow ID, HTTP status, and normalized
error class. They must not include API keys, authorization headers, full prompts,
EMA answers, reflection text, combined responses, or full model output.

OpenAI calls use a bounded timeout. A single retry is permitted only for
transient rate-limit and server errors before any result is saved.

## Secret and Deployment

Register `OPENAI_API_KEY` in Supabase Edge Function Secrets for project
`wmeknyvxkvhsuuvswdnb`. The secret value is never written to the repository or
placed in a shell command that would expose it in logs.

The local repository must be initialized and linked to the project before
deployment. Supabase CLI deployment requires an authenticated CLI session or a
Supabase personal access token; the dashboard email/password is not stored in
the repository and is not used as a CLI token.

Deployment must first verify that the four prompt rows and required RPCs are
present in the remote project. If the live schema is missing them, deployment
verification stops and reports the missing database prerequisite instead of
silently deploying a function that cannot run.

## Verification

Before deployment:

- Static checks confirm no secret or credential is present in tracked files.
- Unit tests cover template replacement, unresolved variables, structured-output
  extraction, question cardinality, request validation, and error mapping.
- Type checking covers all shared modules and function entry points.

After deployment:

- Confirm the `OPENAI_API_KEY` secret name exists without printing its value.
- Confirm all four function names appear in the project function list.
- Confirm an unauthenticated call returns `401` and never calls OpenAI.
- With an authenticated test user and prepared flows, exercise the four stages
  and verify the expected prompt template IDs, flow states, and saved result
  rows.
- Confirm retries return the existing result and do not create duplicate rows.

## Out of Scope

- Any change to files under `Bench/`
- Supabase client initialization in HTML
- Page loading, retry, or result-rendering UI
- New prompt content or changes to the four database schemas
- Historical-flow, baseline, or cross-user context in any prompt
