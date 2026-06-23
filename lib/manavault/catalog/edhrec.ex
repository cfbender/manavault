defmodule Manavault.Catalog.EDHRec do
  @moduledoc false

  alias Manavault.Catalog.EDHRec.Recommendations

  defdelegate recs(deck, opts \\ []), to: Recommendations
  defdelegate recs_payload(deck, opts \\ []), to: Recommendations
  defdelegate fetch_recs(payload), to: Recommendations
  defdelegate fetch_commander_page(name), to: Recommendations

  def normalize_recs_response(
        deck,
        response,
        fetch_commander_page \\ &Recommendations.fetch_commander_page/1
      ) do
    Recommendations.normalize_recs_response(deck, response, fetch_commander_page)
  end
end
