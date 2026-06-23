defmodule ManavaultWeb.Schema.Catalog.LocationMutations do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Repo
  alias ManavaultWeb.Schema.Catalog.Errors

  def create_location(_parent, %{input: input}, _resolution) do
    case Catalog.create_location(input) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def delete_location(_parent, %{id: id}, _resolution) do
    if to_string(id) == "unfiled" do
      {:error, "Unfiled cannot be deleted"}
    else
      delete_persisted_location(id)
    end
  end

  def update_location(_parent, %{id: id, input: input}, _resolution) do
    if to_string(id) == "unfiled" do
      {:error, "Unfiled cannot be edited"}
    else
      update_persisted_location(id, input)
    end
  end

  defp delete_persisted_location(id) do
    location = id |> location_id() |> Catalog.get_location!()

    case Catalog.delete_location(location) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  defp update_persisted_location(id, input) do
    location = id |> location_id() |> Catalog.get_location!()

    case Catalog.update_location(location, input) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  defp location_id(id) when is_integer(id), do: id

  defp location_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> parsed
      _other -> id
    end
  end
end
