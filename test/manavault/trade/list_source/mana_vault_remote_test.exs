defmodule Manavault.Trade.ListSource.ManaVaultRemoteTest do
  use ExUnit.Case, async: false

  alias Manavault.Trade.ListSource.ManaVaultRemote

  @stub __MODULE__.Stub
  @uri URI.new!("https://other-vault.example/share/decks/whatever")

  setup do
    previous = Application.get_env(:manavault, :trade_manavault_req_options)
    previous_clock = Application.get_env(:manavault, :trade_manavault_monotonic_time)

    Application.put_env(:manavault, :trade_manavault_req_options,
      plug: {Req.Test, @stub},
      retry: false
    )

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :trade_manavault_req_options, previous)
      else
        Application.delete_env(:manavault, :trade_manavault_req_options)
      end

      if previous_clock do
        Application.put_env(:manavault, :trade_manavault_monotonic_time, previous_clock)
      else
        Application.delete_env(:manavault, :trade_manavault_monotonic_time)
      end
    end)

    :ok
  end

  defp respond_json(conn, payload) do
    conn
    |> Plug.Conn.put_resp_header("content-type", "application/json")
    |> Plug.Conn.send_resp(200, Jason.encode!(payload))
  end

  defp request_variables(conn) do
    {:ok, body, conn} = Plug.Conn.read_body(conn)
    {Jason.decode!(body)["variables"], conn}
  end

  defp deck_edge(name) do
    %{
      "node" => %{
        "quantity" => 1,
        "zone" => "mainboard",
        "card" => %{"name" => name}
      }
    }
  end

  defp deck_page(edges, has_next_page, end_cursor, extra \\ %{}) do
    Map.merge(
      %{
        "data" => %{
          "deck" => %{
            "name" => "Remote Deck",
            "deckCards" => %{
              "edges" => edges,
              "pageInfo" => %{
                "hasNextPage" => has_next_page,
                "endCursor" => end_cursor
              }
            }
          }
        }
      },
      extra
    )
  end

  describe "fetch/3 with :deck" do
    test "fetches and normalizes a single page" do
      Req.Test.stub(@stub, fn conn ->
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

      assert {:ok, %{source_name: "Remote Deck", entries: [entry]}} =
               ManaVaultRemote.fetch(:deck, @uri, "whatever-token")

      assert %{name: "Sol Ring", quantity: 1, zone: "mainboard"} = entry
    end

    test "paginates on hasNextPage/endCursor until exhausted" do
      Req.Test.stub(@stub, fn conn ->
        {variables, conn} = request_variables(conn)

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
               ManaVaultRemote.fetch(:deck, @uri, "whatever-token")

      assert [
               %{name: "Sol Ring", quantity: 4, zone: "mainboard"},
               %{name: "Negate", quantity: 2, zone: "considering"}
             ] = entries
    end

    test "stops endless pagination after ten pages" do
      {:ok, requests} = Agent.start_link(fn -> 0 end)

      Req.Test.stub(@stub, fn conn ->
        request_number = Agent.get_and_update(requests, fn count -> {count + 1, count + 1} end)
        respond_json(conn, deck_page([], true, "cursor-#{request_number}"))
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "endless")
      assert message =~ "too large or took too long"
      assert Agent.get(requests, & &1) == 10
    end

    test "rejects a repeated cursor" do
      Req.Test.stub(@stub, fn conn ->
        {variables, conn} = request_variables(conn)

        cursor =
          case variables["after"] do
            nil -> "cursor-1"
            "cursor-1" -> "cursor-1"
          end

        respond_json(conn, deck_page([], true, cursor))
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "repeated")
      assert message =~ "invalid list pagination"
    end

    test "rejects a non-advancing empty cursor" do
      Req.Test.stub(@stub, fn conn -> respond_json(conn, deck_page([], true, "")) end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "empty-cursor")
      assert message =~ "invalid list pagination"
    end

    test "rejects more than ten thousand normalized entries across pages" do
      first_page = Enum.map(1..5_001, &deck_edge("First #{&1}"))
      second_page = Enum.map(1..5_000, &deck_edge("Second #{&1}"))

      Req.Test.stub(@stub, fn conn ->
        {variables, conn} = request_variables(conn)

        case variables["after"] do
          nil -> respond_json(conn, deck_page(first_page, true, "cursor-1"))
          "cursor-1" -> respond_json(conn, deck_page(second_page, false, nil))
        end
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "too-many-entries")
      assert message =~ "too large or took too long"
    end

    test "rejects more than ten megabytes of responses across pages" do
      padding = String.duplicate("x", 3_400_000)

      Req.Test.stub(@stub, fn conn ->
        {variables, conn} = request_variables(conn)

        case variables["after"] do
          nil ->
            respond_json(conn, deck_page([], true, "cursor-1", %{"padding" => padding}))

          "cursor-1" ->
            respond_json(conn, deck_page([], true, "cursor-2", %{"padding" => padding}))

          "cursor-2" ->
            respond_json(conn, deck_page([], false, nil, %{"padding" => padding}))
        end
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "too-many-bytes")
      assert message =~ "too large or took too long"
    end

    test "rejects an import that reaches its whole-import deadline" do
      {:ok, times} = Agent.start_link(fn -> [0, 0, 30_000] end)

      Application.put_env(:manavault, :trade_manavault_monotonic_time, fn ->
        Agent.get_and_update(times, fn [time | rest] -> {time, rest} end)
      end)

      Req.Test.stub(@stub, fn conn -> respond_json(conn, deck_page([], false, nil)) end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "too-slow")
      assert message =~ "too large or took too long"
    end

    test "returns a not-found error when the deck resolves to null" do
      Req.Test.stub(@stub, fn conn -> respond_json(conn, %{"data" => %{"deck" => nil}}) end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "nope")
      assert message =~ "doesn't match a deck on that ManaVault instance"
    end

    test "returns an unreachable error for a GraphQL errors array" do
      Req.Test.stub(@stub, fn conn ->
        respond_json(conn, %{"errors" => [%{"message" => "boom"}]})
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "whatever")
      assert message =~ "Couldn't reach that ManaVault instance"
    end

    test "returns an unreachable error for malformed (non-JSON) response bodies" do
      Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 200, "not json") end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "whatever")
      assert message =~ "Couldn't reach that ManaVault instance"
    end

    test "returns an unreachable error for a response shaped unlike the expected schema" do
      Req.Test.stub(@stub, fn conn -> respond_json(conn, %{"data" => %{"unexpected" => true}}) end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "whatever")
      assert message =~ "Couldn't reach that ManaVault instance"
    end

    test "returns an unreachable error on a transport failure" do
      Req.Test.stub(@stub, fn conn -> Req.Test.transport_error(conn, :timeout) end)

      assert {:error, message} = ManaVaultRemote.fetch(:deck, @uri, "whatever")
      assert message =~ "Couldn't reach that ManaVault instance"
    end
  end

  describe "fetch/3 with :wants" do
    test "fetches and normalizes want entries" do
      Req.Test.stub(@stub, fn conn ->
        respond_json(conn, %{
          "data" => %{
            "wantsList" => %{
              "entries" => [
                %{
                  "cardName" => "Sol Ring",
                  "quantity" => 2,
                  "setCode" => "cmr",
                  "collectorNumber" => "1"
                },
                %{
                  "cardName" => "Negate",
                  "quantity" => 1,
                  "setCode" => nil,
                  "collectorNumber" => nil
                }
              ]
            }
          }
        })
      end)

      assert {:ok, %{source_name: "Shared wants", entries: entries}} =
               ManaVaultRemote.fetch(:wants, @uri, "whatever-token")

      assert [
               %{
                 name: "Sol Ring",
                 quantity: 2,
                 zone: "mainboard",
                 set_code: "cmr",
                 collector_number: "1"
               },
               %{
                 name: "Negate",
                 quantity: 1,
                 zone: "mainboard",
                 set_code: nil,
                 collector_number: nil
               }
             ] = entries
    end

    test "returns a not-found error when the want list resolves to null" do
      Req.Test.stub(@stub, fn conn -> respond_json(conn, %{"data" => %{"wantsList" => nil}}) end)

      assert {:error, message} = ManaVaultRemote.fetch(:wants, @uri, "nope")
      assert message =~ "doesn't match a shared want list on that ManaVault instance"
    end

    test "returns an unsupported-feature error when the remote schema lacks wantsList" do
      Req.Test.stub(@stub, fn conn ->
        respond_json(conn, %{
          "errors" => [
            %{"message" => "Cannot query field \"wantsList\" on type \"RootQueryType\"."}
          ]
        })
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:wants, @uri, "whatever")
      assert message =~ "doesn't support shared want lists"
    end

    test "returns an unreachable error for an unrelated GraphQL errors array" do
      Req.Test.stub(@stub, fn conn ->
        respond_json(conn, %{"errors" => [%{"message" => "internal server error"}]})
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:wants, @uri, "whatever")
      assert message =~ "Couldn't reach that ManaVault instance"
    end
  end

  describe "fetch/3 with :binder" do
    test "fetches and normalizes binder entries" do
      Req.Test.stub(@stub, fn conn ->
        respond_json(conn, %{
          "data" => %{
            "binderList" => %{
              "entries" => [
                %{
                  "cardName" => "Sol Ring",
                  "quantity" => 2,
                  "setCode" => "cmr",
                  "collectorNumber" => "1"
                },
                %{
                  "cardName" => "Negate",
                  "quantity" => 1,
                  "setCode" => nil,
                  "collectorNumber" => nil
                }
              ]
            }
          }
        })
      end)

      assert {:ok, %{source_name: "Trade binder", entries: entries}} =
               ManaVaultRemote.fetch(:binder, @uri, "whatever-token")

      assert [
               %{
                 name: "Sol Ring",
                 quantity: 2,
                 zone: "mainboard",
                 set_code: "cmr",
                 collector_number: "1"
               },
               %{
                 name: "Negate",
                 quantity: 1,
                 zone: "mainboard",
                 set_code: nil,
                 collector_number: nil
               }
             ] = entries
    end

    test "returns a not-found error when the binder list resolves to null" do
      Req.Test.stub(@stub, fn conn -> respond_json(conn, %{"data" => %{"binderList" => nil}}) end)

      assert {:error, message} = ManaVaultRemote.fetch(:binder, @uri, "nope")
      assert message =~ "doesn't match a shared trade binder on that ManaVault instance"
    end

    test "returns an unsupported-feature error when the remote schema lacks binderList" do
      Req.Test.stub(@stub, fn conn ->
        respond_json(conn, %{
          "errors" => [
            %{"message" => "Cannot query field \"binderList\" on type \"RootQueryType\"."}
          ]
        })
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:binder, @uri, "whatever")
      assert message =~ "doesn't support shared trade binders"
    end

    test "returns an unreachable error for an unrelated GraphQL errors array" do
      Req.Test.stub(@stub, fn conn ->
        respond_json(conn, %{"errors" => [%{"message" => "internal server error"}]})
      end)

      assert {:error, message} = ManaVaultRemote.fetch(:binder, @uri, "whatever")
      assert message =~ "Couldn't reach that ManaVault instance"
    end
  end

  describe "fetch/3 with a non-http(s) scheme or missing host" do
    test "rejects a non-http scheme without making any request" do
      uri = URI.new!("ftp://example.test/share/decks/token")

      assert {:error, "Unsupported link. Paste the list text instead."} =
               ManaVaultRemote.fetch(:deck, uri, "token")
    end

    test "rejects a protocol-relative uri with no scheme" do
      uri = %URI{scheme: nil, host: "example.test", port: nil}

      assert {:error, "Unsupported link. Paste the list text instead."} =
               ManaVaultRemote.fetch(:deck, uri, "token")
    end
  end
end
