defmodule ManavaultWeb.Schema.Catalog.AIOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.AIResolvers

  object :ai_queries do
    field :ai_settings, non_null(:ai_settings) do
      resolve(&AIResolvers.settings/3)
    end
  end

  object :ai_mutations do
    payload field :update_ai_settings do
      arg(:input, non_null(:ai_settings_input))

      output do
        field :ai_settings, :ai_settings
      end

      resolve(fn parent, args, resolution ->
        case AIResolvers.update_settings(parent, args, resolution) do
          {:ok, settings} -> {:ok, %{ai_settings: settings}}
          other -> other
        end
      end)
    end

    payload field :refresh_all_deck_analyses do
      output do
        field :queued_count, non_null(:integer)
      end

      resolve(fn parent, args, resolution ->
        case AIResolvers.refresh_all_deck_analyses(parent, args, resolution) do
          {:ok, queued_count} -> {:ok, %{queued_count: queued_count}}
          other -> other
        end
      end)
    end
  end
end
