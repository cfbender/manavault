defmodule ManavaultWeb.SchemaTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog
  alias Manavault.Catalog.ScryfallSyncWorker

  test "home summary is available over GraphQL", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          homeSummary {
            collectionCount
            locationCount
            deckCount
          }
        }
        """
      })

    assert %{
             "data" => %{
               "homeSummary" => %{
                 "collectionCount" => 0,
                 "locationCount" => 0,
                 "deckCount" => 0
               }
             }
           } = json_response(conn, 200)
  end

  test "cloud backups are empty before a provider is configured", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          backupSettings { provider }
          cloudBackups { id }
        }
        """
      })

    assert %{
             "data" => %{
               "backupSettings" => %{"provider" => "none"},
               "cloudBackups" => []
             }
           } = json_response(conn, 200)
  end

  test "backup settings can be saved over GraphQL", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation SaveBackupSettings($input: BackupSettingsInput!) {
          updateBackupSettings(input: $input) {
            enabled
            provider
            cron
            s3Endpoint
            s3Bucket
            s3Region
            s3Prefix
            s3AccessKeyId
            hasS3SecretAccessKey
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "enabled" => true,
            "provider" => "s3",
            "cron" => "*/15 * * * *",
            "s3Endpoint" => "https://example.r2.cloudflarestorage.com",
            "s3Bucket" => "manavault",
            "s3Region" => "auto",
            "s3Prefix" => "backups",
            "s3AccessKeyId" => "access-key",
            "s3SecretAccessKey" => "secret-key"
          }
        }
      })

    assert %{
             "data" => %{
               "updateBackupSettings" => %{
                 "enabled" => true,
                 "provider" => "s3",
                 "cron" => "*/15 * * * *",
                 "s3Endpoint" => "https://example.r2.cloudflarestorage.com",
                 "s3Bucket" => "manavault",
                 "s3Region" => "auto",
                 "s3Prefix" => "backups",
                 "s3AccessKeyId" => "access-key",
                 "hasS3SecretAccessKey" => true
               }
             }
           } = json_response(conn, 200)

    conn =
      post(build_conn(), "/api/graphql", %{
        "query" => """
        query {
          backupSettings {
            provider
            hasS3SecretAccessKey
          }
        }
        """
      })

    assert %{
             "data" => %{
               "backupSettings" => %{"provider" => "s3", "hasS3SecretAccessKey" => true}
             }
           } =
             json_response(conn, 200)
  end

  test "Scryfall reload mutations queue worker jobs", %{conn: conn} do
    test_pid = self()

    start_supervised!(
      {ScryfallSyncWorker,
       [
         initial_delay: :timer.hours(24),
         sync_fun: fn ->
           send(test_pid, :catalog_sync)
           {:ok, %{printings_count: 10}}
         end,
         asset_sync_fun: fn ->
           send(test_pid, :asset_sync)
           {:ok, %{symbols_count: 2, sets_count: 3}}
         end
       ]}
    )

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation {
          reloadScryfallCatalog { status message }
          reloadScryfallAssets { status message }
        }
        """
      })

    assert %{
             "data" => %{
               "reloadScryfallCatalog" => %{
                 "status" => "queued",
                 "message" => catalog_message
               },
               "reloadScryfallAssets" => %{
                 "status" => "queued",
                 "message" => asset_message
               }
             }
           } = json_response(conn, 200)

    assert catalog_message == "Scryfall catalog reload queued."
    assert asset_message =~ "set icon"
    assert_receive :catalog_sync
    assert_receive :asset_sync
  end

  test "collection query resolves locations and card images", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Test Card",
          "type_line" => "Creature",
          "collector_number" => "1",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "rare",
          "image_uris" => %{
            "normal" => "https://example.test/card.jpg",
            "art_crop" => "https://example.test/card-art.jpg"
          },
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "12.34"},
          "legalities" => %{}
        }
      ])

    printing = Catalog.get_printing_by_scryfall_id("scryfall-printing-1")

    {:ok, location} =
      Catalog.create_location(%{
        name: "Binder",
        kind: "binder",
        cover_scryfall_id: printing.scryfall_id
      })

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: printing.scryfall_id,
        location_id: location.id,
        quantity: 3
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          locations {
            id
            name
            kind
            itemCount
            totalPriceText
            coverPrinting { imageUrl artCropUrl card { name } }
            valueSummary {
              totalPriceText
              purchasePriceText
              valueGainText
              valueGainPercentText
            }
          }
          collectionItems {
            priceText
            allocatedQuantity
            printing { imageUrl card { name } }
            purchasePriceText
            valueGainText
            valueGainPercentText
            location { name }
          }
          collectionItemCount
          collectionValueSummary {
            totalPriceText
            purchasePriceText
            valueGainText
            valueGainPercentText
          }
        }
        """
      })

    assert %{
             "data" => %{
               "locations" => [
                 %{
                   "id" => _id,
                   "name" => "Binder",
                   "kind" => "binder",
                   "coverPrinting" => %{
                     "card" => %{"name" => "Test Card"},
                     "artCropUrl" => "https://example.test/card-art.jpg",
                     "imageUrl" => "https://example.test/card.jpg"
                   },
                   "itemCount" => 3,
                   "totalPriceText" => "$37.02",
                   "valueSummary" => %{
                     "totalPriceText" => "$37.02",
                     "purchasePriceText" => "$37.02",
                     "valueGainText" => "$0",
                     "valueGainPercentText" => "0%"
                   }
                 },
                 %{
                   "id" => "unfiled",
                   "name" => "Unfiled",
                   "kind" => "unfiled",
                   "coverPrinting" => nil,
                   "itemCount" => 0,
                   "totalPriceText" => "$0",
                   "valueSummary" => %{
                     "totalPriceText" => "$0",
                     "purchasePriceText" => "$0",
                     "valueGainText" => "$0",
                     "valueGainPercentText" => nil
                   }
                 }
               ],
               "collectionItemCount" => 3,
               "collectionValueSummary" => %{
                 "totalPriceText" => "$37.02",
                 "purchasePriceText" => "$37.02",
                 "valueGainText" => "$0",
                 "valueGainPercentText" => "0%"
               },
               "collectionItems" => [
                 %{
                   "allocatedQuantity" => 0,
                   "location" => %{"name" => "Binder"},
                   "priceText" => "$12.34",
                   "purchasePriceText" => "$12.34",
                   "valueGainText" => "$0",
                   "valueGainPercentText" => "0%",
                   "printing" => %{
                     "card" => %{"name" => "Test Card"},
                     "imageUrl" => "https://example.test/card.jpg"
                   }
                 }
               ]
             }
           } = json_response(conn, 200)
  end

  test "card query resolves owned counts per printing", %{conn: conn} do
    {:ok, %{printings_count: 2}} =
      Catalog.import_cards(
        [
          %{
            "id" => "scryfall-owned-old",
            "oracle_id" => "oracle-owned-card",
            "name" => "Owned Card",
            "type_line" => "Artifact",
            "collector_number" => "1",
            "set" => "old",
            "set_name" => "Old Set",
            "lang" => "en",
            "rarity" => "rare",
            "image_uris" => %{},
            "prices" => %{"usd" => "1.00"},
            "finishes" => ["nonfoil"],
            "released_at" => "1993-08-05",
            "legalities" => %{}
          },
          %{
            "id" => "scryfall-owned-new",
            "oracle_id" => "oracle-owned-card",
            "name" => "Owned Card",
            "type_line" => "Artifact",
            "collector_number" => "2",
            "set" => "new",
            "set_name" => "New Set",
            "lang" => "en",
            "rarity" => "rare",
            "image_uris" => %{},
            "prices" => %{"usd" => "2.00"},
            "finishes" => ["nonfoil"],
            "released_at" => "1994-08-05",
            "legalities" => %{}
          }
        ],
        nil,
        oracle_tags: [
          %{
            "object" => "tag",
            "id" => "tag-card-draw",
            "slug" => "card-draw",
            "label" => "Card Draw",
            "type" => "function",
            "description" => nil,
            "parent_ids" => [],
            "child_ids" => [],
            "aliases" => [],
            "taggings" => [
              %{
                "oracle_id" => "oracle-owned-card",
                "weight" => 0.72,
                "annotation" => "draws extra cards"
              }
            ]
          }
        ]
      )

    {:ok, binder} = Catalog.create_location(%{name: "Binder", kind: "binder"})
    {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-old",
        location_id: binder.id,
        quantity: 2
      })

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-old",
        quantity: 1
      })

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-new",
        location_id: binder.id,
        quantity: 1
      })

    {:ok, _list_item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-new",
        location_id: list.id,
        quantity: 5
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          card(id: "oracle-owned-card") {
            oracleTags {
              id
              slug
              label
              weight
              annotation
            }
            deckCategory
            deckThemes
            printings {
              scryfallId
              ownedCount
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "card" => %{
                 "oracleTags" => [
                   %{
                     "id" => "tag-card-draw",
                     "slug" => "card-draw",
                     "label" => "Card Draw",
                     "weight" => "0.72",
                     "annotation" => "draws extra cards"
                   }
                 ],
                 "deckCategory" => "card_advantage",
                 "deckThemes" => deck_themes,
                 "printings" => [
                   %{"scryfallId" => "scryfall-owned-new", "ownedCount" => 1},
                   %{"scryfallId" => "scryfall-owned-old", "ownedCount" => 3}
                 ]
               }
             }
           } = json_response(conn, 200)

    assert "card_advantage" in deck_themes
    assert "artifact" in deck_themes
  end

  test "unfiled location resolves cards without an assigned location", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-unfiled",
          "oracle_id" => "oracle-unfiled",
          "name" => "Loose Card",
          "type_line" => "Creature",
          "collector_number" => "7",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "common",
          "image_uris" => %{},
          "prices" => %{"usd" => "0.50"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-unfiled",
        quantity: 4
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          location(id: "unfiled") {
            id
            name
            kind
            itemCount
            totalPriceText
            collectionItems { quantity location { name } printing { card { name } } }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "location" => %{
                 "id" => "unfiled",
                 "name" => "Unfiled",
                 "kind" => "unfiled",
                 "itemCount" => 4,
                 "totalPriceText" => "$2",
                 "collectionItems" => [
                   %{
                     "quantity" => 4,
                     "location" => nil,
                     "printing" => %{"card" => %{"name" => "Loose Card"}}
                   }
                 ]
               }
             }
           } = json_response(conn, 200)
  end

  test "card name suggestions expose fuzzy catalog matches", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Black Lotus",
          "type_line" => "Artifact",
          "collector_number" => "232",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "Time Walk",
          "type_line" => "Sorcery",
          "collector_number" => "84",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          cardNameSuggestions(q: "blak lotu", limit: 5)
        }
        """
      })

    assert %{
             "data" => %{
               "cardNameSuggestions" => ["Black Lotus"]
             }
           } = json_response(conn, 200)
  end

  test "card query exposes Scryfall rulings", %{conn: conn} do
    rulings_uri = "https://api.scryfall.com/cards/oracle-rulings/rulings"
    previous_fetcher = Application.fetch_env(:manavault, :scryfall_rulings_fetcher)

    Application.put_env(:manavault, :scryfall_rulings_fetcher, fn ^rulings_uri ->
      {:ok,
       Jason.encode!(%{
         "data" => [
           %{
             "source" => "wotc",
             "published_at" => "2024-01-02",
             "comment" => "This ruling is shown on the card detail page."
           }
         ]
       })}
    end)

    on_exit(fn ->
      case previous_fetcher do
        {:ok, fetcher} -> Application.put_env(:manavault, :scryfall_rulings_fetcher, fetcher)
        :error -> Application.delete_env(:manavault, :scryfall_rulings_fetcher)
      end
    end)

    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-rulings-printing",
          "oracle_id" => "oracle-rulings",
          "name" => "Rulings Card",
          "type_line" => "Instant",
          "collector_number" => "1",
          "set" => "rul",
          "set_name" => "Rulings Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{},
          "rulings_uri" => rulings_uri
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          card(id: "oracle-rulings") {
            rulings {
              source
              publishedAt
              comment
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "card" => %{
                 "rulings" => [
                   %{
                     "source" => "wotc",
                     "publishedAt" => "2024-01-02",
                     "comment" => "This ruling is shown on the card detail page."
                   }
                 ]
               }
             }
           } = json_response(conn, 200)
  end

  test "card query exposes Scryfall legalities", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-legality-printing",
          "oracle_id" => "oracle-legalities",
          "name" => "Legality Card",
          "type_line" => "Sorcery",
          "collector_number" => "2",
          "set" => "leg",
          "set_name" => "Legality Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{
            "modern" => "not_legal",
            "commander" => "legal",
            "standard" => "banned"
          }
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          card(id: "oracle-legalities") {
            legalities {
              format
              status
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "card" => %{
                 "legalities" => [
                   %{"format" => "commander", "status" => "legal"},
                   %{"format" => "modern", "status" => "not_legal"},
                   %{"format" => "standard", "status" => "banned"}
                 ]
               }
             }
           } = json_response(conn, 200)
  end

  test "create deck mutation creates a deck", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateDeck($input: DeckInput!) {
          createDeck(input: $input) {
            id
            name
            format
            status
            cardCount
            uniqueCardCount
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "name" => "Knife Drawer",
            "format" => "commander",
            "status" => "brewing"
          }
        }
      })

    assert %{
             "data" => %{
               "createDeck" => %{
                 "id" => _id,
                 "name" => "Knife Drawer",
                 "format" => "commander",
                 "status" => "brewing",
                 "cardCount" => 0,
                 "uniqueCardCount" => 0
               }
             }
           } = json_response(conn, 200)
  end

  test "deck counts exclude sideboard and maybeboard cards", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([
               %{
                 "id" => "scryfall-count-main",
                 "oracle_id" => "oracle-count-main",
                 "name" => "Count Main",
                 "type_line" => "Creature",
                 "collector_number" => "1",
                 "set" => "cnt",
                 "set_name" => "Count Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               },
               %{
                 "id" => "scryfall-count-commander",
                 "oracle_id" => "oracle-count-commander",
                 "name" => "Count Commander",
                 "type_line" => "Legendary Creature",
                 "collector_number" => "2",
                 "set" => "cnt",
                 "set_name" => "Count Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               }
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Count Test", "format" => "commander"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Main",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Commander",
               "quantity" => 1,
               "zone" => "commander"
             })

    assert {:ok, _sideboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Main",
               "quantity" => 4,
               "zone" => "sideboard"
             })

    assert {:ok, _maybeboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Commander",
               "quantity" => 8,
               "zone" => "maybeboard"
             })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query Deck($id: ID!) {
          deck(id: $id) {
            cardCount
            uniqueCardCount
          }
        }
        """,
        "variables" => %{"id" => deck.id}
      })

    assert %{
             "data" => %{
               "deck" => %{
                 "cardCount" => 3,
                 "uniqueCardCount" => 2
               }
             }
           } = json_response(conn, 200)
  end

  test "decks query exposes lightweight summary fields", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([
               %{
                 "id" => "scryfall-summary-main",
                 "oracle_id" => "oracle-summary-main",
                 "name" => "Summary Main",
                 "type_line" => "Creature",
                 "collector_number" => "1",
                 "set" => "sum",
                 "set_name" => "Summary Set",
                 "lang" => "en",
                 "image_uris" => %{"art_crop" => "https://example.test/summary-main-art.jpg"},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               },
               %{
                 "id" => "scryfall-summary-commander",
                 "oracle_id" => "oracle-summary-commander",
                 "name" => "Summary Commander",
                 "type_line" => "Legendary Creature",
                 "color_identity" => ["G", "U"],
                 "collector_number" => "2",
                 "set" => "sum",
                 "set_name" => "Summary Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               }
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Summary Deck", "format" => "commander"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Summary Main",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Summary Commander",
               "quantity" => 1,
               "zone" => "commander"
             })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          decks {
            name
            coverImageUrl
            commanderColorIdentity
            cardCount
            uniqueCardCount
          }
        }
        """
      })

    assert %{
             "data" => %{
               "decks" => [
                 %{
                   "name" => "Summary Deck",
                   "coverImageUrl" => "https://example.test/summary-main-art.jpg",
                   "commanderColorIdentity" => ["U", "G"],
                   "cardCount" => 3,
                   "uniqueCardCount" => 2
                 }
               ]
             }
           } = json_response(conn, 200)
  end

  test "deck share mutation creates a public token and public share query resolves it", %{
    conn: conn
  } do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-share-card",
          "oracle_id" => "oracle-share-card",
          "name" => "Shared Card",
          "type_line" => "Artifact",
          "collector_number" => "9",
          "set" => "shr",
          "set_name" => "Share Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Shared Deck"})
    {:ok, _deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Shared Card"})

    share_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation ShareDeck($id: ID!) {
          ensureDeckShareToken(id: $id) {
            id
            shareToken
          }
        }
        """,
        "variables" => %{"id" => deck.id}
      })

    assert %{
             "data" => %{
               "ensureDeckShareToken" => %{
                 "id" => _id,
                 "shareToken" => share_token
               }
             }
           } = json_response(share_conn, 200)

    assert is_binary(share_token)
    assert String.length(share_token) > 20
    refute share_token == to_string(deck.id)

    public_conn =
      post(conn, "/share/graphql", %{
        "query" => """
        query SharedDeck($id: ID!) {
          deck(id: $id) {
            name
            shareToken
            cardCount
            uniqueCardCount
            deckCards {
              id
              quantity
              zone
              finish
              card { name }
              preferredPrinting {
                scryfallId
                imageUrl
                artCropUrl
                setCode
                setName
                collectorNumber
                rarity
                finishes
              }
              allocationStatus {
                state
                required
                owned
                allocated
                available
                allocatedElsewhere
                missing
                candidates {
                  allocated
                  allocatedElsewhere
                  available
                  item {
                    id
                    quantity
                    finish
                    condition
                    language
                    priceText
                    location {
                      id
                      name
                    }
                    printing {
                      scryfallId
                      setCode
                      setName
                      collectorNumber
                      rarity
                      card { name }
                    }
                  }
                }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => share_token}
      })

    assert %{
             "data" => %{
               "deck" => %{
                 "name" => "Shared Deck",
                 "shareToken" => ^share_token,
                 "cardCount" => 1,
                 "uniqueCardCount" => 1,
                 "deckCards" => [
                   %{
                     "quantity" => 1,
                     "card" => %{"name" => "Shared Card"},
                     "allocationStatus" => %{
                       "state" => "shared",
                       "required" => 1,
                       "owned" => 0,
                       "allocated" => 0,
                       "available" => 0,
                       "allocatedElsewhere" => 0,
                       "missing" => 0,
                       "candidates" => []
                     }
                   }
                 ]
               }
             }
           } = json_response(public_conn, 200)
  end

  test "create collection item mutation adds a printing to the collection", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "New Collection Card",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "rare",
          "image_uris" => %{"normal" => "https://example.test/new-card.jpg"},
          "finishes" => ["nonfoil", "foil"],
          "prices" => %{"usd" => "1.25", "usd_foil" => "3.50"},
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateCollectionItem($input: CollectionItemInput!) {
          createCollectionItem(input: $input) {
            id
            quantity
            condition
            language
            finish
            notes
            printing { scryfallId card { name } }
            purchasePriceCents
            purchasePriceText
            valueGainText
            valueGainPercentText
            location { id name }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "scryfallId" => "scryfall-printing-2",
            "quantity" => 2,
            "condition" => "near_mint",
            "language" => "en",
            "finish" => "foil",
            "locationId" => location.id,
            "notes" => "Fresh pull"
          }
        }
      })

    assert %{
             "data" => %{
               "createCollectionItem" => %{
                 "quantity" => 2,
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "foil",
                 "notes" => "Fresh pull",
                 "purchasePriceCents" => 350,
                 "purchasePriceText" => "$3.50",
                 "valueGainText" => "$0",
                 "valueGainPercentText" => "0%",
                 "printing" => %{
                   "scryfallId" => "scryfall-printing-2",
                   "card" => %{"name" => "New Collection Card"}
                 },
                 "location" => %{"id" => _id, "name" => "Trade Binder"}
               }
             }
           } = json_response(conn, 200)
  end

  test "update and delete collection item mutations change owned printings", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-update",
          "oracle_id" => "oracle-update",
          "name" => "Update Collection Card",
          "type_line" => "Creature",
          "collector_number" => "12",
          "set" => "upd",
          "set_name" => "Update Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil", "foil"],
          "prices" => %{"usd" => "2.00", "usd_foil" => "5.00"},
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Old Box", kind: "box"})
    {:ok, new_location} = Catalog.create_location(%{name: "New List", kind: "list"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-printing-update",
        quantity: 2,
        location_id: location.id
      })

    update_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
          updateCollectionItem(id: $id, input: $input) {
            id
            quantity
            condition
            language
            finish
            notes
            purchasePriceCents
            purchasePriceText
            valueGainText
            valueGainPercentText
            location { name }
          }
        }
        """,
        "variables" => %{
          "id" => item.id,
          "input" => %{
            "quantity" => 4,
            "condition" => "lightly_played",
            "language" => "ja",
            "finish" => "foil",
            "locationId" => new_location.id,
            "notes" => "Moved",
            "purchasePriceCents" => 1234
          }
        }
      })

    assert %{
             "data" => %{
               "updateCollectionItem" => %{
                 "id" => _id,
                 "quantity" => 4,
                 "condition" => "lightly_played",
                 "language" => "ja",
                 "finish" => "foil",
                 "notes" => "Moved",
                 "purchasePriceCents" => 1234,
                 "purchasePriceText" => "$12.34",
                 "valueGainText" => "-$7.34",
                 "valueGainPercentText" => "-59.5%",
                 "location" => %{"name" => "New List"}
               }
             }
           } = json_response(update_conn, 200)

    delete_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteCollectionItem($id: ID!) {
          deleteCollectionItem(id: $id) {
            id
          }
        }
        """,
        "variables" => %{"id" => item.id}
      })

    assert %{"data" => %{"deleteCollectionItem" => %{"id" => _id}}} =
             json_response(delete_conn, 200)

    assert [] = Catalog.list_collection_items()
  end

  test "add collection item to deck creates a deck card and allocation", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-deck-add",
          "oracle_id" => "oracle-deck-add",
          "name" => "Deck Add Card",
          "type_line" => "Artifact",
          "collector_number" => "7",
          "set" => "dad",
          "set_name" => "Deck Add Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-printing-deck-add",
        quantity: 1
      })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Target Deck"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AddCollectionItemToDeck($id: ID!, $deckId: ID!, $zone: String) {
          addCollectionItemToDeck(id: $id, deckId: $deckId, zone: $zone) {
            id
            quantity
            zone
            finish
            card { name }
            preferredPrinting { scryfallId }
          }
        }
        """,
        "variables" => %{"id" => item.id, "deckId" => deck.id, "zone" => "sideboard"}
      })

    assert %{
             "data" => %{
               "addCollectionItemToDeck" => %{
                 "id" => _id,
                 "quantity" => 1,
                 "zone" => "sideboard",
                 "finish" => "nonfoil",
                 "card" => %{"name" => "Deck Add Card"},
                 "preferredPrinting" => %{"scryfallId" => "scryfall-printing-deck-add"}
               }
             }
           } = json_response(conn, 200)

    [deck_card] = Catalog.get_deck!(deck.id).deck_cards
    status = Catalog.deck_card_allocation_status(deck_card)
    assert status.allocated == 1
  end

  test "deck allocation status and allocation mutations are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-allocation-status",
          "oracle_id" => "oracle-allocation-status",
          "name" => "Allocation Status Card",
          "type_line" => "Artifact",
          "collector_number" => "8",
          "set" => "alc",
          "set_name" => "Allocation Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-allocation-status",
        quantity: 1,
        finish: "nonfoil"
      })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Allocation Deck"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Allocation Status Card"})

    status_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query Deck($id: ID!) {
          deck(id: $id) {
            deckCards {
              id
              allocationStatus {
                state
                required
                owned
                available
                allocated
                missing
                candidates {
                  available
                  item { id quantity printing { card { name } } }
                }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => deck.id}
      })

    assert %{
             "data" => %{
               "deck" => %{
                 "deckCards" => [
                   %{
                     "id" => _id,
                     "allocationStatus" => %{
                       "state" => "available",
                       "required" => 1,
                       "owned" => 1,
                       "available" => 1,
                       "allocated" => 0,
                       "missing" => 0,
                       "candidates" => [
                         %{
                           "available" => 1,
                           "item" => %{
                             "id" => _item_id,
                             "quantity" => 1,
                             "printing" => %{"card" => %{"name" => "Allocation Status Card"}}
                           }
                         }
                       ]
                     }
                   }
                 ]
               }
             }
           } = json_response(status_conn, 200)

    allocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation Allocate($deckCardId: ID!, $collectionItemId: ID!) {
          allocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
            id
            allocationStatus { state allocated available missing }
          }
        }
        """,
        "variables" => %{"deckCardId" => deck_card.id, "collectionItemId" => item.id}
      })

    assert %{
             "data" => %{
               "allocateDeckCardItem" => %{
                 "allocationStatus" => %{
                   "state" => "allocated",
                   "allocated" => 1,
                   "available" => 0,
                   "missing" => 0
                 }
               }
             }
           } = json_response(allocate_conn, 200)

    visibility_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          location(id: "unfiled") {
            itemCount
            collectionItems { id }
          }
          collectionItems {
            allocatedQuantity
            printing { card { name } }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "location" => %{"itemCount" => 0, "collectionItems" => []},
               "collectionItems" => [
                 %{
                   "allocatedQuantity" => 1,
                   "printing" => %{"card" => %{"name" => "Allocation Status Card"}}
                 }
               ]
             }
           } = json_response(visibility_conn, 200)

    [loaded_deck_card] = Catalog.get_deck!(deck.id).deck_cards

    allocated_item_id =
      loaded_deck_card
      |> Catalog.deck_card_allocation_status()
      |> Map.fetch!(:candidates)
      |> Enum.find(&(&1.allocated == 1))
      |> Map.fetch!(:item)
      |> Map.fetch!(:id)

    deallocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation Deallocate($deckCardId: ID!, $collectionItemId: ID!) {
          deallocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
            id
            allocationStatus { state allocated available missing }
          }
        }
        """,
        "variables" => %{"deckCardId" => deck_card.id, "collectionItemId" => allocated_item_id}
      })

    assert %{
             "data" => %{
               "deallocateDeckCardItem" => %{
                 "allocationStatus" => %{
                   "state" => "available",
                   "allocated" => 0,
                   "available" => 1,
                   "missing" => 0
                 }
               }
             }
           } = json_response(deallocate_conn, 200)
  end

  test "deck page allocation status is batched over GraphQL", %{conn: conn} do
    cards =
      for index <- 1..3 do
        %{
          "id" => "scryfall-batched-allocation-#{index}",
          "oracle_id" => "oracle-batched-allocation-#{index}",
          "name" => "Batched Allocation #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "bat",
          "set_name" => "Batch Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: 3, printings_count: 3}} = Catalog.import_cards(cards)
    {:ok, location} = Catalog.create_location(%{name: "Batch Binder", kind: "binder"})

    for index <- 1..3 do
      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 scryfall_id: "scryfall-batched-allocation-#{index}",
                 quantity: 1,
                 finish: "nonfoil",
                 location_id: location.id
               })
    end

    {:ok, deck} = Catalog.create_deck(%{"name" => "Batched Allocation Deck"})

    for index <- 1..3 do
      assert {:ok, _deck_card} =
               Catalog.add_card_to_deck(deck, %{"name" => "Batched Allocation #{index}"})
    end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query Deck($id: ID!) {
            deck(id: $id) {
              deckCards {
                id
                allocationStatus {
                  state
                  available
                  candidates {
                    available
                    item {
                      id
                      priceText
                      location { name }
                      printing { card { name } }
                    }
                  }
                }
              }
            }
          }
          """,
          "variables" => %{"id" => deck.id}
        })
      end)

    assert %{
             "data" => %{
               "deck" => %{
                 "deckCards" => [_, _, _]
               }
             }
           } = json_response(conn, 200)

    assert query_count <= 12
  end

  test "deck proxy allocation mutations are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-proxy-allocation",
          "oracle_id" => "oracle-proxy-allocation",
          "name" => "Proxy Allocation Card",
          "type_line" => "Artifact",
          "collector_number" => "9",
          "set" => "pxy",
          "set_name" => "Proxy Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Proxy Allocation Deck"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Proxy Allocation Card"})

    allocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AllocateProxy($deckCardId: ID!) {
          allocateDeckCardProxy(deckCardId: $deckCardId) {
            id
            allocationStatus { state allocated proxyAllocated available missing }
          }
        }
        """,
        "variables" => %{"deckCardId" => deck_card.id}
      })

    assert %{
             "data" => %{
               "allocateDeckCardProxy" => %{
                 "allocationStatus" => %{
                   "state" => "allocated",
                   "allocated" => 1,
                   "proxyAllocated" => 1,
                   "available" => 0,
                   "missing" => 0
                 }
               }
             }
           } = json_response(allocate_conn, 200)

    deallocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeallocateProxy($deckCardId: ID!) {
          deallocateDeckCardProxy(deckCardId: $deckCardId) {
            id
            allocationStatus { state allocated proxyAllocated available missing }
          }
        }
        """,
        "variables" => %{"deckCardId" => deck_card.id}
      })

    assert %{
             "data" => %{
               "deallocateDeckCardProxy" => %{
                 "allocationStatus" => %{
                   "state" => "missing",
                   "allocated" => 0,
                   "proxyAllocated" => 0,
                   "available" => 0,
                   "missing" => 1
                 }
               }
             }
           } = json_response(deallocate_conn, 200)
  end

  test "bulk deck allocation preview and mutation are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-bulk-allocation",
          "oracle_id" => "oracle-bulk-allocation",
          "name" => "Bulk Allocation Card",
          "type_line" => "Artifact",
          "collector_number" => "9",
          "set" => "alc",
          "set_name" => "Allocation Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-bulk-allocation",
        quantity: 2,
        finish: "nonfoil"
      })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Bulk Allocation Deck"})

    {:ok, _deck_card} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Bulk Allocation Card",
        "quantity" => 2,
        "preferred_printing_id" => "scryfall-bulk-allocation"
      })

    preview_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation PreviewBulkAllocateDeck($id: ID!, $mode: String!) {
          previewBulkAllocateDeck(id: $id, mode: $mode) {
            mode
            allocated
            cards
            skipped
            entries {
              quantity
              exact
              deckCard { card { name } preferredPrinting { setCode collectorNumber } }
              item { quantity printing { card { name } setCode collectorNumber } }
            }
          }
        }
        """,
        "variables" => %{"id" => deck.id, "mode" => "exact_printings"}
      })

    assert %{
             "data" => %{
               "previewBulkAllocateDeck" => %{
                 "mode" => "exact_printings",
                 "allocated" => 2,
                 "cards" => 1,
                 "skipped" => 0,
                 "entries" => [
                   %{
                     "quantity" => 2,
                     "exact" => true,
                     "deckCard" => %{
                       "card" => %{"name" => "Bulk Allocation Card"},
                       "preferredPrinting" => %{"setCode" => "alc", "collectorNumber" => "9"}
                     },
                     "item" => %{
                       "quantity" => 2,
                       "printing" => %{
                         "card" => %{"name" => "Bulk Allocation Card"},
                         "setCode" => "alc",
                         "collectorNumber" => "9"
                       }
                     }
                   }
                 ]
               }
             }
           } = json_response(preview_conn, 200)

    allocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkAllocateDeck($id: ID!, $mode: String!) {
          bulkAllocateDeck(id: $id, mode: $mode) {
            allocated
            cards
            skipped
          }
        }
        """,
        "variables" => %{"id" => deck.id, "mode" => "exact_printings"}
      })

    assert %{
             "data" => %{
               "bulkAllocateDeck" => %{
                 "allocated" => 2,
                 "cards" => 1,
                 "skipped" => 0
               }
             }
           } = json_response(allocate_conn, 200)
  end

  test "create location mutation creates a location with optional cover", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-3",
          "oracle_id" => "oracle-3",
          "name" => "Location Cover",
          "type_line" => "Artifact",
          "collector_number" => "3",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{"art_crop" => "https://example.test/location-cover.jpg"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateLocation($input: LocationInput!) {
          createLocation(input: $input) {
            id
            name
            kind
            description
            coverPrinting { scryfallId artCropUrl card { name } }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "name" => "New Box",
            "kind" => "box",
            "description" => "Sealed cards",
            "coverScryfallId" => "scryfall-printing-3"
          }
        }
      })

    assert %{
             "data" => %{
               "createLocation" => %{
                 "name" => "New Box",
                 "kind" => "box",
                 "description" => "Sealed cards",
                 "coverPrinting" => %{
                   "scryfallId" => "scryfall-printing-3",
                   "artCropUrl" => "https://example.test/location-cover.jpg",
                   "card" => %{"name" => "Location Cover"}
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "collection import preview commit and export are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-import",
          "oracle_id" => "oracle-import",
          "name" => "Imported Card",
          "type_line" => "Creature",
          "collector_number" => "9",
          "set" => "imp",
          "set_name" => "Import Set",
          "lang" => "en",
          "rarity" => "rare",
          "image_uris" => %{"normal" => "https://example.test/import.jpg"},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "4.25"},
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Import Binder", kind: "binder"})

    csv = """
    Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Purchase Price
    3,Imported Card,imp,9,nonfoil,NM,en,3.00
    """

    preview_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation PreviewCollectionImport($input: CollectionImportPreviewInput!) {
          previewCollectionImport(input: $input) {
            locationId
            total
            exact
            ambiguous
            unresolved
            rows {
              rowNumber
              status
              attrs { quantity finish condition language scryfallId locationId purchasePriceCents }
              printing { scryfallId card { name } }
              candidates { scryfallId }
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{"text" => csv, "format" => "csv", "locationId" => location.id}
        }
      })

    assert %{
             "data" => %{
               "previewCollectionImport" => %{
                 "locationId" => _location_id,
                 "total" => 1,
                 "exact" => 1,
                 "ambiguous" => 0,
                 "unresolved" => 0,
                 "rows" =>
                   [
                     %{
                       "rowNumber" => 2,
                       "status" => "exact",
                       "attrs" => %{
                         "quantity" => 3,
                         "finish" => "nonfoil",
                         "condition" => "near_mint",
                         "language" => "en",
                         "scryfallId" => "scryfall-printing-import",
                         "purchasePriceCents" => 300
                       },
                       "printing" => %{
                         "scryfallId" => "scryfall-printing-import",
                         "card" => %{"name" => "Imported Card"}
                       }
                     }
                   ] = rows
               }
             }
           } = json_response(preview_conn, 200)

    commit_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
          commitCollectionImport(input: $input) {
            imported
            skipped
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "rows" =>
              Enum.map(rows, fn row ->
                %{
                  "rowNumber" => row["rowNumber"],
                  "status" => row["status"],
                  "attrs" => row["attrs"]
                }
              end)
          }
        }
      })

    assert %{
             "data" => %{
               "commitCollectionImport" => %{"imported" => 1, "skipped" => 0}
             }
           } = json_response(commit_conn, 200)

    export_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          collectionExportCsv
        }
        """
      })

    assert %{"data" => %{"collectionExportCsv" => export_csv}} = json_response(export_conn, 200)

    assert export_csv =~
             "Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Location,Purchase Price"

    assert export_csv =~ "3,Imported Card,imp,9,nonfoil,near_mint,en,Import Binder,$3"

    text_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query CollectionExportText($filters: CollectionItemFilters) {
          collectionExportText(filters: $filters)
        }
        """,
        "variables" => %{"filters" => %{"locationId" => location.id}}
      })

    assert %{"data" => %{"collectionExportText" => export_text}} = json_response(text_conn, 200)
    assert export_text == "3x Imported Card (IMP) 9"
  end

  test "update deck mutation updates deck fields", %{conn: conn} do
    {:ok, deck} =
      Catalog.create_deck(%{"name" => "Old Deck", "format" => "commander", "status" => "brewing"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {
          updateDeck(id: $id, input: $input) {
            id
            name
            format
            status
          }
        }
        """,
        "variables" => %{
          "id" => deck.id,
          "input" => %{"name" => "New Deck", "format" => "modern", "status" => "active"}
        }
      })

    assert %{
             "data" => %{
               "updateDeck" => %{
                 "id" => _id,
                 "name" => "New Deck",
                 "format" => "modern",
                 "status" => "active"
               }
             }
           } = json_response(conn, 200)
  end

  test "decklist import mutation and export query expose plain text decklists", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-deck-import-1",
          "oracle_id" => "oracle-deck-import-1",
          "name" => "Import Lotus",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "imp",
          "set_name" => "Import Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-deck-import-2",
          "oracle_id" => "oracle-deck-import-2",
          "name" => "Import Walk",
          "type_line" => "Sorcery",
          "collector_number" => "2",
          "set" => "imp",
          "set_name" => "Import Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Import Deck"})

    import_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation ImportDecklist($id: ID!, $text: String!) {
          importDecklist(id: $id, text: $text) {
            imported
            unresolved
            skippedPrintings
          }
        }
        """,
        "variables" => %{
          "id" => deck.id,
          "text" => """
          Commander
          1 Import Walk

          Mainboard
          2 Import Lotus
          1 Missing Card
          """
        }
      })

    assert %{
             "data" => %{
               "importDecklist" => %{
                 "imported" => 2,
                 "unresolved" => ["Missing Card"],
                 "skippedPrintings" => []
               }
             }
           } = json_response(import_conn, 200)

    export_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DeckExportText($id: ID!) {
          deckExportText(id: $id)
        }
        """,
        "variables" => %{"id" => deck.id}
      })

    assert %{"data" => %{"deckExportText" => export_text}} = json_response(export_conn, 200)
    assert export_text =~ "Commander\n1x Import Walk"
    assert export_text =~ "Mainboard\n2x Import Lotus"

    replace_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation ImportDecklist($id: ID!, $text: String!, $replaceExisting: Boolean!) {
          importDecklist(id: $id, text: $text, replaceExisting: $replaceExisting) {
            imported
            unresolved
          }
        }
        """,
        "variables" => %{
          "id" => deck.id,
          "text" => """
          Mainboard
          1 Import Walk
          """,
          "replaceExisting" => true
        }
      })

    assert %{
             "data" => %{
               "importDecklist" => %{"imported" => 1, "unresolved" => []}
             }
           } = json_response(replace_conn, 200)

    replaced_export_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DeckExportText($id: ID!) {
          deckExportText(id: $id)
        }
        """,
        "variables" => %{"id" => deck.id}
      })

    assert %{"data" => %{"deckExportText" => replaced_export_text}} =
             json_response(replaced_export_conn, 200)

    assert replaced_export_text == "Mainboard\n1x Import Walk"
  end

  test "deck buylist and export queries expose missing card workflow data", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-buylist-1",
          "oracle_id" => "oracle-buylist-1",
          "name" => "Buylist Lotus",
          "type_line" => "Artifact",
          "collector_number" => "7",
          "set" => "buy",
          "set_name" => "Buy Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "3.50"},
          "legalities" => %{}
        }
      ])

    {:ok, deck} =
      Catalog.create_deck(%{
        "name" => "Buylist Deck",
        "format" => "vintage",
        "status" => "active"
      })

    {:ok, _deck_card} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Buylist Lotus",
        "quantity" => 2,
        "preferred_printing_id" => "scryfall-buylist-1"
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DeckBuylist($id: ID!) {
          deckBuylist(id: $id, printingMode: "exact") {
            cardName
            quantity
            missing
            unavailable
            reason
            setCode
            collectorNumber
            language
            unitPriceText
            totalPriceText
          }
          deckBuylistExport(id: $id, format: "csv", printingMode: "exact")
        }
        """,
        "variables" => %{"id" => deck.id}
      })

    assert %{
             "data" => %{
               "deckBuylist" => [
                 %{
                   "cardName" => "Buylist Lotus",
                   "quantity" => 2,
                   "missing" => 2,
                   "unavailable" => 0,
                   "reason" => "missing",
                   "setCode" => "buy",
                   "collectorNumber" => "7",
                   "language" => "en",
                   "unitPriceText" => "$3.50",
                   "totalPriceText" => "$7"
                 }
               ],
               "deckBuylistExport" => export_csv
             }
           } = json_response(conn, 200)

    assert export_csv =~
             "Quantity,Card,Set,Collector Number,Finish,Language,Reason,Unit Price,Total Price"

    assert export_csv =~ "2,Buylist Lotus,buy,7,nonfoil,en,missing,$3.50,$7"
  end

  test "update location mutation updates location fields", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "Cover Card",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{"art_crop" => "https://example.test/cover-art.jpg"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Old Box", kind: "box"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
          updateLocation(id: $id, input: $input) {
            id
            name
            kind
            description
            coverPrinting { artCropUrl card { name } }
          }
        }
        """,
        "variables" => %{
          "id" => location.id,
          "input" => %{
            "name" => "New Binder",
            "kind" => "binder",
            "description" => "Trade cards",
            "coverScryfallId" => "scryfall-printing-2"
          }
        }
      })

    assert %{
             "data" => %{
               "updateLocation" => %{
                 "id" => _id,
                 "name" => "New Binder",
                 "kind" => "binder",
                 "description" => "Trade cards",
                 "coverPrinting" => %{
                   "artCropUrl" => "https://example.test/cover-art.jpg",
                   "card" => %{"name" => "Cover Card"}
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "update location mutation rejects unfiled pseudo-location", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
          updateLocation(id: $id, input: $input) {
            id
          }
        }
        """,
        "variables" => %{
          "id" => "unfiled",
          "input" => %{"coverScryfallId" => "anything"}
        }
      })

    assert %{"errors" => [%{"message" => "Unfiled cannot be edited"}]} = json_response(conn, 200)
  end

  test "delete location mutation deletes location and unfiles cards", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-delete-location",
          "oracle_id" => "oracle-delete-location",
          "name" => "Delete Location Card",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "loc",
          "set_name" => "Location Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{"name" => "Delete Location", "kind" => "box"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-delete-location",
        "quantity" => 1,
        "location_id" => location.id
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteLocation($id: ID!) {
          deleteLocation(id: $id) {
            id
            name
          }
        }
        """,
        "variables" => %{"id" => location.id}
      })

    assert %{
             "data" => %{
               "deleteLocation" => %{"id" => _id, "name" => "Delete Location"}
             }
           } = json_response(conn, 200)

    assert_raise Ecto.NoResultsError, fn -> Catalog.get_location!(location.id) end
    assert Catalog.get_collection_item!(item.id).location_id == nil
  end

  test "update deck card mutation moves a card between zones", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Black Lotus",
          "type_line" => "Artifact",
          "collector_number" => "232",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Sideboard Test"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation MoveDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
          updateDeckCard(id: $id, input: $input) {
            id
            zone
            quantity
            card { name }
          }
        }
        """,
        "variables" => %{
          "id" => deck_card.id,
          "input" => %{"zone" => "sideboard"}
        }
      })

    assert %{
             "data" => %{
               "updateDeckCard" => %{
                 "id" => _id,
                 "zone" => "sideboard",
                 "quantity" => 1,
                 "card" => %{"name" => "Black Lotus"}
               }
             }
           } = json_response(conn, 200)
  end

  test "deck card tag fields update individually and in bulk", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-tag-card-1",
          "oracle_id" => "oracle-tag-card-1",
          "name" => "Tag One",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "tag",
          "set_name" => "Tag Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-tag-card-2",
          "oracle_id" => "oracle-tag-card-2",
          "name" => "Tag Two",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "tag",
          "set_name" => "Tag Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Tag Test"})
    {:ok, first} = Catalog.add_card_to_deck(deck, %{"name" => "Tag One"})
    {:ok, second} = Catalog.add_card_to_deck(deck, %{"name" => "Tag Two"})

    update_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateTag($id: ID!, $input: DeckCardUpdateInput!) {
          updateDeckCard(id: $id, input: $input) {
            id
            tag
          }
        }
        """,
        "variables" => %{"id" => first.id, "input" => %{"tag" => "getting"}}
      })

    assert %{
             "data" => %{
               "updateDeckCard" => %{
                 "id" => _id,
                 "tag" => "getting"
               }
             }
           } = json_response(update_conn, 200)

    bulk_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkTag($deckCardIds: [ID!]!, $tag: String) {
          updateDeckCardsTag(deckCardIds: $deckCardIds, tag: $tag) {
            id
            tag
          }
        }
        """,
        "variables" => %{
          "deckCardIds" => [first.id, second.id],
          "tag" => "consider_cutting"
        }
      })

    assert %{
             "data" => %{
               "updateDeckCardsTag" => tagged_cards
             }
           } = json_response(bulk_conn, 200)

    assert Enum.sort_by(tagged_cards, & &1["id"]) ==
             Enum.sort_by(
               [
                 %{"id" => to_string(first.id), "tag" => "consider_cutting"},
                 %{"id" => to_string(second.id), "tag" => "consider_cutting"}
               ],
               & &1["id"]
             )
  end

  test "add deck card mutation adds a card by name", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-add-deck-card",
          "oracle_id" => "oracle-add-deck-card",
          "name" => "Add Me",
          "type_line" => "Creature",
          "collector_number" => "3",
          "set" => "add",
          "set_name" => "Add Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Add Test"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AddDeckCard($deckId: ID!, $input: DeckCardInput!) {
          addDeckCard(deckId: $deckId, input: $input) {
            id
            quantity
            zone
            finish
            card { name }
          }
        }
        """,
        "variables" => %{
          "deckId" => deck.id,
          "input" => %{
            "name" => "Add Me",
            "quantity" => 2,
            "zone" => "sideboard",
            "finish" => "nonfoil"
          }
        }
      })

    assert %{
             "data" => %{
               "addDeckCard" => %{
                 "id" => _id,
                 "quantity" => 2,
                 "zone" => "sideboard",
                 "finish" => "nonfoil",
                 "card" => %{"name" => "Add Me"}
               }
             }
           } = json_response(conn, 200)
  end

  test "delete deck card mutation removes a card from a deck", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-delete-deck-card",
          "oracle_id" => "oracle-delete-deck-card",
          "name" => "Delete Me",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "del",
          "set_name" => "Delete Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Delete Test"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Delete Me"})
    {:ok, location} = Catalog.create_location(%{"name" => "Delete Binder", "kind" => "binder"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-delete-deck-card",
        "quantity" => 1,
        "location_id" => location.id
      })

    assert {:ok, allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteDeckCard($id: ID!) {
          deleteDeckCard(id: $id) {
            id
            card { name }
          }
        }
        """,
        "variables" => %{"id" => deck_card.id}
      })

    assert %{
             "data" => %{
               "deleteDeckCard" => %{
                 "id" => _id,
                 "card" => %{"name" => "Delete Me"}
               }
             }
           } = json_response(conn, 200)

    assert Catalog.get_deck!(deck.id).deck_cards == []

    restored_item =
      allocation.collection_item_id
      |> Catalog.get_collection_item!()

    assert restored_item.location_id == location.id
    assert Catalog.deck_allocation_status(Catalog.get_deck!(deck.id)) == %{}
  end

  test "delete deck mutation removes a deck and restores allocated cards", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-delete-deck",
          "oracle_id" => "oracle-delete-deck",
          "name" => "Delete Deck Card",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "ddk",
          "set_name" => "Delete Deck Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Deck To Delete"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Delete Deck Card"})

    {:ok, location} =
      Catalog.create_location(%{"name" => "Delete Deck Binder", "kind" => "binder"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-delete-deck",
        "quantity" => 1,
        "location_id" => location.id
      })

    assert {:ok, allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteDeck($id: ID!) {
          deleteDeck(id: $id) {
            id
            name
          }
        }
        """,
        "variables" => %{"id" => deck.id}
      })

    assert %{
             "data" => %{
               "deleteDeck" => %{"id" => _id, "name" => "Deck To Delete"}
             }
           } = json_response(conn, 200)

    assert_raise Ecto.NoResultsError, fn -> Catalog.get_deck!(deck.id) end
    assert Catalog.get_collection_item!(allocation.collection_item_id).location_id == location.id
  end

  test "set deck commander replaces the current commander", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Old Legend",
          "type_line" => "Legendary Creature — Wizard",
          "collector_number" => "1",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "New Legend",
          "type_line" => "Legendary Creature — Soldier",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Commander Test"})

    {:ok, old_commander} =
      Catalog.add_card_to_deck(deck, %{"name" => "Old Legend", "zone" => "commander"})

    {:ok, new_commander} = Catalog.add_card_to_deck(deck, %{"name" => "New Legend"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation SetDeckCommander($id: ID!) {
          setDeckCommander(id: $id) {
            id
            zone
            card { name }
          }
        }
        """,
        "variables" => %{"id" => new_commander.id}
      })

    assert %{
             "data" => %{
               "setDeckCommander" => %{
                 "id" => _id,
                 "zone" => "commander",
                 "card" => %{"name" => "New Legend"}
               }
             }
           } = json_response(conn, 200)

    loaded = Catalog.get_deck!(deck.id)

    assert Enum.any?(loaded.deck_cards, &(&1.id == old_commander.id and &1.zone == "mainboard"))
    assert Enum.any?(loaded.deck_cards, &(&1.id == new_commander.id and &1.zone == "commander"))
  end

  defp count_repo_queries(fun) when is_function(fun, 0) do
    caller = self()
    ref = make_ref()
    handler_id = {__MODULE__, ref}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, _config ->
          unless metadata[:source] == "schema_migrations" do
            send(caller, {ref, :query})
          end
        end,
        nil
      )

    try do
      result = fun.()
      {result, collect_query_count(ref, 0)}
    after
      :telemetry.detach(handler_id)
      collect_query_count(ref, 0)
    end
  end

  defp collect_query_count(ref, count) do
    receive do
      {^ref, :query} -> collect_query_count(ref, count + 1)
    after
      0 -> count
    end
  end
end
