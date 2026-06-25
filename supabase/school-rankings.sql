-- ============================================================
-- IOgames 学校ランキングテーブル
-- Supabase Dashboard → SQL Editor に貼り付けて「RUN」
--
-- 実行タイミング: 学校コードシステムを有効化する前に1回だけ実行してください。
-- ============================================================

-- 学校別ランキング（学校コードでフィルタされる）
create table if not exists public.school_rankings (
  id          bigserial    primary key,
  school_code text         not null,
  game_key    text         not null,
  date        text,
  player      text,
  score       integer,
  device_id   text,
  created_at  timestamptz  default now()
);

-- インデックス（検索を高速化）
create index if not exists idx_school_rankings_lookup
  on public.school_rankings (school_code, game_key, score desc);

-- RLS を有効化
alter table public.school_rankings enable row level security;

-- 誰でもスコアを登録できる（生徒がゲーム中に保存）
create policy "school_rankings_insert"
  on public.school_rankings for insert
  with check (true);

-- 誰でもランキングを読める（同じ学校の生徒が閲覧）
create policy "school_rankings_select"
  on public.school_rankings for select
  using (true);
