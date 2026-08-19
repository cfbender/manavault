defmodule ManavaultWeb.Schema.AITypes do
  @moduledoc false

  use Absinthe.Schema.Notation

  object :ai_settings do
    field :provider, non_null(:string)
    field :model, :string
    field :has_api_key, non_null(:boolean)
  end

  input_object :ai_settings_input do
    field :provider, non_null(:string)
    field :api_key, :string
    field :model, non_null(:string)
  end
end
