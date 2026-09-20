defmodule Manavault.Catalog.Collection.AutoSort do
  @moduledoc false

  alias Manavault.Catalog.Collection.AutoSort.{Apply, Query, Rules}

  def run(opts \\ []) when is_list(opts) do
    dry_run? = Keyword.get(opts, :dry_run, false) == true

    with {:ok, query} <- Query.build(opts),
         {:ok, rules} <- Rules.load(opts) do
      Apply.run(query, rules, dry_run?)
    end
  end
end
