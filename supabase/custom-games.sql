-- ============================================================
-- IOgames カスタムゲームテーブル
-- Supabase Dashboard → SQL Editor に貼り付けて「RUN」
-- ============================================================

create table if not exists public.custom_games (
  id          bigserial    primary key,
  school_code text         not null,
  title       text         not null,
  subject     text,
  word_data   jsonb        not null,
  created_at  timestamptz  default now()
);

create index if not exists idx_custom_games_school
  on public.custom_games (school_code, created_at desc);

alter table public.custom_games enable row level security;

-- 誰でも読める（生徒がゲームデータを取得）
drop policy if exists "custom_games_select" on public.custom_games;
create policy "custom_games_select"
  on public.custom_games for select
  using (true);

-- 登録済み学校コードを持つユーザー（先生）または管理者が追加可能
drop policy if exists "custom_games_insert" on public.custom_games;
create policy "custom_games_insert"
  on public.custom_games for insert
  with check (
    exists (select 1 from public.schools where school_code = custom_games.school_code)
  );

-- 削除は管理者のみ
drop policy if exists "custom_games_delete" on public.custom_games;
create policy "custom_games_delete"
  on public.custom_games for delete
  using (auth.uid() is not null);
