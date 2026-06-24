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

    field :deck_buylist, non_null(list_of(non_null(:deck_buylist_entry))) do
      arg(:id, non_null(:id))
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)

      resolve(fn _parent, %{id: token} = args, _resolution ->
        case Catalog.get_deck_by_share_token(token, preload?: false) do
          %Deck{} = deck -> {:ok, Catalog.deck_buylist(deck, public_buylist_opts(args))}
          nil -> {:ok, []}
        end
      end)
    end

    field :deck_buylist_export, non_null(:string) do
      arg(:id, non_null(:id))
      arg(:format, :string, default_value: "text")
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)

      resolve(fn _parent, %{id: token} = args, _resolution ->
        case Catalog.get_deck_by_share_token(token, preload?: false) do
          %Deck{} = deck ->
            {:ok,
             Catalog.export_deck_buylist(
               deck,
               Map.get(args, :format, "text"),
               public_buylist_opts(args)
             )}

          nil ->
            {:ok, ""}
        end
      end)
    end
  end

  defp public_buylist_opts(args) do
    [
      printing_mode: Map.get(args, :printing_mode, "none"),
      include_basic_lands: Map.get(args, :include_basic_lands, false),
      assume_no_owned: true
    ]
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
