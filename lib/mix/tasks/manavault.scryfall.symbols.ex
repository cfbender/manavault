defmodule Mix.Tasks.Manavault.Scryfall.Symbols do
  use Mix.Task

  @shortdoc "Refreshes runtime-cached Scryfall symbol and set SVG assets"

  @symbology_url "https://api.scryfall.com/symbology"
  @sets_url "https://api.scryfall.com/sets"
  @headers [
    {"accept", "application/json"},
    {"user-agent", "ManaVault/0.1 (+https://github.com/cfb/manavault)"}
  ]

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    symbols_dir = Manavault.ScryfallAssets.symbols_dir()
    sets_dir = Manavault.ScryfallAssets.sets_dir()

    File.mkdir_p!(symbols_dir)
    File.mkdir_p!(sets_dir)

    sync_card_symbols(symbols_dir)
    sync_set_icons(sets_dir)
    Manavault.ScryfallAssets.clear_cache()
  end

  defp sync_card_symbols(symbols_dir) do
    symbols =
      @symbology_url
      |> fetch_json!()
      |> Map.fetch!("data")
      |> Enum.map(fn symbol ->
        local_uri =
          download_svg!(
            symbol["svg_uri"],
            symbols_dir,
            "/scryfall-assets/symbols"
          )

        symbol
        |> Map.take(["symbol", "english", "colors", "represents_mana", "svg_uri"])
        |> Map.put("local_uri", local_uri)
      end)

    write_json!(Path.join(symbols_dir, "symbology.json"), %{"data" => symbols})
    Mix.shell().info("Downloaded #{length(symbols)} Scryfall card symbols.")
  end

  defp sync_set_icons(sets_dir) do
    sets =
      @sets_url
      |> fetch_json!()
      |> Map.fetch!("data")
      |> Enum.map(fn set ->
        local_uri =
          download_svg!(
            set["icon_svg_uri"],
            sets_dir,
            "/scryfall-assets/sets"
          )

        set
        |> Map.take(["code", "name", "set_type", "icon_svg_uri"])
        |> Map.put("local_uri", local_uri)
      end)

    write_json!(Path.join(sets_dir, "sets.json"), %{"data" => sets})
    Mix.shell().info("Downloaded #{length(sets)} Scryfall set icons.")
  end

  defp fetch_json!(url) do
    url
    |> Req.get!(headers: @headers)
    |> Map.fetch!(:body)
  end

  defp download_svg!(nil, _dir, _uri_prefix), do: nil

  defp download_svg!(url, dir, uri_prefix) do
    filename = url |> URI.parse() |> Map.fetch!(:path) |> Path.basename()
    path = Path.join(dir, filename)

    unless File.exists?(path) do
      body = url |> Req.get!(headers: @headers) |> Map.fetch!(:body)
      File.write!(path, body)
    end

    Path.join(uri_prefix, filename)
  end

  defp write_json!(path, data) do
    File.write!(path, Jason.encode_to_iodata!(data, pretty: true))
  end
end
