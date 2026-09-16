defmodule Manavault.Catalog.DeckPickerTest do
  use Manavault.DataCase

  alias Manavault.Catalog
  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.Decks.DeckPicker
  alias Manavault.Repo

  test "selection weights increase with recency and skips and decrease with plays" do
    now = ~U[2026-08-26 12:00:00Z]
    one_day_ago = DateTime.add(now, -24, :hour)
    ten_days_ago = DateTime.add(now, -10, :day)

    decks = [
      %Deck{id: 1, name: "Recent", play_count: 1, skip_count: 0, last_played_at: one_day_ago},
      %Deck{id: 2, name: "Older", play_count: 1, skip_count: 0, last_played_at: ten_days_ago},
      %Deck{id: 3, name: "Frequent", play_count: 5, skip_count: 0, last_played_at: one_day_ago},
      %Deck{id: 4, name: "Skipped", play_count: 1, skip_count: 2, last_played_at: one_day_ago},
      %Deck{id: 5, name: "Never", play_count: 0, skip_count: 0, last_played_at: nil}
    ]

    weights =
      decks
      |> DeckPicker.selection_weights(now)
      |> Map.new(fn {deck, weight} -> {deck.id, weight} end)

    assert weights[2] > weights[1]
    assert weights[1] > weights[3]
    assert weights[4] > weights[1]
    assert weights[5] > weights[2]
  end

  test "random deck only picks active decks and excludes the previous suggestion when possible" do
    assert {:ok, alpha} = Catalog.create_deck(%{"name" => "Alpha", "status" => "active"})
    assert {:ok, beta} = Catalog.create_deck(%{"name" => "Beta", "status" => "active"})
    assert {:ok, _brewing} = Catalog.create_deck(%{"name" => "A Brew", "status" => "brewing"})
    assert {:ok, _archived} = Catalog.create_deck(%{"name" => "Archived", "status" => "archived"})

    assert %Deck{id: id} = Catalog.random_deck(random: fn -> 0.0 end)
    assert id == alpha.id

    assert %Deck{id: id} = Catalog.random_deck(exclude_id: alpha.id, random: fn -> 0.0 end)
    assert id == beta.id

    assert {:ok, _archived_beta} = Catalog.update_deck(beta, %{"status" => "archived"})

    assert %Deck{id: id} = Catalog.random_deck(exclude_id: alpha.id, random: fn -> 0.0 end)
    assert id == alpha.id
  end

  test "random deck returns nil when every deck is brewing or archived" do
    assert {:ok, brewing} = Catalog.create_deck(%{"name" => "Brewing", "status" => "brewing"})
    assert {:ok, _archived} = Catalog.create_deck(%{"name" => "Retired", "status" => "archived"})

    assert Catalog.random_deck() == nil
    assert Catalog.random_deck(exclude_id: brewing.id) == nil
  end

  test "inclusion persists independently of status and is honored before reroll fallback" do
    assert {:ok, alpha} = Catalog.create_deck(%{"name" => "Alpha", "status" => "active"})
    assert alpha.included_for_play

    assert {:ok, beta} =
             Catalog.create_deck(%{
               "name" => "Beta",
               "status" => "active",
               "included_for_play" => false
             })

    assert {:ok, alpha} = Catalog.update_deck(alpha, %{"included_for_play" => false})
    assert alpha.status == "active"
    refute Repo.get!(Deck, alpha.id).included_for_play
    assert length(Catalog.list_deck_summaries()) == 2
    assert Catalog.random_deck(exclude_id: alpha.id) == nil

    assert {:ok, beta} = Catalog.update_deck(beta, %{"included_for_play" => true})

    for random <- [0.0, 1.0] do
      assert %Deck{id: id} =
               Catalog.random_deck(exclude_id: beta.id, random: fn -> random end)

      assert id == beta.id
    end

    assert {:ok, _beta} = Catalog.update_deck(beta, %{"status" => "archived"})
    assert Catalog.random_deck() == nil

    assert {:ok, alpha} = Catalog.update_deck(alpha, %{"included_for_play" => true})
    assert Catalog.random_deck().id == alpha.id

    assert {:error, changeset} = Catalog.update_deck(alpha, %{"included_for_play" => nil})
    assert %{included_for_play: [_]} = errors_on(changeset)
  end

  test "playing resets accumulated skips and subsequent skips start from zero" do
    assert {:ok, deck} =
             Catalog.create_deck(%{"name" => "History", "status" => "active", "skip_count" => 3})

    assert {:ok, %Deck{play_count: 1, skip_count: 0, last_played_at: %DateTime{}}} =
             Catalog.record_deck_play(deck, :played)

    deck = Repo.get!(Deck, deck.id)
    assert deck.skip_count == 0

    assert {:ok, %Deck{play_count: 1, skip_count: 1, last_played_at: %DateTime{}}} =
             Catalog.record_deck_play(deck, :skipped)

    assert [%Deck{play_count: 1, skip_count: 1, last_played_at: %DateTime{}}] =
             Catalog.list_deck_summaries()
  end

  test "historical play data can be imported, cleared, and cannot use negative counts" do
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Imported History"})

    assert {:ok,
            %Deck{
              play_count: 14,
              skip_count: 3,
              last_played_at: ~U[2026-08-10 07:00:00Z]
            } = deck} =
             Catalog.update_deck(deck, %{
               "play_count" => 14,
               "skip_count" => 3,
               "last_played_at" => "2026-08-10T07:00:00Z"
             })

    assert {:ok, %Deck{last_played_at: nil}} =
             Catalog.update_deck(deck, %{"last_played_at" => nil})

    assert {:error, changeset} =
             Catalog.update_deck(deck, %{"play_count" => -1, "skip_count" => -1})

    assert %{play_count: [_], skip_count: [_]} = errors_on(changeset)
  end

  test "archived decks cannot record picker outcomes" do
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Retired", "status" => "archived"})

    assert {:error, :archived_deck} = Catalog.record_deck_play(deck, :played)
    assert {:error, :archived_deck} = Catalog.record_deck_play(deck, :skipped)
  end
end
