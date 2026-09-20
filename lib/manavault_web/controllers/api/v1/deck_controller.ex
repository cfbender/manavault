defmodule ManavaultWeb.Api.V1.DeckController do
  use ManavaultWeb, :controller

  alias Manavault.Catalog

  @default_per_page 50
  @max_per_page 100

  def index(conn, params) do
    page = positive_integer(params["page"], 1)
    per_page = params["per_page"] |> positive_integer(@default_per_page) |> min(@max_per_page)
    total = Catalog.count_decks()

    decks =
      [offset: (page - 1) * per_page, limit: per_page]
      |> Catalog.list_deck_summaries()
      |> Enum.map(&serialize_deck(conn, &1))

    json(conn, %{
      data: decks,
      pagination: %{
        page: page,
        per_page: per_page,
        total: total,
        total_pages: ceil(total / per_page)
      }
    })
  end

  defp serialize_deck(conn, deck) do
    public = is_binary(deck.share_token)

    %{
      id: deck.id,
      name: deck.name,
      format: deck.format,
      commanders:
        deck.deck_cards
        |> Enum.filter(&(&1.zone == "commander"))
        |> Enum.map(& &1.card.name),
      commanderColorIdentity: deck.commander_color_identity,
      cardCount: deck.card_count,
      updated_at: deck.updated_at,
      publicly_shared: public,
      public_share_url: if(public, do: absolute_share_url(conn, deck.share_token))
    }
  end

  defp absolute_share_url(conn, token) do
    uri = conn |> Plug.Conn.request_url() |> URI.parse()

    %{uri | path: "/share/decks/#{URI.encode(token)}", query: nil, fragment: nil}
    |> URI.to_string()
  end

  defp positive_integer(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {number, ""} when number > 0 -> number
      _ -> default
    end
  end

  defp positive_integer(_value, default), do: default
end
