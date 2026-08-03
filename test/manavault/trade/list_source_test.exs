defmodule Manavault.Trade.ListSourceTest do
  use Manavault.DataCase, async: false
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog
  alias Manavault.Trade
  alias Manavault.Trade.ListSource

  @moxfield_stub __MODULE__.MoxfieldStub
  @archidekt_stub __MODULE__.ArchidektStub
  @manavault_stub __MODULE__.ManaVaultStub

  setup do
    previous_moxfield = Application.get_env(:manavault, :trade_moxfield_req_options)
    previous_archidekt = Application.get_env(:manavault, :trade_archidekt_req_options)
    previous_manavault = Application.get_env(:manavault, :trade_manavault_req_options)

    Application.put_env(:manavault, :trade_moxfield_req_options,
      plug: {Req.Test, @moxfield_stub},
      retry: false
    )

    Application.put_env(:manavault, :trade_archidekt_req_options,
      plug: {Req.Test, @archidekt_stub},
      retry: false
    )

    Application.put_env(:manavault, :trade_manavault_req_options,
      plug: {Req.Test, @manavault_stub},
      retry: false
    )

    on_exit(fn ->
      restore_env(:trade_moxfield_req_options, previous_moxfield)
      restore_env(:trade_archidekt_req_options, previous_archidekt)
      restore_env(:trade_manavault_req_options, previous_manavault)
    end)

    :ok
  end

  defp restore_env(key, nil), do: Application.delete_env(:manavault, key)
  defp restore_env(key, value), do: Application.put_env(:manavault, key, value)

  defp respond_json(conn, payload) do
    conn
    |> Plug.Conn.put_resp_header("content-type", "application/json")
    |> Plug.Conn.send_resp(200, Jason.encode!(payload))
  end

  describe "resolve/1 with pasted text" do
    test "maps decklist entries, resolving a printing annotation to set/collector" do
      assert {:ok, _} = Catalog.import_cards([black_lotus()])

      text = """
      4 Sol Ring
      1 Black Lotus (LEA) 232
      """

      assert {:ok, %{source_name: nil, entries: entries}} =
               ListSource.resolve(%{url: nil, text: text})

      assert [
               %{
                 name: "Sol Ring",
                 quantity: 4,
                 zone: "mainboard",
                 set_code: nil,
                 collector_number: nil
               },
               %{
                 name: "Black Lotus",
                 quantity: 1,
                 zone: "mainboard",
                 set_code: "lea",
                 collector_number: "232"
               }
             ] = entries
    end

    test "text wins when both text and url are present" do
      assert {:ok, %{source_name: nil, entries: [%{name: "Sol Ring"}]}} =
               ListSource.resolve(%{
                 url: "https://moxfield.com/decks/whatever",
                 text: "1 Sol Ring"
               })
    end
  end

  describe "resolve/1 with neither text nor url" do
    test "returns a friendly error" do
      assert {:error, message} = ListSource.resolve(%{url: nil, text: nil})
      assert message =~ "Paste a decklist"
      assert {:error, _message} = ListSource.resolve(%{url: "", text: "   "})
    end
  end

  describe "resolve/1 with an unsupported or malformed url" do
    test "rejects an unrelated host" do
      assert {:error, "Unsupported link. Paste the list text instead."} =
               ListSource.resolve(%{url: "https://example.com/decks/123", text: nil})
    end

    test "rejects a malformed url" do
      assert {:error, "Unsupported link. Paste the list text instead."} =
               ListSource.resolve(%{url: "not a url", text: nil})
    end

    test "rejects a moxfield url with an invalid deck id, without making a request" do
      assert {:error, "Unsupported link. Paste the list text instead."} =
               ListSource.resolve(%{url: "https://www.moxfield.com/decks/ab", text: nil})
    end

    test "rejects an archidekt url with a non-numeric deck id, without making a request" do
      assert {:error, "Unsupported link. Paste the list text instead."} =
               ListSource.resolve(%{url: "https://archidekt.com/decks/abc", text: nil})
    end
  end

  describe "resolve/1 with a moxfield url" do
    test "fetches and normalizes the deck via the hardcoded moxfield API origin" do
      Req.Test.stub(@moxfield_stub, fn conn ->
        payload = %{
          "name" => "Moxfield Deck",
          "boards" => %{
            "mainboard" => %{
              "cards" => %{"1" => %{"quantity" => 1, "card" => %{"name" => "Sol Ring"}}}
            }
          }
        }

        conn
        |> Plug.Conn.put_resp_header("content-type", "application/json")
        |> Plug.Conn.send_resp(200, Jason.encode!(payload))
      end)

      assert {:ok,
              %{source_name: "Moxfield Deck", entries: [%{name: "Sol Ring", zone: "mainboard"}]}} =
               ListSource.resolve(%{url: "https://www.moxfield.com/decks/abcde", text: nil})
    end
  end

  describe "resolve/1 with an archidekt url" do
    test "fetches and normalizes the deck via the hardcoded archidekt API origin" do
      Req.Test.stub(@archidekt_stub, fn conn ->
        payload = %{
          "name" => "Archidekt Deck",
          "cards" => [
            %{
              "quantity" => 1,
              "card" => %{"oracleCard" => %{"name" => "Lightning Bolt"}},
              "categories" => []
            }
          ]
        }

        conn
        |> Plug.Conn.put_resp_header("content-type", "application/json")
        |> Plug.Conn.send_resp(200, Jason.encode!(payload))
      end)

      assert {:ok,
              %{
                source_name: "Archidekt Deck",
                entries: [%{name: "Lightning Bolt", zone: "mainboard"}]
              }} =
               ListSource.resolve(%{
                 url: "https://archidekt.com/decks/1234567/my-deck",
                 text: nil
               })
    end
  end

  describe "resolve/1 with a relative manavault share link (no host)" do
    setup do
      assert {:ok, _} = Catalog.import_cards([black_lotus()])
      {:ok, deck} = Catalog.create_deck(%{"name" => "Shared Deck"})
      add_deck_card!(deck, "Black Lotus", 1, "mainboard")
      {:ok, deck} = Catalog.ensure_deck_share_token(deck)

      assert {:ok, _want} = Trade.create_want_by_name("Black Lotus", 2)
      assert {:ok, wants_token} = Trade.ensure_wants_share_token()

      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => 4,
                 "for_trade" => true
               })

      assert {:ok, binder_token} = Trade.ensure_binder_share_token()

      %{deck: deck, wants_token: wants_token, binder_token: binder_token}
    end

    test "resolves a bare deck path locally, making no outbound request", %{deck: deck} do
      assert {:ok, %{source_name: "Shared Deck", entries: [%{name: "Black Lotus"}]}} =
               ListSource.resolve(%{url: "/share/decks/#{deck.share_token}", text: nil})
    end

    test "resolves a bare wants path locally, making no outbound request", %{wants_token: token} do
      assert {:ok,
              %{
                source_name: "Shared wants",
                entries: [%{name: "Black Lotus", quantity: 2, zone: "mainboard"}]
              }} = ListSource.resolve(%{url: "/share/wants/#{token}", text: nil})
    end

    test "resolves a bare binder path locally, making no outbound request", %{
      binder_token: token
    } do
      assert {:ok,
              %{
                source_name: "Trade binder",
                entries: [%{name: "Black Lotus", quantity: 4, zone: "mainboard"}]
              }} = ListSource.resolve(%{url: "/share/binder/#{token}", text: nil})
    end
  end

  describe "resolve/1 with an absolute manavault share link (has a host)" do
    test "always fetches remotely via POST {origin}/share/graphql, even for a host alias of this instance" do
      # An absolute link is never resolved locally, even when the host
      # happens to match this very instance — it loops back over HTTP to
      # this same server's public endpoint instead, exercised here purely
      # through the stubbed remote fetch.
      Req.Test.stub(@manavault_stub, fn conn ->
        respond_json(conn, %{
          "data" => %{
            "deck" => %{
              "name" => "Remote Deck",
              "deckCards" => %{
                "edges" => [
                  %{
                    "node" => %{
                      "quantity" => 1,
                      "zone" => "mainboard",
                      "card" => %{"name" => "Sol Ring"}
                    }
                  }
                ],
                "pageInfo" => %{"hasNextPage" => false, "endCursor" => nil}
              }
            }
          }
        })
      end)

      for host <- ["manavault.example", "127.0.0.1:4000", "localhost"] do
        assert {:ok, %{source_name: "Remote Deck", entries: [%{name: "Sol Ring"}]}} =
                 ListSource.resolve(%{url: "http://#{host}/share/decks/some-token", text: nil})
      end
    end

    test "paginates a large deck via hasNextPage/endCursor" do
      Req.Test.stub(@manavault_stub, fn conn ->
        {:ok, body, conn} = Plug.Conn.read_body(conn)
        %{"query" => query, "variables" => variables} = Jason.decode!(body)
        assert query =~ "deckCards(first: 500, after: $after)"

        payload =
          case variables["after"] do
            nil ->
              %{
                "data" => %{
                  "deck" => %{
                    "name" => "Big Deck",
                    "deckCards" => %{
                      "edges" => [
                        %{
                          "node" => %{
                            "quantity" => 4,
                            "zone" => "mainboard",
                            "card" => %{"name" => "Sol Ring"}
                          }
                        }
                      ],
                      "pageInfo" => %{"hasNextPage" => true, "endCursor" => "cursor-1"}
                    }
                  }
                }
              }

            "cursor-1" ->
              %{
                "data" => %{
                  "deck" => %{
                    "name" => "Big Deck",
                    "deckCards" => %{
                      "edges" => [
                        %{
                          "node" => %{
                            "quantity" => 2,
                            "zone" => "sideboard",
                            "card" => %{"name" => "Negate"}
                          }
                        }
                      ],
                      "pageInfo" => %{"hasNextPage" => false, "endCursor" => nil}
                    }
                  }
                }
              }
          end

        respond_json(conn, payload)
      end)

      assert {:ok, %{source_name: "Big Deck", entries: entries}} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/decks/big-deck-token",
                 text: nil
               })

      assert [%{name: "Sol Ring", zone: "mainboard"}, %{name: "Negate", zone: "considering"}] =
               entries
    end

    test "fetches a shared want list remotely" do
      Req.Test.stub(@manavault_stub, fn conn ->
        respond_json(conn, %{
          "data" => %{
            "wantsList" => %{
              "entries" => [
                %{
                  "cardName" => "Sol Ring",
                  "quantity" => 3,
                  "setCode" => nil,
                  "collectorNumber" => nil
                }
              ]
            }
          }
        })
      end)

      assert {:ok,
              %{
                source_name: "Shared wants",
                entries: [%{name: "Sol Ring", quantity: 3, zone: "mainboard"}]
              }} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/wants/some-token",
                 text: nil
               })
    end

    test "fetches a shared trade binder remotely" do
      Req.Test.stub(@manavault_stub, fn conn ->
        respond_json(conn, %{
          "data" => %{
            "binderList" => %{
              "entries" => [
                %{
                  "cardName" => "Sol Ring",
                  "quantity" => 3,
                  "setCode" => nil,
                  "collectorNumber" => nil
                }
              ]
            }
          }
        })
      end)

      assert {:ok,
              %{
                source_name: "Trade binder",
                entries: [%{name: "Sol Ring", quantity: 3, zone: "mainboard"}]
              }} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/binder/some-token",
                 text: nil
               })
    end

    test "an unknown token on a foreign instance returns a friendly not-found error" do
      Req.Test.stub(@manavault_stub, fn conn ->
        respond_json(conn, %{"data" => %{"deck" => nil}})
      end)

      assert {:error, message} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/decks/nope-token",
                 text: nil
               })

      assert message =~ "doesn't match a deck on that ManaVault instance"
    end

    test "a transport failure returns a friendly couldn't-reach error" do
      Req.Test.stub(@manavault_stub, fn conn -> Req.Test.transport_error(conn, :timeout) end)

      assert {:error, message} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/decks/some-token",
                 text: nil
               })

      assert message =~ "Couldn't reach that ManaVault instance"
    end

    test "a GraphQL errors array returns a friendly couldn't-reach error" do
      Req.Test.stub(@manavault_stub, fn conn ->
        respond_json(conn, %{"errors" => [%{"message" => "boom"}]})
      end)

      assert {:error, message} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/decks/some-token",
                 text: nil
               })

      assert message =~ "Couldn't reach that ManaVault instance"
    end

    test "an undefined wantsList field returns a friendly unsupported-feature error" do
      Req.Test.stub(@manavault_stub, fn conn ->
        respond_json(conn, %{
          "errors" => [
            %{"message" => "Cannot query field \"wantsList\" on type \"RootQueryType\"."}
          ]
        })
      end)

      assert {:error, message} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/wants/some-token",
                 text: nil
               })

      assert message =~ "doesn't support shared want lists"
    end

    test "an undefined binderList field returns a friendly unsupported-feature error" do
      Req.Test.stub(@manavault_stub, fn conn ->
        respond_json(conn, %{
          "errors" => [
            %{"message" => "Cannot query field \"binderList\" on type \"RootQueryType\"."}
          ]
        })
      end)

      assert {:error, message} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/binder/some-token",
                 text: nil
               })

      assert message =~ "doesn't support shared trade binders"
    end

    test "a malformed JSON response returns a friendly couldn't-reach error" do
      Req.Test.stub(@manavault_stub, fn conn -> Plug.Conn.send_resp(conn, 200, "not json") end)

      assert {:error, message} =
               ListSource.resolve(%{
                 url: "https://other-vault.example/share/decks/some-token",
                 text: nil
               })

      assert message =~ "Couldn't reach that ManaVault instance"
    end

    test "a non-http scheme is unsupported without making any request" do
      assert {:error, "Unsupported link. Paste the list text instead."} =
               ListSource.resolve(%{
                 url: "ftp://other-vault.example/share/decks/some-token",
                 text: nil
               })
    end
  end
end
