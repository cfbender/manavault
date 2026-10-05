defmodule Manavault.Catalog.Tokens do
  @moduledoc """
  Owned tokens and the tokens cards create. Tokens are catalog cards with a
  token layout; owning one is a `TokenItem`, separate from collection copies.
  """

  alias Manavault.Catalog.Tokens.{BackOptions, Items, Produced, SearchPrintings}

  defdelegate search_token_printings(filters, opts \\ []), to: SearchPrintings, as: :run
  defdelegate token_back_options(scryfall_id), to: BackOptions, as: :run

  defdelegate list_token_items(filters \\ []), to: Items, as: :list
  defdelegate count_token_items(), to: Items, as: :count
  defdelegate get_token_item!(id), to: Items, as: :get!
  defdelegate add_token_item(attrs), to: Items, as: :add
  defdelegate update_token_item(token_item, attrs), to: Items, as: :update
  defdelegate delete_token_item(token_item), to: Items, as: :delete
  defdelegate owned_token_counts(oracle_ids), to: Items

  defdelegate produced_tokens_by_oracle_ids(oracle_ids), to: Produced, as: :by_oracle_ids
end
