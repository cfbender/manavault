defmodule Manavault.TradeTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :black_lotus_beta, :time_walk]

  alias Manavault.Catalog
  alias Manavault.Repo
  alias Manavault.Trade
  alias Manavault.Trade.{BinderShare, Want, WantsShare}

  setup do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta, @time_walk])

    :ok
  end

  describe "create_want_by_name/2" do
    test "creates a want for an existing card by exact name" do
      assert {:ok, %Want{quantity: 1, oracle_id: "oracle-1", card: card}} =
               Trade.create_want_by_name("Black Lotus")

      assert card.name == "Black Lotus"
    end

    test "matches card names case-insensitively" do
      assert {:ok, %Want{quantity: 3, card: card}} =
               Trade.create_want_by_name("bLACK loTUS", 3)

      assert card.name == "Black Lotus"
    end

    test "bumps the existing want's quantity instead of duplicating the row" do
      assert {:ok, %Want{id: id, quantity: 2}} = Trade.create_want_by_name("Black Lotus", 2)
      assert {:ok, %Want{id: ^id, quantity: 5}} = Trade.create_want_by_name("Black Lotus", 3)

      assert [%Want{id: ^id, quantity: 5}] = Trade.list_wants()
    end

    test "defaults quantity to 1 when omitted" do
      assert {:ok, %Want{quantity: 1}} = Trade.create_want_by_name("Black Lotus")
    end

    test "returns {:error, :not_found} for an unknown card name" do
      assert {:error, :not_found} = Trade.create_want_by_name("Definitely Not A Real Card")
    end

    test "never bumps an existing printing-specific want for the same card" do
      assert {:ok, specific} = Trade.create_want_by_printing("scryfall-printing-1", 4)

      assert {:ok, generic1} = Trade.create_want_by_name("Black Lotus", 1)
      assert {:ok, generic2} = Trade.create_want_by_name("Black Lotus", 2)

      assert generic1.id == generic2.id
      assert generic2.quantity == 3
      assert generic2.preferred_printing_id == nil
      assert generic2.id != specific.id
      assert Trade.get_want!(specific.id).quantity == 4
    end
  end

  describe "create_want_by_printing/2" do
    test "creates a want for a specific printing" do
      assert {:ok,
              %Want{
                quantity: 1,
                oracle_id: "oracle-1",
                preferred_printing_id: "scryfall-printing-1",
                card: card
              }} = Trade.create_want_by_printing("scryfall-printing-1")

      assert card.name == "Black Lotus"
    end

    test "defaults quantity to 1 when omitted" do
      assert {:ok, %Want{quantity: 1}} = Trade.create_want_by_printing("scryfall-printing-1")
    end

    test "bumps the existing want's quantity for the same printing instead of duplicating" do
      assert {:ok, %Want{id: id, quantity: 2}} =
               Trade.create_want_by_printing("scryfall-printing-1", 2)

      assert {:ok, %Want{id: ^id, quantity: 5}} =
               Trade.create_want_by_printing("scryfall-printing-1", 3)

      assert [%Want{id: ^id, quantity: 5}] = Trade.list_wants()
    end

    test "a generic want and a specific-printing want for the same card coexist" do
      assert {:ok, generic} = Trade.create_want_by_name("Black Lotus")
      assert {:ok, specific} = Trade.create_want_by_printing("scryfall-printing-3")

      assert generic.id != specific.id
      assert generic.preferred_printing_id == nil
      assert specific.oracle_id == generic.oracle_id
      assert specific.preferred_printing_id == "scryfall-printing-3"
      assert length(Trade.list_wants()) == 2
    end

    test "a want for another printing of the same card is untouched by a different printing" do
      assert {:ok, first} = Trade.create_want_by_printing("scryfall-printing-1", 1)
      assert {:ok, second} = Trade.create_want_by_printing("scryfall-printing-3", 1)

      assert first.id != second.id
      assert Trade.get_want!(first.id).quantity == 1
      assert Trade.get_want!(second.id).quantity == 1
    end

    test "returns {:error, :not_found} for an unknown scryfall id" do
      assert {:error, :not_found} = Trade.create_want_by_printing("not-a-real-printing")
    end
  end

  describe "list_wants/0" do
    test "orders wants newest first and preloads the card" do
      assert {:ok, lotus_want} = Trade.create_want_by_name("Black Lotus")
      assert {:ok, walk_want} = Trade.create_want_by_name("Time Walk")

      assert [first, second] = Trade.list_wants()
      assert first.id == walk_want.id
      assert second.id == lotus_want.id
      assert first.card.name == "Time Walk"
    end
  end

  describe "wants_by_oracle_ids/1" do
    test "filters to the requested oracle ids" do
      assert {:ok, lotus_want} = Trade.create_want_by_name("Black Lotus")
      assert {:ok, _walk_want} = Trade.create_want_by_name("Time Walk")

      assert [found] = Trade.wants_by_oracle_ids([lotus_want.oracle_id])
      assert found.id == lotus_want.id
    end

    test "returns an empty list for an empty input" do
      assert Trade.wants_by_oracle_ids([]) == []
    end
  end

  describe "update_want_quantity/2" do
    test "updates the quantity" do
      assert {:ok, want} = Trade.create_want_by_name("Black Lotus")
      assert {:ok, %Want{quantity: 9}} = Trade.update_want_quantity(want, 9)
    end

    test "rejects a quantity below 1" do
      assert {:ok, want} = Trade.create_want_by_name("Black Lotus")
      assert {:error, changeset} = Trade.update_want_quantity(want, 0)
      assert "must be greater than or equal to 1" in errors_on(changeset).quantity
    end
  end

  describe "delete_want/1" do
    test "removes the want" do
      assert {:ok, want} = Trade.create_want_by_name("Black Lotus")
      assert {:ok, %Want{}} = Trade.delete_want(want)
      assert Trade.list_wants() == []
    end
  end

  describe "want_image_url/1" do
    test "resolves the representative printing image" do
      assert {:ok, want} = Trade.create_want_by_name("Black Lotus")
      assert Trade.want_image_url(want) == "https://example.test/black-lotus.jpg"
    end

    test "prefers the preferred printing's image over the representative one" do
      older_printing =
        Map.merge(@black_lotus_beta, %{
          "released_at" => "1990-01-01",
          "image_uris" => %{"normal" => "https://example.test/lotus-beta.jpg"}
        })

      assert {:ok, _result} = Catalog.import_cards([older_printing])
      assert {:ok, want} = Trade.create_want_by_printing("scryfall-printing-3")

      assert Trade.want_image_url(want) == "https://example.test/lotus-beta.jpg"
      # Without a preferred printing, the representative lookup instead picks
      # the most recently released printing — proving the branches differ.
      assert Trade.want_image_url(%Want{want | preferred_printing: nil}) ==
               "https://example.test/black-lotus.jpg"
    end
  end

  describe "wants_share_token/0 and ensure_wants_share_token/0" do
    test "there is no token until one is created" do
      assert Trade.wants_share_token() == nil
    end

    test "creates a token on first use and reuses it on every later call" do
      assert {:ok, token} = Trade.ensure_wants_share_token()
      assert is_binary(token)
      assert Trade.wants_share_token() == token
      assert {:ok, ^token} = Trade.ensure_wants_share_token()
    end

    test "disable deletes duplicates and rotate replaces duplicates with one fresh row" do
      Repo.insert!(
        WantsShare.changeset(%WantsShare{}, %{
          token: Manavault.Catalog.Decks.ShareToken.generate()
        })
      )

      Repo.insert!(
        WantsShare.changeset(%WantsShare{}, %{
          token: Manavault.Catalog.Decks.ShareToken.generate()
        })
      )

      old_tokens = Repo.all(WantsShare) |> Enum.map(& &1.token)

      assert {:ok, 2} = Trade.disable_wants_sharing()
      assert Repo.all(WantsShare) == []

      Enum.each(old_tokens, fn token ->
        Repo.insert!(WantsShare.changeset(%WantsShare{}, %{token: token}))
      end)

      assert {:ok, new_token} = Trade.rotate_wants_share_token()
      assert [%WantsShare{token: ^new_token}] = Repo.all(WantsShare)
      refute new_token in old_tokens
      Enum.each(old_tokens, &refute(Trade.wants_list_by_share_token(&1)))
    end
  end

  describe "wants_list_by_share_token/1" do
    test "returns nil before any token has been created" do
      assert Trade.wants_list_by_share_token("anything") == nil
    end

    test "returns nil for a well-formed token that doesn't match the stored one" do
      assert {:ok, token} = Trade.ensure_wants_share_token()
      wrong_token = token |> String.reverse() |> String.replace("A", "B")

      assert Trade.wants_list_by_share_token(wrong_token) == nil
    end

    test "returns nil for a malformed token" do
      assert {:ok, _token} = Trade.ensure_wants_share_token()
      assert Trade.wants_list_by_share_token("not-a-real-token") == nil
    end

    test "lists generic and printing-specific wants, with printing detail only when set" do
      assert {:ok, _walk_want} = Trade.create_want_by_name("Time Walk", 2)
      assert {:ok, _lotus_want} = Trade.create_want_by_printing("scryfall-printing-3", 1)

      assert {:ok, token} = Trade.ensure_wants_share_token()
      assert %{entries: entries} = Trade.wants_list_by_share_token(token)
      assert length(entries) == 2

      walk_entry = Enum.find(entries, &(&1.card_name == "Time Walk"))
      assert walk_entry.quantity == 2
      assert walk_entry.type_line == "Sorcery"
      assert walk_entry.set_code == nil
      assert walk_entry.collector_number == nil
      assert walk_entry.image_url == nil

      lotus_entry = Enum.find(entries, &(&1.card_name == "Black Lotus"))
      assert lotus_entry.quantity == 1
      assert lotus_entry.type_line == "Artifact"
      assert lotus_entry.set_code == "leb"
      assert lotus_entry.collector_number == "233"
      assert lotus_entry.image_url == "https://example.test/black-lotus.jpg"
    end
  end

  describe "binder_share_token/0 and ensure_binder_share_token/0" do
    test "there is no token until one is created" do
      assert Trade.binder_share_token() == nil
    end

    test "creates a token on first use and reuses it on every later call" do
      assert {:ok, token} = Trade.ensure_binder_share_token()
      assert is_binary(token)
      assert Trade.binder_share_token() == token
      assert {:ok, ^token} = Trade.ensure_binder_share_token()
    end

    test "disable deletes duplicates and rotate replaces duplicates with one fresh row" do
      Repo.insert!(
        BinderShare.changeset(%BinderShare{}, %{
          token: Manavault.Catalog.Decks.ShareToken.generate()
        })
      )

      Repo.insert!(
        BinderShare.changeset(%BinderShare{}, %{
          token: Manavault.Catalog.Decks.ShareToken.generate()
        })
      )

      old_tokens = Repo.all(BinderShare) |> Enum.map(& &1.token)

      assert {:ok, 2} = Trade.disable_binder_sharing()
      assert Repo.all(BinderShare) == []

      Enum.each(old_tokens, fn token ->
        Repo.insert!(BinderShare.changeset(%BinderShare{}, %{token: token}))
      end)

      assert {:ok, new_token} = Trade.rotate_binder_share_token()
      assert [%BinderShare{token: ^new_token}] = Repo.all(BinderShare)
      refute new_token in old_tokens
      Enum.each(old_tokens, &refute(Trade.binder_list_by_share_token(&1)))
    end
  end

  describe "binder_list_by_share_token/1" do
    test "returns nil before any token has been created" do
      assert Trade.binder_list_by_share_token("anything") == nil
    end

    test "returns nil for a well-formed token that doesn't match the stored one" do
      assert {:ok, token} = Trade.ensure_binder_share_token()
      wrong_token = token |> String.reverse() |> String.replace("A", "B")

      assert Trade.binder_list_by_share_token(wrong_token) == nil
    end

    test "returns nil for a malformed token" do
      assert {:ok, _token} = Trade.ensure_binder_share_token()
      assert Trade.binder_list_by_share_token("not-a-real-token") == nil
    end

    test "aggregates for-trade items by printing/finish/condition, ordered by card name" do
      assert {:ok, _item1} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => 2,
                 "for_trade_quantity" => 1
               })

      assert {:ok, _item2} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => 1,
                 "for_trade" => true
               })

      # printing-1 is nonfoil-only, so this row differs by condition alone
      # (a requested foil would be coerced back to nonfoil on create).
      assert {:ok, _item3} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => 1,
                 "condition" => "lightly_played",
                 "for_trade" => true
               })

      # Not for trade: must not appear even though it's the same printing.
      assert {:ok, _not_for_trade} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => 5
               })

      # printing-2 is foil-only in the fixtures, so the finish is explicit.
      assert {:ok, _walk} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-2",
                 "quantity" => 4,
                 "finish" => "foil",
                 "for_trade" => true
               })

      assert {:ok, token} = Trade.ensure_binder_share_token()
      assert %{entries: entries} = Trade.binder_list_by_share_token(token)
      assert length(entries) == 3

      nonfoil =
        Enum.find(entries, &(&1.condition == "near_mint" and &1.card_name == "Black Lotus"))

      assert nonfoil.quantity == 2
      assert nonfoil.finish == "nonfoil"
      assert nonfoil.type_line == "Artifact"
      assert nonfoil.set_code == "lea"
      assert nonfoil.collector_number == "232"
      assert nonfoil.image_url == "https://example.test/black-lotus.jpg"

      played =
        Enum.find(entries, &(&1.condition == "lightly_played" and &1.card_name == "Black Lotus"))

      assert played.quantity == 1
      assert played.finish == "nonfoil"

      walk = Enum.find(entries, &(&1.card_name == "Time Walk"))
      assert walk.quantity == 4
      assert walk.finish == "foil"
      assert walk.condition == "near_mint"
      assert walk.set_code == "lea"
      assert walk.collector_number == "84"
      assert walk.image_url == nil
    end

    test "excludes for-trade items stored in list-kind locations" do
      assert {:ok, wishlist} = Catalog.create_location(%{"name" => "Wishlist", "kind" => "list"})

      assert {:ok, _listed} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => 3,
                 "for_trade" => true,
                 "location_id" => wishlist.id
               })

      assert {:ok, token} = Trade.ensure_binder_share_token()
      assert %{entries: []} = Trade.binder_list_by_share_token(token)
    end
  end
end
