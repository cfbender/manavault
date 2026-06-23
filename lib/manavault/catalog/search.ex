defmodule Manavault.Catalog.Search do
  @moduledoc false

  alias Manavault.Catalog.Search.Queries

  defdelegate search_cards(term, opts \\ []), to: Queries
  defdelegate suggest_card_names(term, opts \\ []), to: Queries
  defdelegate get_printing_by_scryfall_id(scryfall_id), to: Queries
  defdelegate get_printing(set_code, collector_number), to: Queries
  defdelegate get_card_with_printings(oracle_id), to: Queries
  defdelegate search_printings(filters, opts \\ []), to: Queries
  defdelegate search_sets(term, opts \\ []), to: Queries
  defdelegate list_printings_for_oracle_id(oracle_id), to: Queries
  defdelegate clear_card_name_suggestion_cache(), to: Queries
end
