CREATE TABLE IF NOT EXISTS counter (
  name TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0 -- 初期値を0に設定
);

-- 初期データの挿入
INSERT OR IGNORE INTO counter (name, value) VALUES ('waiting', 0);
INSERT OR IGNORE INTO counter (name, value) VALUES ('treatment', 0);