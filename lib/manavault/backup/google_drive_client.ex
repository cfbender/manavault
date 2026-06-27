defmodule Manavault.Backup.GoogleDriveClient do
  @moduledoc false

  @token_url "https://oauth2.googleapis.com/token"
  @drive_url "https://www.googleapis.com/drive/v3/files"
  @upload_url "https://www.googleapis.com/upload/drive/v3/files"
  @mime "application/zip"

  def upload(settings, artifact_path) do
    with {:ok, token} <- access_token(settings),
         {:ok, response} <- upload_file(token, settings, artifact_path) do
      {:ok,
       %{
         id: response["id"],
         name: response["name"] || Path.basename(artifact_path),
         provider: "google_drive",
         size: File.stat!(artifact_path).size,
         modified_at: DateTime.utc_now() |> DateTime.truncate(:second)
       }}
    end
  end

  def list(settings) do
    with {:ok, token} <- access_token(settings) do
      q = ["name contains 'manavault-'", "mimeType = '#{@mime}'", "trashed = false"]

      q =
        if present?(settings.google_folder_id),
          do: ["'#{settings.google_folder_id}' in parents" | q],
          else: q

      case Req.get(@drive_url,
             auth: {:bearer, token},
             params: [
               q: Enum.join(q, " and "),
               fields: "files(id,name,size,modifiedTime)",
               orderBy: "modifiedTime desc",
               pageSize: 100
             ]
           ) do
        {:ok, %{status: status, body: %{"files" => files}}} when status in 200..299 ->
          {:ok, Enum.map(files, &remote_file/1)}

        {:ok, response} ->
          {:error, response_error("Google Drive list", response)}

        {:error, reason} ->
          {:error, inspect(reason)}
      end
    end
  end

  def download(settings, file_id, destination) do
    with {:ok, token} <- access_token(settings) do
      url = @drive_url <> "/" <> URI.encode(file_id)

      case Req.get(url, auth: {:bearer, token}, params: [alt: "media"]) do
        {:ok, %{status: status, body: body}} when status in 200..299 ->
          File.mkdir_p!(Path.dirname(destination))
          File.write!(destination, body)
          :ok

        {:ok, response} ->
          {:error, response_error("Google Drive download", response)}

        {:error, reason} ->
          {:error, inspect(reason)}
      end
    end
  end

  def delete(settings, file_id) do
    with {:ok, token} <- access_token(settings) do
      url = @drive_url <> "/" <> URI.encode(file_id)

      case Req.delete(url, auth: {:bearer, token}) do
        {:ok, %{status: status}} when status in 200..299 or status == 404 ->
          :ok

        {:ok, response} ->
          {:error, response_error("Google Drive delete", response)}

        {:error, reason} ->
          {:error, inspect(reason)}
      end
    end
  end

  defp upload_file(token, settings, artifact_path) do
    boundary = "manavault-#{System.unique_integer([:positive])}"
    metadata = %{"name" => Path.basename(artifact_path), "mimeType" => @mime}

    metadata =
      if present?(settings.google_folder_id),
        do: Map.put(metadata, "parents", [settings.google_folder_id]),
        else: metadata

    body = [
      "--#{boundary}\r\n",
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      Jason.encode!(metadata),
      "\r\n--#{boundary}\r\n",
      "Content-Type: #{@mime}\r\n\r\n",
      File.read!(artifact_path),
      "\r\n--#{boundary}--\r\n"
    ]

    case Req.post(@upload_url,
           auth: {:bearer, token},
           params: [uploadType: "multipart", fields: "id,name"],
           headers: [{"content-type", "multipart/related; boundary=#{boundary}"}],
           body: body
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 -> {:ok, body}
      {:ok, response} -> {:error, response_error("Google Drive upload", response)}
      {:error, reason} -> {:error, inspect(reason)}
    end
  end

  defp access_token(settings) do
    case Req.post(@token_url,
           form: [
             client_id: settings.google_client_id,
             client_secret: settings.google_client_secret,
             refresh_token: settings.google_refresh_token,
             grant_type: "refresh_token"
           ]
         ) do
      {:ok, %{status: status, body: %{"access_token" => token}}} when status in 200..299 ->
        {:ok, token}

      {:ok, response} ->
        {:error, response_error("Google OAuth", response)}

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  end

  defp remote_file(file) do
    %{
      id: file["id"],
      name: file["name"],
      provider: "google_drive",
      size: parse_int(file["size"]),
      modified_at: parse_datetime(file["modifiedTime"])
    }
  end

  defp parse_int(nil), do: nil

  defp parse_int(value) do
    case Integer.parse(to_string(value)) do
      {int, _} -> int
      _ -> nil
    end
  end

  defp parse_datetime(nil), do: nil

  defp parse_datetime(value) do
    case DateTime.from_iso8601(value) do
      {:ok, datetime, _} -> datetime
      _ -> nil
    end
  end

  defp response_error(operation, %{status: status, body: body}),
    do: "#{operation} failed with HTTP #{status}: #{inspect(body)}"

  defp present?(value), do: is_binary(value) and String.trim(value) != ""
end
