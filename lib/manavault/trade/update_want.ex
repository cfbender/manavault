defmodule Manavault.Trade.UpdateWant do
  @moduledoc false

  alias Manavault.Repo
  alias Manavault.Trade.Want

  def quantity(%Want{} = want, quantity) do
    case want |> Want.quantity_changeset(%{quantity: quantity}) |> Repo.update() do
      {:ok, updated_want} -> {:ok, Repo.preload(updated_want, [:card, :preferred_printing])}
      error -> error
    end
  end
end
