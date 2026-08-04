defmodule Manavault.Trade.ListSource.ManaVaultRemoteTest do
  use ExUnit.Case, async: false

  alias Manavault.Trade.ListSource.ManaVaultRemote

  @stub __MODULE__.Stub
  @uri URI.new!("https://other-vault.example/share/decks/whatever")

  setup do
    previous = Application.get_env(:manavault, :trade_manavault_req_options)
    previous_clock = Application.get_env(:manavault, :trade_manavault_monotonic_time)
    previous_resolver = Application.get_env(:manavault, :trade_manavault_resolver)

    previous_allowlist =
      Application.get_env(:manavault, :trade_manavault_destination_allowlist)

    Application.put_env(:manavault, :trade_manavault_req_options,
      plug: {Req.Test, @stub},
      retry: false
    )

    Application.put_env(
      :manavault,
      :trade_manavault_resolver,
      fn _host -> {:ok, [{93, 184, 216, 34}]} end
    )

    Application.put_env(:manavault, :trade_manavault_destination_allowlist, [])

    on_exit(fn ->
      restore_env(:trade_manavault_req_options, previous)
      restore_env(:trade_manavault_monotonic_time, previous_clock)
      restore_env(:trade_manavault_resolver, previous_resolver)
      restore_env(:trade_manavault_destination_allowlist, previous_allowlist)
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

  describe "destination policy" do
    test "rejects loopback, private, link-local, and unspecified IPv4 and IPv6 literals" do
      addresses = [
        "127.0.0.1",
        "10.20.30.40",
        "169.254.169.254",
        "0.0.0.0",
        "[::1]",
        "[fd12:3456::20]",
        "[fe80::1]",
        "[::]",
        "[::ffff:127.0.0.1]",
        "[2001:2::1]",
        "[2001:20::1]",
        "[2002:7f00:1::1]",
        "[3fff::1]"
      ]

      for address <- addresses do
        uri = URI.new!("http://#{address}/share/decks/token")

        assert {:error, "Unsupported link. Paste the list text instead."} =
                 ManaVaultRemote.fetch(:deck, uri, "token")
      end
    end

    test "allows a configured LAN hostname and preserves its HTTP authority" do
      Application.put_env(:manavault, :trade_manavault_destination_allowlist, ["friend.home"])

      Application.put_env(
        :manavault,
        :trade_manavault_resolver,
        fn "friend.home" -> {:ok, [{192, 168, 50, 24}]} end
      )

      Req.Test.stub(@stub, fn conn ->
        assert conn.host == "192.168.50.24"
        assert Plug.Conn.get_req_header(conn, "host") == ["friend.home:4000"]
        assert conn.request_path == "/share/graphql"
        respond_json(conn, %{"data" => %{"deck" => nil}})
      end)

      uri = URI.new!("http://friend.home:4000/private/path?ignored=yes")
      assert {:error, message} = ManaVaultRemote.fetch(:deck, uri, "token")
      assert message =~ "doesn't match a deck"
    end

    test "allows only addresses inside an explicitly configured IPv6 LAN CIDR" do
      Application.put_env(:manavault, :trade_manavault_destination_allowlist, ["fd12:3456::/64"])

      Req.Test.stub(@stub, fn conn ->
        assert conn.host == "fd12:3456::20"
        respond_json(conn, %{"data" => %{"deck" => nil}})
      end)

      allowed = URI.new!("http://[fd12:3456::20]/share/decks/token")
      assert {:error, allowed_message} = ManaVaultRemote.fetch(:deck, allowed, "token")
      assert allowed_message =~ "doesn't match a deck"

      denied = URI.new!("http://[fd13:3456::20]/share/decks/token")

      assert {:error, "Unsupported link. Paste the list text instead."} =
               ManaVaultRemote.fetch(:deck, denied, "token")
    end

    test "accepts public IPv4 and IPv6 destinations" do
      Req.Test.stub(@stub, fn conn -> respond_json(conn, %{"data" => %{"deck" => nil}}) end)

      for address <- ["93.184.216.34", "[2606:4700:4700::1111]"] do
        uri = URI.new!("https://#{address}/share/decks/token")
        assert {:error, message} = ManaVaultRemote.fetch(:deck, uri, "token")
        assert message =~ "doesn't match a deck"
      end
    end

    test "rejects a DNS answer set containing a private address and never dispatches" do
      Application.put_env(
        :manavault,
        :trade_manavault_resolver,
        fn "rebinding.example" ->
          {:ok, [{93, 184, 216, 34}, {169, 254, 169, 254}]}
        end
      )

      uri = URI.new!("https://rebinding.example/share/decks/token")

      assert {:error, "Unsupported link. Paste the list text instead."} =
               ManaVaultRemote.fetch(:deck, uri, "token")
    end

    test "resolves once and pins that address across pagination" do
      counter = :counters.new(1, [])

      Application.put_env(
        :manavault,
        :trade_manavault_resolver,
        fn "stable.example" ->
          :counters.add(counter, 1, 1)
          {:ok, [{93, 184, 216, 34}]}
        end
      )

      Req.Test.stub(@stub, fn conn ->
        assert conn.host == "93.184.216.34"
        assert Plug.Conn.get_req_header(conn, "host") == ["stable.example"]
        {variables, conn} = request_variables(conn)

        page_info =
          if variables["after"] do
            %{"hasNextPage" => false, "endCursor" => nil}
          else
            %{"hasNextPage" => true, "endCursor" => "next"}
          end

        respond_json(conn, %{
          "data" => %{
            "deck" => %{
              "name" => "Pinned",
              "deckCards" => %{"edges" => [], "pageInfo" => page_info}
            }
          }
        })
      end)

      uri = URI.new!("https://stable.example/share/decks/token")
      assert {:ok, %{source_name: "Pinned"}} = ManaVaultRemote.fetch(:deck, uri, "token")
      assert :counters.get(counter, 1) == 1
    end
  end
end
