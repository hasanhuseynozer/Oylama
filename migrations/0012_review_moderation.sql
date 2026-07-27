CREATE TABLE IF NOT EXISTS hidden_reviews (
  review_id INTEGER PRIMARY KEY,
  report_id INTEGER,
  hidden_by INTEGER,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(report_id) REFERENCES content_reports(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hidden_reviews_created ON hidden_reviews(created_at);
