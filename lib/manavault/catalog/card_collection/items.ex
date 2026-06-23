defmodule Manavault.Catalog.CardCollection.Items do
  @moduledoc false

  alias Manavault.Catalog.CardCollection.ItemQueries

  defdelegate list_items(filters \\ [], opts \\ []), to: ItemQueries
  defdelegate count_items(filters \\ []), to: ItemQueries
  defdelegate list_items_by_location(location_id, filters \\ [], opts \\ []), to: ItemQueries
  defdelegate value_summary(filters \\ []), to: ItemQueries
  defdelegate location_summaries(), to: ItemQueries
end
