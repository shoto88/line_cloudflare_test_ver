CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number INTEGER NOT NULL UNIQUE,
  line_user_id TEXT NOT NULL,
  line_display_name TEXT,
  ticket_time TIMESTAMP NOT NULL,
  notified BOOLEAN DEFAULT FALSE
);