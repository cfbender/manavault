defmodule Manavault.AI.ListDeckAnalysisRequests do
  @moduledoc false

  import Ecto.Query

  alias Manavault.AI.DeckAnalysisRequest
  alias Manavault.Repo

  @default_limit 50
  @maximum_limit 100

  def run(opts \\ []) do
    limit = opts |> Keyword.get(:limit, @default_limit) |> min(@maximum_limit) |> max(1)

    DeckAnalysisRequest
    |> order_by([request], desc: request.inserted_at, desc: request.id)
    |> limit(^limit)
    |> Repo.all()
  end
end
