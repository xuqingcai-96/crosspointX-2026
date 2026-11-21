CREATE TABLE peer_review_sets (
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  reviewer_id TEXT NOT NULL REFERENCES students(id),
  first_submission_id TEXT NOT NULL REFERENCES submissions(id),
  second_submission_id TEXT NOT NULL REFERENCES submissions(id),
  first_review TEXT,
  second_review TEXT,
  submitted_at TEXT,
  PRIMARY KEY (assignment_id, reviewer_id),
  CHECK (first_submission_id <> second_submission_id),
  CHECK (submitted_at IS NULL OR (first_review IS NOT NULL AND second_review IS NOT NULL))
);
