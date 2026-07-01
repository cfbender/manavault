defmodule Manavault.Backup.CloudSettingsEncryptionTest do
  use Manavault.DataCase, async: true

  alias Manavault.Backup.CloudSettings

  test "secret fields are stored encrypted but read back as plaintext" do
    attrs = %{
      provider: "s3",
      cron: "0 3 * * *",
      s3_endpoint: "https://s3.example.com",
      s3_bucket: "backups",
      s3_region: "us-east-1",
      s3_access_key_id: "AKIA-not-secret",
      s3_secret_access_key: "the-s3-secret",
      google_client_secret: "the-google-secret",
      google_refresh_token: "the-refresh-token"
    }

    {:ok, settings} =
      %CloudSettings{id: 1}
      |> CloudSettings.changeset(attrs)
      |> Repo.insert()

    # Reading through Ecto decrypts transparently.
    reloaded = Repo.get!(CloudSettings, settings.id)
    assert reloaded.s3_secret_access_key == "the-s3-secret"
    assert reloaded.google_client_secret == "the-google-secret"
    assert reloaded.google_refresh_token == "the-refresh-token"

    # The raw column bytes are ciphertext, not the plaintext secret — this is
    # what ends up inside a backup snapshot.
    [[raw_s3, raw_client, raw_token, raw_access_key]] =
      Repo.query!(
        "SELECT s3_secret_access_key, google_client_secret, google_refresh_token, s3_access_key_id FROM backup_settings WHERE id = ?1",
        [settings.id]
      ).rows

    assert String.starts_with?(raw_s3, "enc.v1.")
    assert String.starts_with?(raw_client, "enc.v1.")
    assert String.starts_with?(raw_token, "enc.v1.")
    refute raw_s3 =~ "the-s3-secret"
    refute raw_client =~ "the-google-secret"
    refute raw_token =~ "the-refresh-token"

    # Non-secret identifier stays plaintext (not encrypted).
    assert raw_access_key == "AKIA-not-secret"
  end
end
