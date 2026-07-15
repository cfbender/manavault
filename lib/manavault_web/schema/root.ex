defmodule ManavaultWeb.Schema do
  use Absinthe.Schema
  use Absinthe.Relay.Schema, :modern

  import_types(ManavaultWeb.Schema.CatalogTypes)
  import_types(ManavaultWeb.Schema.BackupTypes)
  import_types(ManavaultWeb.Schema.Catalog.BackupOperations)
  import_types(ManavaultWeb.Schema.Catalog.CardOperations)
  import_types(ManavaultWeb.Schema.Catalog.CollectionOperations)
  import_types(ManavaultWeb.Schema.Catalog.DeckOperations)
  import_types(ManavaultWeb.Schema.Catalog.LocationOperations)
  import_types(ManavaultWeb.Schema.Catalog.OtherOperations)

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, CollectionItem, Deck, DeckCard, Location, Printing}
  alias ManavaultWeb.Schema.Catalog.QueryResolvers
  alias ManavaultWeb.Schema.RelayHelpers

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
    import_fields :other_queries
    import_fields :card_queries
    import_fields :collection_queries
    import_fields :location_queries
    import_fields :deck_queries
    import_fields :backup_queries

    node field do
      resolve(fn
        %{type: :card, id: id}, resolution ->
          QueryResolvers.card(nil, %{id: id}, resolution)

        %{type: :printing, id: id}, resolution ->
          with {:ok, id} <- RelayHelpers.node_id(id, :printing, resolution) do
            {:ok, Catalog.get_printing_by_scryfall_id(id)}
          end

        %{type: :collection_item, id: id}, resolution ->
          with {:ok, id} <- RelayHelpers.node_id(id, :collection_item, resolution) do
            {:ok, Catalog.get_collection_item!(id)}
          end

        %{type: :location, id: id}, resolution ->
          QueryResolvers.location(nil, %{id: id}, resolution)

        %{type: :deck, id: id}, resolution ->
          QueryResolvers.deck(nil, %{id: id}, resolution)

        %{type: :deck_card, id: id}, resolution ->
          with {:ok, id} <- RelayHelpers.node_id(id, :deck_card, resolution) do
            {:ok, Catalog.get_deck_card!(id)}
          end

        _node, _resolution ->
          {:ok, nil}
      end)
    end
  end

  mutation do
    import_fields :backup_mutations
    import_fields :card_mutations
    import_fields :collection_mutations
    import_fields :location_mutations
    import_fields :deck_mutations
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
