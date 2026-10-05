defmodule Manavault.Catalog.CardToken do
  @moduledoc """
  A producer printing → token printing link from Scryfall's `all_parts`
  (component `"token"`). Rows carry no foreign keys: tokens and producers are
  imported in separate batches and some linked parts are never imported, so
  readers join through `scryfall_printings` to drop dangling links.
  """

  use Ecto.Schema

  @primary_key false
  schema "scryfall_card_tokens" do
    field :scryfall_id, :string
    field :token_scryfall_id, :string
  end
end
