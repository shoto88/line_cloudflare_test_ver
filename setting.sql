CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auto_mode INTEGER DEFAULT 0,
  manual_mode INTEGER DEFAULT 0
);

-- 初期値を挿入 (自動モード: オフ, 手動モード: オフ)
INSERT INTO settings (auto_mode, manual_mode) VALUES (0, 0);