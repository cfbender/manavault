defmodule Manavault.Catalog.ImportTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :renamed_lotus, :time_walk, :plains]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    Printing
  }

  test "import_cards stores identities and printings and safely updates on rerun" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert %Card{
             name: "Black Lotus",
             color_identity: "[]",
             game_changer: false,
             rulings_uri: "https://api.scryfall.com/cards/oracle-1/rulings"
           } = Repo.get!(Card, "oracle-1")

    assert %Printing{
             scryfall_id: "scryfall-printing-1",
             oracle_id: "oracle-1",
             set_code: "lea",
             collector_number: "232",
             released_at: ~D[1993-08-05]
           } = Catalog.get_printing_by_scryfall_id("scryfall-printing-1")

    assert %Printing{scryfall_id: "scryfall-printing-1"} = Catalog.get_printing("LEA", "232")
    assert [%Card{oracle_id: "oracle-1"}] = Catalog.search_cards("lotus")

    assert %Card{printings: [%Printing{scryfall_id: "scryfall-printing-1"}]} =
             Catalog.get_card_with_printings("oracle-1")

    assert [%Printing{scryfall_id: "scryfall-printing-1", card: %Card{name: "Black Lotus"}}] =
             Catalog.search_printings(name: "lotus", set_code: "LEA", collector_number: "232")

    assert [] = Catalog.search_printings(name: "", set_code: "", collector_number: "")
    assert [%{set_code: "lea", set_name: "Limited Edition Alpha"}] = Catalog.search_sets("alpha")

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([Map.put(@renamed_lotus, "game_changer", true)])

    assert Repo.aggregate(Card, :count) == 1
    assert Repo.aggregate(Printing, :count) == 1

    assert %Card{
             name: "Black Lotus Updated",
             game_changer: true,
             rulings_uri: "https://api.scryfall.com/cards/oracle-1/rulings-updated"
           } = Repo.get!(Card, "oracle-1")

    assert %Printing{prices: prices} = Repo.get!(Printing, "scryfall-printing-1")
    assert Jason.decode!(prices) == %{"usd" => "1.00"}
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
end
