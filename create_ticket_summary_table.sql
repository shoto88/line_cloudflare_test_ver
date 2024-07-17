CREATE TABLE ticket_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  line_display_name TEXT,
  ticket_number INTEGER,
  ticket_time TEXT NOT NULL,
  ticket_date TEXT NOT NULL,
  UNIQUE(line_user_id, ticket_date)
);