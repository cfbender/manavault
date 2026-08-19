defmodule ManavaultWeb.Schema.AIResolvers do
  @moduledoc false

  alias Manavault.AI
  alias ManavaultWeb.Schema.Catalog.Errors

  def settings(_parent, _args, _resolution), do: {:ok, AI.sanitized_settings()}

  def update_settings(_parent, %{input: input}, _resolution) do
    case AI.update_settings(input) do
      {:ok, _settings} -> {:ok, AI.sanitized_settings()}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end
end
