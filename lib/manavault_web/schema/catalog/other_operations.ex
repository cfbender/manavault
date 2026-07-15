defmodule ManavaultWeb.Schema.Catalog.OtherOperations do
  @moduledoc false

  use Absinthe.Schema.Notation

  alias ManavaultWeb.Schema.Catalog.QueryResolvers

  object :other_queries do
    field :home_summary, non_null(:home_summary) do
      resolve(&QueryResolvers.home_summary/3)
    end
  end
end
