defmodule ManavaultWeb.Schema.Catalog.TokenOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  import ManavaultWeb.Schema.Catalog.Payload, only: [payload: 5]

  alias ManavaultWeb.Schema.Catalog.TokenResolvers

  object :token_queries do
    @desc "Owned tokens, alphabetically by name. `q` matches either printed side."
    field :token_items, non_null(list_of(non_null(:token_item))) do
      arg(:q, :string, default_value: "")
      resolve(&TokenResolvers.token_items/3)
    end

    @desc "Total owned token copies."
    field :token_item_count, non_null(:integer) do
      resolve(&TokenResolvers.token_item_count/3)
    end

    @desc "Token printings by name or set, newest first. Empty when no filter is given."
    field :token_printings, non_null(list_of(non_null(:printing))) do
      arg(:q, :string, default_value: "")
      arg(:set_code, :string, default_value: "")
      arg(:exclude_scryfall_id, :id)
      arg(:limit, :integer, default_value: 60)
      resolve(&TokenResolvers.token_printings/3)
    end
  end

  object :token_mutations do
    payload field :add_token_item do
      arg(:input, non_null(:token_item_input))

      output do
        field :token_item, :token_item
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &TokenResolvers.add_token_item/3, :token_item)
      end)
    end

    payload field :update_token_item do
      arg(:id, non_null(:id))
      arg(:input, non_null(:token_item_update_input))

      output do
        field :token_item, :token_item
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &TokenResolvers.update_token_item/3, :token_item)
      end)
    end

    payload field :delete_token_item do
      arg(:id, non_null(:id))

      output do
        field :token_item, :token_item
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &TokenResolvers.delete_token_item/3, :token_item)
      end)
    end
  end
end
