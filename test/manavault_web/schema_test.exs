defmodule ManavaultWeb.SchemaTest do
  use ManavaultWeb.ConnCase

  test "home summary is available over GraphQL", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          homeSummary {
            collectionCount
            locationCount
            deckCount
          }
        }
        """
      })

    assert %{
             "data" => %{
               "homeSummary" => %{
                 "collectionCount" => 0,
                 "locationCount" => 0,
                 "deckCount" => 0
               }
             }
           } = json_response(conn, 200)
  end

  test "cloud backups are empty before a provider is configured", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          backupSettings { provider }
          cloudBackups { id }
        }
        """
      })

    assert %{
             "data" => %{
               "backupSettings" => %{"provider" => "none"},
               "cloudBackups" => []
             }
           } = json_response(conn, 200)
  end

  test "backup settings can be saved over GraphQL", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation SaveBackupSettings($input: BackupSettingsInput!) {
          updateBackupSettings(input: $input) {
            backupSettings {
              enabled
              provider
              cron
              retentionCount
              s3Endpoint
              s3Bucket
              s3Region
              s3Prefix
              s3AccessKeyId
              hasS3SecretAccessKey
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "enabled" => true,
            "provider" => "s3",
            "cron" => "*/15 * * * *",
            "retentionCount" => 7,
            "s3Endpoint" => "https://example.r2.cloudflarestorage.com",
            "s3Bucket" => "manavault",
            "s3Region" => "auto",
            "s3Prefix" => "backups",
            "s3AccessKeyId" => "access-key",
            "s3SecretAccessKey" => "secret-key"
          }
        }
      })

    assert %{
             "data" => %{
               "updateBackupSettings" => %{
                 "backupSettings" => %{
                   "enabled" => true,
                   "provider" => "s3",
                   "cron" => "*/15 * * * *",
                   "retentionCount" => 7,
                   "s3Endpoint" => "https://example.r2.cloudflarestorage.com",
                   "s3Bucket" => "manavault",
                   "s3Region" => "auto",
                   "s3Prefix" => "backups",
                   "s3AccessKeyId" => "access-key",
                   "hasS3SecretAccessKey" => true
                 }
               }
             }
           } = json_response(conn, 200)

    conn =
      post(build_conn(), "/api/graphql", %{
        "query" => """
        query {
          backupSettings {
            provider
            hasS3SecretAccessKey
          }
        }
        """
      })

    assert %{
             "data" => %{
               "backupSettings" => %{"provider" => "s3", "hasS3SecretAccessKey" => true}
             }
           } =
             json_response(conn, 200)
  end
end
