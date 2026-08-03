defmodule Manavault.Trade.ListSource.MoxfieldTest do
  use ExUnit.Case, async: false

  alias Manavault.Trade.ListSource.Moxfield

  @stub __MODULE__.Stub

  setup do
    previous = Application.get_env(:manavault, :trade_moxfield_req_options)

    Application.put_env(:manavault, :trade_moxfield_req_options,
      plug: {Req.Test, @stub},
      retry: false
    )

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :trade_moxfield_req_options, previous)
      else
        Application.delete_env(:manavault, :trade_moxfield_req_options)
      end
    end)

    :ok
  end

  describe "host?/1" do
    test "accepts moxfield.com and www.moxfield.com case-insensitively" do
      assert Moxfield.host?("moxfield.com")
      assert Moxfield.host?("www.moxfield.com")
      assert Moxfield.host?("MOXFIELD.COM")
    end

    test "rejects other hosts" do
      refute Moxfield.host?("moxfield.com.evil.example")
      refute Moxfield.host?("archidekt.com")
      refute Moxfield.host?(nil)
    end
  end

  describe "deck_id/1" do
    test "extracts a valid id from /decks/<id>" do
      assert {:ok, "AbC123-_"} = Moxfield.deck_id("/decks/AbC123-_")
    end

    test "allows and ignores a trailing slug segment" do
      assert {:ok, "AbC123"} = Moxfield.deck_id("/decks/AbC123/my-deck-name")
    end

    test "rejects ids that are too short, too long, or contain invalid characters" do
      assert :error = Moxfield.deck_id("/decks/ab")
      assert :error = Moxfield.deck_id("/decks/has space")
      assert :error = Moxfield.deck_id("/decks/" <> String.duplicate("a", 65))
    end

    test "rejects a path that isn't a deck path" do
      assert :error = Moxfield.deck_id("/users/someone")
      assert :error = Moxfield.deck_id("/decks")
    end
  end

  describe "fetch/1" do
    test "normalizes every board into zoned entries" do
      payload = %{
        "name" => "Boros Aggro",
        "boards" => %{
          "mainboard" => %{
            "cards" => %{
              "1" => %{
                "quantity" => 4,
                "card" => %{"name" => "Sol Ring", "set" => "cmr", "cn" => "1"}
              }
            }
          },
          "sideboard" => %{
            "cards" => %{"2" => %{"quantity" => 2, "card" => %{"name" => "Negate"}}}
          },
          "maybeboard" => %{
            "cards" => %{"3" => %{"quantity" => 1, "card" => %{"name" => "Ponder"}}}
          },
          "commanders" => %{
            "cards" => %{"4" => %{"quantity" => 1, "card" => %{"name" => "Krenko, Mob Boss"}}}
          }
        }
      }

      Req.Test.stub(@stub, fn conn ->
        conn
        |> Plug.Conn.put_resp_header("content-type", "application/json")
        |> Plug.Conn.send_resp(200, Jason.encode!(payload))
      end)

      assert {:ok, %{source_name: "Boros Aggro", entries: entries}} = Moxfield.fetch("abc123")

      assert %{
               name: "Sol Ring",
               quantity: 4,
               zone: "mainboard",
               set_code: "cmr",
               collector_number: "1"
             } =
               Enum.find(entries, &(&1.name == "Sol Ring"))

      assert %{name: "Negate", quantity: 2, zone: "considering", set_code: nil} =
               Enum.find(entries, &(&1.name == "Negate"))

      assert %{name: "Ponder", quantity: 1, zone: "considering"} =
               Enum.find(entries, &(&1.name == "Ponder"))

      assert %{name: "Krenko, Mob Boss", quantity: 1, zone: "commander"} =
               Enum.find(entries, &(&1.name == "Krenko, Mob Boss"))
    end

    test "returns a paste-suggesting error for a 403 (unapproved client or private deck)" do
      Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 403, "forbidden") end)

      assert {:error, message} = Moxfield.fetch("abc123")
      assert message =~ "paste the list instead"
    end

    test "returns a friendly error when the request fails outright" do
      Req.Test.stub(@stub, fn conn -> Req.Test.transport_error(conn, :timeout) end)

      assert {:error, message} = Moxfield.fetch("abc123")
      assert message =~ "Paste the deck export text"
    end
  end
end
