defmodule ManavaultWeb.Schema.CatalogTypes do
  @moduledoc false

  use Absinthe.Schema.Notation

  import_types(ManavaultWeb.Schema.Catalog.CardTypes)
  import_types(ManavaultWeb.Schema.Catalog.CollectionTypes)
  import_types(ManavaultWeb.Schema.Catalog.DeckTypes)
end
