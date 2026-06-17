defmodule Manavault.ScryfallAssets do
  @moduledoc """
  Runtime cache for Scryfall symbol and set SVG assets.
  """

  @cache_key {__MODULE__, :manifests, 1}

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

  defp safe_join(root, filename) do
    clean_filename = Path.basename(filename || "")
    path = Path.join(root, clean_filename)

    if File.regular?(path), do: path
  end
end
