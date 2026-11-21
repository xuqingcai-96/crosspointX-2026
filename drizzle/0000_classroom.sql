CREATE TABLE classrooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  course_name TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  teacher_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL REFERENCES classrooms(id),
  name TEXT NOT NULL,
  student_number TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(classroom_id, student_number)
);
CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL REFERENCES classrooms(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  preset TEXT NOT NULL,
  file_prefix TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','published','closed')),
  due_at TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX assignments_classroom ON assignments(classroom_id, created_at);
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  version INTEGER NOT NULL,
  nonce TEXT NOT NULL,
  code TEXT NOT NULL,
  filename TEXT NOT NULL,
  note TEXT NOT NULL,
  evaluation_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','verified','returned')),
  score INTEGER,
  feedback TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(assignment_id, student_id, version),
  UNIQUE(student_id, nonce)
);
CREATE INDEX submissions_assignment ON submissions(assignment_id, submitted_at);
CREATE TABLE review_events (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  decision TEXT NOT NULL,
  score INTEGER,
  feedback TEXT NOT NULL,
  created_at TEXT NOT NULL
);
