-- Add lightweight onboarding fields to profiles.
-- Users complete onboarding once; fields are nullable until then.

alter table public.profiles
  add column if not exists primary_challenge text;

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

