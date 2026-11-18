-- ==============================================================================
-- SASANA ERP - CLOUDFLARE D1 SAFE MIGRATION & 100-YEAR OPTIMIZATION SCHEMA
-- File: cashbook-api/schema_upgrade.sql
-- Safe to run on existing production D1 database (Zero data loss, Idempotent)
-- Note: Do NOT add BEGIN TRANSACTION / COMMIT / PRAGMA for Cloudflare D1.
-- ==============================================================================

-- ==============================================================================
-- 1. COMPOSITE INDEXES FOR ALL 13 EXISTING TABLES (Full Table Scan ကာကွယ်ရန်)
-- ==============================================================================

-- Bank Group (3 Books)
CREATE INDEX IF NOT EXISTS "idx_1cb_date_id"    ON "1CB Bank (General)" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_1cb_updated"    ON "1CB Bank (General)" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_2cb_date_id"    ON "2CB Bank (Meal)" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_2cb_updated"    ON "2CB Bank (Meal)" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_3cb_date_id"    ON "3CB Bank (UZ)" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_3cb_updated"    ON "3CB Bank (UZ)" (updated_at);

-- Ledger Group (7 Books)
CREATE INDEX IF NOT EXISTS "idx_4gb_date_id"    ON "1General Book" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_4gb_updated"    ON "1General Book" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_5fb_date_id"    ON "2Meal Book" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_5fb_updated"    ON "2Meal Book" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_6hb_date_id"    ON "3Hall Book" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_6hb_updated"    ON "3Hall Book" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_7pb_date_id"    ON "4Pagoda Book" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_7pb_updated"    ON "4Pagoda Book" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_8eb_date_id"    ON "5Electronic Book" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_8eb_updated"    ON "5Electronic Book" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_9mb_date_id"    ON "6Medical Book" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_9mb_updated"    ON "6Medical Book" (updated_at);

CREATE INDEX IF NOT EXISTS "idx_10gb_date_id"   ON "7Other Book" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_10gb_updated"   ON "7Other Book" (updated_at);

-- Inventory
CREATE INDEX IF NOT EXISTS "idx_inv_date_id"    ON "Inventory" (date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_inv_updated"    ON "Inventory" (updated_at);

-- Yogi Group (2 Books)
CREATE INDEX IF NOT EXISTS "idx_pyogi_start_id" ON "Permanent Yogi" (start_date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_pyogi_end_date" ON "Permanent Yogi" (end_date);

CREATE INDEX IF NOT EXISTS "idx_cyogi_start_id" ON "Camp Yogi" (start_date ASC, id ASC);
CREATE INDEX IF NOT EXISTS "idx_cyogi_end_date" ON "Camp Yogi" (end_date);

-- ==============================================================================
-- 2. PRO CACHE & SUMMARY TABLES (Read 99% လျှော့ချရန်)
-- ==============================================================================

-- 2.1 Book Versions Table (စာအုပ်တစ်အုပ်ချင်းစီ ပြောင်းလဲမှု ရှိ/မရှိ စစ်ဆေးရန် - 13 rows max)
CREATE TABLE IF NOT EXISTS "book_versions" (
  table_name TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  row_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2.2 Monthly Ledger Summary Table (Home Dashboard & Annual Report အတွက်)
CREATE TABLE IF NOT EXISTS "ledger_summary" (
  book_name TEXT NOT NULL,
  ym TEXT NOT NULL,
  receiver TEXT NOT NULL,
  title TEXT NOT NULL,
  sub_title TEXT NOT NULL,
  total_income REAL NOT NULL DEFAULT 0,
  total_expense REAL NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (book_name, ym, receiver, title, sub_title)
);

CREATE INDEX IF NOT EXISTS "idx_ledger_summary_book_ym" ON "ledger_summary" (book_name, ym);

-- 2.3 Audit Logs Table (Pro App ပြင်ဆင်/ဖျက်သိမ်း မှတ်တမ်း)
CREATE TABLE IF NOT EXISTS "audit_logs" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_uid TEXT,
  summary TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_created" ON "audit_logs" (created_at DESC, id DESC);

-- ==============================================================================
-- 3. BACKFILL "ledger_summary" FROM EXISTING DATA (လက်ရှိစာရင်းများအား ပေါင်းချုပ်သိမ်းခြင်း)
-- ==============================================================================
DELETE FROM "ledger_summary";

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '1CB Bank (General)',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'Bank'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "1CB Bank (General)"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'Bank'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '2CB Bank (Meal)',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'Bank'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "2CB Bank (Meal)"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'Bank'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '3CB Bank (UZ)',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'Bank'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "3CB Bank (UZ)"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'Bank'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '1General Book',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "1General Book"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '2Meal Book',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "2Meal Book"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '3Hall Book',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "3Hall Book"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '4Pagoda Book',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "4Pagoda Book"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '5Electronic Book',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "5Electronic Book"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '6Medical Book',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "6Medical Book"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

INSERT INTO "ledger_summary" (book_name, ym, receiver, title, sub_title, total_income, total_expense, row_count)
SELECT
  '7Other Book',
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), ''),
  COALESCE(SUM(COALESCE(income, 0)), 0),
  COALESCE(SUM(COALESCE(expense, 0)), 0),
  COUNT(*)
FROM "7Other Book"
GROUP BY
  COALESCE(NULLIF(TRIM(substr(date, 1, 7)), ''), '0000-00'),
  COALESCE(NULLIF(TRIM(receiver), ''), 'User 1'),
  COALESCE(TRIM(title), ''),
  COALESCE(TRIM(sub_title), '');

-- ==============================================================================
-- 4. SEED / SYNC "book_versions" FOR ALL 13 TABLES
-- ==============================================================================
INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('1CB Bank (General)', 1, (SELECT COUNT(*) FROM "1CB Bank (General)"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('2CB Bank (Meal)', 1, (SELECT COUNT(*) FROM "2CB Bank (Meal)"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('3CB Bank (UZ)', 1, (SELECT COUNT(*) FROM "3CB Bank (UZ)"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('1General Book', 1, (SELECT COUNT(*) FROM "1General Book"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('2Meal Book', 1, (SELECT COUNT(*) FROM "2Meal Book"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('3Hall Book', 1, (SELECT COUNT(*) FROM "3Hall Book"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('4Pagoda Book', 1, (SELECT COUNT(*) FROM "4Pagoda Book"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('5Electronic Book', 1, (SELECT COUNT(*) FROM "5Electronic Book"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('6Medical Book', 1, (SELECT COUNT(*) FROM "6Medical Book"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('7Other Book', 1, (SELECT COUNT(*) FROM "7Other Book"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('Inventory', 1, (SELECT COUNT(*) FROM "Inventory"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('Permanent Yogi', 1, (SELECT COUNT(*) FROM "Permanent Yogi"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');

INSERT INTO "book_versions" (table_name, version, row_count, updated_at)
VALUES ('Camp Yogi', 1, (SELECT COUNT(*) FROM "Camp Yogi"), datetime('now'))
ON CONFLICT(table_name) DO UPDATE SET row_count = excluded.row_count, version = "book_versions".version + 1, updated_at = datetime('now');
