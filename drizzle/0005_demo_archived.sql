ALTER TABLE submissions ADD COLUMN demo_archived INTEGER NOT NULL DEFAULT 0 CHECK (demo_archived IN (0,1));
CREATE INDEX submissions_active_version ON submissions(assignment_id,student_id,demo_archived,version);
