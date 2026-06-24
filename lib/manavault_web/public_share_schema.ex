defmodule ManavaultWeb.PublicShareSchema do
  use Absinthe.Schema

  import_types(ManavaultWeb.Schema.PublicShareTypes)

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.CatalogResolvers

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
