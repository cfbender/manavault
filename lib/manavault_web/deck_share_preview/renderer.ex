defmodule ManavaultWeb.DeckSharePreview.Renderer do
  @moduledoc false

  alias ManavaultWeb.DeckSharePreview

  @renderer "rsvg-convert"

  def render(preview, opts \\ [])

  def render(%{kind: :deck} = preview, opts) do
    command_runner = Keyword.get(opts, :command_runner, &System.cmd/2)

    path =
      Path.join(
        System.tmp_dir!(),
        "manavault-share-preview-#{System.unique_integer([:positive])}.svg"
      )

    try do
      with :ok <- File.write(path, DeckSharePreview.svg(preview, symbol_resolver: &mana_symbol_data_uri/1)),
           {png, 0} <-
             command_runner.(@renderer, [
               "--format=png",
               "--width=#{DeckSharePreview.image_width()}",
               "--height=#{DeckSharePreview.image_height()}",
               path
             ]) do
        {:ok, png}
      else
        {:error, _reason} -> {:error, :render_failed}
        {_output, _status} -> {:error, :render_failed}
      end
    after
      File.rm(path)
    end
  rescue
    ErlangError -> {:error, :renderer_unavailable}
    File.Error -> {:error, :render_failed}
  end

  defp mana_symbol_data_uri(color) do
    filename = "#{symbol_code(color)}.svg"

    case Manavault.ScryfallAssets.local_path(["symbols", filename]) do
      nil ->
        mana_symbol_url(color)

      path ->
        case File.read(path) do
          {:ok, svg} -> "data:image/svg+xml;base64,#{Base.encode64(svg)}"
          {:error, _reason} -> mana_symbol_url(color)
        end
    end
  end

  defp mana_symbol_url(color), do: "/scryfall-assets/symbols/#{symbol_code(color)}.svg"

  defp symbol_code(color) do
    color
    |> to_string()
    |> String.replace("/", "")
    |> String.upcase()
    |> URI.encode(&URI.char_unreserved?/1)
  end
end
