-- create_owner_sessions
--
-- Owner sign-ins, one row per session id carried in the session cookie.
-- Signing out deletes the row, so a copied cookie stops working instead of
-- staying valid until it expires. Cookies from earlier releases carry no
-- session id and are signed out once.

CREATE TABLE "owner_sessions" ("id" TEXT PRIMARY KEY NOT NULL, "expires_at" TEXT NOT NULL, "inserted_at" TEXT NOT NULL);
CREATE INDEX "owner_sessions_expires_at_index" ON "owner_sessions" ("expires_at");
