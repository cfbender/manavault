defmodule Manavault.Trade.DeleteWant do
  @moduledoc false

  alias Manavault.Repo
  alias Manavault.Trade.Want

  def run(%Want{} = want), do: Repo.delete(want)
end
