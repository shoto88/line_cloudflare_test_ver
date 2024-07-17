CREATE TABLE follow (
  line_user_id TEXT PRIMARY KEY,
  line_display_name TEXT,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  examination_number INTEGER
);