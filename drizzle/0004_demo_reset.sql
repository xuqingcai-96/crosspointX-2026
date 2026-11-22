CREATE TABLE demo_reset_snapshots (
  generation INTEGER PRIMARY KEY AUTOINCREMENT,
  classroom_id TEXT NOT NULL REFERENCES classrooms(id),
  previous_generation INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(classroom_id, previous_generation)
);
