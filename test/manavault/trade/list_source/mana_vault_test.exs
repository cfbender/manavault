defmodule Manavault.Trade.ListSource.ManaVaultTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog
  alias Manavault.Trade
  alias Manavault.Trade.ListSource.ManaVault

  describe "share_path/1" do
    test "extracts a deck token from /share/decks/<token>" do
      assert {:ok, :deck, "abcDEF-123_456"} = ManaVault.share_path("/share/decks/abcDEF-123_456")
    end

    test "extracts a wants token from /share/wants/<token>" do
      assert {:ok, :wants, "abcDEF-123_456"} = ManaVault.share_path("/share/wants/abcDEF-123_456")
    end

    test "extracts a binder token from /share/binder/<token>" do
      assert {:ok, :binder, "abcDEF-123_456"} =
               ManaVault.share_path("/share/binder/abcDEF-123_456")
    end

    test "allows an optional trailing slash for either kind" do
      assert {:ok, :deck, "abc"} = ManaVault.share_path("/share/decks/abc/")
      assert {:ok, :wants, "abc"} = ManaVault.share_path("/share/wants/abc/")
      assert {:ok, :binder, "abc"} = ManaVault.share_path("/share/binder/abc/")
    end

    test "rejects a non-share path or a missing token" do
      assert :error = ManaVault.share_path("/decks/abc")
      assert :error = ManaVault.share_path("/share/decks/")
      assert :error = ManaVault.share_path("/share/decks")
      assert :error = ManaVault.share_path("/share/wants/")
      assert :error = ManaVault.share_path("/share/wants")
      assert :error = ManaVault.share_path("/share/binder/")
      assert :error = ManaVault.share_path("/share/binder")
    end
  end

  describe "fetch/2 with :deck" do
    setup do
      {:ok, _} = Catalog.import_cards([black_lotus(), time_walk()])
      {:ok, deck} = Catalog.create_deck(%{"name" => "My Cube Deck"})
      add_deck_card!(deck, "Black Lotus", 1, "mainboard")
      add_deck_card!(deck, "Time Walk", 1, "considering")
      {:ok, deck} = Catalog.ensure_deck_share_token(deck)
      %{deck: deck}
    end

    test "resolves the deck's cards with zones, entirely locally", %{deck: deck} do
      assert {:ok, %{source_name: "My Cube Deck", entries: entries}} =
               ManaVault.fetch(:deck, deck.share_token)

      assert [
               %{
                 name: "Black Lotus",
                 quantity: 1,
                 zone: "mainboard",
                 set_code: nil,
                 collector_number: nil
               }
             ] = Enum.filter(entries, &(&1.zone == "mainboard"))

      assert [%{name: "Time Walk", quantity: 1, zone: "considering"}] =
               Enum.filter(entries, &(&1.zone == "considering"))
    end

    test "returns a friendly error for an unknown token" do
      assert {:error, message} = ManaVault.fetch(:deck, "not-a-real-token-not-a-real-token")
      assert message =~ "doesn't match a deck on this ManaVault instance"
    end
  end

  describe "fetch/2 with :wants" do
    setup do
      {:ok, _} = Catalog.import_cards([black_lotus()])
      assert {:ok, _want} = Trade.create_want_by_name("Black Lotus", 3)
      assert {:ok, token} = Trade.ensure_wants_share_token()
      %{token: token}
    end

    test "resolves the want list's entries entirely locally", %{token: token} do
      assert {:ok, %{source_name: "Shared wants", entries: entries}} =
               ManaVault.fetch(:wants, token)

      assert [%{name: "Black Lotus", quantity: 3, zone: "mainboard"}] = entries
    end

    test "returns a friendly error for an unknown token" do
      assert {:error, message} = ManaVault.fetch(:wants, "not-a-real-token-not-a-real-token")
      assert message =~ "doesn't match a shared want list on this ManaVault instance"
    end
  end

  describe "fetch/2 with :binder" do
    setup do
      {:ok, _} = Catalog.import_cards([black_lotus()])

      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => 3,
                 "for_trade" => true
               })

      assert {:ok, token} = Trade.ensure_binder_share_token()
      %{token: token}
    end

    test "resolves the trade binder's entries entirely locally", %{token: token} do
      assert {:ok, %{source_name: "Trade binder", entries: entries}} =
               ManaVault.fetch(:binder, token)

      assert [%{name: "Black Lotus", quantity: 3, zone: "mainboard"}] = entries
    end

    test "returns a friendly error for an unknown token" do
      assert {:error, message} = ManaVault.fetch(:binder, "not-a-real-token-not-a-real-token")
      assert message =~ "doesn't match a shared trade binder on this ManaVault instance"
    end
  end
end
