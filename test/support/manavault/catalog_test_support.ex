defmodule Manavault.CatalogTestSupport do
  import ExUnit.Assertions

  alias Manavault.Catalog

  def black_lotus do
    %{
      "id" => "scryfall-printing-1",
      "oracle_id" => "oracle-1",
      "name" => "Black Lotus",
      "type_line" => "Artifact",
      "oracle_text" => "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
      "mana_cost" => "{0}",
      "cmc" => 0.0,
      "colors" => [],
      "color_identity" => [],
      "legalities" => %{"vintage" => "restricted"},
      "set" => "lea",
      "set_name" => "Limited Edition Alpha",
      "collector_number" => "232",
      "lang" => "en",
      "rarity" => "rare",
      "finishes" => ["nonfoil"],
      "image_uris" => %{"normal" => "https://example.test/black-lotus.jpg"},
      "prices" => %{"usd" => "100000.00"},
      "released_at" => "1993-08-05",
      "rulings_uri" => "https://api.scryfall.com/cards/oracle-1/rulings"
    }
  end

  def renamed_lotus do
    %{
      black_lotus()
      | "name" => "Black Lotus Updated",
        "prices" => %{"usd" => "1.00"},
        "rulings_uri" => "https://api.scryfall.com/cards/oracle-1/rulings-updated"
    }
  end

  def black_lotus_beta do
    %{
      black_lotus()
      | "id" => "scryfall-printing-3",
        "set" => "leb",
        "set_name" => "Limited Edition Beta",
        "collector_number" => "233",
        "released_at" => "1993-10-04"
    }
  end

  def time_walk do
    %{
      "id" => "scryfall-printing-2",
      "oracle_id" => "oracle-2",
      "name" => "Time Walk",
      "type_line" => "Sorcery",
      "oracle_text" => "Take an extra turn after this turn.",
      "mana_cost" => "{1}{U}",
      "cmc" => 2.0,
      "colors" => ["U"],
      "color_identity" => ["U"],
      "set" => "lea",
      "set_name" => "Limited Edition Alpha",
      "collector_number" => "84",
      "lang" => "ja",
      "rarity" => "rare",
      "finishes" => ["foil"],
      "prices" => %{"usd_foil" => "5.00"},
      "released_at" => "1993-08-05"
    }
  end

  def plains do
    %{
      "id" => "scryfall-printing-basic-plains",
      "oracle_id" => "oracle-plains",
      "name" => "Plains",
      "type_line" => "Basic Land — Plains",
      "cmc" => 0.0,
      "colors" => [],
      "color_identity" => ["W"],
      "set" => "lea",
      "set_name" => "Limited Edition Alpha",
      "collector_number" => "250",
      "lang" => "en",
      "rarity" => "common",
      "finishes" => ["nonfoil"],
      "released_at" => "1993-08-05"
    }
  end

  def legal_commander_card do
    Map.merge(time_walk(), %{
      "id" => "scryfall-printing-test-commander",
      "oracle_id" => "oracle-test-commander",
      "name" => "Test Commander",
      "type_line" => "Legendary Creature — Cat",
      "colors" => ["W"],
      "color_identity" => ["W"],
      "legalities" => %{"commander" => "legal"},
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => "1",
      "lang" => "en",
      "finishes" => ["nonfoil"],
      "prices" => %{},
      "released_at" => "2026-01-01"
    })
  end

  def legal_plains do
    Map.put(plains(), "legalities", %{"commander" => "legal"})
  end

  def legality_card(name, color_identity, legalities) do
    card_slug = slug(name)

    Map.merge(time_walk(), %{
      "id" => "scryfall-printing-#{card_slug}",
      "oracle_id" => "oracle-#{card_slug}",
      "name" => name,
      "type_line" => "Instant",
      "colors" => color_identity,
      "color_identity" => color_identity,
      "legalities" => legalities,
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => card_slug,
      "lang" => "en",
      "finishes" => ["nonfoil"],
      "prices" => %{},
      "released_at" => "2026-01-01"
    })
  end

  def add_deck_card!(deck, name, quantity, zone) do
    assert {:ok, deck_card} =
             Catalog.add_card_to_deck(deck, %{
               "name" => name,
               "quantity" => quantity,
               "zone" => zone
             })

    deck_card
  end

  def issue_by_code(legality, code) do
    Enum.find(legality.issues, &(&1.code == code))
  end

  def expected_decklist_entries(text) do
    text
    |> String.split(~r/\R/u)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.reduce(%{}, fn line, entries ->
      [_, quantity, name, set_code, collector_number | finish_captures] =
        Regex.run(
          ~r/^(\d+)x\s+(.+?)\s+\(([A-Z0-9]+)\)\s+(.+?)(?:\s+\*([A-Z])\*)?$/,
          line
        )

      foil_marker = List.first(finish_captures)
      finish = if foil_marker == "F", do: "foil", else: "nonfoil"

      Map.update(
        entries,
        name,
        %{
          quantity: String.to_integer(quantity),
          name: name,
          set_code: set_code,
          collector_number: collector_number,
          finish: finish
        },
        fn entry ->
          %{entry | quantity: max(entry.quantity, String.to_integer(quantity))}
        end
      )
    end)
  end

  def cards_from_expected_entries(expected) do
    expected
    |> Map.values()
    |> Enum.map(fn entry ->
      %{
        "id" => scryfall_id(entry),
        "oracle_id" => oracle_id(entry.name),
        "name" => entry.name,
        "type_line" => type_line(entry.name),
        "oracle_text" => "",
        "color_identity" => [],
        "legalities" => %{},
        "set" => String.downcase(entry.set_code),
        "set_name" => "#{entry.set_code} Test Set",
        "collector_number" => entry.collector_number,
        "lang" => "en",
        "finishes" => [entry.finish],
        "image_uris" => %{"normal" => "https://example.test/#{scryfall_id(entry)}.jpg"},
        "prices" => %{},
        "released_at" => "2026-01-01"
      }
    end)
  end

  def oracle_id(name), do: "oracle-" <> slug(name)

  def scryfall_id(entry) do
    [
      String.downcase(entry.set_code),
      entry.collector_number,
      entry.finish,
      slug(entry.name)
    ]
    |> Enum.join("-")
  end

  def slug(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end

  def type_line(name) when name in ["Forest", "Island", "Mountain"], do: "Basic Land"
  def type_line(_name), do: "Instant"

  def scryfall_tag(attrs) do
    Map.merge(
      %{
        "object" => "tag",
        "id" => "tag-default",
        "slug" => "default",
        "label" => "Default",
        "type" => "function",
        "description" => nil,
        "parent_ids" => [],
        "child_ids" => [],
        "aliases" => [],
        "taggings" => []
      },
      attrs
    )
  end

  def collection_item_ids(filters) do
    filters
    |> Catalog.list_collection_items(limit: 10)
    |> Enum.map(& &1.id)
  end
end

defmodule Manavault.CatalogTestFixtures do
  @fixtures [:black_lotus, :renamed_lotus, :black_lotus_beta, :time_walk, :plains]

  defmacro __using__(opts) do
    fixtures = Keyword.get(opts, :fixtures, [])

    fixture_attrs =
      Enum.map(fixtures, fn fixture ->
        unless fixture in @fixtures do
          raise ArgumentError, "unknown catalog test fixture: #{inspect(fixture)}"
        end

        quote do
          Module.put_attribute(
            __MODULE__,
            unquote(fixture),
            apply(Manavault.CatalogTestSupport, unquote(fixture), [])
          )
        end
      end)

    quote do
      import Manavault.CatalogTestSupport
      unquote_splicing(fixture_attrs)
    end
  end
end
