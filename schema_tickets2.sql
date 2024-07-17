CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number INTEGER NOT NULL,
  line_user_id TEXT NOT NULL,
  line_display_name TEXT,
  ticket_time TEXT NOT NULL
);