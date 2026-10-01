-- ==============================================================================
-- SASANA ERP - CLOUDFLARE D1 DATABASE SCHEMA
-- ==============================================================================

-- 0. အသုံးပြုသူများ ဇယား (Users)
CREATE TABLE IF NOT EXISTS "users" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Viewer',
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ==============================================================================
-- BANK GROUP (ဘဏ်စာရင်း ၃ ခု)
-- ==============================================================================

-- 1. 1CB Bank (General)
CREATE TABLE IF NOT EXISTS "1CB Bank (General)" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '1CB Bank (General)',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. 2CB Bank (Meal)
CREATE TABLE IF NOT EXISTS "2CB Bank (Meal)" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '2CB Bank (Meal)',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 3. 3CB Bank (UZ)
CREATE TABLE IF NOT EXISTS "3CB Bank (UZ)" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '3CB Bank (UZ)',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==============================================================================
-- LEDGER GROUP (ပင်မစာအုပ် ၇ ခု)
-- ==============================================================================

-- 4. 1General Book
CREATE TABLE IF NOT EXISTS "1General Book" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '1General Book',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 5. 2Meal Book
CREATE TABLE IF NOT EXISTS "2Meal Book" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '2Meal Book',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 6. 3Hall Book
CREATE TABLE IF NOT EXISTS "3Hall Book" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '3Hall Book',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 7. 4Pagoda Book
CREATE TABLE IF NOT EXISTS "4Pagoda Book" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '4Pagoda Book',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 8. 5Electronic Book
CREATE TABLE IF NOT EXISTS "5Electronic Book" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '5Electronic Book',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 9. 6Medical Book
CREATE TABLE IF NOT EXISTS "6Medical Book" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '6Medical Book',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 10. 7Other Book
CREATE TABLE IF NOT EXISTS "7Other Book" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  title TEXT,
  sub_title TEXT,
  description TEXT NOT NULL,
  income REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  voucher_no TEXT,
  receiver TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT '7Other Book',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==============================================================================
-- INVENTORY (ပစ္စည်းစာရင်း)
-- ==============================================================================

-- 11. Inventory
CREATE TABLE IF NOT EXISTS "Inventory" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  date TEXT NOT NULL,
  location TEXT,
  category TEXT,
  description TEXT NOT NULL,
  unit TEXT,
  qty REAL DEFAULT 0,
  remark TEXT,
  month_year TEXT,
  book_name TEXT DEFAULT 'Inventory',
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==============================================================================
-- YOGI GROUP (ယောဂီစာရင်း ၂ ခု)
-- ==============================================================================

-- 12. Permanent Yogi
CREATE TABLE IF NOT EXISTS "Permanent Yogi" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  start_date TEXT,
  end_date TEXT,
  yogi_type TEXT DEFAULT 'အမြဲနေ',
  name TEXT NOT NULL,
  father_name TEXT,
  nrc TEXT,
  dob TEXT,
  age INTEGER,
  gender TEXT,
  yogi_phone TEXT,
  home_phone TEXT,
  address TEXT,
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 13. Camp Yogi
CREATE TABLE IF NOT EXISTS "Camp Yogi" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER,
  start_date TEXT,
  end_date TEXT,
  yogi_type TEXT DEFAULT 'စခန်းဝင်',
  name TEXT NOT NULL,
  father_name TEXT,
  nrc TEXT,
  dob TEXT,
  age INTEGER,
  gender TEXT,
  yogi_phone TEXT,
  home_phone TEXT,
  address TEXT,
  unique_id TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Default Users ထည့်သွင်းခြင်း
INSERT OR IGNORE INTO "users" (id, username, password_hash, role, name)
VALUES 
  (1, 'Admin', 'Admin123', 'Admin', 'စီမံအုပ်ချုပ်သူ'),
  (2, 'Finance', 'Finance123', 'Finance', 'ဘဏ္ဍာရေး'),
  (3, 'Account', 'account123', 'Account', 'ငွေစာရင်းကိုင်'),
  (4, 'Staff', 'Staff123', 'Staff', 'ရုံးအကူ'),
  (5, 'Viewer', 'Viewer123', 'Viewer', 'ကြည့်ရှုသူ');
