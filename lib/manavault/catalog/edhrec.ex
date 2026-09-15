defmodule Manavault.Catalog.EDHRec do
  @moduledoc false

  alias Manavault.Catalog.EDHRec.{Client, Recommendations}
  alias Manavault.Catalog.EDHRec.Response.CardPage

  defdelegate recs(deck, opts \\ []), to: Recommendations
  defdelegate recs_payload(deck, opts \\ []), to: Recommendations
  defdelegate fetch_recs(payload), to: Recommendations
  defdelegate fetch_commander_page(name, theme_slug \\ nil), to: Recommendations

  def card_page(name, opts \\ []) when is_binary(name) and is_list(opts) do
    fetch = Keyword.get(opts, :fetch, &Client.fetch_card_page/1)

    with {:ok, page} <- fetch.(name) do
      {:ok, CardPage.normalize(page)}
    end
  end

  def normalize_recs_response(
        deck,
        response,
        fetch_commander_page \\ &Recommendations.fetch_commander_page/2,
        commander_theme \\ nil
      ) do
    Recommendations.normalize_recs_response(
      deck,
      response,
      fetch_commander_page,
      commander_theme
    )
  end
end
