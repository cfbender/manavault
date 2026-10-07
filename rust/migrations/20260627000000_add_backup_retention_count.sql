-- Migration 20260627000000 (add_backup_retention_count).

ALTER TABLE "backup_settings" ADD COLUMN "retention_count" INTEGER;

