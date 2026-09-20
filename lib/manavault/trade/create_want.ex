defmodule Manavault.Trade.CreateWant do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, Printing, Util}
  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo
  alias Manavault.Trade.{Query, UpdateWant, Want}

  def by_name(name, quantity \\ nil) when is_binary(name) do
    quantity = Util.positive_quantity(quantity)

    case CardsByName.find(name) do
      %Card{oracle_id: oracle_id} -> upsert(oracle_id, nil, quantity)
      nil -> {:error, :not_found}
    end
  end

  def by_printing(scryfall_id, quantity \\ nil) when is_binary(scryfall_id) do
    quantity = Util.positive_quantity(quantity)

    case Catalog.get_printing_by_scryfall_id(scryfall_id) do
      %Printing{oracle_id: oracle_id} -> upsert(oracle_id, scryfall_id, quantity)
      nil -> {:error, :not_found}
    end
  end

  defp upsert(oracle_id, preferred_printing_id, quantity) do
    %Want{}
    |> Want.changeset(%{
      oracle_id: oracle_id,
      preferred_printing_id: preferred_printing_id,
      quantity: quantity
    })
    |> Repo.insert()
    |> case do
      {:ok, want} ->
        {:ok, Repo.preload(want, [:card, :preferred_printing])}

      {:error, changeset} ->
        handle_conflict(changeset, oracle_id, preferred_printing_id, quantity)
    end
  end

  defp handle_conflict(changeset, oracle_id, preferred_printing_id, quantity) do
    if Keyword.has_key?(changeset.errors, :oracle_id) do
      bump_existing(oracle_id, preferred_printing_id, quantity)
    else
      {:error, changeset}
    end
  end

  defp bump_existing(oracle_id, preferred_printing_id, quantity) do
    case Query.matching_want(oracle_id, preferred_printing_id) do
      nil -> upsert(oracle_id, preferred_printing_id, quantity)
      %Want{} = want -> UpdateWant.quantity(want, want.quantity + quantity)
    end
  end
end
