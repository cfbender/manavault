-- Migration 20260622000000 (create_backup_settings).

CREATE TABLE "backup_settings" ("id" INTEGER PRIMARY KEY, "enabled" INTEGER DEFAULT false NOT NULL, "provider" TEXT DEFAULT 'none' NOT NULL, "cron" TEXT DEFAULT '0 3 * * *' NOT NULL, "s3_endpoint" TEXT, "s3_bucket" TEXT, "s3_region" TEXT, "s3_prefix" TEXT, "s3_access_key_id" TEXT, "s3_secret_access_key" TEXT, "google_client_id" TEXT, "google_client_secret" TEXT, "google_refresh_token" TEXT, "google_folder_id" TEXT, "last_backup_at" TEXT, "last_backup_status" TEXT, "last_backup_message" TEXT, "last_backup_path" TEXT, "last_restore_at" TEXT, "last_restore_status" TEXT, "last_restore_message" TEXT, "pending_restore_path" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

