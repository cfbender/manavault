defmodule Manavault.Catalog.CardCollection.SearchFilter do
  @moduledoc false

  alias Manavault.Catalog.CardCollection.SearchFilter.Query

  def apply(query, search), do: Query.apply(query, search)
end
