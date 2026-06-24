defmodule ManavaultWeb.PublicShareSchema do
  use Absinthe.Schema
  use Absinthe.Relay.Schema, :modern

  import_types(ManavaultWeb.Schema.PublicShareTypes)

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, CollectionItem, Deck, DeckCard, Location, Printing}
  alias ManavaultWeb.Schema.CatalogResolvers

  node interface do
    resolve_type(fn
      %Card{}, _ -> :card
      %Printing{}, _ -> :printing
      %CollectionItem{}, _ -> :collection_item
      %Location{}, _ -> :location
      %Deck{}, _ -> :deck
      %DeckCard{}, _ -> :deck_card
      %{scryfall_id: _, set_code: _}, _ -> :printing
      %{oracle_id: _, name: _, type_line: _}, _ -> :card
      %{id: "unfiled"}, _ -> :location
      %{id: _, kind: _}, _ -> :location
      %{id: _, condition: _, finish: _}, _ -> :collection_item
      %{id: _, quantity: _, zone: _}, _ -> :deck_card
      %{id: _, format: _, status: _}, _ -> :deck
      _, _ -> nil
    end)
  end

  query do
    field :deck, :deck do
      arg(:id, non_null(:id))

      resolve(fn parent, %{id: token}, resolution ->
        CatalogResolvers.shared_deck(parent, %{token: token}, resolution)
      end)
    end
  end

  def context(ctx) do
    loader =
      Dataloader.new()
      |> Dataloader.add_source(Catalog, Catalog.data())

    Map.put(ctx, :loader, loader)
  end

  def plugins do
    [Absinthe.Middleware.Dataloader | Absinthe.Plugin.defaults()]
  end
end
