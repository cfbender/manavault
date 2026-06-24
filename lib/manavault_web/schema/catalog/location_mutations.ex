defmodule ManavaultWeb.Schema.Catalog.LocationMutations do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Repo
  alias ManavaultWeb.Schema.Catalog.Errors
  alias ManavaultWeb.Schema.RelayHelpers

  def create_location(_parent, %{input: input}, resolution) do
    with {:ok, input} <- normalize_location_input(input, resolution) do
      case Catalog.create_location(input) do
        {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def delete_location(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :location, resolution) do
      if id == "unfiled" do
        {:error, "Unfiled cannot be deleted"}
      else
        delete_persisted_location(id)
      end
    end
  end

  def update_location(_parent, %{id: id, input: input}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :location, resolution),
         {:ok, input} <- normalize_location_input(input, resolution) do
      if id == "unfiled" do
        {:error, "Unfiled cannot be edited"}
      else
        update_persisted_location(id, input)
      end
    end
  end

  defp delete_persisted_location(id) do
    location = Catalog.get_location!(id)

    case Catalog.delete_location(location) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  defp update_persisted_location(id, input) do
    location = Catalog.get_location!(id)

    case Catalog.update_location(location, input) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  defp normalize_location_input(input, resolution) do
    RelayHelpers.put_optional_node_id(input, :cover_scryfall_id, :printing, resolution)
  end
end
