defmodule Manavault.Backup.S3Client do
  @moduledoc false

  @service "s3"
  @algorithm "AWS4-HMAC-SHA256"
  @unsigned_payload "UNSIGNED-PAYLOAD"

  @doc false
  def build_upload_request(settings, artifact_path) do
    key = remote_key(settings, Path.basename(artifact_path))
    stat = File.stat!(artifact_path)
    url = object_url(settings, key)

    headers = [{"content-length", Integer.to_string(stat.size)}]
    signed_url = build_presigned_url(settings, "PUT", url, [], 300)

    %{headers: headers, key: key, size: stat.size, url: signed_url}
  end

  def upload(settings, artifact_path) do
    %{headers: headers, key: key, size: size, url: url} =
      build_upload_request(settings, artifact_path)

    case Req.put(url, headers: headers, body: File.stream!(artifact_path, 64_000, [])) do
      {:ok, %{status: status}} when status in 200..299 ->
        {:ok,
         %{
           id: key,
           name: Path.basename(key),
           provider: "s3",
           size: size,
           modified_at: DateTime.utc_now() |> DateTime.truncate(:second)
         }}

      {:ok, response} ->
        {:error, response_error(response)}

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  end

  def list(settings) do
    prefix = normalized_prefix(settings)
    query = [{"list-type", "2"}, {"prefix", prefix}, {"max-keys", "100"}]
    url = bucket_url(settings)
    url = build_presigned_url(settings, "GET", url, query, 300)

    case Req.get(url) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        {:ok, parse_list_response(to_string(body), settings)}

      {:ok, response} ->
        {:error, response_error(response)}

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  end

  def download(settings, key, destination) do
    url = object_url(settings, key)
    url = build_presigned_url(settings, "GET", url, [], 300)

    case Req.get(url) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        File.mkdir_p!(Path.dirname(destination))
        File.write!(destination, body)
        :ok

      {:ok, response} ->
        {:error, response_error(response)}

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  end

  @doc false
  def build_presigned_url(settings, method, url, query, expires, now \\ DateTime.utc_now()) do
    uri = URI.parse(url)
    amz_date = Calendar.strftime(now, "%Y%m%dT%H%M%SZ")
    date = Calendar.strftime(now, "%Y%m%d")
    scope = "#{date}/#{settings.s3_region}/#{@service}/aws4_request"
    signed_headers = "host"

    signing_query =
      query ++
        [
          {"X-Amz-Algorithm", @algorithm},
          {"X-Amz-Credential", "#{settings.s3_access_key_id}/#{scope}"},
          {"X-Amz-Date", amz_date},
          {"X-Amz-Expires", Integer.to_string(expires)},
          {"X-Amz-SignedHeaders", signed_headers}
        ]

    canonical_request =
      [
        method,
        canonical_path(uri.path || "/"),
        canonical_query(signing_query),
        "host:#{host_header(uri)}\n",
        signed_headers,
        @unsigned_payload
      ]
      |> Enum.join("\n")

    string_to_sign =
      [@algorithm, amz_date, scope, sha256(canonical_request)]
      |> Enum.join("\n")

    signature =
      signing_key(settings.s3_secret_access_key, date, settings.s3_region)
      |> hmac_raw(string_to_sign)
      |> hex()

    query_string = canonical_query(signing_query ++ [{"X-Amz-Signature", signature}])
    %{uri | query: query_string} |> URI.to_string()
  end

  defp signing_key(secret, date, region) do
    ("AWS4" <> secret)
    |> hmac_raw(date)
    |> hmac_raw(region)
    |> hmac_raw(@service)
    |> hmac_raw("aws4_request")
  end

  defp bucket_url(settings) do
    endpoint = String.trim_trailing(settings.s3_endpoint, "/")
    bucket = settings.s3_bucket

    if endpoint_already_includes_bucket?(endpoint, bucket) do
      endpoint
    else
      endpoint <> "/" <> uri_encode(bucket)
    end
  end

  defp endpoint_already_includes_bucket?(endpoint, bucket) do
    endpoint
    |> URI.parse()
    |> Map.get(:path)
    |> to_string()
    |> String.trim("/")
    |> String.split("/", trim: true)
    |> List.last()
    |> case do
      nil -> false
      segment -> URI.decode(segment) == bucket
    end
  end

  defp object_url(settings, key), do: bucket_url(settings) <> "/" <> encode_key(key)

  defp remote_key(settings, filename), do: normalized_prefix(settings) <> filename

  defp normalized_prefix(settings) do
    settings.s3_prefix
    |> to_string()
    |> String.trim("/")
    |> case do
      "" -> ""
      prefix -> prefix <> "/"
    end
  end

  defp parse_list_response(body, settings) do
    ~r/<Contents>(.*?)<\/Contents>/s
    |> Regex.scan(body, capture: :all_but_first)
    |> Enum.map(fn [entry] ->
      key = xml_text(entry, "Key")

      %{
        id: key,
        name: key |> String.replace_prefix(normalized_prefix(settings), "") |> URI.decode(),
        provider: "s3",
        size: entry |> xml_text("Size") |> parse_size(),
        modified_at: entry |> xml_text("LastModified") |> parse_datetime()
      }
    end)
    |> Enum.filter(&String.ends_with?(&1.name, ".zip"))
  end

  defp xml_text(entry, tag) do
    case Regex.run(~r/<#{tag}>(.*?)<\/#{tag}>/s, entry, capture: :all_but_first) do
      [value] -> value |> html_unescape() |> String.trim()
      _ -> ""
    end
  end

  defp html_unescape(value) do
    value
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&apos;", "'")
  end

  defp parse_size(value) do
    case Integer.parse(value) do
      {int, _} -> int
      _ -> nil
    end
  end

  defp parse_datetime(value) do
    case DateTime.from_iso8601(value) do
      {:ok, datetime, _} -> datetime
      _ -> nil
    end
  end

  defp response_error(%{status: status, body: body}) do
    detail = s3_error_detail(response_body(body))

    credential_hint =
      if status in [401, 403] do
        " Check the S3 Access Key ID/Secret Access Key, bucket permission, endpoint, and region."
      else
        ""
      end

    "S3 request failed with HTTP #{status}: #{detail}#{credential_hint}"
  end

  defp response_body(body) when is_binary(body), do: body
  defp response_body(body), do: inspect(body)

  defp s3_error_detail(body) do
    code = xml_text(body, "Code")
    message = xml_text(body, "Message")

    cond do
      code != "" and message != "" -> "#{code}: #{message}"
      message != "" -> message
      body != "" -> body
      true -> "empty response body"
    end
  end

  defp canonical_query(query) do
    query
    |> Enum.sort_by(fn {key, value} -> {to_string(key), to_string(value)} end)
    |> Enum.map_join("&", fn {key, value} ->
      "#{uri_encode(to_string(key))}=#{uri_encode(to_string(value))}"
    end)
  end

  defp canonical_path(path),
    do: path |> String.split("/", trim: false) |> Enum.map_join("/", &uri_encode/1)

  defp encode_key(key),
    do: key |> String.split("/", trim: false) |> Enum.map_join("/", &uri_encode/1)

  defp uri_encode(value) do
    value
    |> URI.encode(&unreserved?/1)
    |> String.replace("+", "%20")
  end

  defp unreserved?(char),
    do: char in ?A..?Z or char in ?a..?z or char in ?0..?9 or char in [?-, ?_, ?., ?~]

  defp host_header(%URI{host: host, port: nil}), do: host
  defp host_header(%URI{scheme: "http", host: host, port: 80}), do: host
  defp host_header(%URI{scheme: "https", host: host, port: 443}), do: host
  defp host_header(%URI{host: host, port: port}), do: "#{host}:#{port}"

  defp sha256(data), do: :crypto.hash(:sha256, data) |> hex()
  defp hmac_raw(key, data), do: :crypto.mac(:hmac, :sha256, key, data)
  defp hex(data), do: Base.encode16(data, case: :lower)
end
