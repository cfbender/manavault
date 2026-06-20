defmodule ManavaultWeb.PublicShareSchema do
  use Absinthe.Schema

  import_types(ManavaultWeb.Schema.PublicShareTypes)

  alias ManavaultWeb.Schema.CatalogResolvers

  query do
    field :deck, :deck do
      arg(:id, non_null(:id))

      resolve(fn parent, %{id: token}, resolution ->
        CatalogResolvers.shared_deck(parent, %{token: token}, resolution)
      end)
    end
  end
end
