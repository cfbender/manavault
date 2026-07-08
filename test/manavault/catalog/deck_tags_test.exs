defmodule Manavault.Catalog.DeckTagsTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    DeckCard,
    DeckTag
  }

  setup do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    :ok
  end

  defp create_deck!(name) do
    assert {:ok, deck} =
             Catalog.create_deck(%{"name" => name, "format" => "vintage", "status" => "brewing"})

    deck
  end

  defp add_card!(deck, oracle_id, quantity) do
    assert {:ok, %DeckCard{} = deck_card} =
             Catalog.add_card_to_deck(deck, %{
               "oracle_id" => oracle_id,
               "quantity" => quantity,
               "zone" => "mainboard"
             })

    deck_card
  end

  describe "create_deck_tag/2" do
    test "creates a tag with name and color, auto-incrementing distinct positions" do
      deck = create_deck!("Powered")

      assert {:ok, %DeckTag{name: "Aggro", color: "#ff0000"} = tag1} =
               Catalog.create_deck_tag(deck, %{"name" => "Aggro", "color" => "#ff0000"})

      assert {:ok, %DeckTag{name: "Combo", color: "#00ff00"} = tag2} =
               Catalog.create_deck_tag(deck, %{"name" => "Combo", "color" => "#00ff00"})

      assert tag2.position > tag1.position
      assert tag1.position != tag2.position
    end

    test "blank or absent color falls back to the same default hex color" do
      deck = create_deck!("Powered")

      assert {:ok, %DeckTag{} = absent_color_tag} =
               Catalog.create_deck_tag(deck, %{"name" => "NoColorKey"})

      assert {:ok, %DeckTag{} = blank_color_tag} =
               Catalog.create_deck_tag(deck, %{"name" => "BlankColor", "color" => ""})

      assert absent_color_tag.color =~ ~r/^#[0-9a-fA-F]{6}$/
      assert absent_color_tag.color == blank_color_tag.color
    end

    test "invalid color format is rejected with a changeset error" do
      deck = create_deck!("Powered")

      assert {:error, changeset} =
               Catalog.create_deck_tag(deck, %{"name" => "Aggro", "color" => "red"})

      assert "has invalid format" in errors_on(changeset).color
    end

    test "duplicate tag name within the same deck is rejected" do
      deck = create_deck!("Powered")

      assert {:ok, _tag} =
               Catalog.create_deck_tag(deck, %{"name" => "Aggro", "color" => "#ff0000"})

      assert {:error, changeset} =
               Catalog.create_deck_tag(deck, %{"name" => "Aggro", "color" => "#00ff00"})

      assert "has already been taken" in errors_on(changeset).deck_id
    end
  end

  describe "list_deck_tags/1" do
    test "orders results by position, not by id or creation order" do
      deck = create_deck!("Powered")

      assert {:ok, zebra} = Catalog.create_deck_tag(deck, %{"name" => "Zebra", "color" => "#111111"})
      assert {:ok, apple} = Catalog.create_deck_tag(deck, %{"name" => "Apple", "color" => "#222222"})
      assert {:ok, mango} = Catalog.create_deck_tag(deck, %{"name" => "Mango", "color" => "#333333"})

      assert {:ok, _} = Catalog.update_deck_tag(zebra, %{"position" => 10})
      assert {:ok, _} = Catalog.update_deck_tag(apple, %{"position" => 5})
      assert {:ok, _} = Catalog.update_deck_tag(mango, %{"position" => 0})

      assert Catalog.list_deck_tags(deck) |> Enum.map(& &1.name) == ["Mango", "Apple", "Zebra"]
    end

    test "card_count sums member deck_card quantities, not row counts" do
      deck = create_deck!("Powered")
      lotus = add_card!(deck, "oracle-1", "3")
      walk = add_card!(deck, "oracle-2", "1")

      assert {:ok, busy_tag} = Catalog.create_deck_tag(deck, %{"name" => "Busy", "color" => "#ff0000"})
      assert {:ok, empty_tag} = Catalog.create_deck_tag(deck, %{"name" => "Empty", "color" => "#00ff00"})

      assert {:ok, _} = Catalog.assign_deck_card_tag(lotus.id, busy_tag.id)
      assert {:ok, _} = Catalog.assign_deck_card_tag(walk.id, busy_tag.id)

      tags = Catalog.list_deck_tags(deck)

      assert Enum.find(tags, &(&1.id == busy_tag.id)).card_count == 4
      assert Enum.find(tags, &(&1.id == empty_tag.id)).card_count == 0
    end
  end

  describe "assign_deck_card_tag/2 and unassign_deck_card_tag/2" do
    test "assign is idempotent, unassign is idempotent, and a card may hold multiple tags" do
      deck = create_deck!("Powered")
      card = add_card!(deck, "oracle-1", "1")

      assert {:ok, tag1} = Catalog.create_deck_tag(deck, %{"name" => "T1", "color" => "#ff0000"})
      assert {:ok, tag2} = Catalog.create_deck_tag(deck, %{"name" => "T2", "color" => "#00ff00"})

      assert {:ok, %DeckCard{tag_ids: tag_ids}} = Catalog.assign_deck_card_tag(card.id, tag1.id)
      assert tag_ids == [to_string(tag1.id)]

      assert {:ok, %DeckCard{tag_ids: tag_ids}} = Catalog.assign_deck_card_tag(card.id, tag1.id)
      assert tag_ids == [to_string(tag1.id)]

      assert {:ok, %DeckCard{tag_ids: tag_ids}} = Catalog.assign_deck_card_tag(card.id, tag2.id)
      assert Enum.sort(tag_ids) == Enum.sort([to_string(tag1.id), to_string(tag2.id)])

      assert {:ok, %DeckCard{tag_ids: tag_ids}} = Catalog.unassign_deck_card_tag(card.id, tag1.id)
      assert tag_ids == [to_string(tag2.id)]

      assert {:ok, %DeckCard{tag_ids: tag_ids}} = Catalog.unassign_deck_card_tag(card.id, tag1.id)
      assert tag_ids == [to_string(tag2.id)]
    end
  end

  describe "cross-deck guard" do
    test "assigning a tag from a different deck returns {:error, :deck_mismatch}" do
      deck_a = create_deck!("Deck A")
      deck_b = create_deck!("Deck B")

      card_a = add_card!(deck_a, "oracle-1", "1")
      assert {:ok, tag_b} = Catalog.create_deck_tag(deck_b, %{"name" => "TagB", "color" => "#ff0000"})

      assert {:error, :deck_mismatch} = Catalog.assign_deck_card_tag(card_a.id, tag_b.id)
    end

    test "assigning a non-existent deck_card_id or deck_tag_id returns {:error, :not_found}" do
      deck = create_deck!("Powered")
      card = add_card!(deck, "oracle-1", "1")
      assert {:ok, tag} = Catalog.create_deck_tag(deck, %{"name" => "T1", "color" => "#ff0000"})

      assert {:error, :not_found} = Catalog.assign_deck_card_tag(-1, tag.id)
      assert {:error, :not_found} = Catalog.assign_deck_card_tag(card.id, -1)
    end
  end

  describe "reorder_deck_tags/2" do
    test "sets position by index of the given order, and ignores ids from other decks" do
      deck_a = create_deck!("Deck A")
      deck_b = create_deck!("Deck B")

      assert {:ok, tag1} = Catalog.create_deck_tag(deck_a, %{"name" => "T1", "color" => "#111111"})
      assert {:ok, tag2} = Catalog.create_deck_tag(deck_a, %{"name" => "T2", "color" => "#222222"})
      assert {:ok, tag3} = Catalog.create_deck_tag(deck_a, %{"name" => "T3", "color" => "#333333"})
      assert {:ok, tag_b} = Catalog.create_deck_tag(deck_b, %{"name" => "TB", "color" => "#444444"})

      assert {:ok, _} =
               Catalog.reorder_deck_tags(deck_a, [tag3.id, tag_b.id, tag1.id, tag2.id])

      assert Catalog.list_deck_tags(deck_a) |> Enum.map(& &1.name) == ["T3", "T1", "T2"]

      # the foreign tag id was ignored: deck B's tag is untouched and unaffected by deck A's reorder
      assert [%DeckTag{position: unaffected_position}] = Catalog.list_deck_tags(deck_b)
      assert unaffected_position == tag_b.position
    end
  end

  describe "delete_deck_tag/1" do
    test "removes the tag from list_deck_tags and cascades join rows off tagged cards" do
      deck = create_deck!("Powered")
      card = add_card!(deck, "oracle-1", "1")

      assert {:ok, tag} = Catalog.create_deck_tag(deck, %{"name" => "T1", "color" => "#ff0000"})
      assert {:ok, %DeckCard{tag_ids: [_tag_id]}} = Catalog.assign_deck_card_tag(card.id, tag.id)

      assert {:ok, _deleted} = Catalog.delete_deck_tag(tag)

      refute tag.id in Enum.map(Catalog.list_deck_tags(deck), & &1.id)

      reloaded_card =
        Catalog.get_deck!(deck.id).deck_cards
        |> Enum.find(&(&1.id == card.id))

      assert [%DeckCard{tag_ids: tag_ids}] = Catalog.put_deck_card_tag_ids([reloaded_card])
      refute to_string(tag.id) in tag_ids
    end
  end
end
