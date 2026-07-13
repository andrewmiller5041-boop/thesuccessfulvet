-- The Successful Vet — Mock Interview backend schema
-- Run this in the Supabase SQL editor once, against a fresh project.
-- Requires: Supabase Auth already enabled (auth.users table exists by default).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- users: one row per authenticated person, mirrors auth.users, adds
-- the Stripe customer id we need for billing.
-- ---------------------------------------------------------------------
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  stripe_customer_id text unique,
  free_resume_credits_used int not null default 0,
  created_at timestamptz default now()
);

-- Safe to re-run: if this schema was already deployed before the free
-- tier existed, `create table if not exists` above won't add the new
-- column to an existing table. This does it explicitly, and does
-- nothing if the column is already there.
alter table users add column if not exists free_resume_credits_used int not null default 0;

-- ---------------------------------------------------------------------
-- subscriptions: current + historical Stripe subscription state.
-- We keep history (don't delete rows) and always read the most recent
-- active one for access checks.
-- ---------------------------------------------------------------------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  plan text not null,               -- 'starter' | 'pro'
  status text not null,             -- 'active' | 'past_due' | 'canceled' | 'incomplete' | ...
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_user_status
  on subscriptions (user_id, status);

-- ---------------------------------------------------------------------
-- interview_sessions: one row per mock interview session.
-- transcript is only populated if the user opts in (save_transcript).
-- final_summary is always saved on completion — it's the useful
-- progress-tracking artifact, and far less sensitive than raw answers.
-- ---------------------------------------------------------------------
create table if not exists interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  track text not null,              -- 'veteran' | 'spouse'
  role text,
  company text,
  question_count int not null,
  status text not null default 'in_progress', -- 'in_progress' | 'completed' | 'abandoned'
  save_transcript boolean not null default false,
  transcript jsonb,
  final_summary jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_sessions_user
  on interview_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------
-- usage_counters: monthly session counts per user, used to enforce
-- plan limits without recounting interview_sessions on every request.
-- ---------------------------------------------------------------------
create table if not exists usage_counters (
  user_id uuid references users(id) on delete cascade,
  period_month date not null,       -- always the 1st of the month, UTC
  sessions_used int not null default 0,
  primary key (user_id, period_month)
);

-- ---------------------------------------------------------------------
-- resume_sessions: lightweight log of resume-tailoring runs.
-- Deliberately does NOT store the source resume text or the tailored
-- output — only metadata and the short change_summary — since resumes
-- contain far more personal identifying information than an interview
-- transcript, and there's no product need to retain the full document
-- server-side. The Word doc is generated and returned directly to the
-- browser; it isn't persisted here.
-- ---------------------------------------------------------------------
create table if not exists resume_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  track text not null,               -- 'veteran' | 'spouse'
  target_role text,
  target_company text,
  change_summary jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_resume_sessions_user
  on resume_sessions (user_id, created_at desc);

alter table resume_sessions enable row level security;

create policy "users can read own resume sessions" on resume_sessions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- Our serverless functions use the Supabase service-role key, which
-- bypasses RLS entirely — these policies protect against the case
-- where a Supabase client is ever used directly from the browser
-- with a user's own JWT (e.g. if the history view is fetched
-- client-side against Supabase instead of through /api/interview/history).
-- ---------------------------------------------------------------------
alter table users enable row level security;
alter table subscriptions enable row level security;
alter table interview_sessions enable row level security;
alter table usage_counters enable row level security;

create policy "users can read own row" on users
  for select using (auth.uid() = id);

create policy "users can read own subscriptions" on subscriptions
  for select using (auth.uid() = user_id);

create policy "users can read own sessions" on interview_sessions
  for select using (auth.uid() = user_id);

create policy "users can read own usage" on usage_counters
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies are defined for authenticated users
-- on purpose — all writes go through the service role in our API
-- functions, never directly from the browser.
