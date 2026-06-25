-- ============================================================
-- IOgames Supabase セットアップSQL
-- Supabase Dashboard → SQL Editor に全文貼り付けて「RUN」
-- 何度実行しても安全（IF NOT EXISTS / DROP IF EXISTS 対応）
-- ============================================================

-- テーブル作成
CREATE TABLE IF NOT EXISTS global_rankings (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_key   TEXT NOT NULL,
  player     TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  date       TEXT,
  device_id  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS violations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT,
  game        TEXT,
  date        TIMESTAMPTZ,
  device_id   TEXT,
  device_info TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_applications (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_name   TEXT NOT NULL,
  prefecture    TEXT,
  subjects      TEXT[],
  contact_name  TEXT,
  email         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  assigned_code TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schools (
  school_code TEXT PRIMARY KEY,
  school_name TEXT NOT NULL,
  prefecture  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_private (
  school_code  TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  contact_name TEXT
);

-- Row Level Security 有効化
ALTER TABLE global_rankings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools             ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_private      ENABLE ROW LEVEL SECURITY;

-- global_rankings: 誰でも読み書きOK、削除は管理者のみ
DROP POLICY IF EXISTS "rankings_select" ON global_rankings;
DROP POLICY IF EXISTS "rankings_insert" ON global_rankings;
DROP POLICY IF EXISTS "rankings_delete" ON global_rankings;
CREATE POLICY "rankings_select" ON global_rankings FOR SELECT USING (true);
CREATE POLICY "rankings_insert" ON global_rankings FOR INSERT WITH CHECK (true);
CREATE POLICY "rankings_delete" ON global_rankings FOR DELETE USING (auth.role() = 'authenticated');

-- violations: 書き込みは誰でもOK、閲覧・削除は管理者のみ
DROP POLICY IF EXISTS "violations_insert" ON violations;
DROP POLICY IF EXISTS "violations_select" ON violations;
DROP POLICY IF EXISTS "violations_delete" ON violations;
CREATE POLICY "violations_insert" ON violations FOR INSERT WITH CHECK (true);
CREATE POLICY "violations_select" ON violations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "violations_delete" ON violations FOR DELETE USING (auth.role() = 'authenticated');

-- school_applications: 書き込みは誰でも・閲覧/更新/削除は管理者のみ
DROP POLICY IF EXISTS "applications_insert" ON school_applications;
DROP POLICY IF EXISTS "applications_select" ON school_applications;
DROP POLICY IF EXISTS "applications_update" ON school_applications;
DROP POLICY IF EXISTS "applications_delete" ON school_applications;
CREATE POLICY "applications_insert" ON school_applications
  FOR INSERT WITH CHECK (school_name IS NOT NULL AND email IS NOT NULL AND status = 'pending');
CREATE POLICY "applications_select" ON school_applications FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "applications_update" ON school_applications FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "applications_delete" ON school_applications FOR DELETE USING (auth.role() = 'authenticated');

-- schools: 誰でも読める・書き込みは管理者のみ
DROP POLICY IF EXISTS "schools_select" ON schools;
DROP POLICY IF EXISTS "schools_insert" ON schools;
DROP POLICY IF EXISTS "schools_update" ON schools;
DROP POLICY IF EXISTS "schools_delete" ON schools;
CREATE POLICY "schools_select" ON schools FOR SELECT USING (true);
CREATE POLICY "schools_insert" ON schools FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "schools_update" ON schools FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "schools_delete" ON schools FOR DELETE USING (auth.role() = 'authenticated');

-- school_private: 管理者のみ
DROP POLICY IF EXISTS "private_all" ON school_private;
CREATE POLICY "private_all" ON school_private FOR ALL USING (auth.role() = 'authenticated');
