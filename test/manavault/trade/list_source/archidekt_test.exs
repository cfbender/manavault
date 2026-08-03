defmodule Manavault.Trade.ListSource.ArchidektTest do
  use ExUnit.Case, async: false

  alias Manavault.Trade.ListSource.Archidekt

  @stub __MODULE__.Stub

  setup do
    previous = Application.get_env(:manavault, :trade_archidekt_req_options)

    Application.put_env(:manavault, :trade_archidekt_req_options,
      plug: {Req.Test, @stub},
      retry: false
    )

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :trade_archidekt_req_options, previous)
      else
        Application.delete_env(:manavault, :trade_archidekt_req_options)
      end
    end)

    :ok
  end

  describe "host?/1" do
    test "accepts archidekt.com and www.archidekt.com" do
      assert Archidekt.host?("archidekt.com")
      assert Archidekt.host?("www.archidekt.com")
    end

    test "rejects other hosts" do
      refute Archidekt.host?("archidekt.com.evil.example")
      refute Archidekt.host?("moxfield.com")
      refute Archidekt.host?(nil)
    end
  end

  describe "deck_id/1" do
    test "extracts a numeric id from /decks/<id>" do
      assert {:ok, "1234567"} = Archidekt.deck_id("/decks/1234567")
    end

    test "allows and ignores a trailing slug segment" do
      assert {:ok, "1234567"} = Archidekt.deck_id("/decks/1234567/my-deck-name")
    end

    test "rejects a non-numeric or too-long id" do
      assert :error = Archidekt.deck_id("/decks/abc123")
      assert :error = Archidekt.deck_id("/decks/" <> String.duplicate("1", 13))
    end

    test "rejects a path that isn't a deck path" do
      assert :error = Archidekt.deck_id("/users/someone")
      assert :error = Archidekt.deck_id("/decks")
    end
  end

  describe "fetch/1" do
    test "maps cards[] into zoned entries by category" do
      payload = %{
        "name" => "Mono Red Aggro",
        "cards" => [
          %{
            "quantity" => 4,
            "card" => %{"oracleCard" => %{"name" => "Lightning Bolt"}},
            "categories" => []
          },
          %{
            "quantity" => 2,
            "card" => %{"oracleCard" => %{"name" => "Abrade"}},
            "categories" => ["Sideboard"]
          },
          %{
            "quantity" => 1,
            "card" => %{"oracleCard" => %{"name" => "Chandra, Torch of Defiance"}},
            "categories" => ["Maybeboard"]
          },
          %{
            "quantity" => 1,
            "card" => %{"oracleCard" => %{"name" => "Krenko, Mob Boss"}},
            "categories" => ["Commander"]
          }
        ]
      }

      Req.Test.stub(@stub, fn conn ->
        conn
        |> Plug.Conn.put_resp_header("content-type", "application/json")
        |> Plug.Conn.send_resp(200, Jason.encode!(payload))
      end)

      assert {:ok, %{source_name: "Mono Red Aggro", entries: entries}} =
               Archidekt.fetch("1234567")

      assert %{name: "Lightning Bolt", quantity: 4, zone: "mainboard"} =
               Enum.find(entries, &(&1.name == "Lightning Bolt"))

      assert %{name: "Abrade", quantity: 2, zone: "considering"} =
               Enum.find(entries, &(&1.name == "Abrade"))

      assert %{name: "Chandra, Torch of Defiance", quantity: 1, zone: "considering"} =
               Enum.find(entries, &(&1.name == "Chandra, Torch of Defiance"))

      assert %{name: "Krenko, Mob Boss", quantity: 1, zone: "commander"} =
               Enum.find(entries, &(&1.name == "Krenko, Mob Boss"))
    end

    test "skips card entries missing an oracle card name" do
      payload = %{"name" => "Broken Export", "cards" => [%{"quantity" => 1, "categories" => []}]}

      Req.Test.stub(@stub, fn conn ->
        conn
        |> Plug.Conn.put_resp_header("content-type", "application/json")
        |> Plug.Conn.send_resp(200, Jason.encode!(payload))
      end)

      assert {:ok, %{entries: []}} = Archidekt.fetch("1234567")
    end

    test "returns a friendly, paste-suggesting error for a 403 (private deck)" do
      Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 403, "forbidden") end)

      assert {:error, message} = Archidekt.fetch("1234567")
      assert message =~ "Paste the deck export text"
    end
  end
end
