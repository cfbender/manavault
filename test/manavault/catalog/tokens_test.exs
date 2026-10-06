defmodule Manavault.Catalog.TokensTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus]

  alias Manavault.Catalog
  alias Manavault.Catalog.{Printing, TokenItem}

  @treasure_tlea %{
    "id" => "token-treasure-tlea",
    "oracle_id" => "oracle-treasure",
    "name" => "Treasure",
    "type_line" => "Token Artifact — Treasure",
    "layout" => "token",
    "set" => "tlea",
    "set_name" => "Alpha Tokens",
    "set_type" => "token",
    "collector_number" => "1",
    "lang" => "en",
    "finishes" => ["nonfoil", "foil"],
    "released_at" => "1993-08-05"
  }

  @treasure_tleb Map.merge(@treasure_tlea, %{
                   "id" => "token-treasure-tleb",
                   "set" => "tleb",
                   "set_name" => "Beta Tokens",
                   "released_at" => "1993-10-04"
                 })

  @soldier_tlea Map.merge(@treasure_tlea, %{
                  "id" => "token-soldier-tlea",
                  "oracle_id" => "oracle-soldier",
                  "name" => "Soldier",
                  "type_line" => "Token Creature — Soldier",
                  "collector_number" => "2"
                })

  setup do
    producer =
      Map.put(@black_lotus, "all_parts", [
        %{"component" => "token", "id" => "token-treasure-tlea"},
        %{"component" => "token", "id" => "token-soldier-tlea"}
      ])

    {:ok, _result} =
      Catalog.import_cards([producer, @treasure_tlea, @treasure_tleb, @soldier_tlea])

    :ok
  end

  test "add_token_item merges copies of the same printing, back, and finish" do
    assert {:ok, %TokenItem{quantity: 2, finish: "nonfoil", back_scryfall_id: nil}} =
             Catalog.add_token_item(%{scryfall_id: "token-treasure-tlea", quantity: 2})

    assert {:ok, %TokenItem{id: id, quantity: 3}} =
             Catalog.add_token_item(%{"scryfall_id" => "token-treasure-tlea"})

    # A different back face or finish is a separate row.
    assert {:ok, %TokenItem{back_scryfall_id: "token-soldier-tlea", quantity: 1}} =
             Catalog.add_token_item(%{
               scryfall_id: "token-treasure-tlea",
               back_scryfall_id: "token-soldier-tlea"
             })

    assert {:ok, %TokenItem{finish: "foil", quantity: 1}} =
             Catalog.add_token_item(%{scryfall_id: "token-treasure-tlea", finish: "foil"})

    assert [%TokenItem{id: ^id, printing: %Printing{card: %{name: "Treasure"}}} | _rest] =
             Catalog.list_token_items()

    assert length(Catalog.list_token_items()) == 3

    # The name filter matches either printed side.
    assert [%TokenItem{back_scryfall_id: "token-soldier-tlea"}] =
             Catalog.list_token_items(q: "sold")

    assert [] = Catalog.list_token_items(q: "lotus")
  end

  test "add_token_item rejects playable cards and unknown printings" do
    assert {:error, :not_a_token} = Catalog.add_token_item(%{scryfall_id: @black_lotus["id"]})
    assert {:error, :printing_not_found} = Catalog.add_token_item(%{scryfall_id: "nope"})

    assert {:error, :not_a_token} =
             Catalog.add_token_item(%{
               scryfall_id: "token-treasure-tlea",
               back_scryfall_id: @black_lotus["id"]
             })

    assert {:error, %Ecto.Changeset{}} =
             Catalog.add_token_item(%{scryfall_id: "token-treasure-tlea", quantity: 0})
  end

  test "owned counts span printings and back faces of a token" do
    {:ok, _front} = Catalog.add_token_item(%{scryfall_id: "token-treasure-tlea", quantity: 2})
    {:ok, _other} = Catalog.add_token_item(%{scryfall_id: "token-treasure-tleb", quantity: 3})

    {:ok, _double} =
      Catalog.add_token_item(%{
        scryfall_id: "token-soldier-tlea",
        back_scryfall_id: "token-treasure-tlea",
        quantity: 4
      })

    assert %{"oracle-treasure" => 9, "oracle-soldier" => 4} =
             Catalog.owned_token_counts(["oracle-treasure", "oracle-soldier", "oracle-1"])

    # Each produced token shows the printing the producer links to, and the
    # owned count covers every printing of that token.
    assert [
             %{printing: %Printing{scryfall_id: "token-soldier-tlea"}, owned_count: 4},
             %{printing: %Printing{scryfall_id: "token-treasure-tlea"}, owned_count: 9}
           ] = Catalog.produced_tokens_by_oracle_ids(["oracle-1"])["oracle-1"]
  end

  test "update and delete token items" do
    {:ok, item} = Catalog.add_token_item(%{scryfall_id: "token-treasure-tlea", quantity: 2})

    assert {:ok, %TokenItem{quantity: 5, finish: "nonfoil"} = item} =
             Catalog.update_token_item(item, %{quantity: 5})

    assert {:ok, %TokenItem{quantity: 5, finish: "foil"}} =
             Catalog.update_token_item(item, %{finish: "foil"})

    assert {:ok, _deleted} = Catalog.delete_token_item(item)
    assert [] = Catalog.list_token_items()
  end

  test "search_token_printings finds tokens by name and set, excluding a printing" do
    assert [
             %Printing{scryfall_id: "token-treasure-tleb"},
             %Printing{scryfall_id: "token-treasure-tlea"}
           ] =
             Catalog.search_token_printings(q: "treas")

    assert [%Printing{scryfall_id: "token-soldier-tlea"}] =
             Catalog.search_token_printings(
               set_code: "TLEA",
               exclude_scryfall_id: "token-treasure-tlea"
             )

    assert [] = Catalog.search_token_printings(q: "lotus")
    assert [] = Catalog.search_token_printings(q: "")
  end

  describe "search_cards/2 :tokens" do
    test "excludes tokens by default, includes or restricts to them on request" do
      assert ["Black Lotus"] = Catalog.search_cards("") |> Enum.map(& &1.name)

      assert ["Black Lotus", "Soldier", "Treasure"] =
               Catalog.search_cards("", tokens: :include) |> Enum.map(& &1.name)

      assert ["Soldier", "Treasure"] =
               Catalog.search_cards("", tokens: :only) |> Enum.map(& &1.name)
    end
  end

  describe "token_back_options/1" do
    # Real M3C faces: Dragon #12 is printed with Shapeshifter #8, Copy (MH3 #1),
    # or Treasure (MH3 #34, not imported here); Goblin #13 only with Tarmogoyf #22.
    @dragon_m3c Map.merge(@treasure_tlea, %{
                  "id" => "token-dragon-m3c",
                  "oracle_id" => "oracle-dragon",
                  "name" => "Dragon",
                  "set" => "tm3c",
                  "collector_number" => "12"
                })
    @shapeshifter_m3c Map.merge(@dragon_m3c, %{
                        "id" => "token-shapeshifter-m3c",
                        "oracle_id" => "oracle-shapeshifter",
                        "name" => "Shapeshifter",
                        "collector_number" => "8"
                      })
    @goblin_m3c Map.merge(@dragon_m3c, %{
                  "id" => "token-goblin-m3c",
                  "oracle_id" => "oracle-goblin",
                  "name" => "Goblin",
                  "collector_number" => "13"
                })
    @copy_mh3 Map.merge(@dragon_m3c, %{
                "id" => "token-copy-mh3",
                "oracle_id" => "oracle-copy",
                "name" => "Copy",
                "set" => "tmh3",
                "collector_number" => "1"
              })

    setup do
      # A playable card at a paired position must never be offered as a back.
      impostor =
        Map.merge(@black_lotus, %{
          "id" => "card-at-tmh3-34",
          "set" => "tmh3",
          "collector_number" => "34"
        })

      {:ok, _result} =
        Catalog.import_cards([@dragon_m3c, @shapeshifter_m3c, @goblin_m3c, @copy_mh3, impostor])

      :ok
    end

    test "lists known backs in data order, then the set's other tokens" do
      assert %{known: known, same_set: same_set} =
               Catalog.token_back_options("token-dragon-m3c")

      assert [
               %Printing{scryfall_id: "token-shapeshifter-m3c", card: %{name: "Shapeshifter"}},
               %Printing{scryfall_id: "token-copy-mh3", card: %{name: "Copy"}}
             ] = known

      assert [%Printing{scryfall_id: "token-goblin-m3c"}] = same_set
    end

    test "falls back to the set when no known back is in the catalog" do
      assert %{known: [], same_set: same_set} = Catalog.token_back_options("token-goblin-m3c")

      assert ["token-dragon-m3c", "token-shapeshifter-m3c"] =
               same_set |> Enum.map(& &1.scryfall_id) |> Enum.sort()
    end

    test "is empty for an unknown printing" do
      assert %{known: [], same_set: []} = Catalog.token_back_options("nope")
    end

    test "offers the set's emblems as backs and records them on owned tokens" do
      # Real TINR pairing: Human Wizard #5 is printed with the Jace, Unraveler of
      # Secrets emblem #25 on its back.
      human_wizard =
        Map.merge(@treasure_tlea, %{
          "id" => "token-human-wizard-inr",
          "oracle_id" => "oracle-human-wizard",
          "name" => "Human Wizard",
          "set" => "tinr",
          "collector_number" => "5"
        })

      emblem =
        Map.merge(human_wizard, %{
          "id" => "emblem-jace-inr",
          "oracle_id" => "oracle-jace-emblem",
          "name" => "Jace, Unraveler of Secrets Emblem",
          "type_line" => "Emblem — Jace",
          "layout" => "emblem",
          "collector_number" => "25"
        })

      {:ok, _result} = Catalog.import_cards([human_wizard, emblem])

      assert %{known: [], same_set: [%Printing{scryfall_id: "emblem-jace-inr"}]} =
               Catalog.token_back_options("token-human-wizard-inr")

      assert {:ok, %TokenItem{back_scryfall_id: "emblem-jace-inr"}} =
               Catalog.add_token_item(%{
                 scryfall_id: "token-human-wizard-inr",
                 back_scryfall_id: "emblem-jace-inr",
                 quantity: 1,
                 finish: "nonfoil"
               })

      assert %{known: [%Printing{scryfall_id: "emblem-jace-inr"}], same_set: []} =
               Catalog.token_back_options("token-human-wizard-inr")

      assert %{known: [%Printing{scryfall_id: "token-human-wizard-inr"}], same_set: []} =
               Catalog.token_back_options("emblem-jace-inr")
    end

    test "learns backs from owned tokens in both directions, ahead of gallery data" do
      # Goblin owned with Dragon on its back: Dragon learns Goblin even though the
      # gallery data only pairs Goblin with Tarmogoyf.
      {:ok, _item} =
        Catalog.add_token_item(%{
          "scryfall_id" => "token-goblin-m3c",
          "back_scryfall_id" => "token-dragon-m3c",
          "quantity" => 2
        })

      # Dragon owned with Copy on its back: already a gallery pairing, so Copy
      # moves ahead of Shapeshifter without being listed twice.
      {:ok, _item} =
        Catalog.add_token_item(%{
          "scryfall_id" => "token-dragon-m3c",
          "back_scryfall_id" => "token-copy-mh3"
        })

      assert %{known: known, same_set: same_set} =
               Catalog.token_back_options("token-dragon-m3c")

      assert ["token-goblin-m3c", "token-copy-mh3", "token-shapeshifter-m3c"] =
               Enum.map(known, & &1.scryfall_id)

      assert same_set == []

      assert %{known: [%Printing{scryfall_id: "token-dragon-m3c"}]} =
               Catalog.token_back_options("token-goblin-m3c")
    end

    test "ignores owned tokens without a recorded back" do
      {:ok, _item} = Catalog.add_token_item(%{"scryfall_id" => "token-goblin-m3c"})

      assert %{known: []} = Catalog.token_back_options("token-goblin-m3c")
    end
  end
end
