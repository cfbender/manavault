defmodule Manavault.Catalog.EDHRec.Recommendations do
  @moduledoc false

  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.EDHRec.{Client, Payload, Response}
  alias Manavault.Repo

  def recs(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, Payload.deck_preloads(), force: true)
    payload = recs_payload(deck, opts)
    fetch = Keyword.get(opts, :fetch, &fetch_recs/1)
    fetch_commander_page = Keyword.get(opts, :fetch_commander_page, &fetch_commander_page/1)

    with :ok <- Payload.validate_payload(payload),
         {:ok, response} <- fetch.(payload) do
      {:ok, normalize_recs_response(deck, response, fetch_commander_page)}
    end
  end

  defdelegate recs_payload(deck, opts \\ []), to: Payload
  defdelegate fetch_recs(payload), to: Client
  defdelegate fetch_commander_page(name), to: Client

  defdelegate normalize_recs_response(
                deck,
                response,
                fetch_commander_page \\ &Client.fetch_commander_page/1
              ),
              to: Response
end
