defmodule Manavault.Catalog.CardCollection do
  @moduledoc """
  Public catalog collection-card query facade.
  """

  alias Manavault.Catalog.CardCollection.Items

  defdelegate list_items(filters \\ [], opts \\ []), to: Items
  defdelegate count_items(filters \\ []), to: Items
  defdelegate list_items_by_location(location_id, filters \\ [], opts \\ []), to: Items
  defdelegate value_summary(filters \\ []), to: Items
  defdelegate location_summaries(), to: Items
end
