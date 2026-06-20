defmodule Manavault.Catalog.RuntimeImageMatcher do
  @moduledoc """
  Candidate-scoped image matching for scanner recognition.

  The scanner first narrows candidates with OCR. This module then downloads and
  caches only those candidate printings' card images, hashes them, and compares
  them with the captured frame.
  """

  require Logger

  alias Manavault.Catalog.{ImageMatcher, Printing}

  @user_agent "ManaVault/0.1 (local scanner image matcher)"
  @default_limit 5

  def match(image_path, printings, opts \\ [])
      when is_binary(image_path) and is_list(printings) do
    limit = Keyword.get(opts, :limit, @default_limit)

    printings
    |> Enum.take(limit)
    |> Enum.flat_map(&reference_fixture/1)
    |> ImageMatcher.build_references()
    |> then(&ImageMatcher.match(image_path, &1, Keyword.take(opts, [:crop, :limit, :threshold])))
  rescue
    exception ->
      Logger.warning(
        "Runtime image matching failed for #{image_path}: #{Exception.message(exception)}"
      )

      []
  end

  defp reference_fixture(%Printing{} = printing) do
    with {:ok, uris} <- decode_json(printing.image_uris),
         url when is_binary(url) <- image_url(uris),
         {:ok, path} <- cached_image(printing.scryfall_id, url) do
      [
        %{
          "image_path" => path,
          "card" => %{
            "id" => printing.scryfall_id,
            "oracle_id" => printing.oracle_id,
            "name" => printing.card && printing.card.name
          }
        }
      ]
    else
      _error -> []
    end
  end

  defp decode_json(value) when is_binary(value), do: Jason.decode(value)
  defp decode_json(_value), do: {:ok, %{}}

  defp image_url(uris) when is_map(uris) do
    uris["normal"] || uris["large"] || uris["png"] || uris["small"]
  end

  defp cached_image(scryfall_id, url) do
    path = Path.join(cache_dir(), "#{scryfall_id}#{image_extension(url)}")

    cond do
      File.regular?(path) ->
        {:ok, path}

      true ->
        download_image(url, path)
    end
  end

  defp download_image(url, path) do
    File.mkdir_p!(Path.dirname(path))

    case Req.get(url, headers: [{"user-agent", @user_agent}], retry: :transient, max_retries: 2) do
      {:ok, %{status: status, body: body}} when status in 200..299 and is_binary(body) ->
        File.write!(path, body)
        {:ok, path}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp cache_dir do
    Application.get_env(
      :manavault,
      :scan_image_cache_dir,
      Path.join(["data", "cache", "scryfall", "scanner-images"])
    )
  end

  defp image_extension(url) do
    path = URI.parse(url).path || ""

    cond do
      String.match?(path, ~r/\.png$/i) -> ".png"
      String.match?(path, ~r/\.webp$/i) -> ".webp"
      true -> ".jpg"
    end
  end
end
