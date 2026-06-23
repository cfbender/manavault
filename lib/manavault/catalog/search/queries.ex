defmodule Manavault.Catalog.Search.Queries do
  @moduledoc false

  alias Manavault.Catalog.Search.{CardNameSuggestions, Cards, Printings}

  defdelegate search_cards(term, opts \\ []), to: Cards
  defdelegate suggest_card_names(term, opts \\ []), to: CardNameSuggestions
  defdelegate clear_card_name_suggestion_cache(), to: CardNameSuggestions

  defdelegate get_printing_by_scryfall_id(scryfall_id), to: Printings
  defdelegate get_printing(set_code, collector_number), to: Printings
  defdelegate get_card_with_printings(oracle_id), to: Printings
  defdelegate search_printings(filters, opts \\ []), to: Printings
  defdelegate search_sets(term, opts \\ []), to: Printings
  defdelegate list_printings_for_oracle_id(oracle_id), to: Printings
end
