defmodule ManavaultWeb.Schema.ApiKeyTypes do
  use Absinthe.Schema.Notation

  object :api_key do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :prefix, non_null(:string)
    field :created_at, non_null(:string), resolve: fn key, _, _ -> {:ok, key.inserted_at} end
    field :last_used_at, :string
  end

  object :created_api_key do
    field :api_key, non_null(:api_key)
    field :token, non_null(:string)
  end
end
