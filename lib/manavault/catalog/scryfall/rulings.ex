defmodule Manavault.Catalog.Scryfall.Rulings do
  @moduledoc false

  alias Manavault.Catalog.Card
  alias Manavault.Catalog.Scryfall.Fetch

  def list(card, opts \\ [])

  def list(%Card{rulings_uri: rulings_uri}, _opts) when rulings_uri in [nil, ""], do: []

  def list(%Card{rulings_uri: rulings_uri}, opts) when is_binary(rulings_uri) do
    fetcher = Keyword.get(opts, :fetcher, default_fetcher())

    with {:ok, body} <- fetch_body(fetcher, rulings_uri),
         {:ok, %{"data" => rulings}} when is_list(rulings) <- decode_body(body),
         true <- Enum.all?(rulings, &valid?/1) do
      Enum.map(rulings, &attrs/1)
    else
      _reason -> []
    end
  end

  def list(_card, _opts), do: []

  defp default_fetcher do
    Application.get_env(:manavault, :scryfall_rulings_fetcher) || (&Fetch.url/1)
  end

  defp fetch_body(fetcher, rulings_uri) do
    case fetcher.(rulings_uri) do
      {:ok, %{status: status, body: body}} when status in 200..299 -> {:ok, body}
      {:ok, %{status: _status}} -> :error
      {:ok, body} -> {:ok, body}
      {:error, _reason} -> :error
      _other -> :error
    end
  end

  defp decode_body(body) when is_binary(body), do: Jason.decode(body)
  defp decode_body(body) when is_map(body), do: {:ok, body}
  defp decode_body(_body), do: :error

  defp valid?(%{"comment" => comment} = ruling) when is_binary(comment) do
    optional_string?(Map.get(ruling, "source")) and
      optional_string?(Map.get(ruling, "published_at"))
  end

  defp valid?(_ruling), do: false

  defp optional_string?(nil), do: true
  defp optional_string?(value), do: is_binary(value)

  defp attrs(ruling) do
    %{
      source: Map.get(ruling, "source"),
      published_at: Map.get(ruling, "published_at"),
      comment: Map.fetch!(ruling, "comment")
    }
  end
end
