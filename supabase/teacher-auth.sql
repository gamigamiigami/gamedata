-- ============================================================
-- 先生パスワードハッシュテーブル
-- Supabase Dashboard → SQL Editor に貼り付けて「RUN」
-- ============================================================

create table if not exists public.teacher_auth (
  school_code   text         primary key,
  password_hash text         not null,
  updated_at    timestamptz  default now()
);

alter table public.teacher_auth enable row level security;

-- 誰でも読める（クライアント側でハッシュ比較）
drop policy if exists "teacher_auth_select" on public.teacher_auth;
create policy "teacher_auth_select"
  on public.teacher_auth for select
  using (true);

-- 認証済みユーザー（管理者）のみ書き込み可
drop policy if exists "teacher_auth_insert" on public.teacher_auth;
create policy "teacher_auth_insert"
  on public.teacher_auth for insert
  with check (auth.uid() is not null);

drop policy if exists "teacher_auth_update" on public.teacher_auth;
create policy "teacher_auth_update"
  on public.teacher_auth for update
  using (auth.uid() is not null);

drop policy if exists "teacher_auth_delete" on public.teacher_auth;
create policy "teacher_auth_delete"
  on public.teacher_auth for delete
  using (auth.uid() is not null);
