defmodule Manavault.Catalog.Collection.ListAutoSortRules do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.AutoSortRule
  alias Manavault.Repo

  def run do
    AutoSortRule
    |> order_by([rule], asc: rule.priority, asc: rule.id)
    |> Repo.all()
    |> Repo.preload(:target_location)
  end
end
