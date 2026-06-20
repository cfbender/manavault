defmodule Manavault.ScryfallAssetsTest do
  use ExUnit.Case, async: false

  alias Manavault.ScryfallAssets

  setup do
    previous_dir = Application.get_env(:manavault, :scryfall_assets_dir)
    tmp_dir = Path.join(System.tmp_dir!(), "manavault-scryfall-assets-#{System.unique_integer()}")

    Application.put_env(:manavault, :scryfall_assets_dir, tmp_dir)
    ScryfallAssets.clear_cache()

    on_exit(fn ->
      ScryfallAssets.clear_cache()
      File.rm_rf(tmp_dir)

      if previous_dir do
        Application.put_env(:manavault, :scryfall_assets_dir, previous_dir)
      else
        Application.delete_env(:manavault, :scryfall_assets_dir)
      end
    end)

    %{tmp_dir: tmp_dir}
  end

  test "sync downloads symbol and set manifests with local SVGs", %{tmp_dir: tmp_dir} do
    symbology_url = "https://example.test/symbology"
    sets_url = "https://example.test/sets"
    symbol_svg_url = "https://svgs.scryfall.io/card-symbols/W.svg"
    set_svg_url = "https://svgs.scryfall.io/sets/lea.svg"

    fetcher = fn
      ^symbology_url ->
        {:ok,
         Jason.encode!(%{
           "data" => [
             %{
               "symbol" => "{W}",
               "english" => "White",
               "colors" => ["W"],
               "represents_mana" => true,
               "svg_uri" => symbol_svg_url
             }
           ]
         })}

      ^sets_url ->
        {:ok,
         Jason.encode!(%{
           "data" => [
             %{
               "code" => "LEA",
               "name" => "Limited Edition Alpha",
               "set_type" => "core",
               "icon_svg_uri" => set_svg_url
             }
           ]
         })}

      ^symbol_svg_url ->
        {:ok, ~s(<svg id="white"/>)}

      ^set_svg_url ->
        {:ok, ~s(<svg id="lea"/>)}

      url ->
        raise "unexpected fetch: #{url}"
    end

    assert {:ok, %{symbols_count: 1, sets_count: 1}} =
             ScryfallAssets.sync(
               fetcher: fetcher,
               symbology_url: symbology_url,
               sets_url: sets_url
             )

    assert File.read!(Path.join([tmp_dir, "symbols", "W.svg"])) == ~s(<svg id="white"/>)
    assert File.read!(Path.join([tmp_dir, "sets", "lea.svg"])) == ~s(<svg id="lea"/>)

    assert %{
             "english" => "White",
             "local_uri" => "/scryfall-assets/symbols/W.svg"
           } = ScryfallAssets.symbol("W")

    assert %{
             "name" => "Limited Edition Alpha",
             "local_uri" => "/scryfall-assets/sets/lea.svg"
           } = ScryfallAssets.set("lea")

    assert %DateTime{} = ScryfallAssets.latest_sync_completed_at()
  end

  test "sync returns an error when Scryfall omits symbology data" do
    fetcher = fn _url -> {:ok, %{"object" => "error"}} end

    assert {:error, "Scryfall symbology response did not include data"} =
             ScryfallAssets.sync(fetcher: fetcher)
  end
end
