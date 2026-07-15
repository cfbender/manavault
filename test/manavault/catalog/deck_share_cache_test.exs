defmodule Manavault.Catalog.DeckShareCacheTest do
  use Manavault.DataCase

  alias Manavault.Catalog
  alias Manavault.Catalog.{Cache, Deck, Decks}
  alias Manavault.Catalog.Decks.ShareToken

  test "share tokens match the generated URL-safe unpadded value contract" do
    token = ShareToken.generate()

    assert byte_size(token) == 24
    assert ShareToken.valid?(token)
    assert {:ok, decoded} = Base.url_decode64(token, padding: false)
    assert byte_size(decoded) == 18

    refute ShareToken.valid?(token <> "=")
    refute ShareToken.valid?(String.duplicate("A", 23))
    refute ShareToken.valid?(String.duplicate("/", 24))
    refute ShareToken.valid?(nil)
  end

  test "Decks caches only positive share lookups and invalidates them after deck mutations" do
    malformed_tokens = [nil, "", "not-a-share-token", String.duplicate("=", 24)]

    {malformed_results, malformed_queries} =
      count_deck_queries(fn ->
        for _ <- 1..2, token <- malformed_tokens do
          Decks.get_deck_by_share_token(token, preload?: false)
        end
      end)

    assert Enum.all?(malformed_results, &is_nil/1)
    assert malformed_queries == 0
    assert cache_size() == 0

    missing_token = String.duplicate("A", 24)

    {missing_results, missing_queries} =
      count_deck_queries(fn ->
        for _ <- 1..2 do
          Decks.get_deck_by_share_token(missing_token, preload?: false)
        end
      end)

    assert missing_results == [nil, nil]
    assert missing_queries == 2
    assert cache_size() == 0

    {:ok, deck} = Catalog.create_deck(%{"name" => "Cacheable Share"})
    {:ok, deck} = Catalog.ensure_deck_share_token(deck)

    {existing_results, existing_queries} =
      count_deck_queries(fn ->
        for _ <- 1..2 do
          Decks.get_deck_by_share_token(deck.share_token, preload?: false)
        end
      end)

    deck_id = deck.id
    assert [%Deck{id: ^deck_id}, %Deck{id: ^deck_id}] = existing_results
    assert existing_queries == 1
    assert cache_size() == 1

    assert {:ok, %Deck{id: ^deck_id}} =
             Cache.fetch({:deck_by_share_token, deck.share_token, [preload?: false]})

    {:ok, updated_deck} = Catalog.update_deck(deck, %{"name" => "Updated Shared Deck"})
    assert cache_size() == 0

    {updated_result, updated_queries} =
      count_deck_queries(fn ->
        Decks.get_deck_by_share_token(updated_deck.share_token, preload?: false)
      end)

    assert %Deck{id: ^deck_id, name: "Updated Shared Deck"} = updated_result
    assert updated_queries == 1
    assert cache_size() == 1

    old_token = updated_deck.share_token
    assert %Deck{} = Repo.update!(Ecto.Changeset.change(updated_deck, share_token: nil))
    {:ok, rotated_deck} = Catalog.ensure_deck_share_token(updated_deck)

    refute rotated_deck.share_token == old_token
    assert cache_size() == 0
    assert nil == Decks.get_deck_by_share_token(old_token, preload?: false)
    assert cache_size() == 0

    assert %Deck{id: ^deck_id} =
             Decks.get_deck_by_share_token(rotated_deck.share_token, preload?: false)

    assert cache_size() == 1
    {:ok, _deleted_deck} = Catalog.delete_deck(rotated_deck)
    assert cache_size() == 0
    assert nil == Decks.get_deck_by_share_token(rotated_deck.share_token, preload?: false)
    assert cache_size() == 0
  end

  defp cache_size, do: Manavault.Cache.count_all!()

  defp count_deck_queries(fun) when is_function(fun, 0) do
    caller = self()
    ref = make_ref()
    handler_id = {__MODULE__, ref}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, _config ->
          if metadata[:source] == "decks", do: send(caller, {ref, :deck_query})
        end,
        nil
      )

    try do
      result = fun.()
      {result, collect_deck_queries(ref, 0)}
    after
      :telemetry.detach(handler_id)
    end
  end

  defp collect_deck_queries(ref, count) do
    receive do
      {^ref, :deck_query} -> collect_deck_queries(ref, count + 1)
    after
      0 -> count
    end
  end
end
