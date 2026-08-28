defmodule Manavault.Catalog.Recommander do
  @moduledoc false

  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.Decks.Preloads
  alias Manavault.Catalog.Recommander.{Client, Payload, Response}
  alias Manavault.Repo

  def recs(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, Preloads.deck_preloads(), force: true)
    fetch = Keyword.get(opts, :fetch, &Client.fetch_recommendations/1)

    with {:ok, payload} <- Payload.recommend_payload(deck),
         {:ok, recommendations} <- fetch.(payload) do
      {:ok, Response.normalize(deck, recommendations)}
    end
  end

  defdelegate recommend_payload(deck), to: Payload
  defdelegate fetch_recommendations(payload), to: Client
  defdelegate normalize(deck, recommendations), to: Response
end
