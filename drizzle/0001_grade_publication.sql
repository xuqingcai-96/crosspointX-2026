ALTER TABLE submissions ADD COLUMN grade_published_at TEXT;
ALTER TABLE submissions ADD COLUMN grade_release_required INTEGER NOT NULL DEFAULT 0;
CREATE TABLE grade_publications (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  published_at TEXT NOT NULL
);
