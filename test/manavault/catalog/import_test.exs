defmodule Manavault.Catalog.ImportTest do
  use Manavault.DataCase

  use Manavault.CatalogTestFixtures,
    fixtures: [:black_lotus, :renamed_lotus, :reversible_lotus, :time_walk, :plains]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    Printing
  }

  test "import_cards stores identities and printings and safely updates on rerun" do
    card = Map.put(@black_lotus, "illustration_id", "illustration-top-level")
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([card])

    assert %Card{
             name: "Black Lotus",
             color_identity: "[]",
             game_changer: false,
             edhrec_rank: 1,
             rulings_uri: "https://api.scryfall.com/cards/oracle-1/rulings"
           } = Repo.get!(Card, "oracle-1")

    assert %Printing{
             scryfall_id: "scryfall-printing-1",
             oracle_id: "oracle-1",
             set_code: "lea",
             collector_number: "232",
             illustration_id: "illustration-top-level",
             released_at: ~D[1993-08-05]
           } =
             Catalog.get_printing_by_scryfall_id("scryfall-printing-1")

    assert %Printing{scryfall_id: "scryfall-printing-1"} = Catalog.get_printing("LEA", "232")
    assert [%Card{oracle_id: "oracle-1"}] = Catalog.search_cards("lotus")

    assert %Card{printings: [%Printing{scryfall_id: "scryfall-printing-1"}]} =
             Catalog.get_card_with_printings("oracle-1")

    assert [%Printing{scryfall_id: "scryfall-printing-1", card: %Card{name: "Black Lotus"}}] =
             Catalog.search_printings(name: "lotus", set_code: "LEA", collector_number: "232")

    assert [] = Catalog.search_printings(name: "", set_code: "", collector_number: "")
    assert [%{set_code: "lea", set_name: "Limited Edition Alpha"}] = Catalog.search_sets("alpha")

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([
               @renamed_lotus
               |> Map.put("game_changer", true)
               |> Map.put("illustration_id", "illustration-updated")
             ])

    assert Repo.aggregate(Card, :count) == 1
    assert Repo.aggregate(Printing, :count) == 1

    assert %Card{
             name: "Black Lotus Updated",
             game_changer: true,
             rulings_uri: "https://api.scryfall.com/cards/oracle-1/rulings-updated"
           } = Repo.get!(Card, "oracle-1")

    assert %Printing{prices: prices, illustration_id: "illustration-updated"} =
             Repo.get!(Printing, "scryfall-printing-1")

    assert Jason.decode!(prices) == %{"usd" => "1.00"}
  end

  test "import_cards uses the first face illustration when the top-level value is absent" do
    card =
      @black_lotus
      |> Map.delete("illustration_id")
      |> Map.put("card_faces", [
        %{"illustration_id" => "front-illustration"},
        %{"illustration_id" => "back-illustration"}
      ])

    assert {:ok, _result} = Catalog.import_cards([card])
    assert %Printing{illustration_id: "front-illustration"} = Repo.get!(Printing, card["id"])
  end

  test "import_cards takes a reversible card's identity from its first face" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([@reversible_lotus])

    assert %Card{name: "Black Lotus", type_line: "Artifact", mana_cost: "{0}"} =
             Repo.get!(Card, "oracle-1")

    assert %Printing{oracle_id: "oracle-1", collector_number: "351"} =
             Repo.get!(Printing, "scryfall-reversible-1")
  end

  test "import_cards keeps the canonical card whichever order a reversible printing arrives" do
    for cards <- [[@reversible_lotus, @black_lotus], [@black_lotus, @reversible_lotus]] do
      Repo.delete_all(Printing)
      Repo.delete_all(Card)

      assert {:ok, _result} = Catalog.import_cards(cards)
      assert %Card{name: "Black Lotus", type_line: "Artifact"} = Repo.get!(Card, "oracle-1")
      assert Repo.aggregate(Printing, :count) == 2
    end
  end

  test "import_cards excludes memorabilia and token-set cards that are not tokens" do
    memorabilia =
      Map.merge(@black_lotus, %{
        "id" => "scryfall-memorabilia",
        "set" => "alea",
        "set_name" => "Alpha Art Series",
        "set_type" => "memorabilia"
      })

    emblem =
      Map.merge(@black_lotus, %{
        "id" => "scryfall-emblem",
        "oracle_id" => "oracle-emblem",
        "name" => "Lotus Emblem",
        "layout" => "emblem",
        "set" => "tlea",
        "set_name" => "Alpha Tokens",
        "set_type" => "token"
      })

    # Emblems are printed on token backs, so they import as tokens.
    assert {:ok, %{cards_count: 2, printings_count: 2, source_count: 3}} =
             Catalog.import_cards([@black_lotus, memorabilia, emblem])

    assert Repo.get!(Printing, @black_lotus["id"])
    refute Repo.get(Printing, memorabilia["id"])
    assert Repo.get!(Printing, emblem["id"])
    assert %Card{layout: "emblem"} = emblem_card = Repo.get!(Card, emblem["oracle_id"])
    assert Card.token?(emblem_card)
  end

  test "import_cards keeps bare-\"Card\" helper tokens but not inserts or counter cards" do
    # Real Scryfall shapes: game helpers are typed "Card" exactly like inserts.
    bare = fn id, overrides ->
      Map.merge(
        @black_lotus,
        Map.merge(
          %{
            "id" => id,
            "oracle_id" => "oracle-" <> id,
            "type_line" => "Card",
            "layout" => "token",
            "set" => "tlea",
            "set_name" => "Alpha Tokens",
            "set_type" => "token"
          },
          overrides
        )
      )
    end

    adventure = bare.("on-an-adventure", %{"name" => "On an Adventure"})

    day_night =
      bare.("day-night", %{
        "name" => "Day // Night",
        "type_line" => "Card // Card",
        "layout" => "double_faced_token"
      })

    # Non-game inserts: decklists and ads in memorabilia sets, minigame cards,
    # checklists and substitute cards in token sets.
    decklist =
      bare.("decklist", %{
        "name" => "Aeo Paquette Decklist",
        "set" => "wc04",
        "set_type" => "memorabilia"
      })

    minigame =
      bare.("booster-blitz", %{
        "name" => "Booster Blitz",
        "set" => "mone",
        "set_type" => "minigame"
      })

    checklist = bare.("checklist", %{"name" => "Innistrad Checklist"})

    substitute =
      bare.("substitute", %{"name" => "Double-Faced Substitute Card", "layout" => "normal"})

    # Bare "Card" cards Scryfall does not file as tokens stay out: they would
    # otherwise become playable collection cards.
    poison = bare.("poison", %{"name" => "Poison Counter", "layout" => "normal"})

    red_mana =
      bare.("red-mana", %{
        "name" => "Red Mana",
        "layout" => "normal",
        "set" => "sld",
        "set_type" => "box"
      })

    assert {:ok, %{cards_count: 2, printings_count: 2, source_count: 8}} =
             Catalog.import_cards([
               adventure,
               day_night,
               decklist,
               minigame,
               checklist,
               substitute,
               poison,
               red_mana
             ])

    assert %Card{layout: "token"} = Repo.get!(Card, adventure["oracle_id"])
    assert Repo.get!(Printing, day_night["id"])

    for card <- [decklist, minigame, checklist, substitute, poison, red_mana] do
      refute Repo.get(Printing, card["id"]), "#{card["name"]} should not be imported"
    end
  end

  test "import_cards keeps tokens, records layouts, and links producers to their tokens" do
    producer =
      Map.merge(@black_lotus, %{
        "layout" => "normal",
        "all_parts" => [
          %{"component" => "combo_piece", "id" => "scryfall-printing-1", "name" => "Black Lotus"},
          %{"component" => "token", "id" => "scryfall-treasure-token", "name" => "Treasure"},
          %{"component" => "token", "id" => "scryfall-missing-token", "name" => "Missing"}
        ]
      })

    token =
      Map.merge(@black_lotus, %{
        "id" => "scryfall-treasure-token",
        "oracle_id" => "oracle-treasure",
        "name" => "Treasure",
        "type_line" => "Token Artifact — Treasure",
        "layout" => "token",
        "set" => "tlea",
        "set_name" => "Alpha Tokens",
        "set_type" => "token",
        "all_parts" => [
          %{"component" => "token", "id" => "scryfall-treasure-token", "name" => "Treasure"},
          %{"component" => "combo_piece", "id" => "scryfall-printing-1", "name" => "Black Lotus"}
        ]
      })

    assert {:ok, %{cards_count: 2, printings_count: 2}} = Catalog.import_cards([producer, token])

    assert %Card{layout: "normal"} = Repo.get!(Card, "oracle-1")
    assert %Card{layout: "token"} = token_card = Repo.get!(Card, "oracle-treasure")
    assert Card.token?(token_card)

    assert [%{printing: %Printing{scryfall_id: "scryfall-treasure-token"}, owned_count: 0}] =
             Catalog.produced_tokens_by_oracle_ids(["oracle-1"])["oracle-1"]

    # Links only point from producers to tokens, never the other way round.
    refute Map.has_key?(
             Catalog.produced_tokens_by_oracle_ids(["oracle-treasure"]),
             "oracle-treasure"
           )

    # Token cards never surface as playable cards.
    assert [] = Catalog.search_cards("treasure")
    assert nil == Catalog.find_card_by_name("Treasure")
    assert [] = Catalog.search_printings(name: "Treasure")
    refute "Treasure" in Catalog.suggest_card_names("Treas")

    # A rerun that drops a link removes it.
    assert {:ok, _result} = Catalog.import_cards([Map.put(producer, "all_parts", [])])
    assert %{} == Catalog.produced_tokens_by_oracle_ids(["oracle-1"])
  end

  test "import_cards only writes rows whose stored data changed" do
    producer =
      Map.put(@black_lotus, "all_parts", [
        %{"component" => "token", "id" => "scryfall-treasure-token", "name" => "Treasure"},
        %{"component" => "token", "id" => "scryfall-clue-token", "name" => "Clue"}
      ])

    assert {:ok, %{written_cards_count: 2, written_printings_count: 2}} =
             Catalog.import_cards([producer, @time_walk])

    # An identical rerun reads but never writes, so it never takes the lock.
    {result, writes} = with_catalog_writes(fn -> Catalog.import_cards([producer, @time_walk]) end)

    assert {:ok, %{cards_count: 2, printings_count: 2}} = result
    assert {:ok, %{written_cards_count: 0, written_printings_count: 0}} = result
    assert writes == []

    # A price change rewrites that printing only; its card and links are untouched.
    repriced = put_in(producer, ["prices", "usd"], "99.00")

    {result, writes} = with_catalog_writes(fn -> Catalog.import_cards([repriced, @time_walk]) end)

    assert {:ok, %{written_cards_count: 0, written_printings_count: 1}} = result
    assert [{"insert", "scryfall_printings"}] = writes
    assert Jason.decode!(Repo.get!(Printing, "scryfall-printing-1").prices) == %{"usd" => "99.00"}

    # Dropping a token link relinks that printing without touching card rows.
    unlinked = Map.put(repriced, "all_parts", List.first(producer["all_parts"]) |> List.wrap())

    {result, writes} = with_catalog_writes(fn -> Catalog.import_cards([unlinked, @time_walk]) end)

    assert {:ok, %{written_cards_count: 0, written_printings_count: 0}} = result
    assert [{"delete", "scryfall_card_tokens"}, {"insert", "scryfall_card_tokens"}] = writes

    assert [%{token_scryfall_id: "scryfall-treasure-token"}] =
             Repo.all(Manavault.Catalog.CardToken)

    # Oracle-level changes rewrite the card only.
    {result, writes} =
      with_catalog_writes(fn ->
        Catalog.import_cards([Map.put(unlinked, "edhrec_rank", 7), @time_walk])
      end)

    assert {:ok, %{written_cards_count: 1, written_printings_count: 0}} = result
    assert [{"insert", "scryfall_cards"}] = writes
    assert Repo.get!(Card, "oracle-1").edhrec_rank == 7
  end

  test "import_cards skips oracle tag columns in the diff when tags are not being replaced" do
    assert {:ok, _result} = Catalog.import_cards([@black_lotus], oracle_tags: :skip)
    Repo.update_all(Card, set: [oracle_tags: ~s(["ramp"]), deck_category: "ramp"])

    {result, writes} =
      with_catalog_writes(fn -> Catalog.import_cards([@black_lotus], oracle_tags: :skip) end)

    assert {:ok, %{written_cards_count: 0}} = result
    assert writes == []
    assert Repo.get!(Card, "oracle-1").deck_category == "ramp"
  end

  test "import_cards releases the write lock between batches" do
    test_pid = self()
    handler_id = {__MODULE__, make_ref()}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, pid ->
          query = metadata |> Map.get(:query, "") |> to_string() |> String.downcase()

          if query == "commit" or String.starts_with?(query, "release savepoint") do
            send(pid, {:catalog_import_batch_committed, System.monotonic_time(:millisecond)})
          end
        end,
        test_pid
      )

    on_exit(fn -> :telemetry.detach(handler_id) end)

    cards =
      Enum.map(1..205, fn index ->
        %{
          @time_walk
          | "id" => "scryfall-batched-#{index}",
            "oracle_id" => "oracle-batched-#{index}",
            "name" => "Batched Card #{index}",
            "collector_number" => "#{index}"
        }
      end)

    assert {:ok, %{cards_count: 205, printings_count: 205}} = Catalog.import_cards(cards)
    assert_receive {:catalog_import_batch_committed, first_commit_at}
    assert_receive {:catalog_import_batch_committed, second_commit_at}
    # Waiters poll the lock every 50ms, so the gap between commits must exceed that.
    assert second_commit_at - first_commit_at >= 75
    assert Repo.aggregate(Card, :count) == 205
    assert Repo.aggregate(Printing, :count) == 205

    assert [%Printing{scryfall_id: "scryfall-batched-205"}] =
             Catalog.search_printings(
               name: "Batched Card 205",
               set_code: "LEA",
               collector_number: "205"
             )
  end

  test "import_cards rolls back every write in a failed batch" do
    Repo.query!("""
    CREATE TEMP TRIGGER fail_catalog_batch
    BEFORE INSERT ON scryfall_printings
    WHEN NEW.scryfall_id = 'scryfall-atomic-batch'
    BEGIN
      SELECT RAISE(ABORT, 'catalog batch test failure');
    END
    """)

    card = %{
      @time_walk
      | "id" => "scryfall-atomic-batch",
        "oracle_id" => "oracle-atomic-batch",
        "name" => "Atomic Batch Card"
    }

    assert_raise Exqlite.Error, ~r/catalog batch test failure/, fn ->
      Catalog.import_cards([card])
    end

    refute Repo.get(Card, "oracle-atomic-batch")
    refute Repo.get(Printing, "scryfall-atomic-batch")
  end

  test "import_cards stores selected oracle tags and derives deck grouping fields" do
    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-ramp",
        "slug" => "ramp",
        "label" => "Ramp",
        "type" => "function",
        "taggings" => [
          %{
            "oracle_id" => "oracle-1",
            "weight" => 0.93,
            "annotation" => "fast mana"
          }
        ]
      }),
      scryfall_tag(%{
        "id" => "tag-removal",
        "slug" => "spot-removal",
        "label" => "Spot Removal",
        "type" => "oracle",
        "taggings" => [
          %{
            "oracle_id" => "oracle-2",
            "weight" => 0.81,
            "annotation" => "answers a permanent"
          }
        ]
      }),
      scryfall_tag(%{
        "id" => "tag-art",
        "slug" => "flower",
        "label" => "Flower",
        "type" => "artwork",
        "taggings" => [
          %{
            "illustration_id" => "illustration-1",
            "weight" => 0.99,
            "annotation" => "visible in the art"
          }
        ]
      })
    ]

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk], nil, oracle_tags: oracle_tags)

    assert %Card{
             oracle_tags: lotus_tags_json,
             deck_category: "ramp",
             deck_themes: lotus_themes_json
           } = Repo.get!(Card, "oracle-1")

    assert [
             %{
               "id" => "tag-ramp",
               "slug" => "ramp",
               "label" => "Ramp",
               "weight" => 0.93,
               "annotation" => "fast mana"
             }
           ] = Jason.decode!(lotus_tags_json)

    assert "ramp" in Jason.decode!(lotus_themes_json)
    assert "artifact" in Jason.decode!(lotus_themes_json)
    refute "flower" in Jason.decode!(lotus_themes_json)

    assert %Card{
             oracle_tags: walk_tags_json,
             deck_category: "targeted_disruption",
             deck_themes: walk_themes_json
           } = Repo.get!(Card, "oracle-2")

    assert [
             %{
               "id" => "tag-removal",
               "slug" => "spot-removal",
               "label" => "Spot Removal",
               "weight" => 0.81,
               "annotation" => "answers a permanent"
             }
           ] = Jason.decode!(walk_tags_json)

    assert Enum.any?(Jason.decode!(walk_themes_json), &(&1 in ["removal", "spot_removal"]))
    assert "sorcery" in Jason.decode!(walk_themes_json)
  end

  test "import_cards derives themes from inherited oracle tag parents" do
    weftwalking = %{
      @black_lotus
      | "id" => "scryfall-weftwalking",
        "oracle_id" => "oracle-weftwalking",
        "name" => "Weftwalking",
        "type_line" => "Enchantment",
        "oracle_text" =>
          "When this enchantment enters, if you cast it, shuffle your hand and graveyard into your library, then draw seven cards."
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-card-advantage",
        "slug" => "card-advantage",
        "label" => "card advantage",
        "type" => "oracle"
      }),
      scryfall_tag(%{
        "id" => "tag-draw",
        "slug" => "draw",
        "label" => "draw",
        "type" => "oracle",
        "parent_ids" => ["tag-card-advantage"]
      }),
      scryfall_tag(%{
        "id" => "tag-burst-draw",
        "slug" => "burst-draw",
        "label" => "burst draw",
        "type" => "oracle",
        "parent_ids" => ["tag-draw"],
        "taggings" => [%{"oracle_id" => "oracle-weftwalking", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-recursion",
        "slug" => "recursion",
        "label" => "recursion",
        "type" => "oracle"
      }),
      scryfall_tag(%{
        "id" => "tag-restock",
        "slug" => "restock",
        "label" => "restock",
        "type" => "oracle",
        "parent_ids" => ["tag-recursion"]
      }),
      scryfall_tag(%{
        "id" => "tag-restock-all",
        "slug" => "restock-all",
        "label" => "restock-all",
        "type" => "oracle",
        "parent_ids" => ["tag-restock"],
        "taggings" => [%{"oracle_id" => "oracle-weftwalking", "weight" => "median"}]
      })
    ]

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([weftwalking], nil, oracle_tags: oracle_tags)

    assert %Card{
             deck_category: "card_advantage",
             deck_themes: themes_json,
             oracle_tags: tags_json
           } = Repo.get!(Card, "oracle-weftwalking")

    themes = Jason.decode!(themes_json)
    tag_slugs = tags_json |> Jason.decode!() |> Enum.map(& &1["slug"])

    assert "card_advantage" in themes
    assert "recursion" in themes
    assert "enchantment" in themes
    assert "burst-draw" in tag_slugs
    assert "restock-all" in tag_slugs
  end

  test "import_cards scores category by tag count before priority" do
    path_to_exile = %{
      @time_walk
      | "id" => "scryfall-path-to-exile",
        "oracle_id" => "oracle-path-to-exile",
        "name" => "Path to Exile",
        "type_line" => "Instant",
        "oracle_text" =>
          "Exile target creature. Its controller may search their library for a basic land card."
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-ramp",
        "slug" => "ramp",
        "label" => "Ramp",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-land-ramp",
        "slug" => "land-ramp",
        "label" => "Land Ramp",
        "type" => "function",
        "parent_ids" => ["tag-ramp"],
        "taggings" => [%{"oracle_id" => "oracle-path-to-exile", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-removal",
        "slug" => "removal",
        "label" => "Removal",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-removal-creature",
        "slug" => "removal-creature",
        "label" => "Removal Creature",
        "type" => "function",
        "parent_ids" => ["tag-removal"],
        "taggings" => [%{"oracle_id" => "oracle-path-to-exile", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-removal-exile",
        "slug" => "removal-exile",
        "label" => "Removal Exile",
        "type" => "function",
        "parent_ids" => ["tag-removal"],
        "taggings" => [%{"oracle_id" => "oracle-path-to-exile", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-spot-removal",
        "slug" => "spot-removal",
        "label" => "Spot Removal",
        "type" => "function",
        "parent_ids" => ["tag-removal"],
        "taggings" => [%{"oracle_id" => "oracle-path-to-exile", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-tutor",
        "slug" => "tutor",
        "label" => "Tutor",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-tutor-land-basic",
        "slug" => "tutor-land-basic",
        "label" => "Tutor Land Basic",
        "type" => "function",
        "parent_ids" => ["tag-tutor"],
        "taggings" => [%{"oracle_id" => "oracle-path-to-exile", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-tutor-land-to-battlefield",
        "slug" => "tutor-land-to-battlefield",
        "label" => "Tutor Land To Battlefield",
        "type" => "function",
        "parent_ids" => ["tag-tutor"],
        "taggings" => [%{"oracle_id" => "oracle-path-to-exile", "weight" => "median"}]
      })
    ]

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([path_to_exile], nil, oracle_tags: oracle_tags)

    assert %Card{deck_category: "targeted_disruption", deck_themes: themes_json} =
             Repo.get!(Card, "oracle-path-to-exile")

    assert ["removal", "ramp", "tutor", "instant"] = Jason.decode!(themes_json)
  end

  test "import_cards uses category priority only to break tied tag counts" do
    mixed_card = %{
      @time_walk
      | "id" => "scryfall-even-ramp-removal",
        "oracle_id" => "oracle-even-ramp-removal",
        "name" => "Even Ramp Removal",
        "type_line" => "Instant"
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-land-ramp",
        "slug" => "land-ramp",
        "label" => "Land Ramp",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-even-ramp-removal", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-spot-removal",
        "slug" => "spot-removal",
        "label" => "Spot Removal",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-even-ramp-removal", "weight" => "median"}]
      })
    ]

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([mixed_card], nil, oracle_tags: oracle_tags)

    assert %Card{deck_category: "ramp", deck_themes: themes_json} =
             Repo.get!(Card, "oracle-even-ramp-removal")

    assert ["ramp", "removal", "instant"] = Jason.decode!(themes_json)
  end

  test "import_cards categorizes single-card disruption beyond spot removal" do
    wasteland = %{
      @plains
      | "id" => "scryfall-wasteland",
        "oracle_id" => "oracle-wasteland",
        "name" => "Wasteland",
        "collector_number" => "wasteland"
    }

    counterspell = %{
      @time_walk
      | "id" => "scryfall-counterspell",
        "oracle_id" => "oracle-counterspell",
        "name" => "Counterspell",
        "type_line" => "Instant",
        "collector_number" => "counterspell"
    }

    flawless_maneuver = %{
      @time_walk
      | "id" => "scryfall-flawless-maneuver",
        "oracle_id" => "oracle-flawless-maneuver",
        "name" => "Flawless Maneuver",
        "type_line" => "Instant",
        "collector_number" => "flawless-maneuver"
    }

    swiftfoot_boots = %{
      @black_lotus
      | "id" => "scryfall-swiftfoot-boots",
        "oracle_id" => "oracle-swiftfoot-boots",
        "name" => "Swiftfoot Boots",
        "type_line" => "Artifact — Equipment",
        "collector_number" => "swiftfoot-boots"
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-spot-removal",
        "slug" => "spot-removal",
        "label" => "Spot Removal",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-wasteland", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-counterspell",
        "slug" => "counterspell",
        "label" => "Counterspell",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-counterspell", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-protection",
        "slug" => "protection",
        "label" => "Protection",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-protects-creature",
        "slug" => "protects-creature",
        "label" => "Protects Creature",
        "type" => "function",
        "parent_ids" => ["tag-protection"],
        "taggings" => [
          %{"oracle_id" => "oracle-flawless-maneuver", "weight" => "median"},
          %{"oracle_id" => "oracle-swiftfoot-boots", "weight" => "median"}
        ]
      })
    ]

    assert {:ok, %{cards_count: 4, printings_count: 4}} =
             Catalog.import_cards(
               [wasteland, counterspell, flawless_maneuver, swiftfoot_boots],
               nil,
               oracle_tags: oracle_tags
             )

    assert %Card{deck_category: "targeted_disruption", deck_themes: wasteland_themes} =
             Repo.get!(Card, "oracle-wasteland")

    assert List.first(Jason.decode!(wasteland_themes)) == "removal"

    assert %Card{deck_category: "targeted_disruption", deck_themes: counterspell_themes} =
             Repo.get!(Card, "oracle-counterspell")

    assert List.first(Jason.decode!(counterspell_themes)) == "counterspell"

    assert %Card{deck_category: "targeted_disruption", deck_themes: maneuver_themes} =
             Repo.get!(Card, "oracle-flawless-maneuver")

    assert List.first(Jason.decode!(maneuver_themes)) == "protection"

    assert %Card{deck_category: "other", deck_themes: boots_themes} =
             Repo.get!(Card, "oracle-swiftfoot-boots")

    assert "protection" in Jason.decode!(boots_themes)
  end

  test "import_cards lets functional tags categorize utility lands" do
    waterlogged_grove = %{
      @plains
      | "id" => "scryfall-waterlogged-grove",
        "oracle_id" => "oracle-waterlogged-grove",
        "name" => "Waterlogged Grove",
        "collector_number" => "waterlogged-grove"
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-card-draw",
        "slug" => "card-draw",
        "label" => "Card Draw",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-pure-draw",
        "slug" => "pure-draw",
        "label" => "Pure Draw",
        "type" => "function",
        "parent_ids" => ["tag-card-draw"],
        "taggings" => [%{"oracle_id" => "oracle-waterlogged-grove", "weight" => "median"}]
      })
    ]

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([waterlogged_grove], nil, oracle_tags: oracle_tags)

    assert %Card{deck_category: "card_advantage", deck_themes: themes_json} =
             Repo.get!(Card, "oracle-waterlogged-grove")

    assert ["card_advantage", "land"] = Jason.decode!(themes_json)
  end

  test "import_cards ignores hand-neutral card draw tags unless hand-positive" do
    sheltered_thicket =
      Map.merge(@plains, %{
        "id" => "scryfall-sheltered-thicket",
        "oracle_id" => "oracle-sheltered-thicket",
        "name" => "Sheltered Thicket",
        "type_line" => "Land — Mountain Forest",
        "oracle_text" => "({T}: Add {R} or {G}.)\nCycling {2}",
        "collector_number" => "169"
      })

    accumulate_wisdom = %{
      @time_walk
      | "id" => "scryfall-accumulate-wisdom",
        "oracle_id" => "oracle-accumulate-wisdom",
        "name" => "Accumulate Wisdom",
        "type_line" => "Instant",
        "oracle_text" => "Draw cards.",
        "collector_number" => "42"
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-card-draw",
        "slug" => "card-draw",
        "label" => "Card Draw",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-hand-neutral",
        "slug" => "hand-neutral",
        "label" => "Hand Neutral",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-hand-positive",
        "slug" => "hand-positive",
        "label" => "Hand Positive",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-cycling",
        "slug" => "cycling",
        "label" => "Cycling",
        "type" => "function",
        "parent_ids" => ["tag-card-draw", "tag-hand-neutral"],
        "taggings" => [%{"oracle_id" => "oracle-sheltered-thicket", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-accumulate-wisdom",
        "slug" => "accumulate-wisdom",
        "label" => "Accumulate Wisdom",
        "type" => "function",
        "parent_ids" => ["tag-card-draw", "tag-hand-neutral", "tag-hand-positive"],
        "taggings" => [%{"oracle_id" => "oracle-accumulate-wisdom", "weight" => "median"}]
      })
    ]

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([sheltered_thicket, accumulate_wisdom], nil,
               oracle_tags: oracle_tags
             )

    assert %Card{deck_category: "lands", deck_themes: thicket_themes_json} =
             Repo.get!(Card, "oracle-sheltered-thicket")

    thicket_themes = Jason.decode!(thicket_themes_json)
    assert thicket_themes == ["land"]
    refute "card_advantage" in thicket_themes

    assert %Card{deck_category: "card_advantage", deck_themes: wisdom_themes_json} =
             Repo.get!(Card, "oracle-accumulate-wisdom")

    wisdom_themes = Jason.decode!(wisdom_themes_json)
    assert "card_advantage" in wisdom_themes
    assert "instant" in wisdom_themes
  end

  test "import_cards categorizes mass disruption beyond board wipes" do
    fog = %{
      @time_walk
      | "id" => "scryfall-fog",
        "oracle_id" => "oracle-fog",
        "name" => "Fog",
        "type_line" => "Instant",
        "collector_number" => "fog"
    }

    propaganda = %{
      @time_walk
      | "id" => "scryfall-propaganda",
        "oracle_id" => "oracle-propaganda",
        "name" => "Propaganda",
        "type_line" => "Enchantment",
        "collector_number" => "propaganda"
    }

    disrupt_decorum = %{
      @time_walk
      | "id" => "scryfall-disrupt-decorum",
        "oracle_id" => "oracle-disrupt-decorum",
        "name" => "Disrupt Decorum",
        "type_line" => "Sorcery",
        "collector_number" => "disrupt-decorum"
    }

    rest_in_peace = %{
      @time_walk
      | "id" => "scryfall-rest-in-peace",
        "oracle_id" => "oracle-rest-in-peace",
        "name" => "Rest in Peace",
        "type_line" => "Enchantment",
        "collector_number" => "rest-in-peace"
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-fog",
        "slug" => "fog",
        "label" => "Fog",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-fog", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-pillowfort",
        "slug" => "pillowfort",
        "label" => "Pillowfort",
        "type" => "function"
      }),
      scryfall_tag(%{
        "id" => "tag-tax-attack",
        "slug" => "tax-attack",
        "label" => "Tax Attack",
        "type" => "function",
        "parent_ids" => ["tag-pillowfort"],
        "taggings" => [%{"oracle_id" => "oracle-propaganda", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-graveyard-hate",
        "slug" => "graveyard-hate",
        "label" => "Graveyard Hate",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-rest-in-peace", "weight" => "median"}]
      }),
      scryfall_tag(%{
        "id" => "tag-pseudo-fog",
        "slug" => "pseudo-fog",
        "label" => "Pseudo Fog",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-disrupt-decorum", "weight" => "median"}]
      })
    ]

    assert {:ok, %{cards_count: 4, printings_count: 4}} =
             Catalog.import_cards([fog, propaganda, disrupt_decorum, rest_in_peace], nil,
               oracle_tags: oracle_tags
             )

    assert %Card{deck_category: "mass_disruption", deck_themes: fog_themes} =
             Repo.get!(Card, "oracle-fog")

    assert List.first(Jason.decode!(fog_themes)) == "fog"

    assert %Card{deck_category: "mass_disruption", deck_themes: propaganda_themes} =
             Repo.get!(Card, "oracle-propaganda")

    assert List.first(Jason.decode!(propaganda_themes)) == "pillowfort"

    assert %Card{deck_category: "mass_disruption", deck_themes: decorum_themes} =
             Repo.get!(Card, "oracle-disrupt-decorum")

    assert List.first(Jason.decode!(decorum_themes)) == "fog"

    assert %Card{deck_category: "mass_disruption", deck_themes: rest_themes} =
             Repo.get!(Card, "oracle-rest-in-peace")

    assert List.first(Jason.decode!(rest_themes)) == "graveyard_hate"
  end

  test "import_cards prioritizes mass disruption over targeted disruption" do
    wrath = %{
      @time_walk
      | "id" => "scryfall-board-wipe",
        "oracle_id" => "oracle-board-wipe",
        "name" => "Wrath of Test"
    }

    oracle_tags = [
      scryfall_tag(%{
        "id" => "tag-board-wipe",
        "slug" => "board-wipe",
        "label" => "Board Wipe",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-board-wipe", "weight" => 0.7}]
      }),
      scryfall_tag(%{
        "id" => "tag-removal",
        "slug" => "spot-removal",
        "label" => "Spot Removal",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-board-wipe", "weight" => 0.6}]
      }),
      scryfall_tag(%{
        "id" => "tag-discard",
        "slug" => "discard",
        "label" => "Discard",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-board-wipe", "weight" => 0.5}]
      }),
      scryfall_tag(%{
        "id" => "tag-graveyard-hate",
        "slug" => "graveyard-hate",
        "label" => "Graveyard Hate",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-board-wipe", "weight" => 0.5}]
      })
    ]

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([wrath], nil, oracle_tags: oracle_tags)

    assert %Card{deck_category: "mass_disruption", deck_themes: themes_json} =
             Repo.get!(Card, "oracle-board-wipe")

    themes = Jason.decode!(themes_json)
    assert List.first(themes) == "board_wipe"
    assert "removal" in themes
    assert "sorcery" in themes
  end

  test "import_cards derives land deck grouping from type_line without oracle tags" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@plains])

    assert %Card{oracle_tags: "[]", deck_category: "lands", deck_themes: themes_json} =
             Repo.get!(Card, "oracle-plains")

    assert ["land"] = Jason.decode!(themes_json)
  end

  test "import_cards replaces stale oracle tag data on rerun" do
    ramp_tags = [
      scryfall_tag(%{
        "id" => "tag-ramp",
        "slug" => "ramp",
        "label" => "Ramp",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-1", "weight" => 0.95}]
      })
    ]

    draw_tags = [
      scryfall_tag(%{
        "id" => "tag-draw",
        "slug" => "card-draw",
        "label" => "Card Draw",
        "type" => "function",
        "taggings" => [%{"oracle_id" => "oracle-1", "weight" => 0.75}]
      })
    ]

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([@black_lotus], nil, oracle_tags: ramp_tags)

    assert %Card{deck_category: "ramp"} = Repo.get!(Card, "oracle-1")

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([@renamed_lotus], nil, oracle_tags: draw_tags)

    assert %Card{
             name: "Black Lotus Updated",
             oracle_tags: tags_json,
             deck_category: "card_advantage",
             deck_themes: themes_json
           } = Repo.get!(Card, "oracle-1")

    assert [draw_tag] = Jason.decode!(tags_json)

    assert Map.take(draw_tag, ["id", "slug", "label", "weight"]) == %{
             "id" => "tag-draw",
             "slug" => "card-draw",
             "label" => "Card Draw",
             "weight" => 0.75
           }

    themes = Jason.decode!(themes_json)
    assert "card_advantage" in themes
    refute "ramp" in themes
  end

  test "import_cards refreshes printing search rows in batches" do
    cards =
      for index <- 1..600 do
        suffix = Integer.to_string(index)

        %{
          @black_lotus
          | "id" => "batch-printing-#{suffix}",
            "oracle_id" => "batch-oracle-#{suffix}",
            "name" => "Batch Lotus #{suffix}",
            "collector_number" => suffix
        }
      end

    assert {:ok, %{cards_count: 600, printings_count: 600}} = Catalog.import_cards(cards)

    assert Repo.aggregate(Card, :count) == 600
    assert Repo.aggregate(Printing, :count) == 600

    assert [%Printing{scryfall_id: "batch-printing-600"}] =
             Catalog.search_printings(name: "Batch Lotus 600", collector_number: "600")
  end

  defp with_catalog_writes(fun) do
    test_pid = self()
    handler_id = {__MODULE__, make_ref()}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, pid ->
          case Regex.run(
                 ~r/^(insert|update|delete)\s+(?:into\s+|from\s+)?"(scryfall_\w+)"/i,
                 to_string(metadata.query)
               ) do
            [_match, verb, table] -> send(pid, {:catalog_write, String.downcase(verb), table})
            nil -> :ok
          end
        end,
        test_pid
      )

    result =
      try do
        fun.()
      after
        :telemetry.detach(handler_id)
      end

    {result, collect_catalog_writes([])}
  end

  defp collect_catalog_writes(writes) do
    receive do
      {:catalog_write, verb, table} -> collect_catalog_writes([{verb, table} | writes])
    after
      0 -> Enum.reverse(writes)
    end
  end
end
