defmodule ManavaultWeb.Schema.Catalog.TokenTypes do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  @desc "A token a card creates, with how many copies of that token the user owns."
  object :produced_token do
    field :printing, non_null(:printing)
    field :owned_count, non_null(:integer)
  end

  @desc "Owned copies of a token printing. Tokens are never allocated or valued."
  node object(:token_item) do
    field :quantity, non_null(:integer)
    field :finish, non_null(:string)
    field :printing, non_null(:printing)
    field :back_printing, :printing
  end

  input_object :token_item_input do
    field :scryfall_id, non_null(:id)
    field :back_scryfall_id, :id
    field :finish, :string
    field :quantity, :integer
  end

  input_object :token_item_update_input do
    field :quantity, :integer
    field :finish, :string
  end
end
