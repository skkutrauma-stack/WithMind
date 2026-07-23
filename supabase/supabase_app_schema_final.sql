-- ============================================================
-- Supabase/PostgreSQL schema for EMA -> reflection -> EMI counseling application
-- Final initial-deployment version for Supabase SQL Editor
-- ============================================================
-- IMPORTANT
-- 1) Run this script in a new Supabase project.
-- 2) Do not place the service_role key in a client application.
-- 3) The actual Supabase Auth admin user is created separately.
-- 4) Consent document bodies and Storage image files are placeholders.
-- ============================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;


-- ------------------------------------------------------------
-- Shared utility functions
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.block_update_or_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% rows are immutable after creation', tg_table_name;
end;
$$;

create or replace function public.valid_gestalt_ids(p_ids smallint[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_ids is not null
    and cardinality(p_ids) between 1 and 6
    and not exists (
      select 1 from unnest(p_ids) as x(id)
      where id < 1 or id > 6
    )
    and cardinality(p_ids) = (
      select count(distinct id) from unnest(p_ids) as x(id)
    );
$$;


-- ------------------------------------------------------------
-- User profile and authorization
-- ------------------------------------------------------------

create table if not exists public.education_levels (
  education_code smallint primary key,
  education_name text not null unique,
  classification_group smallint not null check (classification_group in (1, 2))
);

insert into public.education_levels (education_code, education_name, classification_group)
values
  (1, '초등학교', 1),
  (2, '중학교', 1),
  (3, '고등학교', 1),
  (4, '대학교', 2),
  (5, '대학원 이상', 2)
on conflict (education_code) do update
set education_name = excluded.education_name,
    classification_group = excluded.classification_group;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  user_no bigint generated always as identity unique,
  email citext not null unique,
  gender_code text check (gender_code in ('male', 'female', 'private')),
  nickname citext unique,
  birth_date date,
  education_code smallint references public.education_levels(education_code),
  region_name text,
  registration_status text not null default 'draft'
    check (registration_status in ('draft', 'completed')),
  registration_completed_at timestamptz,
  account_status text not null default 'active'
    check (account_status in ('active', 'withdrawn', 'suspended')),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_registration_complete_ck check (
    registration_status = 'draft'
    or (
      gender_code is not null
      and nickname is not null
      and birth_date is not null
      and education_code is not null
      and region_name is not null
      and registration_completed_at is not null
    )
  ),
  constraint profiles_withdrawal_ck check (
    (account_status <> 'withdrawn' and withdrawn_at is null)
    or (account_status = 'withdrawn' and withdrawn_at is not null)
  )
);

create unique index if not exists profiles_nickname_lower_uidx
  on public.profiles (lower(nickname::text))
  where nickname is not null;

create table if not exists public.app_user_roles (
  user_id uuid primary key references public.profiles(user_id) on delete restrict,
  app_role text not null default 'user'
    check (app_role in ('user', 'admin')),
  login_alias citext unique,
  created_at timestamptz not null default now(),
  constraint app_user_roles_alias_ck check (
    app_role = 'admin' or login_alias is null
  )
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id,
    email,
    gender_code,
    nickname,
    birth_date,
    education_code,
    region_name,
    registration_status,
    registration_completed_at
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'gender_code', ''),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
    nullif(new.raw_user_meta_data ->> 'education_code', '')::smallint,
    nullif(new.raw_user_meta_data ->> 'region_name', ''),
    case
      when nullif(new.raw_user_meta_data ->> 'nickname', '') is not null
       and nullif(new.raw_user_meta_data ->> 'birth_date', '') is not null
       and nullif(new.raw_user_meta_data ->> 'education_code', '') is not null
       and nullif(new.raw_user_meta_data ->> 'gender_code', '') is not null
       and nullif(new.raw_user_meta_data ->> 'region_name', '') is not null
      then 'completed'
      else 'draft'
    end,
    case
      when nullif(new.raw_user_meta_data ->> 'nickname', '') is not null
       and nullif(new.raw_user_meta_data ->> 'birth_date', '') is not null
       and nullif(new.raw_user_meta_data ->> 'education_code', '') is not null
       and nullif(new.raw_user_meta_data ->> 'gender_code', '') is not null
       and nullif(new.raw_user_meta_data ->> 'region_name', '') is not null
      then now()
      else null
    end
  )
  on conflict (user_id) do nothing;

  insert into public.app_user_roles (user_id, app_role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = new.email,
           updated_at = now()
     where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sync_auth_user_email();

drop function if exists public.complete_registration(uuid, text, date, smallint, text);
drop function if exists public.complete_registration(uuid, text, date, smallint, text, text);

create or replace function public.complete_registration(
  p_user_id uuid,
  p_nickname text,
  p_birth_date date,
  p_education_code smallint,
  p_region_name text,
  p_gender_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(p_nickname), '') is null then
    raise exception 'nickname is required';
  end if;

  if nullif(btrim(p_region_name), '') is null then
    raise exception 'region_name is required';
  end if;

  if nullif(btrim(p_gender_code), '') is null then
    raise exception 'gender_code is required';
  end if;

  if p_gender_code not in ('male', 'female', 'private') then
    raise exception 'gender_code is invalid';
  end if;

  update public.profiles
     set nickname = p_nickname,
         birth_date = p_birth_date,
         education_code = p_education_code,
         region_name = btrim(p_region_name),
         gender_code = p_gender_code,
         registration_status = 'completed',
         registration_completed_at = coalesce(registration_completed_at, now()),
         updated_at = now()
   where user_id = p_user_id;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

create or replace function public.is_app_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_user_roles r
    where r.user_id = p_user_id
      and r.app_role = 'admin'
  );
$$;

create or replace function public.grant_app_admin_by_email(
  p_email text,
  p_login_alias text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  select id
    into v_user_id
    from auth.users
   where lower(email) = lower(p_email)
   limit 1;

  if v_user_id is null then
    raise exception 'No Supabase Auth user exists for %', p_email;
  end if;

  insert into public.app_user_roles (user_id, app_role, login_alias)
  values (v_user_id, 'admin', p_login_alias)
  on conflict (user_id) do update
  set app_role = 'admin',
      login_alias = excluded.login_alias;

  return v_user_id;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- Common flow registry
-- One row represents one execution of one application part.
-- ------------------------------------------------------------

create table if not exists public.activity_flows (
  flow_id uuid primary key default gen_random_uuid(),
  flow_no bigint generated always as identity unique,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  part_type text not null check (
    part_type in (
      'consent',
      'baseline',
      'safety_plan',
      'notification_settings',
      'app_lock_settings',
      'ema',
      'ema_reflection',
      'emi'
    )
  ),
  parent_flow_id uuid references public.activity_flows(flow_id) on delete restrict,
  status text not null default 'draft' check (
    status in (
      'draft',
      'questions_ready',
      'submitted',
      'processing',
      'completed',
      'failed'
    )
  ),
  started_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  unique (flow_id, user_id)
);

create index if not exists activity_flows_user_started_idx
  on public.activity_flows (user_id, started_at desc);

create index if not exists activity_flows_user_part_idx
  on public.activity_flows (user_id, part_type, status);

create or replace function public.guard_flow_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.flow_id is distinct from new.flow_id
     or old.user_id is distinct from new.user_id
     or old.part_type is distinct from new.part_type then
    raise exception 'flow identity fields cannot be changed';
  end if;

  if old.status is distinct from new.status then
    if old.status = 'completed' then
      raise exception 'completed flow cannot be changed';
    elsif old.status = 'failed' then
      raise exception 'failed flow cannot be changed; create a new flow';
    elsif old.status = 'draft'
      and new.status not in ('questions_ready', 'submitted', 'processing', 'completed', 'failed') then
      raise exception 'invalid flow transition: % -> %', old.status, new.status;
    elsif old.status = 'questions_ready'
      and new.status not in ('submitted', 'processing', 'completed', 'failed') then
      raise exception 'invalid flow transition: % -> %', old.status, new.status;
    elsif old.status = 'submitted'
      and new.status not in ('processing', 'completed', 'failed') then
      raise exception 'invalid flow transition: % -> %', old.status, new.status;
    elsif old.status = 'processing'
      and new.status not in ('completed', 'failed') then
      raise exception 'invalid flow transition: % -> %', old.status, new.status;
    end if;
  end if;

  new.last_saved_at := now();

  if new.status in ('submitted', 'processing', 'completed')
     and new.submitted_at is null then
    new.submitted_at := now();
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists activity_flows_guard_transition on public.activity_flows;
create trigger activity_flows_guard_transition
before update on public.activity_flows
for each row execute function public.guard_flow_transition();

drop trigger if exists activity_flows_block_delete on public.activity_flows;
create trigger activity_flows_block_delete
before delete on public.activity_flows
for each row execute function public.block_update_or_delete();

create or replace function public.start_activity_flow(
  p_user_id uuid,
  p_part_type text,
  p_parent_flow_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = p_user_id
      and registration_status = 'completed'
      and account_status = 'active'
  ) then
    raise exception 'active completed user profile is required';
  end if;

  insert into public.activity_flows (user_id, part_type, parent_flow_id)
  values (p_user_id, p_part_type, p_parent_flow_id)
  returning flow_id into v_flow_id;

  return v_flow_id;
end;
$$;

create or replace function public.guard_draft_flow_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception '% rows cannot be deleted', tg_table_name;
  end if;

  if old.flow_id is distinct from new.flow_id
     or old.user_id is distinct from new.user_id then
    raise exception 'flow_id and user_id cannot be changed';
  end if;

  select status into v_status
  from public.activity_flows
  where flow_id = old.flow_id
    and user_id = old.user_id;

  if v_status <> 'draft' then
    raise exception '% can be edited only while the flow is draft', tg_table_name;
  end if;

  return new;
end;
$$;

create or replace function public.guard_emi_editable_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception '% rows cannot be deleted', tg_table_name;
  end if;

  if old.flow_id is distinct from new.flow_id
     or old.user_id is distinct from new.user_id
     or old.source_ema_flow_id is distinct from new.source_ema_flow_id
     or old.source_reflection_flow_id is distinct from new.source_reflection_flow_id then
    raise exception 'EMI identity and source flow fields cannot be changed';
  end if;

  select status into v_status
  from public.activity_flows
  where flow_id = old.flow_id
    and user_id = old.user_id;

  if v_status not in ('draft', 'questions_ready') then
    raise exception '% is no longer editable', tg_table_name;
  end if;

  if old.question_1 is not null and (
       new.question_1 is distinct from old.question_1
    or new.question_2 is distinct from old.question_2
    or new.question_3 is distinct from old.question_3
    or new.question_4 is distinct from old.question_4
    or new.question_5 is distinct from old.question_5
    or new.question_prompt_template_id is distinct from old.question_prompt_template_id
    or new.questions_generated_at is distinct from old.questions_generated_at
    or new.gestalt_type_ids is distinct from old.gestalt_type_ids
  ) then
    raise exception 'generated EMI questions and their source settings cannot be changed';
  end if;

  return new;
end;
$$;


create or replace function public.guard_reflection_editable_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception '% rows cannot be deleted', tg_table_name;
  end if;

  if old.flow_id is distinct from new.flow_id
     or old.user_id is distinct from new.user_id
     or old.source_ema_flow_id is distinct from new.source_ema_flow_id then
    raise exception 'reflection identity fields cannot be changed';
  end if;

  select status into v_status
  from public.activity_flows
  where flow_id = old.flow_id
    and user_id = old.user_id;

  if v_status not in ('draft', 'questions_ready') then
    raise exception '% is no longer editable', tg_table_name;
  end if;

  if old.reflection_question is not null and (
       new.reflection_question is distinct from old.reflection_question
    or new.prompt_template_id is distinct from old.prompt_template_id
    or new.question_generated_at is distinct from old.question_generated_at
  ) then
    raise exception 'generated EMA reflection question cannot be regenerated or changed';
  end if;

  if old.submitted_at is not null then
    raise exception 'submitted EMA reflection cannot be changed';
  end if;

  return new;
end;
$$;


-- ------------------------------------------------------------
-- Consent versioning and consent sessions
-- ------------------------------------------------------------

create table if not exists public.consent_document_versions (
  consent_version_id bigint generated by default as identity primary key,
  consent_type text not null check (
    consent_type in (
      'terms_of_service',
      'privacy_collection',
      'sensitive_information',
      'research_data_use'
    )
  ),
  version_label text not null,
  title text not null,
  document_body text not null,
  document_url text,
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (consent_type, version_label)
);

insert into public.consent_document_versions (
  consent_version_id, consent_type, version_label, title, document_body, active
)
values
  (1, 'terms_of_service', '1.0', '서비스 이용약관', '[운영 전 실제 약관 본문으로 교체]', true),
  (2, 'privacy_collection', '1.0', '개인정보 수집 및 이용 동의', '[운영 전 실제 동의 본문으로 교체]', true),
  (3, 'sensitive_information', '1.0', '민감정보 처리 동의', '[운영 전 실제 동의 본문으로 교체]', true),
  (4, 'research_data_use', '1.0', '연구 목적 데이터 활용 동의', '[운영 전 실제 동의 본문으로 교체]', true)
on conflict (consent_version_id) do update
set version_label = excluded.version_label,
    title = excluded.title,
    document_body = excluded.document_body,
    active = excluded.active;

select setval(
  pg_get_serial_sequence('public.consent_document_versions', 'consent_version_id'),
  greatest((select coalesce(max(consent_version_id), 1) from public.consent_document_versions), 1),
  true
);

create table if not exists public.consent_sessions (
  flow_id uuid primary key,
  user_id uuid not null,
  consent_action text not null check (
    consent_action in ('acceptance', 'renewal', 'research_withdrawal')
  ),
  terms_version_id bigint not null references public.consent_document_versions(consent_version_id),
  privacy_version_id bigint not null references public.consent_document_versions(consent_version_id),
  sensitive_version_id bigint not null references public.consent_document_versions(consent_version_id),
  research_version_id bigint not null references public.consent_document_versions(consent_version_id),
  terms_accepted boolean not null,
  privacy_accepted boolean not null,
  sensitive_accepted boolean not null,
  research_accepted boolean not null,
  research_withdrawn_at timestamptz,
  data_use_after_withdrawal boolean not null default true
    check (data_use_after_withdrawal = true),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict,
  constraint consent_sessions_action_ck check (
    (
      consent_action in ('acceptance', 'renewal')
      and terms_accepted
      and privacy_accepted
      and sensitive_accepted
      and research_accepted
      and research_withdrawn_at is null
    )
    or
    (
      consent_action = 'research_withdrawal'
      and terms_accepted
      and privacy_accepted
      and sensitive_accepted
      and not research_accepted
      and research_withdrawn_at is not null
    )
  )
);

drop trigger if exists consent_sessions_guard on public.consent_sessions;
create trigger consent_sessions_guard
before update or delete on public.consent_sessions
for each row execute function public.guard_draft_flow_row();


-- ------------------------------------------------------------
-- Baseline, Safety Plan, notifications, devices, and app lock
-- ------------------------------------------------------------

create table if not exists public.baseline_assessments (
  flow_id uuid primary key,
  user_id uuid not null,
  mood_score smallint not null check (mood_score between 1 and 5),
  burden_score smallint not null check (burden_score between 1 and 5),
  connection_score smallint not null check (connection_score between 1 and 5),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict
);

drop trigger if exists baseline_assessments_guard on public.baseline_assessments;
create trigger baseline_assessments_guard
before update or delete on public.baseline_assessments
for each row execute function public.guard_draft_flow_row();

create or replace function public.submit_baseline(p_flow_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
begin
  select user_id, status
    into v_user_id, v_status
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'baseline'
   for update;

  if v_user_id is null then
    raise exception 'baseline flow not found';
  end if;

  if v_status <> 'draft' then
    raise exception 'baseline flow is not draft';
  end if;

  if not exists (
    select 1 from public.baseline_assessments
    where flow_id = p_flow_id
      and user_id = v_user_id
  ) then
    raise exception 'baseline response row is missing';
  end if;

  if exists (
    select 1
    from public.baseline_assessments b
    join public.activity_flows f on f.flow_id = b.flow_id
    where b.user_id = v_user_id
      and b.flow_id <> p_flow_id
      and f.status = 'completed'
      and f.completed_at > now() - interval '30 days'
  ) then
    raise exception 'baseline can be submitted only 30 days after the previous completed baseline';
  end if;

  update public.baseline_assessments
     set submitted_at = now()
   where flow_id = p_flow_id;

  update public.activity_flows
     set status = 'completed'
   where flow_id = p_flow_id;
end;
$$;

create table if not exists public.safety_plans (
  user_id uuid primary key references public.profiles(user_id) on delete restrict,
  flow_id uuid not null unique,
  warning_signs text not null,
  calming_methods text not null,
  contact_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict
);

drop trigger if exists safety_plans_set_updated_at on public.safety_plans;
create trigger safety_plans_set_updated_at
before update on public.safety_plans
for each row execute function public.set_updated_at();

create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(user_id) on delete restrict,
  flow_id uuid not null unique,
  lunch_enabled boolean not null default false,
  lunch_time time not null default time '12:00',
  evening_enabled boolean not null default false,
  evening_time time not null default time '21:00',
  timezone text not null default 'Asia/Seoul'
    check (timezone = 'Asia/Seoul'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict
);

drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at
before update on public.notification_settings
for each row execute function public.set_updated_at();

create table if not exists public.user_devices (
  device_record_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  device_id text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  push_token text,
  notification_permission text not null default 'unknown'
    check (notification_permission in ('unknown', 'granted', 'denied', 'provisional')),
  token_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create unique index if not exists user_devices_active_push_token_uidx
  on public.user_devices(push_token)
  where push_token is not null and token_active;

drop trigger if exists user_devices_set_updated_at on public.user_devices;
create trigger user_devices_set_updated_at
before update on public.user_devices
for each row execute function public.set_updated_at();

create table if not exists public.app_lock_settings (
  user_id uuid primary key references public.profiles(user_id) on delete restrict,
  flow_id uuid not null unique,
  lock_enabled boolean not null default false,
  lock_method text check (lock_method in ('pin', 'biometric')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict,
  constraint app_lock_settings_method_ck check (
    (not lock_enabled and lock_method is null)
    or (lock_enabled and lock_method is not null)
  )
);

drop trigger if exists app_lock_settings_set_updated_at on public.app_lock_settings;
create trigger app_lock_settings_set_updated_at
before update on public.app_lock_settings
for each row execute function public.set_updated_at();

create table if not exists public.weekly_feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  week_start date not null,
  satisfaction_score smallint not null check (satisfaction_score between 1 and 5),
  opinion_text text not null default '',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  constraint weekly_feedback_week_start_ck check (
    extract(isodow from week_start) = 1
  )
);

drop trigger if exists weekly_feedback_set_updated_at on public.weekly_feedback;
create trigger weekly_feedback_set_updated_at
before update on public.weekly_feedback
for each row execute function public.set_updated_at();

create or replace function public.save_weekly_feedback(
  p_user_id uuid,
  p_week_start date,
  p_satisfaction_score smallint,
  p_opinion_text text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feedback_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = p_user_id
      and registration_status = 'completed'
      and account_status = 'active'
  ) then
    raise exception 'active completed user profile is required';
  end if;

  if p_satisfaction_score not between 1 and 5 then
    raise exception 'satisfaction score must be between 1 and 5';
  end if;

  if extract(isodow from p_week_start) <> 1 then
    raise exception 'week_start must be a Monday';
  end if;

  insert into public.weekly_feedback (
    user_id, week_start, satisfaction_score, opinion_text
  )
  values (
    p_user_id, p_week_start, p_satisfaction_score, coalesce(p_opinion_text, '')
  )
  on conflict (user_id, week_start) do update
  set satisfaction_score = excluded.satisfaction_score,
      opinion_text = excluded.opinion_text,
      submitted_at = now()
  returning feedback_id into v_feedback_id;

  return v_feedback_id;
end;
$$;


-- ------------------------------------------------------------
-- Emotion master data
-- ------------------------------------------------------------

create table if not exists public.emotion_categories (
  emotion_category_id smallint primary key,
  category_key text not null unique,
  category_name text not null unique,
  display_order smallint not null unique
);

create table if not exists public.emotion_details (
  emotion_detail_id smallint primary key,
  emotion_category_id smallint not null references public.emotion_categories(emotion_category_id),
  detail_key text not null unique,
  detail_name text not null,
  display_order smallint not null,
  unique (emotion_category_id, emotion_detail_id),
  unique (emotion_category_id, detail_name)
);

insert into public.emotion_categories (
  emotion_category_id, category_key, category_name, display_order
)
values
  (1, 'anger', '분노', 1),
  (2, 'surprise', '놀람', 2),
  (3, 'joy', '기쁨', 3),
  (4, 'discomfort', '불편함', 4),
  (5, 'sadness', '슬픔', 5),
  (6, 'fear', '두려움', 6),
  (7, 'apathy', '무기력함', 7)
on conflict (emotion_category_id) do update
set category_key = excluded.category_key,
    category_name = excluded.category_name,
    display_order = excluded.display_order;

insert into public.emotion_details (
  emotion_detail_id, emotion_category_id, detail_key, detail_name, display_order
)
values
  (101, 1, 'frustrated', '답답하다', 1),
  (102, 1, 'dissatisfied', '불만스럽다', 2),
  (103, 1, 'irritated', '짜증나다', 3),
  (104, 1, 'nervous_angry', '신경질 나다', 4),
  (105, 1, 'angry', '화나다', 5),

  (201, 2, 'curious', '호기심 생기다', 1),
  (202, 2, 'amazed', '신기하다', 2),
  (203, 2, 'impressed', '감탄하다', 3),
  (204, 2, 'embarrassed', '당황하다', 4),
  (205, 2, 'shocked', '충격받다', 5),

  (301, 3, 'comfortable', '편안하다', 1),
  (302, 3, 'expectant', '기대된다', 2),
  (303, 3, 'delighted', '즐겁다', 3),
  (304, 3, 'proud', '뿌듯하다', 4),
  (305, 3, 'happy', '행복하다', 5),

  (401, 4, 'awkward', '어색하다', 1),
  (402, 4, 'unsettled', '찝찝하다', 2),
  (403, 4, 'wronged', '억울하다', 3),
  (404, 4, 'hateful', '밉다', 4),
  (405, 4, 'unpleasant', '불쾌하다', 5),

  (501, 5, 'hurt', '서운하다', 1),
  (502, 5, 'upset', '속상하다', 2),
  (503, 5, 'disappointed', '실망하다', 3),
  (504, 5, 'lonely', '외롭다', 4),
  (505, 5, 'depressed', '우울하다', 5),

  (601, 6, 'worried', '걱정스럽다', 1),
  (602, 6, 'anxious', '불안하다', 2),
  (603, 6, 'restless', '초조하다', 3),
  (604, 6, 'tense', '긴장되다', 4),
  (605, 6, 'afraid', '무섭다', 5),

  (701, 7, 'bored', '심심하다', 1),
  (702, 7, 'tedious', '지루하다', 2),
  (703, 7, 'tired', '피곤하다', 3),
  (704, 7, 'bothersome', '귀찮다', 4),
  (705, 7, 'unmotivated', '의욕이 없다', 5)
on conflict (emotion_detail_id) do update
set emotion_category_id = excluded.emotion_category_id,
    detail_key = excluded.detail_key,
    detail_name = excluded.detail_name,
    display_order = excluded.display_order;


-- ------------------------------------------------------------
-- EMA versioned master data
-- ------------------------------------------------------------

create table if not exists public.ema_response_option_sets (
  option_set_version_id bigint generated by default as identity primary key,
  option_set_key text not null,
  version_no integer not null check (version_no > 0),
  option_set_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (option_set_key, version_no)
);

create table if not exists public.ema_response_options (
  option_set_version_id bigint not null
    references public.ema_response_option_sets(option_set_version_id) on delete restrict,
  score_value smallint not null,
  option_label text not null,
  display_order smallint not null,
  primary key (option_set_version_id, score_value),
  unique (option_set_version_id, display_order)
);

create table if not exists public.ema_scale_versions (
  scale_version_id bigint generated by default as identity primary key,
  scale_key text not null,
  version_no integer not null check (version_no > 0),
  scale_name text not null,
  scoring_method text not null default 'sum'
    check (scoring_method in ('sum', 'mean', 'custom')),
  theoretical_min numeric(10,3) not null,
  theoretical_max numeric(10,3) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (scale_key, version_no)
);

create table if not exists public.ema_question_versions (
  question_version_id bigint generated by default as identity primary key,
  question_key text not null,
  version_no integer not null check (version_no > 0),
  scale_version_id bigint not null
    references public.ema_scale_versions(scale_version_id) on delete restrict,
  original_item_no integer,
  question_text text not null,
  time_anchor text not null default '지금 현재',
  option_set_version_id bigint not null
    references public.ema_response_option_sets(option_set_version_id) on delete restrict,
  min_score smallint not null,
  max_score smallint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (question_key, version_no),
  check (min_score <= max_score)
);

create table if not exists public.ema_instrument_versions (
  instrument_version_id bigint generated by default as identity primary key,
  instrument_key text not null,
  version_no integer not null check (version_no > 0),
  instrument_name text not null,
  time_anchor text not null default '지금 현재',
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (instrument_key, version_no)
);

create table if not exists public.ema_instrument_items (
  instrument_version_id bigint not null
    references public.ema_instrument_versions(instrument_version_id) on delete restrict,
  question_slot smallint not null check (question_slot between 1 and 100),
  question_version_id bigint not null
    references public.ema_question_versions(question_version_id) on delete restrict,
  display_order smallint not null,
  required boolean not null default true,
  primary key (instrument_version_id, question_slot),
  unique (instrument_version_id, question_version_id),
  unique (instrument_version_id, display_order)
);

create table if not exists public.ema_instrument_scale_slots (
  instrument_version_id bigint not null
    references public.ema_instrument_versions(instrument_version_id) on delete restrict,
  score_slot smallint not null check (score_slot between 1 and 20),
  scale_version_id bigint not null
    references public.ema_scale_versions(scale_version_id) on delete restrict,
  primary key (instrument_version_id, score_slot),
  unique (instrument_version_id, scale_version_id)
);

create table if not exists public.ema_scoring_versions (
  scoring_version_id bigint generated by default as identity primary key,
  instrument_version_id bigint not null
    references public.ema_instrument_versions(instrument_version_id) on delete restrict,
  version_no integer not null check (version_no > 0),
  scoring_name text not null,
  scoring_rule jsonb not null default '{"method":"sum_by_scale"}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (instrument_version_id, version_no)
);


insert into public.ema_response_option_sets (
  option_set_version_id, option_set_key, version_no, option_set_name, active
)
values
  (1, 'loneliness_0_3', 1, '외로움 0–3점', true),
  (2, 'family_stress_0_3', 1, '가정 스트레스 0–3점', true),
  (3, 'phq15_0_2', 1, 'PHQ-15 0–2점', true),
  (4, 'coping_0_3', 1, '대처 0–3점', true)
on conflict (option_set_version_id) do update
set option_set_key = excluded.option_set_key,
    version_no = excluded.version_no,
    option_set_name = excluded.option_set_name,
    active = excluded.active;

delete from public.ema_response_options
where option_set_version_id in (1, 2, 4);

insert into public.ema_response_options (
  option_set_version_id, score_value, option_label, display_order
)
values
  (1, 0, '전혀 아니다', 1),
  (1, 1, '드물지만 있다', 2),
  (1, 2, '가끔 있다', 3),
  (1, 3, '항상 그렇다', 4),

  (2, 0, '만족', 1),
  (2, 1, '대체로 만족', 2),
  (2, 2, '대체로 불만족', 3),
  (2, 3, '불만족', 4),

  (3, 0, '전혀 시달리지 않음', 1),
  (3, 1, '약간 시달림', 2),
  (3, 2, '대단히 시달림', 3),

  (4, 0, '전혀', 1),
  (4, 1, '조금', 2),
  (4, 2, '보통', 3),
  (4, 3, '많이', 4)
on conflict (option_set_version_id, score_value) do update
set option_label = excluded.option_label,
    display_order = excluded.display_order;

insert into public.ema_scale_versions (
  scale_version_id, scale_key, version_no, scale_name,
  scoring_method, theoretical_min, theoretical_max, active
)
values
  (1, 'loneliness', 1, '외로움', 'sum', 0, 9, true),
  (2, 'family_stress', 1, '가정 스트레스', 'sum', 0, 3, true),
  (3, 'somatization_phq15', 1, '신체화 PHQ-15', 'sum', 0, 30, true),
  (4, 'dysfunctional_coping', 1, '역기능적 대처', 'sum', 0, 36, true)
on conflict (scale_version_id) do update
set scale_key = excluded.scale_key,
    version_no = excluded.version_no,
    scale_name = excluded.scale_name,
    scoring_method = excluded.scoring_method,
    theoretical_min = excluded.theoretical_min,
    theoretical_max = excluded.theoretical_max,
    active = excluded.active;


insert into public.ema_question_versions (
  question_version_id, question_key, version_no, scale_version_id,
  original_item_no, question_text, time_anchor,
  option_set_version_id, min_score, max_score, active
)
values
  (1, 'loneliness_01', 1, 1, 1, '지금 현재, 자신이 동료의식이 없다고 느끼나요?', '지금 현재', 1, 0, 3, true),
  (2, 'loneliness_02', 1, 1, 2, '지금 현재, 자신이 따돌림을 당한다고 느끼나요?', '지금 현재', 1, 0, 3, true),
  (3, 'loneliness_03', 1, 1, 3, '지금 현재, 자신이 다른 사람들과 고립되어 있다고 느끼나요?', '지금 현재', 1, 0, 3, true),
  (4, 'family_stress_01', 1, 2, 25, '지금 현재, 가정생활에 얼마나 만족하십니까?', '지금 현재', 2, 0, 3, true),
  (5, 'phq15_01', 1, 3, 1, '지금 현재, 위통으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (6, 'phq15_02', 1, 3, 2, '지금 현재, 허리 통증으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (7, 'phq15_03', 1, 3, 3, '지금 현재, 팔, 다리, 관절(예: 무릎, 고관절 등)의 통증으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (8, 'phq15_04', 1, 3, 4, '지금 현재, 생리기간 동안 생리통 등의 문제으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (9, 'phq15_05', 1, 3, 5, '지금 현재, 두통으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (10, 'phq15_06', 1, 3, 6, '지금 현재, 가슴 통증 또는 흉통으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (11, 'phq15_07', 1, 3, 7, '지금 현재, 어지러움으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (12, 'phq15_08', 1, 3, 8, '지금 현재, 기절할 것 같은 느낌으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (13, 'phq15_09', 1, 3, 9, '지금 현재, 심장이 빨리 뛰는 느낌으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (14, 'phq15_10', 1, 3, 10, '지금 현재, 숨이 참으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (15, 'phq15_11', 1, 3, 11, '지금 현재, 성교 중 통증 등의 문제으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (16, 'phq15_12', 1, 3, 12, '지금 현재, 신경성 복통 또는 빈번한 화장실 사용(과민성 대장 증상)으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (17, 'phq15_13', 1, 3, 13, '지금 현재, 메스꺼움, 방귀 또는 소화 불량으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (18, 'phq15_14', 1, 3, 14, '지금 현재, 피로감 또는 기운 없음으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (19, 'phq15_15', 1, 3, 15, '지금 현재, 수면의 어려움으로 얼마나 시달리고 있습니까?', '지금 현재', 3, 0, 2, true),
  (20, 'dysfunctional_coping_01', 1, 4, 1, '지금 현재 겪고 있는 어려움에 대해, 나는 마음을 분산시키기 위해 일을 하거나 다른 활동을 한다.', '지금 현재', 4, 0, 3, true),
  (21, 'dysfunctional_coping_02', 1, 4, 3, '지금 현재 겪고 있는 어려움에 대해, 나는 ‘그것은 사실일 리가 없어’라고 나 자신에게 말한다.', '지금 현재', 4, 0, 3, true),
  (22, 'dysfunctional_coping_03', 1, 4, 4, '지금 현재 겪고 있는 어려움에 대해, 나는 기분이 나아지기 위해 술을 마신다.', '지금 현재', 4, 0, 3, true),
  (23, 'dysfunctional_coping_04', 1, 4, 6, '지금 현재 겪고 있는 어려움에 대해, 나는 현재의 어려움에 대처하기 위해 노력하는 것을 포기한다.', '지금 현재', 4, 0, 3, true),
  (24, 'dysfunctional_coping_05', 1, 4, 8, '지금 현재 겪고 있는 어려움에 대해, 나는 현재의 어려움이 실제로 일어났다는 사실을 믿기를 거부한다.', '지금 현재', 4, 0, 3, true),
  (25, 'dysfunctional_coping_06', 1, 4, 9, '지금 현재 겪고 있는 어려움에 대해, 나는 괴로운 감정에서 벗어나기 위해 무슨 말이든 한다.', '지금 현재', 4, 0, 3, true),
  (26, 'dysfunctional_coping_07', 1, 4, 11, '지금 현재 겪고 있는 어려움에 대해, 나는 현재의 어려움을 극복하기 위해 술을 마신다.', '지금 현재', 4, 0, 3, true),
  (27, 'dysfunctional_coping_08', 1, 4, 13, '지금 현재 겪고 있는 어려움에 대해, 나는 자신을 비난한다.', '지금 현재', 4, 0, 3, true),
  (28, 'dysfunctional_coping_09', 1, 4, 16, '지금 현재 겪고 있는 어려움에 대해, 나는 현재의 어려움에 대처하기 위해 무엇인가 시도하는 것을 포기한다.', '지금 현재', 4, 0, 3, true),
  (29, 'dysfunctional_coping_10', 1, 4, 19, '지금 현재 겪고 있는 어려움에 대해, 나는 현재의 어려움에 대해 덜 생각하기 위해 영상 시청, 독서, 수면 등 다른 활동을 한다.', '지금 현재', 4, 0, 3, true),
  (30, 'dysfunctional_coping_11', 1, 4, 21, '지금 현재 겪고 있는 어려움에 대해, 나는 부정적인 감정을 표현한다.', '지금 현재', 4, 0, 3, true),
  (31, 'dysfunctional_coping_12', 1, 4, 26, '지금 현재 겪고 있는 어려움에 대해, 나는 문제가 발생한 것에 대하여 스스로를 자책한다.', '지금 현재', 4, 0, 3, true)
on conflict (question_version_id) do update
set question_key = excluded.question_key,
    version_no = excluded.version_no,
    scale_version_id = excluded.scale_version_id,
    original_item_no = excluded.original_item_no,
    question_text = excluded.question_text,
    time_anchor = excluded.time_anchor,
    option_set_version_id = excluded.option_set_version_id,
    min_score = excluded.min_score,
    max_score = excluded.max_score,
    active = excluded.active;

insert into public.ema_instrument_versions (
  instrument_version_id, instrument_key, version_no,
  instrument_name, time_anchor, active
)
values
  (1, 'core_ema', 1, '핵심 EMA 문항 세트 v1', '지금 현재', true)
on conflict (instrument_version_id) do update
set instrument_key = excluded.instrument_key,
    version_no = excluded.version_no,
    instrument_name = excluded.instrument_name,
    time_anchor = excluded.time_anchor,
    active = excluded.active;


insert into public.ema_instrument_items (
  instrument_version_id, question_slot, question_version_id,
  display_order, required
)
values
  (1, 1, 1, 1, true),
  (1, 2, 2, 2, true),
  (1, 3, 3, 3, true),
  (1, 4, 4, 4, true),
  (1, 5, 5, 5, true),
  (1, 6, 6, 6, true),
  (1, 7, 7, 7, true),
  (1, 8, 8, 8, true),
  (1, 9, 9, 9, true),
  (1, 10, 10, 10, true),
  (1, 11, 11, 11, true),
  (1, 12, 12, 12, true),
  (1, 13, 13, 13, true),
  (1, 14, 14, 14, true),
  (1, 15, 15, 15, true),
  (1, 16, 16, 16, true),
  (1, 17, 17, 17, true),
  (1, 18, 18, 18, true),
  (1, 19, 19, 19, true),
  (1, 20, 20, 20, true),
  (1, 21, 21, 21, true),
  (1, 22, 22, 22, true),
  (1, 23, 23, 23, true),
  (1, 24, 24, 24, true),
  (1, 25, 25, 25, true),
  (1, 26, 26, 26, true),
  (1, 27, 27, 27, true),
  (1, 28, 28, 28, true),
  (1, 29, 29, 29, true),
  (1, 30, 30, 30, true),
  (1, 31, 31, 31, true)
on conflict (instrument_version_id, question_slot) do update
set question_version_id = excluded.question_version_id,
    display_order = excluded.display_order,
    required = excluded.required;

insert into public.ema_instrument_scale_slots (
  instrument_version_id, score_slot, scale_version_id
)
values
  (1, 1, 1),
  (1, 2, 2),
  (1, 3, 3),
  (1, 4, 4)
on conflict (instrument_version_id, score_slot) do update
set scale_version_id = excluded.scale_version_id;

insert into public.ema_scoring_versions (
  scoring_version_id, instrument_version_id, version_no,
  scoring_name, scoring_rule, active
)
values
  (1, 1, 1, '단순 합산 v1', '{"method":"sum_by_scale"}'::jsonb, true)
on conflict (scoring_version_id) do update
set instrument_version_id = excluded.instrument_version_id,
    version_no = excluded.version_no,
    scoring_name = excluded.scoring_name,
    scoring_rule = excluded.scoring_rule,
    active = excluded.active;

select setval(
  pg_get_serial_sequence('public.ema_response_option_sets', 'option_set_version_id'),
  greatest((select coalesce(max(option_set_version_id), 1) from public.ema_response_option_sets), 1),
  true
);
select setval(
  pg_get_serial_sequence('public.ema_scale_versions', 'scale_version_id'),
  greatest((select coalesce(max(scale_version_id), 1) from public.ema_scale_versions), 1),
  true
);
select setval(
  pg_get_serial_sequence('public.ema_question_versions', 'question_version_id'),
  greatest((select coalesce(max(question_version_id), 1) from public.ema_question_versions), 1),
  true
);
select setval(
  pg_get_serial_sequence('public.ema_instrument_versions', 'instrument_version_id'),
  greatest((select coalesce(max(instrument_version_id), 1) from public.ema_instrument_versions), 1),
  true
);
select setval(
  pg_get_serial_sequence('public.ema_scoring_versions', 'scoring_version_id'),
  greatest((select coalesce(max(scoring_version_id), 1) from public.ema_scoring_versions), 1),
  true
);


-- ------------------------------------------------------------
-- LLM prompt templates
-- The application should replace {{...}} variables in an Edge Function.
-- ------------------------------------------------------------

create table if not exists public.llm_prompt_templates (
  prompt_template_id bigint generated by default as identity primary key,
  prompt_type text not null check (
    prompt_type in (
      'ema_interpretation',
      'ema_reflection_question',
      'emi_question_generation',
      'emi_response_comment'
    )
  ),
  version_no integer not null check (version_no > 0),
  template_name text not null,
  system_prompt text not null,
  user_prompt_template text not null,
  template_variables jsonb not null,
  output_schema jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (prompt_type, version_no)
);

insert into public.llm_prompt_templates (
  prompt_template_id, prompt_type, version_no, template_name,
  system_prompt, user_prompt_template,
  template_variables, output_schema, active
)
values
(
  1,
  'ema_interpretation',
  1,
  'EMA 결과 설명 v1',
  $prompt$
당신은 청소년과 성인이 사용하는 정서지원 앱의 설명 생성 모듈이다.
제공된 정보만 사용하고, 진단·확정적 인과 추론·위험 과장을 하지 않는다.
사용자의 현재 감정과 EMA 응답, 척도 합산점수, 배정 유형을 서로 연결해
구체적이면서도 비판단적인 한국어로 설명한다.
반드시 지정된 JSON 구조만 출력한다.
$prompt$,
  $prompt$
현재 감정 대분류: {{emotion_category}}
현재 세부감정 목록: {{emotion_details_json}}
EMA 문항별 응답: {{ema_responses_json}}
EMA 척도별 점수: {{ema_scale_scores_json}}
배정 유형: {{classification_json}}

위 정보에 근거하여 서로 중복되지 않는 특성 3개와 AI 코멘트 1개를 생성하라.
$prompt$,
  '["emotion_category","emotion_details_json","ema_responses_json","ema_scale_scores_json","classification_json"]'::jsonb,
  '{"type":"object","additionalProperties":false,"required":["characteristic_1","characteristic_2","characteristic_3","ai_comment"],"properties":{"characteristic_1":{"type":"string"},"characteristic_2":{"type":"string"},"characteristic_3":{"type":"string"},"ai_comment":{"type":"string"}}}'::jsonb,
  true
),
(
  2,
  'emi_question_generation',
  1,
  'EMI 성찰 질문 생성 v1',
  $prompt$
당신은 게슈탈트 관점의 자기성찰 질문을 생성하는 정서지원 앱 모듈이다.
제공된 현재 EMA 자료, 감정, 배정 유형, 사용자가 선택한 게슈탈트 유형만 사용한다.
과거 flow와 baseline을 추정하거나 사용하지 않는다.
질문은 개방형이며 서로 중복되지 않아야 하고, 사용자가 현재 경험을 알아차리고
접촉 방식을 탐색할 수 있도록 작성한다.
정확히 5개의 질문을 지정된 JSON 구조로만 출력한다.
$prompt$,
  $prompt$
현재 감정 대분류: {{emotion_category}}
현재 세부감정 목록: {{emotion_details_json}}
EMA 문항별 응답: {{ema_responses_json}}
EMA 척도별 점수: {{ema_scale_scores_json}}
배정 유형: {{classification_json}}
EMA 분석 결과: {{ema_analysis_json}}
EMA 분석 내용에 대한 질문: {{reflection_question}}
위 질문에 대한 사용자 응답: {{reflection_response}}
사용자가 선택한 게슈탈트 유형: {{gestalt_types_json}}

사용자의 EMA 분석 응답을 중심에 두고, 선택한 게슈탈트 유형의 관점에서
현재 경험과 접촉 방식을 탐색할 수 있는 질문을 정확히 5개 생성하라.
$prompt$,
  '["emotion_category","emotion_details_json","ema_responses_json","ema_scale_scores_json","classification_json","ema_analysis_json","reflection_question","reflection_response","gestalt_types_json"]'::jsonb,
  '{"type":"object","additionalProperties":false,"required":["questions"],"properties":{"questions":{"type":"array","minItems":5,"maxItems":5,"items":{"type":"string"}}}}'::jsonb,
  true
),
(
  3,
  'emi_response_comment',
  2,
  'EMI 통합 응답 코멘트 v2',
  $prompt$
당신은 사용자의 자기성찰 기록에 피드백을 제공하는 정서지원 앱 모듈이다.
제공된 현재 EMA 자료, 감정, 배정 유형, 게슈탈트 유형, 선택 질문 2개와
통합 응답만 사용한다. 진단하거나 단정하지 않고, 사용자가 작성한 표현을 존중하며
알아차림과 다음 행동을 연결하는 한국어 코멘트 1개를 생성한다.

[personalization-rules-v2]
- 선택 질문과 사용자의 통합 응답을 가장 중요한 근거로 삼는다.
- [reflect-user-phrase] 첫 문장에는 통합 응답에서 핵심 단어·표현·행동 하나를 자연스럽게 포함하여, 이 기록에만 해당하는 구체적인 관찰을 작성한다.
- [connect-supported-context] 둘째 문장에는 현재 감정과 게슈탈트 접촉 방식 중 입력으로 확인되는 맥락 하나를 연결하되, "EMA", "점수", "분류", "게슈탈트", "유형" 같은 내부 용어는 사용자에게 노출하지 않는다.
- [suggest-concrete-next-step] 셋째 문장에는 지금 바로 해볼 수 있는 작고 구체적인 행동 하나 또는 짧은 알아차림 질문 하나를 제안한다.
- 입력에 없는 상황, 관계, 원인, 의도는 추측하지 않는다. 진단하거나 단정하지 않는다.
- 두 질문에 하나의 통합 응답만 있는 경우, 질문별로 따로 답했다고 꾸며내지 않는다.
- 3문장, 120~240자 정도의 자연스러운 한국어로 작성한다.
- [avoid-generic-language] "잘 정리해 주셨어요", "그 상황을 중심으로", "정답을 찾기보다", "마음과 몸의 반응을 구분", "충분히 의미가 있습니다" 같은 범용 문구를 사용하지 않는다.
반드시 지정된 JSON 구조만 출력한다.
$prompt$,
  $prompt$
[priority-journal-context]
[최우선 자기성찰 기록]
선택 질문 1: {{selected_question_1}}
선택 질문 2: {{selected_question_2}}
사용자의 통합 응답: {{combined_response}}

[보조 맥락]
현재 감정 대분류: {{emotion_category}}
현재 세부감정 목록: {{emotion_details_json}}
EMA 문항별 응답: {{ema_responses_json}}
EMA 척도별 점수: {{ema_scale_scores_json}}
배정 유형: {{classification_json}}
EMA 분석 결과: {{ema_analysis_json}}
EMA 분석 내용에 대한 질문: {{reflection_question}}
위 질문에 대한 사용자 응답: {{reflection_response}}
사용자가 선택한 게슈탈트 유형: {{gestalt_types_json}}

최우선 자기성찰 기록을 중심으로, 위 개인화 규칙을 모두 지킨 AI 코멘트 1개를 생성하라.
$prompt$,
  '["emotion_category","emotion_details_json","ema_responses_json","ema_scale_scores_json","classification_json","ema_analysis_json","reflection_question","reflection_response","gestalt_types_json","selected_question_1","selected_question_2","combined_response"]'::jsonb,
  '{"type":"object","additionalProperties":false,"required":["ai_comment"],"properties":{"ai_comment":{"type":"string"}}}'::jsonb,
  true
),
(
  4,
  'ema_reflection_question',
  1,
  'EMA 분석 성찰 질문 v1',
  $prompt$
당신은 청소년과 성인이 EMA 분석 내용을 자신의 현재 경험과 연결하도록 돕는
정서지원 앱의 성찰 질문 생성 모듈이다. 제공된 현재 EMA 자료와 배정 유형,
EMA 분석 특성 및 코멘트만 사용한다. 진단하거나 원인을 단정하지 않으며,
사용자가 구체적인 상황·감정·욕구를 자유롭게 설명할 수 있는 개방형 질문을
정확히 1개 생성한다. 질문은 짧고 명확해야 하며 지정된 JSON 구조만 출력한다.
$prompt$,
  $prompt$
현재 감정 대분류: {{emotion_category}}
현재 세부감정 목록: {{emotion_details_json}}
EMA 문항별 응답: {{ema_responses_json}}
EMA 척도별 점수: {{ema_scale_scores_json}}
배정 유형: {{classification_json}}
EMA 분석 결과: {{ema_analysis_json}}

위 분석 내용을 사용자의 실제 현재 경험과 연결하는 개방형 질문을 정확히 1개 생성하라.
$prompt$,
  '["emotion_category","emotion_details_json","ema_responses_json","ema_scale_scores_json","classification_json","ema_analysis_json"]'::jsonb,
  '{"type":"object","additionalProperties":false,"required":["reflection_question"],"properties":{"reflection_question":{"type":"string"}}}'::jsonb,
  true
)
on conflict (prompt_template_id) do update
set prompt_type = excluded.prompt_type,
    version_no = excluded.version_no,
    template_name = excluded.template_name,
    system_prompt = excluded.system_prompt,
    user_prompt_template = excluded.user_prompt_template,
    template_variables = excluded.template_variables,
    output_schema = excluded.output_schema,
    active = excluded.active;

select setval(
  pg_get_serial_sequence('public.llm_prompt_templates', 'prompt_template_id'),
  greatest((select coalesce(max(prompt_template_id), 1) from public.llm_prompt_templates), 1),
  true
);


-- ------------------------------------------------------------
-- EMA activity data
-- q001–q100 are intentionally wide for easy CSV/SPSS/R export.
-- Only slots mapped by instrument_version_id are valid.
-- ------------------------------------------------------------

create table if not exists public.ema_sessions (
  flow_id uuid primary key,
  user_id uuid not null,
  instrument_version_id bigint not null
    references public.ema_instrument_versions(instrument_version_id) on delete restrict,
  emotion_category_id smallint not null
    references public.emotion_categories(emotion_category_id) on delete restrict,
  q001 smallint,
  q002 smallint,
  q003 smallint,
  q004 smallint,
  q005 smallint,
  q006 smallint,
  q007 smallint,
  q008 smallint,
  q009 smallint,
  q010 smallint,
  q011 smallint,
  q012 smallint,
  q013 smallint,
  q014 smallint,
  q015 smallint,
  q016 smallint,
  q017 smallint,
  q018 smallint,
  q019 smallint,
  q020 smallint,
  q021 smallint,
  q022 smallint,
  q023 smallint,
  q024 smallint,
  q025 smallint,
  q026 smallint,
  q027 smallint,
  q028 smallint,
  q029 smallint,
  q030 smallint,
  q031 smallint,
  q032 smallint,
  q033 smallint,
  q034 smallint,
  q035 smallint,
  q036 smallint,
  q037 smallint,
  q038 smallint,
  q039 smallint,
  q040 smallint,
  q041 smallint,
  q042 smallint,
  q043 smallint,
  q044 smallint,
  q045 smallint,
  q046 smallint,
  q047 smallint,
  q048 smallint,
  q049 smallint,
  q050 smallint,
  q051 smallint,
  q052 smallint,
  q053 smallint,
  q054 smallint,
  q055 smallint,
  q056 smallint,
  q057 smallint,
  q058 smallint,
  q059 smallint,
  q060 smallint,
  q061 smallint,
  q062 smallint,
  q063 smallint,
  q064 smallint,
  q065 smallint,
  q066 smallint,
  q067 smallint,
  q068 smallint,
  q069 smallint,
  q070 smallint,
  q071 smallint,
  q072 smallint,
  q073 smallint,
  q074 smallint,
  q075 smallint,
  q076 smallint,
  q077 smallint,
  q078 smallint,
  q079 smallint,
  q080 smallint,
  q081 smallint,
  q082 smallint,
  q083 smallint,
  q084 smallint,
  q085 smallint,
  q086 smallint,
  q087 smallint,
  q088 smallint,
  q089 smallint,
  q090 smallint,
  q091 smallint,
  q092 smallint,
  q093 smallint,
  q094 smallint,
  q095 smallint,
  q096 smallint,
  q097 smallint,
  q098 smallint,
  q099 smallint,
  q100 smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (flow_id, user_id),
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict
);

create table if not exists public.ema_session_emotions (
  flow_id uuid not null,
  user_id uuid not null,
  emotion_detail_id smallint not null
    references public.emotion_details(emotion_detail_id) on delete restrict,
  selection_order smallint not null check (selection_order between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (flow_id, emotion_detail_id),
  unique (flow_id, selection_order),
  foreign key (flow_id, user_id)
    references public.ema_sessions(flow_id, user_id) on delete restrict
);

create or replace function public.guard_ema_session_emotions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_flow_id uuid;
  v_user_id uuid;
  v_flow_user_id uuid;
  v_session_category_id smallint;
  v_detail_category_id smallint;
  v_status text;
begin
  v_flow_id := case when tg_op = 'DELETE' then old.flow_id else new.flow_id end;
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  select e.user_id, e.emotion_category_id, f.status
    into v_flow_user_id, v_session_category_id, v_status
    from public.ema_sessions e
    join public.activity_flows f
      on f.flow_id = e.flow_id
     and f.user_id = e.user_id
   where e.flow_id = v_flow_id;

  if v_flow_user_id is null then
    raise exception 'EMA session not found';
  end if;

  if v_flow_user_id <> v_user_id then
    raise exception 'emotion user_id must match the EMA session owner';
  end if;

  if v_status <> 'draft' then
    raise exception 'EMA emotions can be edited only while the flow is draft';
  end if;

  if tg_op <> 'DELETE' then
    select emotion_category_id
      into v_detail_category_id
      from public.emotion_details
     where emotion_detail_id = new.emotion_detail_id;

    if v_detail_category_id is null then
      raise exception 'emotion detail not found';
    end if;

    if v_detail_category_id <> v_session_category_id then
      raise exception 'all emotion details must belong to the selected emotion category';
    end if;

    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists ema_session_emotions_guard on public.ema_session_emotions;
create trigger ema_session_emotions_guard
before insert or update or delete on public.ema_session_emotions
for each row execute function public.guard_ema_session_emotions();

drop trigger if exists ema_sessions_set_updated_at on public.ema_sessions;
create trigger ema_sessions_set_updated_at
before update on public.ema_sessions
for each row execute function public.set_updated_at();

drop trigger if exists ema_sessions_guard on public.ema_sessions;
create trigger ema_sessions_guard
before update or delete on public.ema_sessions
for each row execute function public.guard_draft_flow_row();

create table if not exists public.ema_scale_scores (
  flow_id uuid primary key,
  user_id uuid not null,
  scoring_version_id bigint not null
    references public.ema_scoring_versions(scoring_version_id) on delete restrict,
  scale01 numeric(10,3),
  scale02 numeric(10,3),
  scale03 numeric(10,3),
  scale04 numeric(10,3),
  scale05 numeric(10,3),
  scale06 numeric(10,3),
  scale07 numeric(10,3),
  scale08 numeric(10,3),
  scale09 numeric(10,3),
  scale10 numeric(10,3),
  scale11 numeric(10,3),
  scale12 numeric(10,3),
  scale13 numeric(10,3),
  scale14 numeric(10,3),
  scale15 numeric(10,3),
  scale16 numeric(10,3),
  scale17 numeric(10,3),
  scale18 numeric(10,3),
  scale19 numeric(10,3),
  scale20 numeric(10,3),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, user_id),
  foreign key (flow_id, user_id)
    references public.ema_sessions(flow_id, user_id) on delete restrict
);

drop trigger if exists ema_scale_scores_set_updated_at on public.ema_scale_scores;
create trigger ema_scale_scores_set_updated_at
before update on public.ema_scale_scores
for each row execute function public.set_updated_at();

drop trigger if exists ema_scale_scores_guard on public.ema_scale_scores;
create trigger ema_scale_scores_guard
before update or delete on public.ema_scale_scores
for each row execute function public.guard_draft_flow_row();


-- ------------------------------------------------------------
-- Classification versions and six result types
-- ------------------------------------------------------------

create table if not exists public.classification_algorithm_versions (
  algorithm_version_id bigint generated by default as identity primary key,
  algorithm_key text not null,
  version_no integer not null check (version_no > 0),
  algorithm_name text not null,
  instrument_version_id bigint not null
    references public.ema_instrument_versions(instrument_version_id) on delete restrict,
  rule_definition jsonb not null,
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (algorithm_key, version_no)
);

insert into public.classification_algorithm_versions (
  algorithm_version_id, algorithm_key, version_no,
  algorithm_name, instrument_version_id, rule_definition, active
)
values
(
  1,
  'core_character_tree',
  1,
  '한일 코로나 참고 분류트리 v1',
  1,
  '{
    "scale_slots":{"loneliness":1,"family_stress":2,"somatization":3,"dysfunctional_coping":4},
    "rules":[
      {"type_id":1,"when":"loneliness <= 2 and family_stress <= 1"},
      {"type_id":2,"when":"loneliness <= 2 and family_stress > 1 and education_group = 1"},
      {"type_id":3,"when":"loneliness <= 2 and family_stress > 1 and education_group = 2"},
      {"type_id":4,"when":"loneliness > 2 and somatization <= 3"},
      {"type_id":5,"when":"loneliness > 2 and somatization > 3 and dysfunctional_coping <= 3"},
      {"type_id":6,"when":"loneliness > 2 and somatization > 3 and dysfunctional_coping > 3"}
    ],
    "age_exception_rule_applied":false
  }'::jsonb,
  true
)
on conflict (algorithm_version_id) do update
set algorithm_key = excluded.algorithm_key,
    version_no = excluded.version_no,
    algorithm_name = excluded.algorithm_name,
    instrument_version_id = excluded.instrument_version_id,
    rule_definition = excluded.rule_definition,
    active = excluded.active;

select setval(
  pg_get_serial_sequence('public.classification_algorithm_versions', 'algorithm_version_id'),
  greatest((select coalesce(max(algorithm_version_id), 1) from public.classification_algorithm_versions), 1),
  true
);

create table if not exists public.classification_types (
  type_id smallint primary key check (type_id between 1 and 6),
  node_code text not null unique,
  internal_type_name text not null unique,
  character_name text not null unique,
  image_bucket text not null default 'character-images',
  image_path text not null,
  created_at timestamptz not null default now()
);

insert into public.classification_types (
  type_id, node_code, internal_type_name, character_name, image_bucket, image_path
)
values
  (1, 'Node 4', '평시관리형', '볕 모으는 조약돌', 'character-images', 'types/type_01.png'),
  (2, 'Node 9', '가족압박형', '눌린 구름쿠션', 'character-images', 'types/type_02.png'),
  (3, 'Node 10', '가족부담형', '물 머금은 화분', 'character-images', 'types/type_03.png'),
  (4, 'Node 12', '고립중심형', '신호 찾는 라디오', 'character-images', 'types/type_04.png'),
  (5, 'Node 14', '고립-신체긴장형', '팽팽한 풍선', 'character-images', 'types/type_05.png'),
  (6, 'Node 15', '복합대처형', '엉킨 이어폰', 'character-images', 'types/type_06.png')
on conflict (type_id) do update
set node_code = excluded.node_code,
    internal_type_name = excluded.internal_type_name,
    character_name = excluded.character_name,
    image_bucket = excluded.image_bucket,
    image_path = excluded.image_path;

create table if not exists public.ema_classifications (
  flow_id uuid primary key,
  user_id uuid not null,
  algorithm_version_id bigint not null
    references public.classification_algorithm_versions(algorithm_version_id) on delete restrict,
  type_id smallint not null
    references public.classification_types(type_id) on delete restrict,
  classified_at timestamptz not null default now(),
  unique (flow_id, user_id),
  foreign key (flow_id, user_id)
    references public.ema_sessions(flow_id, user_id) on delete restrict
);

drop trigger if exists ema_classifications_immutable on public.ema_classifications;
create trigger ema_classifications_immutable
before update or delete on public.ema_classifications
for each row execute function public.block_update_or_delete();

create table if not exists public.ema_ai_results (
  flow_id uuid primary key,
  user_id uuid not null,
  prompt_template_id bigint not null
    references public.llm_prompt_templates(prompt_template_id) on delete restrict,
  characteristic_1 text not null,
  characteristic_2 text not null,
  characteristic_3 text not null,
  ai_comment text not null,
  generated_at timestamptz not null default now(),
  unique (flow_id, user_id),
  foreign key (flow_id, user_id)
    references public.ema_sessions(flow_id, user_id) on delete restrict
);

drop trigger if exists ema_ai_results_immutable on public.ema_ai_results;
create trigger ema_ai_results_immutable
before update or delete on public.ema_ai_results
for each row execute function public.block_update_or_delete();


create or replace function public.submit_ema(p_flow_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
  v_ema public.ema_sessions%rowtype;
  v_scores public.ema_scale_scores%rowtype;
  v_ema_json jsonb;
  v_scores_json jsonb;
  v_item record;
  v_scale record;
  v_value numeric;
  v_front_value numeric;
  v_total numeric;
  v_scoring_version_id bigint;
  v_algorithm_version_id bigint;
  v_education_group smallint;
  v_loneliness numeric;
  v_family_stress numeric;
  v_somatization numeric;
  v_coping numeric;
  v_type_id smallint;
  v_slot_key text;
  v_emotion_count integer;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'ema'
   for update;

  if v_flow.flow_id is null then
    raise exception 'EMA flow not found';
  end if;

  if v_flow.status <> 'draft' then
    raise exception 'EMA can be submitted only from draft status';
  end if;

  select *
    into v_ema
    from public.ema_sessions
   where flow_id = p_flow_id
     and user_id = v_flow.user_id;

  if v_ema.flow_id is null then
    raise exception 'EMA session row is missing';
  end if;

  select count(*)
    into v_emotion_count
    from public.ema_session_emotions
   where flow_id = p_flow_id
     and user_id = v_flow.user_id;

  if v_emotion_count not between 1 and 3 then
    raise exception 'between 1 and 3 emotion details are required';
  end if;

  if exists (
    select 1
    from public.ema_session_emotions ese
    join public.emotion_details ed
      on ed.emotion_detail_id = ese.emotion_detail_id
    where ese.flow_id = p_flow_id
      and ed.emotion_category_id <> v_ema.emotion_category_id
  ) then
    raise exception 'all emotion details must belong to the selected emotion category';
  end if;

  select *
    into v_scores
    from public.ema_scale_scores
   where flow_id = p_flow_id
     and user_id = v_flow.user_id;

  if v_scores.flow_id is null then
    raise exception 'frontend EMA scale score row is missing';
  end if;

  select scoring_version_id
    into v_scoring_version_id
    from public.ema_scoring_versions
   where instrument_version_id = v_ema.instrument_version_id
     and active
   order by version_no desc
   limit 1;

  if v_scoring_version_id is null then
    raise exception 'active scoring version is missing';
  end if;

  if v_scores.scoring_version_id <> v_scoring_version_id then
    raise exception 'scoring version mismatch';
  end if;

  v_ema_json := to_jsonb(v_ema);
  v_scores_json := to_jsonb(v_scores);

  for v_item in
    select
      ii.question_slot,
      ii.required,
      q.min_score,
      q.max_score
    from public.ema_instrument_items ii
    join public.ema_question_versions q
      on q.question_version_id = ii.question_version_id
    where ii.instrument_version_id = v_ema.instrument_version_id
    order by ii.question_slot
  loop
    v_slot_key := 'q' || lpad(v_item.question_slot::text, 3, '0');

    if not (v_ema_json ? v_slot_key) then
      raise exception 'EMA slot % does not exist', v_slot_key;
    end if;

    if v_ema_json ->> v_slot_key is null then
      if v_item.required then
        raise exception 'required EMA response % is missing', v_slot_key;
      end if;
    else
      v_value := (v_ema_json ->> v_slot_key)::numeric;
      if v_value < v_item.min_score or v_value > v_item.max_score then
        raise exception 'EMA response % is outside the permitted range', v_slot_key;
      end if;
    end if;
  end loop;

  -- Unmapped q columns must remain NULL.
  for v_item in
    select n as question_slot
    from generate_series(1, 100) as g(n)
    where not exists (
      select 1
      from public.ema_instrument_items ii
      where ii.instrument_version_id = v_ema.instrument_version_id
        and ii.question_slot = n
    )
  loop
    v_slot_key := 'q' || lpad(v_item.question_slot::text, 3, '0');
    if v_ema_json ->> v_slot_key is not null then
      raise exception 'unmapped EMA response % must be NULL', v_slot_key;
    end if;
  end loop;

  -- Recalculate each scale and compare it with frontend-calculated scaleXX.
  for v_scale in
    select iss.score_slot, iss.scale_version_id
    from public.ema_instrument_scale_slots iss
    where iss.instrument_version_id = v_ema.instrument_version_id
    order by iss.score_slot
  loop
    select sum((v_ema_json ->> ('q' || lpad(ii.question_slot::text, 3, '0')))::numeric)
      into v_total
      from public.ema_instrument_items ii
      join public.ema_question_versions q
        on q.question_version_id = ii.question_version_id
     where ii.instrument_version_id = v_ema.instrument_version_id
       and q.scale_version_id = v_scale.scale_version_id;

    v_slot_key := 'scale' || lpad(v_scale.score_slot::text, 2, '0');
    v_front_value := nullif(v_scores_json ->> v_slot_key, '')::numeric;

    if v_front_value is distinct from v_total then
      raise exception 'frontend % (%) does not match database calculation (%)',
        v_slot_key, v_front_value, v_total;
    end if;
  end loop;

  -- Unmapped scale columns must remain NULL.
  for v_scale in
    select n as score_slot
    from generate_series(1, 20) as g(n)
    where not exists (
      select 1
      from public.ema_instrument_scale_slots iss
      where iss.instrument_version_id = v_ema.instrument_version_id
        and iss.score_slot = n
    )
  loop
    v_slot_key := 'scale' || lpad(v_scale.score_slot::text, 2, '0');
    if v_scores_json ->> v_slot_key is not null then
      raise exception 'unmapped score % must be NULL', v_slot_key;
    end if;
  end loop;

  v_loneliness := v_scores.scale01;
  v_family_stress := v_scores.scale02;
  v_somatization := v_scores.scale03;
  v_coping := v_scores.scale04;

  select el.classification_group
    into v_education_group
    from public.profiles p
    join public.education_levels el
      on el.education_code = p.education_code
   where p.user_id = v_flow.user_id;

  if v_education_group is null then
    raise exception 'education classification group is required for classification';
  end if;

  select algorithm_version_id
    into v_algorithm_version_id
    from public.classification_algorithm_versions
   where instrument_version_id = v_ema.instrument_version_id
     and active
   order by version_no desc
   limit 1;

  if v_algorithm_version_id is null then
    raise exception 'active classification algorithm is missing';
  end if;

  v_type_id :=
    case
      when v_loneliness <= 2 and v_family_stress <= 1 then 1
      when v_loneliness <= 2 and v_family_stress > 1 and v_education_group = 1 then 2
      when v_loneliness <= 2 and v_family_stress > 1 and v_education_group = 2 then 3
      when v_loneliness > 2 and v_somatization <= 3 then 4
      when v_loneliness > 2 and v_somatization > 3 and v_coping <= 3 then 5
      when v_loneliness > 2 and v_somatization > 3 and v_coping > 3 then 6
      else null
    end;

  if v_type_id is null then
    raise exception 'classification rule produced no type';
  end if;

  update public.ema_scale_scores
     set verified_at = now()
   where flow_id = p_flow_id;

  insert into public.ema_classifications (
    flow_id, user_id, algorithm_version_id, type_id
  )
  values (
    p_flow_id, v_flow.user_id, v_algorithm_version_id, v_type_id
  );

  update public.ema_sessions
     set submitted_at = now()
   where flow_id = p_flow_id;

  update public.activity_flows
     set status = 'processing'
   where flow_id = p_flow_id;

  return v_type_id;
end;
$$;

create or replace function public.save_ema_ai_result(
  p_flow_id uuid,
  p_prompt_template_id bigint,
  p_characteristic_1 text,
  p_characteristic_2 text,
  p_characteristic_3 text,
  p_ai_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'ema'
   for update;

  if v_flow.status <> 'processing' then
    raise exception 'EMA flow is not awaiting an AI result';
  end if;

  if exists (select 1 from public.ema_ai_results where flow_id = p_flow_id) then
    raise exception 'EMA AI result already exists';
  end if;

  if not exists (
    select 1 from public.llm_prompt_templates
    where prompt_template_id = p_prompt_template_id
      and prompt_type = 'ema_interpretation'
      and active
  ) then
    raise exception 'invalid EMA prompt template';
  end if;

  insert into public.ema_ai_results (
    flow_id, user_id, prompt_template_id,
    characteristic_1, characteristic_2, characteristic_3, ai_comment
  )
  values (
    p_flow_id, v_flow.user_id, p_prompt_template_id,
    p_characteristic_1, p_characteristic_2, p_characteristic_3, p_ai_comment
  );

  update public.activity_flows
     set status = 'completed'
   where flow_id = p_flow_id;
end;
$$;



-- ------------------------------------------------------------
-- Server-side LLM context builders
-- These functions assemble the exact current-flow data required by
-- the four prompt types. They do not include past flows or baseline.
-- ------------------------------------------------------------

create or replace function public.get_ema_llm_context(p_flow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ema public.ema_sessions%rowtype;
  v_score public.ema_scale_scores%rowtype;
  v_ema_json jsonb;
  v_score_json jsonb;
  v_responses jsonb;
  v_scales jsonb;
  v_classification jsonb;
  v_emotion_category jsonb;
  v_emotions jsonb;
begin
  select * into v_ema
  from public.ema_sessions
  where flow_id = p_flow_id;

  if v_ema.flow_id is null then
    raise exception 'EMA session not found';
  end if;

  select * into v_score
  from public.ema_scale_scores
  where flow_id = p_flow_id;

  v_ema_json := to_jsonb(v_ema);
  v_score_json := to_jsonb(v_score);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slot', ii.question_slot,
        'question_key', q.question_key,
        'question_text', q.question_text,
        'score', (v_ema_json ->> ('q' || lpad(ii.question_slot::text, 3, '0')))::smallint,
        'response_label', ro.option_label,
        'scale_key', sv.scale_key,
        'scale_name', sv.scale_name,
        'question_version_id', q.question_version_id,
        'option_set_version_id', q.option_set_version_id
      )
      order by ii.display_order
    ),
    '[]'::jsonb
  )
  into v_responses
  from public.ema_instrument_items ii
  join public.ema_question_versions q
    on q.question_version_id = ii.question_version_id
  join public.ema_scale_versions sv
    on sv.scale_version_id = q.scale_version_id
  left join public.ema_response_options ro
    on ro.option_set_version_id = q.option_set_version_id
   and ro.score_value = (v_ema_json ->> ('q' || lpad(ii.question_slot::text, 3, '0')))::smallint
  where ii.instrument_version_id = v_ema.instrument_version_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'score_slot', iss.score_slot,
        'scale_key', sv.scale_key,
        'scale_name', sv.scale_name,
        'score', (v_score_json ->> ('scale' || lpad(iss.score_slot::text, 2, '0')))::numeric,
        'scale_version_id', sv.scale_version_id
      )
      order by iss.score_slot
    ),
    '[]'::jsonb
  )
  into v_scales
  from public.ema_instrument_scale_slots iss
  join public.ema_scale_versions sv
    on sv.scale_version_id = iss.scale_version_id
  where iss.instrument_version_id = v_ema.instrument_version_id;

  select jsonb_build_object(
    'algorithm_version_id', c.algorithm_version_id,
    'type_id', c.type_id,
    'node_code', t.node_code,
    'internal_type_name', t.internal_type_name,
    'character_name', t.character_name,
    'image_bucket', t.image_bucket,
    'image_path', t.image_path
  )
  into v_classification
  from public.ema_classifications c
  join public.classification_types t on t.type_id = c.type_id
  where c.flow_id = p_flow_id;

  select jsonb_build_object(
    'category_id', ec.emotion_category_id,
    'category_key', ec.category_key,
    'category_name', ec.category_name
  )
  into v_emotion_category
  from public.emotion_categories ec
  where ec.emotion_category_id = v_ema.emotion_category_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'detail_id', ed.emotion_detail_id,
        'detail_key', ed.detail_key,
        'detail_name', ed.detail_name,
        'selection_order', ese.selection_order
      )
      order by ese.selection_order
    ),
    '[]'::jsonb
  )
  into v_emotions
  from public.ema_session_emotions ese
  join public.emotion_details ed
    on ed.emotion_detail_id = ese.emotion_detail_id
  where ese.flow_id = p_flow_id;

  return jsonb_build_object(
    'user_id', v_ema.user_id,
    'flow_id', v_ema.flow_id,
    'instrument_version_id', v_ema.instrument_version_id,
    'emotion_category', v_emotion_category,
    'emotion_details', v_emotions,
    'ema_responses', v_responses,
    'ema_scale_scores', v_scales,
    'classification', v_classification
  );
end;
$$;


-- ------------------------------------------------------------
-- EMA analysis reflection
-- After EMA interpretation, the LLM generates one question. The user
-- writes one response; this completed reflection becomes required input
-- for the subsequent Gestalt EMI question-generation step.
-- ------------------------------------------------------------

create table if not exists public.ema_reflection_sessions (
  flow_id uuid primary key,
  user_id uuid not null,
  source_ema_flow_id uuid not null unique,
  prompt_template_id bigint
    references public.llm_prompt_templates(prompt_template_id) on delete restrict,
  reflection_question text,
  user_response text,
  question_generated_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, user_id),
  unique (flow_id, user_id, source_ema_flow_id),
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict,
  foreign key (source_ema_flow_id, user_id)
    references public.ema_ai_results(flow_id, user_id) on delete restrict,
  constraint ema_reflection_question_all_or_none_ck check (
    (
      prompt_template_id is null
      and reflection_question is null
      and question_generated_at is null
    )
    or
    (
      prompt_template_id is not null
      and nullif(btrim(reflection_question), '') is not null
      and question_generated_at is not null
    )
  ),
  constraint ema_reflection_response_requires_question_ck check (
    user_response is null
    or reflection_question is not null
  ),
  constraint ema_reflection_submission_ck check (
    submitted_at is null
    or nullif(btrim(user_response), '') is not null
  )
);

create index if not exists ema_reflection_sessions_user_created_idx
  on public.ema_reflection_sessions (user_id, created_at desc);

drop trigger if exists ema_reflection_sessions_set_updated_at
  on public.ema_reflection_sessions;
create trigger ema_reflection_sessions_set_updated_at
before update on public.ema_reflection_sessions
for each row execute function public.set_updated_at();

drop trigger if exists ema_reflection_sessions_guard
  on public.ema_reflection_sessions;
create trigger ema_reflection_sessions_guard
before update or delete on public.ema_reflection_sessions
for each row execute function public.guard_reflection_editable_row();

create or replace function public.start_ema_reflection_flow(
  p_user_id uuid,
  p_source_ema_flow_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow_id uuid;
begin
  if not exists (
    select 1
    from public.activity_flows f
    join public.ema_ai_results ai
      on ai.flow_id = f.flow_id
     and ai.user_id = f.user_id
    where f.flow_id = p_source_ema_flow_id
      and f.user_id = p_user_id
      and f.part_type = 'ema'
      and f.status = 'completed'
  ) then
    raise exception 'completed EMA analysis is required';
  end if;

  if exists (
    select 1
    from public.ema_reflection_sessions
    where source_ema_flow_id = p_source_ema_flow_id
  ) then
    raise exception 'EMA reflection already exists for this EMA flow';
  end if;

  insert into public.activity_flows (
    user_id, part_type, parent_flow_id
  )
  values (
    p_user_id, 'ema_reflection', p_source_ema_flow_id
  )
  returning flow_id into v_flow_id;

  insert into public.ema_reflection_sessions (
    flow_id, user_id, source_ema_flow_id
  )
  values (
    v_flow_id, p_user_id, p_source_ema_flow_id
  );

  return v_flow_id;
end;
$$;

create or replace function public.save_ema_reflection_response(
  p_flow_id uuid,
  p_user_response text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status
    into v_status
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'ema_reflection'
   for update;

  if v_status is null then
    raise exception 'EMA reflection flow not found';
  end if;

  if v_status <> 'questions_ready' then
    raise exception 'EMA reflection response can be saved only after question generation';
  end if;

  update public.ema_reflection_sessions
     set user_response = p_user_response
   where flow_id = p_flow_id;

  if not found then
    raise exception 'EMA reflection session row is missing';
  end if;
end;
$$;

create or replace function public.save_ema_reflection_question(
  p_flow_id uuid,
  p_prompt_template_id bigint,
  p_reflection_question text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
  v_reflection public.ema_reflection_sessions%rowtype;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'ema_reflection'
   for update;

  if v_flow.flow_id is null then
    raise exception 'EMA reflection flow not found';
  end if;

  if v_flow.status <> 'draft' then
    raise exception 'EMA reflection question can be generated only once from draft status';
  end if;

  select *
    into v_reflection
    from public.ema_reflection_sessions
   where flow_id = p_flow_id
     and user_id = v_flow.user_id;

  if v_reflection.flow_id is null then
    raise exception 'EMA reflection session row is missing';
  end if;

  if not exists (
    select 1
    from public.activity_flows ef
    join public.ema_ai_results ai
      on ai.flow_id = ef.flow_id
     and ai.user_id = ef.user_id
    where ef.flow_id = v_reflection.source_ema_flow_id
      and ef.user_id = v_flow.user_id
      and ef.part_type = 'ema'
      and ef.status = 'completed'
  ) then
    raise exception 'source EMA analysis must be completed';
  end if;

  if not exists (
    select 1
    from public.llm_prompt_templates
    where prompt_template_id = p_prompt_template_id
      and prompt_type = 'ema_reflection_question'
      and active
  ) then
    raise exception 'invalid EMA reflection prompt template';
  end if;

  if nullif(btrim(p_reflection_question), '') is null then
    raise exception 'EMA reflection question is required';
  end if;

  update public.ema_reflection_sessions
     set prompt_template_id = p_prompt_template_id,
         reflection_question = p_reflection_question,
         question_generated_at = now()
   where flow_id = p_flow_id;

  update public.activity_flows
     set status = 'questions_ready'
   where flow_id = p_flow_id;
end;
$$;

create or replace function public.submit_ema_reflection(p_flow_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
  v_reflection public.ema_reflection_sessions%rowtype;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'ema_reflection'
   for update;

  if v_flow.flow_id is null then
    raise exception 'EMA reflection flow not found';
  end if;

  if v_flow.status <> 'questions_ready' then
    raise exception 'EMA reflection can be submitted only after the question is generated';
  end if;

  select *
    into v_reflection
    from public.ema_reflection_sessions
   where flow_id = p_flow_id
     and user_id = v_flow.user_id;

  if v_reflection.flow_id is null then
    raise exception 'EMA reflection session row is missing';
  end if;

  if nullif(btrim(v_reflection.reflection_question), '') is null then
    raise exception 'EMA reflection question is missing';
  end if;

  if nullif(btrim(v_reflection.user_response), '') is null then
    raise exception 'EMA reflection response is required';
  end if;

  update public.ema_reflection_sessions
     set submitted_at = now()
   where flow_id = p_flow_id;

  update public.activity_flows
     set status = 'completed'
   where flow_id = p_flow_id;
end;
$$;

create or replace function public.get_ema_reflection_llm_context(p_flow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reflection public.ema_reflection_sessions%rowtype;
  v_status text;
  v_analysis jsonb;
begin
  select *
    into v_reflection
    from public.ema_reflection_sessions
   where flow_id = p_flow_id;

  if v_reflection.flow_id is null then
    raise exception 'EMA reflection session not found';
  end if;

  select status
    into v_status
    from public.activity_flows
   where flow_id = v_reflection.flow_id
     and user_id = v_reflection.user_id;

  select jsonb_build_object(
    'prompt_template_id', ai.prompt_template_id,
    'characteristic_1', ai.characteristic_1,
    'characteristic_2', ai.characteristic_2,
    'characteristic_3', ai.characteristic_3,
    'ai_comment', ai.ai_comment,
    'generated_at', ai.generated_at
  )
  into v_analysis
  from public.ema_ai_results ai
  where ai.flow_id = v_reflection.source_ema_flow_id
    and ai.user_id = v_reflection.user_id;

  return jsonb_build_object(
    'user_id', v_reflection.user_id,
    'flow_id', v_reflection.flow_id,
    'status', v_status,
    'source_ema_flow_id', v_reflection.source_ema_flow_id,
    'ema_context', public.get_ema_llm_context(v_reflection.source_ema_flow_id),
    'ema_analysis', v_analysis,
    'reflection_prompt_template_id', v_reflection.prompt_template_id,
    'reflection_question', v_reflection.reflection_question,
    'reflection_response', v_reflection.user_response,
    'question_generated_at', v_reflection.question_generated_at,
    'submitted_at', v_reflection.submitted_at
  );
end;
$$;

-- ------------------------------------------------------------
-- EMI data
-- Five generated questions are stored; two selected indices and one
-- combined answer are stored in the same row.
-- ------------------------------------------------------------

create table if not exists public.gestalt_types (
  gestalt_type_id smallint primary key check (gestalt_type_id between 1 and 6),
  gestalt_key text not null unique,
  gestalt_name text not null unique
);

insert into public.gestalt_types (gestalt_type_id, gestalt_key, gestalt_name)
values
  (1, 'retroflection', '반전'),
  (2, 'projection', '투사'),
  (3, 'introjection', '내사'),
  (4, 'deflection', '편향'),
  (5, 'egotism', '자의식'),
  (6, 'confluence', '융합')
on conflict (gestalt_type_id) do update
set gestalt_key = excluded.gestalt_key,
    gestalt_name = excluded.gestalt_name;

create table if not exists public.emi_sessions (
  flow_id uuid primary key,
  user_id uuid not null,
  source_ema_flow_id uuid not null,
  source_reflection_flow_id uuid not null unique,
  gestalt_type_ids smallint[] not null
    check (public.valid_gestalt_ids(gestalt_type_ids)),
  question_prompt_template_id bigint
    references public.llm_prompt_templates(prompt_template_id) on delete restrict,
  question_1 text,
  question_2 text,
  question_3 text,
  question_4 text,
  question_5 text,
  selected_question_1_no smallint
    check (selected_question_1_no between 1 and 5),
  selected_question_2_no smallint not null default 0
    check (selected_question_2_no between 0 and 5),
  combined_response text,
  questions_generated_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, user_id),
  foreign key (flow_id, user_id)
    references public.activity_flows(flow_id, user_id) on delete restrict,
  foreign key (source_ema_flow_id, user_id)
    references public.ema_sessions(flow_id, user_id) on delete restrict,
  foreign key (source_reflection_flow_id, user_id, source_ema_flow_id)
    references public.ema_reflection_sessions(flow_id, user_id, source_ema_flow_id) on delete restrict,
  constraint emi_selected_questions_distinct_ck check (
    selected_question_2_no = 0
    or selected_question_1_no is null
    or selected_question_1_no <> selected_question_2_no
  ),
  constraint emi_questions_all_or_none_ck check (
    (
      question_1 is null and question_2 is null and question_3 is null
      and question_4 is null and question_5 is null
      and questions_generated_at is null
      and question_prompt_template_id is null
    )
    or
    (
      question_1 is not null and question_2 is not null and question_3 is not null
      and question_4 is not null and question_5 is not null
      and questions_generated_at is not null
      and question_prompt_template_id is not null
    )
  )
);

drop trigger if exists emi_sessions_set_updated_at on public.emi_sessions;
create trigger emi_sessions_set_updated_at
before update on public.emi_sessions
for each row execute function public.set_updated_at();

drop trigger if exists emi_sessions_guard on public.emi_sessions;
create trigger emi_sessions_guard
before update or delete on public.emi_sessions
for each row execute function public.guard_emi_editable_row();


create or replace function public.start_emi_flow(
  p_user_id uuid,
  p_source_reflection_flow_id uuid,
  p_gestalt_type_ids smallint[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow_id uuid;
  v_source_ema_flow_id uuid;
begin
  if not public.valid_gestalt_ids(p_gestalt_type_ids) then
    raise exception 'one to six distinct Gestalt type IDs are required';
  end if;

  select r.source_ema_flow_id
    into v_source_ema_flow_id
    from public.ema_reflection_sessions r
    join public.activity_flows f
      on f.flow_id = r.flow_id
     and f.user_id = r.user_id
   where r.flow_id = p_source_reflection_flow_id
     and r.user_id = p_user_id
     and f.part_type = 'ema_reflection'
     and f.status = 'completed'
     and nullif(btrim(r.user_response), '') is not null;

  if v_source_ema_flow_id is null then
    raise exception 'completed EMA reflection response is required';
  end if;

  if exists (
    select 1
    from public.emi_sessions
    where source_reflection_flow_id = p_source_reflection_flow_id
  ) then
    raise exception 'EMI flow already exists for this EMA reflection';
  end if;

  insert into public.activity_flows (
    user_id, part_type, parent_flow_id
  )
  values (
    p_user_id, 'emi', p_source_reflection_flow_id
  )
  returning flow_id into v_flow_id;

  insert into public.emi_sessions (
    flow_id,
    user_id,
    source_ema_flow_id,
    source_reflection_flow_id,
    gestalt_type_ids
  )
  values (
    v_flow_id,
    p_user_id,
    v_source_ema_flow_id,
    p_source_reflection_flow_id,
    p_gestalt_type_ids
  );

  return v_flow_id;
end;
$$;


-- ------------------------------------------------------------
-- EMI LLM context builder
-- Defined after gestalt_types and emi_sessions because it uses
-- public.emi_sessions%rowtype.
-- ------------------------------------------------------------

create or replace function public.get_emi_llm_context(p_flow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emi public.emi_sessions%rowtype;
  v_gestalt jsonb;
  v_selected_q1 text;
  v_selected_q2 text;
begin
  select * into v_emi
  from public.emi_sessions
  where flow_id = p_flow_id;

  if v_emi.flow_id is null then
    raise exception 'EMI session not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'gestalt_type_id', g.gestalt_type_id,
        'gestalt_key', g.gestalt_key,
        'gestalt_name', g.gestalt_name
      )
      order by g.gestalt_type_id
    ),
    '[]'::jsonb
  )
  into v_gestalt
  from public.gestalt_types g
  where g.gestalt_type_id = any(v_emi.gestalt_type_ids);

  v_selected_q1 := case v_emi.selected_question_1_no
    when 1 then v_emi.question_1
    when 2 then v_emi.question_2
    when 3 then v_emi.question_3
    when 4 then v_emi.question_4
    when 5 then v_emi.question_5
    else null
  end;

  v_selected_q2 := case v_emi.selected_question_2_no
    when 0 then '선택 안함'
    when 1 then v_emi.question_1
    when 2 then v_emi.question_2
    when 3 then v_emi.question_3
    when 4 then v_emi.question_4
    when 5 then v_emi.question_5
    else null
  end;

  return jsonb_build_object(
    'user_id', v_emi.user_id,
    'flow_id', v_emi.flow_id,
    'source_ema_flow_id', v_emi.source_ema_flow_id,
    'source_reflection_flow_id', v_emi.source_reflection_flow_id,
    'ema_context', public.get_ema_llm_context(v_emi.source_ema_flow_id),
    'reflection_context', public.get_ema_reflection_llm_context(v_emi.source_reflection_flow_id),
    'gestalt_types', v_gestalt,
    'questions', jsonb_build_array(
      v_emi.question_1,
      v_emi.question_2,
      v_emi.question_3,
      v_emi.question_4,
      v_emi.question_5
    ),
    'selected_question_1_no', v_emi.selected_question_1_no,
    'selected_question_2_no', v_emi.selected_question_2_no,
    'selected_question_1', v_selected_q1,
    'selected_question_2', v_selected_q2,
    'combined_response', v_emi.combined_response
  );
end;
$$;

create table if not exists public.emi_ai_results (
  flow_id uuid primary key,
  user_id uuid not null,
  prompt_template_id bigint not null
    references public.llm_prompt_templates(prompt_template_id) on delete restrict,
  ai_comment text not null,
  generated_at timestamptz not null default now(),
  unique (flow_id, user_id),
  foreign key (flow_id, user_id)
    references public.emi_sessions(flow_id, user_id) on delete restrict
);

drop trigger if exists emi_ai_results_immutable on public.emi_ai_results;
create trigger emi_ai_results_immutable
before update or delete on public.emi_ai_results
for each row execute function public.block_update_or_delete();

create or replace function public.save_emi_questions(
  p_flow_id uuid,
  p_prompt_template_id bigint,
  p_question_1 text,
  p_question_2 text,
  p_question_3 text,
  p_question_4 text,
  p_question_5 text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'emi'
   for update;

  if v_flow.status <> 'draft' then
    raise exception 'EMI questions can be generated only once from draft status';
  end if;

  if not exists (
    select 1 from public.emi_sessions
    where flow_id = p_flow_id
      and user_id = v_flow.user_id
  ) then
    raise exception 'EMI session row is missing';
  end if;

  if not exists (
    select 1
    from public.emi_sessions i
    join public.activity_flows ef
      on ef.flow_id = i.source_ema_flow_id
     and ef.user_id = i.user_id
    where i.flow_id = p_flow_id
      and ef.part_type = 'ema'
      and ef.status = 'completed'
  ) then
    raise exception 'source EMA flow must be completed';
  end if;


  if not exists (
    select 1
    from public.emi_sessions i
    join public.ema_reflection_sessions r
      on r.flow_id = i.source_reflection_flow_id
     and r.user_id = i.user_id
     and r.source_ema_flow_id = i.source_ema_flow_id
    join public.activity_flows rf
      on rf.flow_id = r.flow_id
     and rf.user_id = r.user_id
    where i.flow_id = p_flow_id
      and rf.part_type = 'ema_reflection'
      and rf.status = 'completed'
      and nullif(btrim(r.user_response), '') is not null
  ) then
    raise exception 'completed EMA reflection response is required before EMI questions';
  end if;

  if not exists (
    select 1 from public.llm_prompt_templates
    where prompt_template_id = p_prompt_template_id
      and prompt_type = 'emi_question_generation'
      and active
  ) then
    raise exception 'invalid EMI question prompt template';
  end if;

  if nullif(btrim(p_question_1), '') is null
     or nullif(btrim(p_question_2), '') is null
     or nullif(btrim(p_question_3), '') is null
     or nullif(btrim(p_question_4), '') is null
     or nullif(btrim(p_question_5), '') is null then
    raise exception 'all five generated questions are required';
  end if;

  update public.emi_sessions
     set question_prompt_template_id = p_prompt_template_id,
         question_1 = p_question_1,
         question_2 = p_question_2,
         question_3 = p_question_3,
         question_4 = p_question_4,
         question_5 = p_question_5,
         questions_generated_at = now()
   where flow_id = p_flow_id;

  update public.activity_flows
     set status = 'questions_ready'
   where flow_id = p_flow_id;
end;
$$;

create or replace function public.save_emi_response(
  p_flow_id uuid,
  p_selected_question_1_no smallint,
  p_selected_question_2_no smallint,
  p_combined_response text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'emi'
   for update;

  if v_flow.flow_id is null then
    raise exception 'EMI flow not found';
  end if;

  if v_flow.status <> 'questions_ready' then
    raise exception 'EMI response can be saved only after questions are generated';
  end if;

  if p_selected_question_1_no is not null
     and p_selected_question_1_no not between 1 and 5 then
    raise exception 'selected question 1 must be between 1 and 5';
  end if;

  if coalesce(p_selected_question_2_no, 0) not between 0 and 5 then
    raise exception 'selected question 2 must be between 0 and 5';
  end if;

  if p_selected_question_1_no is not null
     and coalesce(p_selected_question_2_no, 0) <> 0
     and p_selected_question_1_no = p_selected_question_2_no then
    raise exception 'two different EMI questions must be selected';
  end if;

  update public.emi_sessions
     set selected_question_1_no = p_selected_question_1_no,
         selected_question_2_no = coalesce(p_selected_question_2_no, 0),
         combined_response = coalesce(p_combined_response, '')
   where flow_id = p_flow_id
     and user_id = v_flow.user_id;

  if not found then
    raise exception 'EMI session row is missing';
  end if;
end;
$$;

create or replace function public.submit_emi(p_flow_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
  v_emi public.emi_sessions%rowtype;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'emi'
   for update;

  if v_flow.status <> 'questions_ready' then
    raise exception 'EMI can be submitted only after questions are generated';
  end if;

  select *
    into v_emi
    from public.emi_sessions
   where flow_id = p_flow_id
     and user_id = v_flow.user_id;

  if v_emi.flow_id is null then
    raise exception 'EMI session row is missing';
  end if;

  if v_emi.selected_question_1_no is null
     or v_emi.selected_question_1_no not between 1 and 5
     or v_emi.selected_question_2_no not between 0 and 5
     or (
       v_emi.selected_question_2_no <> 0
       and v_emi.selected_question_1_no = v_emi.selected_question_2_no
     ) then
    raise exception 'one or two distinct question numbers must be selected';
  end if;

  if nullif(btrim(v_emi.combined_response), '') is null then
    raise exception 'combined EMI response is required';
  end if;

  update public.emi_sessions
     set submitted_at = now()
   where flow_id = p_flow_id;

  update public.activity_flows
     set status = 'processing'
   where flow_id = p_flow_id;
end;
$$;

create or replace function public.save_emi_ai_result(
  p_flow_id uuid,
  p_prompt_template_id bigint,
  p_ai_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.activity_flows%rowtype;
begin
  select *
    into v_flow
    from public.activity_flows
   where flow_id = p_flow_id
     and part_type = 'emi'
   for update;

  if v_flow.status <> 'processing' then
    raise exception 'EMI flow is not awaiting an AI result';
  end if;

  if exists (select 1 from public.emi_ai_results where flow_id = p_flow_id) then
    raise exception 'EMI AI result already exists';
  end if;

  if not exists (
    select 1 from public.llm_prompt_templates
    where prompt_template_id = p_prompt_template_id
      and prompt_type = 'emi_response_comment'
      and active
  ) then
    raise exception 'invalid EMI comment prompt template';
  end if;

  insert into public.emi_ai_results (
    flow_id, user_id, prompt_template_id, ai_comment
  )
  values (
    p_flow_id, v_flow.user_id, p_prompt_template_id, p_ai_comment
  );

  update public.activity_flows
     set status = 'completed'
   where flow_id = p_flow_id;
end;
$$;


-- ------------------------------------------------------------
-- Administrator-friendly wide EMA export
-- The view remains subject to underlying RLS because security_invoker=true.
-- ------------------------------------------------------------

create or replace view public.v_ema_export
with (security_invoker = true)
as
select
  p.user_id,
  p.user_no,
  ('U' || lpad(p.user_no::text, 8, '0')) as user_code,
  p.email,
  p.gender_code,
  p.nickname,
  p.birth_date,
  p.education_code,
  e.flow_id,
  f.flow_no,
  f.started_at,
  f.submitted_at,
  f.completed_at,
  e.instrument_version_id,
  ec.category_name as emotion_category,
  em.emotion_details_json,
  e.q001,
  e.q002,
  e.q003,
  e.q004,
  e.q005,
  e.q006,
  e.q007,
  e.q008,
  e.q009,
  e.q010,
  e.q011,
  e.q012,
  e.q013,
  e.q014,
  e.q015,
  e.q016,
  e.q017,
  e.q018,
  e.q019,
  e.q020,
  e.q021,
  e.q022,
  e.q023,
  e.q024,
  e.q025,
  e.q026,
  e.q027,
  e.q028,
  e.q029,
  e.q030,
  e.q031,
  e.q032,
  e.q033,
  e.q034,
  e.q035,
  e.q036,
  e.q037,
  e.q038,
  e.q039,
  e.q040,
  e.q041,
  e.q042,
  e.q043,
  e.q044,
  e.q045,
  e.q046,
  e.q047,
  e.q048,
  e.q049,
  e.q050,
  e.q051,
  e.q052,
  e.q053,
  e.q054,
  e.q055,
  e.q056,
  e.q057,
  e.q058,
  e.q059,
  e.q060,
  e.q061,
  e.q062,
  e.q063,
  e.q064,
  e.q065,
  e.q066,
  e.q067,
  e.q068,
  e.q069,
  e.q070,
  e.q071,
  e.q072,
  e.q073,
  e.q074,
  e.q075,
  e.q076,
  e.q077,
  e.q078,
  e.q079,
  e.q080,
  e.q081,
  e.q082,
  e.q083,
  e.q084,
  e.q085,
  e.q086,
  e.q087,
  e.q088,
  e.q089,
  e.q090,
  e.q091,
  e.q092,
  e.q093,
  e.q094,
  e.q095,
  e.q096,
  e.q097,
  e.q098,
  e.q099,
  e.q100,
  s.scoring_version_id,
  s.scale01,
  s.scale02,
  s.scale03,
  s.scale04,
  s.scale05,
  s.scale06,
  s.scale07,
  s.scale08,
  s.scale09,
  s.scale10,
  s.scale11,
  s.scale12,
  s.scale13,
  s.scale14,
  s.scale15,
  s.scale16,
  s.scale17,
  s.scale18,
  s.scale19,
  s.scale20,
  c.algorithm_version_id,
  c.type_id,
  ct.node_code,
  ct.internal_type_name,
  ct.character_name,
  ai.characteristic_1,
  ai.characteristic_2,
  ai.characteristic_3,
  ai.ai_comment,
  r.flow_id as reflection_flow_id,
  r.reflection_question,
  r.user_response as reflection_response,
  r.question_generated_at as reflection_question_generated_at,
  r.submitted_at as reflection_submitted_at
from public.ema_sessions e
join public.activity_flows f
  on f.flow_id = e.flow_id
join public.profiles p
  on p.user_id = e.user_id
join public.emotion_categories ec
  on ec.emotion_category_id = e.emotion_category_id
left join lateral (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'detail_id', ed.emotion_detail_id,
        'detail_key', ed.detail_key,
        'detail_name', ed.detail_name,
        'selection_order', ese.selection_order
      )
      order by ese.selection_order
    ),
    '[]'::jsonb
  ) as emotion_details_json
  from public.ema_session_emotions ese
  join public.emotion_details ed
    on ed.emotion_detail_id = ese.emotion_detail_id
  where ese.flow_id = e.flow_id
) em on true
left join public.ema_scale_scores s
  on s.flow_id = e.flow_id
left join public.ema_classifications c
  on c.flow_id = e.flow_id
left join public.classification_types ct
  on ct.type_id = c.type_id
left join public.ema_ai_results ai
  on ai.flow_id = e.flow_id
left join public.ema_reflection_sessions r
  on r.source_ema_flow_id = e.flow_id
 and r.user_id = e.user_id;


-- ------------------------------------------------------------
-- Supabase Storage bucket for public character images
-- Upload files to the paths stored in classification_types.image_path.
-- ------------------------------------------------------------

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'character-images',
  'character-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ------------------------------------------------------------
-- Row Level Security
-- Users receive no direct table write permission.
-- Authenticated administrators receive SELECT-only access.
-- Edge Functions should write with the service_role key.
-- ------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant select on public.v_ema_export to authenticated;

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists admin_read on public.%I', r.tablename);
    execute format(
      'create policy admin_read on public.%I for select to authenticated using (public.is_app_admin(auth.uid()))',
      r.tablename
    );
  end loop;
end
$$;

-- Functions exposed only to server-side service_role, except is_app_admin used by RLS.
revoke all on function public.complete_registration(uuid, text, date, smallint, text, text)
  from public, anon, authenticated;
revoke all on function public.grant_app_admin_by_email(text, text)
  from public, anon, authenticated;
revoke all on function public.start_activity_flow(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_baseline(uuid)
  from public, anon, authenticated;
revoke all on function public.save_weekly_feedback(uuid, date, smallint, text)
  from public, anon, authenticated;
revoke all on function public.submit_ema(uuid)
  from public, anon, authenticated;
revoke all on function public.save_ema_ai_result(uuid, bigint, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_ema_llm_context(uuid)
  from public, anon, authenticated;
revoke all on function public.start_ema_reflection_flow(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.save_ema_reflection_response(uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_ema_reflection_question(uuid, bigint, text)
  from public, anon, authenticated;
revoke all on function public.submit_ema_reflection(uuid)
  from public, anon, authenticated;
revoke all on function public.get_ema_reflection_llm_context(uuid)
  from public, anon, authenticated;
revoke all on function public.start_emi_flow(uuid, uuid, smallint[])
  from public, anon, authenticated;
revoke all on function public.get_emi_llm_context(uuid)
  from public, anon, authenticated;
revoke all on function public.save_emi_questions(uuid, bigint, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.save_emi_response(uuid, smallint, smallint, text)
  from public, anon, authenticated;
revoke all on function public.submit_emi(uuid)
  from public, anon, authenticated;
revoke all on function public.save_emi_ai_result(uuid, bigint, text)
  from public, anon, authenticated;

grant execute on function public.is_app_admin(uuid) to authenticated;
grant execute on function public.complete_registration(uuid, text, date, smallint, text, text) to service_role;
grant execute on function public.grant_app_admin_by_email(text, text) to service_role;
grant execute on function public.start_activity_flow(uuid, text, uuid) to service_role;
grant execute on function public.submit_baseline(uuid) to service_role;
grant execute on function public.save_weekly_feedback(uuid, date, smallint, text) to service_role;
grant execute on function public.submit_ema(uuid) to service_role;
grant execute on function public.save_ema_ai_result(uuid, bigint, text, text, text, text) to service_role;
grant execute on function public.get_ema_llm_context(uuid) to service_role;
grant execute on function public.start_ema_reflection_flow(uuid, uuid) to service_role;
grant execute on function public.save_ema_reflection_response(uuid, text) to service_role;
grant execute on function public.save_ema_reflection_question(uuid, bigint, text) to service_role;
grant execute on function public.submit_ema_reflection(uuid) to service_role;
grant execute on function public.get_ema_reflection_llm_context(uuid) to service_role;
grant execute on function public.start_emi_flow(uuid, uuid, smallint[]) to service_role;
grant execute on function public.get_emi_llm_context(uuid) to service_role;
grant execute on function public.save_emi_questions(uuid, bigint, text, text, text, text, text) to service_role;
grant execute on function public.save_emi_response(uuid, smallint, smallint, text) to service_role;
grant execute on function public.submit_emi(uuid) to service_role;
grant execute on function public.save_emi_ai_result(uuid, bigint, text) to service_role;

-- Future tables default to no direct write access.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

commit;

-- ============================================================
-- AFTER RUNNING THIS SCRIPT
-- 1) Create the actual Supabase Auth administrator user using
--    Authentication > Users or the server-side Admin API.
-- 2) Provide profile metadata: gender_code, nickname, birth_date, education_code.
-- 3) Assign the application admin role:
--
--    select public.grant_app_admin_by_email(
--      'YOUR_REAL_ADMIN_EMAIL',
--      'admin'
--    );
--
-- 4) Upload character images to:
--    character-images/types/type_01.png ... type_06.png
-- 5) Implement four server-side LLM operations in Edge Functions:
--    EMA interpretation -> EMA reflection question -> EMI questions -> EMI comment
-- ============================================================
