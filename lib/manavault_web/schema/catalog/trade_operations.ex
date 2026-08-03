defmodule ManavaultWeb.Schema.Catalog.TradeOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias Manavault.Catalog.Decks.ShareToken
  alias Manavault.Trade
  alias ManavaultWeb.Schema.Catalog.MutationResolvers

  object :trade_queries do
    field :trade_wants, non_null(list_of(non_null(:trade_want))) do
      resolve(fn _parent, _args, _resolution -> {:ok, Trade.list_wants()} end)
    end

    field :trade_wants_share_token, :string do
      resolve(fn _parent, _args, _resolution -> {:ok, Trade.wants_share_token()} end)
    end

    field :trade_binder_share_token, :string do
      resolve(fn _parent, _args, _resolution -> {:ok, Trade.binder_share_token()} end)
    end

    # Mirrors the public /share/graphql binderList query (the wantsList
    # precedent) so codegen-validated documents can serve the share page.
    field :binder_list, :binder_list do
      arg(:id, non_null(:id))

      resolve(fn _parent, %{id: token}, _resolution ->
        if ShareToken.valid?(token) do
          {:ok, Trade.binder_list_by_share_token(token)}
        else
          {:ok, nil}
        end
      end)
    end

    # Mirrors the public /share/graphql wantsList query (the sharedDeck
    # precedent) so codegen-validated documents can serve the share page.
    field :wants_list, :wants_list do
      arg(:id, non_null(:id))

      resolve(fn _parent, %{id: token}, _resolution ->
        if ShareToken.valid?(token) do
          {:ok, Trade.wants_list_by_share_token(token)}
        else
          {:ok, nil}
        end
      end)
    end
  end

  object :trade_mutations do
    payload field :create_trade_want do
      arg(:name, :string)
      arg(:scryfall_id, :id)
      arg(:quantity, :integer)

      output do
        field :trade_want, :trade_want
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.create_trade_want/3, :trade_want)
      end)
    end

    payload field :update_trade_want do
      arg(:id, non_null(:id))
      arg(:quantity, non_null(:integer))

      output do
        field :trade_want, :trade_want
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.update_trade_want/3, :trade_want)
      end)
    end

    payload field :delete_trade_want do
      arg(:id, non_null(:id))

      output do
        field :deleted_id, non_null(:id)
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.delete_trade_want/3, :deleted_id)
      end)
    end

    payload field :ensure_trade_wants_share_token do
      output do
        field :token, non_null(:string)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &MutationResolvers.ensure_trade_wants_share_token/3,
          :token
        )
      end)
    end

    payload field :ensure_trade_binder_share_token do
      output do
        field :token, non_null(:string)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &MutationResolvers.ensure_trade_binder_share_token/3,
          :token
        )
      end)
    end

    payload field :disable_trade_wants_sharing do
      output do
        field :success, non_null(:boolean)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &MutationResolvers.disable_trade_wants_sharing/3,
          :success
        )
      end)
    end

    payload field :rotate_trade_wants_share_token do
      output do
        field :token, non_null(:string)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &MutationResolvers.rotate_trade_wants_share_token/3,
          :token
        )
      end)
    end

    payload field :disable_trade_binder_sharing do
      output do
        field :success, non_null(:boolean)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &MutationResolvers.disable_trade_binder_sharing/3,
          :success
        )
      end)
    end

    payload field :rotate_trade_binder_share_token do
      output do
        field :token, non_null(:string)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &MutationResolvers.rotate_trade_binder_share_token/3,
          :token
        )
      end)
    end
  end

  defp payload(parent, args, resolution, resolver, field) do
    case resolver.(parent, args, resolution) do
      {:ok, value} when is_map(value) ->
        if Map.has_key?(value, field), do: {:ok, value}, else: {:ok, %{field => value}}

      {:ok, value} ->
        {:ok, %{field => value}}

      other ->
        other
    end
  end
end
