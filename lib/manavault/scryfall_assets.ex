defmodule Manavault.ScryfallAssets do
  @moduledoc """
  Runtime cache for Scryfall symbol and set SVG assets.
  """

  @cache_key {__MODULE__, :manifests, 1}
  @symbology_url "https://api.scryfall.com/symbology"
  @sets_url "https://api.scryfall.com/sets"
  @headers [
    {"accept", "application/json"},
    {"user-agent", "ManaVault/0.1 (+https://github.com/cfb/manavault)"}
  ]

  def asset_root do
    Application.get_env(:manavault, :scryfall_assets_dir, "data/scryfall_assets")
  end

  def symbols_dir, do: Path.join(asset_root(), "symbols")
  def sets_dir, do: Path.join(asset_root(), "sets")

  def symbol(symbol) when is_binary(symbol) do
    manifests().symbols[normalize_symbol(symbol)]
  end

  def set(code) when is_binary(code) do
    manifests().sets[String.downcase(code)]
  end

  def local_path(["symbols", filename]), do: safe_join(symbols_dir(), filename)
  def local_path(["sets", filename]), do: safe_join(sets_dir(), filename)
  def local_path(_segments), do: nil

  def latest_sync_completed_at do
    with {:ok, symbols_stat} <-
           File.stat(Path.join(symbols_dir(), "symbology.json"), time: :posix),
         {:ok, sets_stat} <- File.stat(Path.join(sets_dir(), "sets.json"), time: :posix) do
      [symbols_stat.mtime, sets_stat.mtime]
      |> Enum.min()
      |> DateTime.from_unix!(:second)
    else
      _error -> nil
    end
  end

  def sync(opts \\ []) do
    fetcher = Keyword.get(opts, :fetcher, &fetch_url/1)
    symbology_url = Keyword.get(opts, :symbology_url, @symbology_url)
    sets_url = Keyword.get(opts, :sets_url, @sets_url)

    File.mkdir_p!(symbols_dir())
    File.mkdir_p!(sets_dir())

    with {:ok, symbols_count} <- sync_card_symbols(fetcher, symbology_url),
         {:ok, sets_count} <- sync_set_icons(fetcher, sets_url) do
      clear_cache()
      {:ok, %{symbols_count: symbols_count, sets_count: sets_count}}
    end
  end

  def clear_cache do
    try do
      :persistent_term.erase(@cache_key)
    rescue
      ArgumentError -> :ok
    end
  end

  defp manifests do
    case :persistent_term.get(@cache_key, nil) do
      nil ->
        manifests = %{
          symbols: load_symbols(),
          sets: load_sets()
        }

        :persistent_term.put(@cache_key, manifests)
        manifests

      manifests ->
        manifests
    end
  end

  defp load_symbols do
    symbols_dir()
    |> Path.join("symbology.json")
    |> read_manifest()
    |> Enum.map(fn entry -> {normalize_symbol(entry["symbol"]), entry} end)
    |> Map.new()
  end

  defp load_sets do
    sets_dir()
    |> Path.join("sets.json")
    |> read_manifest()
    |> Enum.map(fn entry -> {String.downcase(entry["code"] || ""), entry} end)
    |> Map.new()
  end

  defp read_manifest(path) do
    with {:ok, json} <- File.read(path),
         {:ok, %{"data" => entries}} when is_list(entries) <- Jason.decode(json) do
      entries
    else
      _error -> []
    end
  end

  defp normalize_symbol("{" <> _rest = symbol), do: symbol
  defp normalize_symbol(symbol), do: "{#{symbol}}"

  defp sync_card_symbols(fetcher, symbology_url) do
    with {:ok, %{"data" => symbols}} when is_list(symbols) <-
           fetch_json(fetcher, symbology_url),
         {:ok, symbols} <- map_downloads(symbols, &card_symbol_manifest(fetcher, &1)) do
      with :ok <- write_json(Path.join(symbols_dir(), "symbology.json"), %{"data" => symbols}) do
        {:ok, length(symbols)}
      end
    else
      {:ok, _response} -> {:error, "Scryfall symbology response did not include data"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp sync_set_icons(fetcher, sets_url) do
    with {:ok, %{"data" => sets}} when is_list(sets) <- fetch_json(fetcher, sets_url),
         {:ok, sets} <- map_downloads(sets, &set_icon_manifest(fetcher, &1)) do
      with :ok <- write_json(Path.join(sets_dir(), "sets.json"), %{"data" => sets}) do
        {:ok, length(sets)}
      end
    else
      {:ok, _response} -> {:error, "Scryfall sets response did not include data"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp card_symbol_manifest(fetcher, symbol) do
    with {:ok, local_uri} <-
           download_svg(fetcher, symbol["svg_uri"], symbols_dir(), "/scryfall-assets/symbols") do
      symbol =
        symbol
        |> Map.take(["symbol", "english", "colors", "represents_mana", "svg_uri"])
        |> Map.put("local_uri", local_uri)

      {:ok, symbol}
    end
  end

  defp set_icon_manifest(fetcher, set) do
    with {:ok, local_uri} <-
           download_svg(fetcher, set["icon_svg_uri"], sets_dir(), "/scryfall-assets/sets") do
      set =
        set
        |> Map.take(["code", "name", "set_type", "icon_svg_uri"])
        |> Map.put("local_uri", local_uri)

      {:ok, set}
    end
  end

  defp fetch_json(fetcher, url) do
    with {:ok, body} <- fetcher.(url), do: decode_json(body)
  end

  defp decode_json(body) when is_binary(body), do: Jason.decode(body)
  defp decode_json(body), do: {:ok, body}

  defp map_downloads(entries, mapper) do
    entries
    |> Enum.reduce_while({:ok, []}, fn entry, {:ok, acc} ->
      case mapper.(entry) do
        {:ok, entry} -> {:cont, {:ok, [entry | acc]}}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
    |> case do
      {:ok, entries} -> {:ok, Enum.reverse(entries)}
      {:error, reason} -> {:error, reason}
    end
  end

  defp download_svg(_fetcher, nil, _dir, _uri_prefix), do: {:ok, nil}

  defp download_svg(fetcher, url, dir, uri_prefix) do
    with {:ok, filename} <- filename_from_url(url),
         path = Path.join(dir, filename),
         :ok <- write_asset(fetcher, url, path) do
      {:ok, Path.join(uri_prefix, filename)}
    end
  end

  defp filename_from_url(url) when is_binary(url) do
    case URI.parse(url).path do
      path when is_binary(path) and path != "" -> {:ok, Path.basename(path)}
      _path -> {:error, "Scryfall asset URL did not include a filename: #{url}"}
    end
  end

  defp filename_from_url(url), do: {:error, "Scryfall asset URL was invalid: #{inspect(url)}"}

  defp write_asset(fetcher, url, path) do
    with false <- File.exists?(path),
         {:ok, body} <- fetcher.(url),
         {:ok, body} <- asset_body(body) do
      write_file(path, body)
    else
      true -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp asset_body(body) when is_binary(body), do: {:ok, body}
  defp asset_body(body) when is_list(body), do: {:ok, IO.iodata_to_binary(body)}
  defp asset_body(_body), do: {:error, "Scryfall SVG response was not a binary body"}

  defp write_json(path, data), do: write_file(path, Jason.encode_to_iodata!(data, pretty: true))

  defp write_file(path, contents) do
    case File.write(path, contents) do
      :ok -> :ok
      {:error, reason} -> {:error, "could not write #{path}: #{:file.format_error(reason)}"}
    end
  end

  defp fetch_url(url) do
    case Req.get(url, headers: @headers) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        {:ok, body}

      {:ok, %{status: status}} ->
        {:error, "Scryfall request failed with HTTP #{status}"}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp safe_join(root, filename) do
    clean_filename = Path.basename(filename || "")
    path = Path.join(root, clean_filename)

    if File.regular?(path), do: path
  end
end
