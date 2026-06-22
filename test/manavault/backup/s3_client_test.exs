defmodule Manavault.Backup.S3ClientTest do
  use ExUnit.Case, async: true

  alias Manavault.Backup.CloudSettings
  alias Manavault.Backup.S3Client

  test "matches the AWS S3 presigned URL example" do
    settings = %CloudSettings{
      s3_region: "us-east-1",
      s3_access_key_id: "AKIAIOSFODNN7EXAMPLE",
      s3_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    }

    url =
      S3Client.build_presigned_url(
        settings,
        "GET",
        "https://examplebucket.s3.amazonaws.com/test.txt",
        [],
        86_400,
        DateTime.new!(~D[2013-05-24], ~T[00:00:00], "Etc/UTC")
      )

    assert URI.decode_query(URI.parse(url).query)["X-Amz-Signature"] ==
             "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
  end

  test "builds R2-compatible path-style upload requests" do
    path = Path.join(System.tmp_dir!(), "manavault-s3-client-test.zip")
    File.write!(path, "backup")

    settings = %CloudSettings{
      provider: "s3",
      s3_endpoint: "https://ea1814f339faeaa18ed052b7003134f9.r2.cloudflarestorage.com",
      s3_bucket: "cfb-manavault",
      s3_region: "auto",
      s3_prefix: "manavault",
      s3_access_key_id: "access-key",
      s3_secret_access_key: "secret-key"
    }

    request = S3Client.build_upload_request(settings, path)
    headers = Map.new(request.headers)

    uri = URI.parse(request.url)
    query = URI.decode_query(uri.query)

    assert "#{uri.scheme}://#{uri.host}#{uri.path}" ==
             "https://ea1814f339faeaa18ed052b7003134f9.r2.cloudflarestorage.com/cfb-manavault/manavault/manavault-s3-client-test.zip"

    assert request.key == "manavault/manavault-s3-client-test.zip"
    assert headers["content-length"] == "6"
    assert query["X-Amz-Algorithm"] == "AWS4-HMAC-SHA256"
    assert query["X-Amz-Credential"] =~ "access-key/"
    assert query["X-Amz-Credential"] =~ "/auto/s3/aws4_request"
    assert query["X-Amz-SignedHeaders"] == "host"
    assert is_binary(query["X-Amz-Signature"])
  after
    File.rm(Path.join(System.tmp_dir!(), "manavault-s3-client-test.zip"))
  end

  test "does not duplicate a bucket already present in the endpoint" do
    path = Path.join(System.tmp_dir!(), "manavault-s3-client-test.zip")
    File.write!(path, "backup")

    settings = %CloudSettings{
      provider: "s3",
      s3_endpoint:
        "https://ea1814f339faeaa18ed052b7003134f9.r2.cloudflarestorage.com/cfb-manavault",
      s3_bucket: "cfb-manavault",
      s3_region: "auto",
      s3_prefix: "manavault",
      s3_access_key_id: "access-key",
      s3_secret_access_key: "secret-key"
    }

    request = S3Client.build_upload_request(settings, path)
    uri = URI.parse(request.url)

    assert uri.path == "/cfb-manavault/manavault/manavault-s3-client-test.zip"
  after
    File.rm(Path.join(System.tmp_dir!(), "manavault-s3-client-test.zip"))
  end
end
