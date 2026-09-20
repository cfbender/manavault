defmodule Manavault.Trade.Query do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Printing
  alias Manavault.Repo
  alias Manavault.Trade.Want

  def list_wants do
    Want
    |> order_by([want], desc: want.inserted_at, desc: want.id)
    |> preload([:card, :preferred_printing])
    |> Repo.all()
  end

  def wants_by_oracle_ids([]), do: []

  def wants_by_oracle_ids(oracle_ids) when is_list(oracle_ids) do
    Want
    |> where([want], want.oracle_id in ^oracle_ids)
    |> order_by([want], desc: want.inserted_at, desc: want.id)
    |> preload([:card, :preferred_printing])
    |> Repo.all()
  end

  def get_want!(id) do
    Want
    |> preload([:card, :preferred_printing])
    |> Repo.get!(id)
  end

  def matching_want(oracle_id, preferred_printing_id) do
    Want
    |> where([want], want.oracle_id == ^oracle_id)
    |> matching_printing(preferred_printing_id)
    |> Repo.one()
  end

  def latest_printing(oracle_id) do
    Printing
    |> where([printing], printing.oracle_id == ^oracle_id)
    |> order_by([printing],
      desc: printing.released_at,
      asc: printing.set_code,
      asc: printing.collector_number
    )
    |> limit(1)
    |> Repo.one()
  end

  defp matching_printing(query, nil), do: where(query, [want], is_nil(want.preferred_printing_id))

  defp matching_printing(query, preferred_printing_id),
    do: where(query, [want], want.preferred_printing_id == ^preferred_printing_id)
end
