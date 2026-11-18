-- Migration 20261118003246 (add_status_to_deck_analysis_requests).

-- One-time analyses run as background jobs: a request is saved pending and
-- the job completes it or records why it failed.
ALTER TABLE "deck_analysis_requests" ADD COLUMN "status" TEXT DEFAULT 'completed' NOT NULL;

ALTER TABLE "deck_analysis_requests" ADD COLUMN "error" TEXT;
