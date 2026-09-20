defmodule Manavault.Catalog.Decks.FetchLocation do
  @moduledoc false

  alias Manavault.Catalog.Location
  alias Manavault.Repo

  def run(id) do
    case Repo.get(Location, id) do
      %Location{} = location -> {:ok, Repo.preload(location, cover_printing: :card)}
      nil -> {:error, :not_found}
    end
  end

  def preload(%Location{} = location), do: Repo.preload(location, cover_printing: :card)

  def validate_auto_sort_target(id) do
    case Repo.get(Location, id) do
      %Location{kind: kind} when kind in ["box", "binder"] -> :ok
      %Location{} -> {:error, :invalid_auto_sort_target}
      nil -> {:error, :not_found}
    end
  end
end
