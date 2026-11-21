CREATE TABLE assistant_usage (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK (requests > 0),
  PRIMARY KEY (scope,bucket)
);
