-- Single source of truth: extensions used by the database.
-- Safe to re-run.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

