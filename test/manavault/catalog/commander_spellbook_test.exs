defmodule Manavault.Catalog.CommanderSpellbookTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk, :plains]

  alias Manavault.Catalog

  test "submits commander and mainboard cards and normalizes included combos" do
    assert {:ok, %{cards_count: 3}} = Catalog.import_cards([@black_lotus, @time_walk, @plains])
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Combo Test"})

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "zone" => "commander"
             })

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _considering} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Plains",
               "zone" => "considering"
             })

    test_pid = self()

    fetch = fn payload ->
      send(test_pid, {:spellbook_payload, payload})

      {:ok,
       %{
         "results" => %{
           "included" => [
             %{
               "id" => "1-2",
               "uses" => [
                 %{
                   "card" => %{
                     "name" => "Black Lotus",
                     "imageUriFrontSmall" => "https://example.test/lotus.jpg"
                   },
                   "quantity" => 1
                 },
                 %{"card" => %{"name" => "Time Walk"}, "quantity" => 2}
               ],
               "produces" => [
                 %{"feature" => %{"name" => "Infinite turns"}}
               ],
               "description" => "Cast Time Walk.\nRepeat.",
               "manaNeeded" => "{1}{U}",
               "easyPrerequisites" => "Black Lotus is untapped.",
               "notablePrerequisites" => "Your library has cards.\nYou can cast Time Walk.",
               "notes" => "Keep priority."
             }
           ]
         }
       }}
    end

    assert {:ok, [combo]} = Catalog.deck_combos(deck, fetch: fetch)

    assert_received {:spellbook_payload,
                     %{
                       "commanders" => [%{"card" => "Black Lotus", "quantity" => 1}],
                       "main" => [%{"card" => "Time Walk", "quantity" => 2}]
                     }}

    assert combo == %{
             id: "1-2",
             url: "https://commanderspellbook.com/combo/1-2",
             cards: [
               %{
                 name: "Black Lotus",
                 quantity: 1,
                 image_url: "https://example.test/lotus.jpg"
               },
               %{name: "Time Walk", quantity: 2, image_url: nil}
             ],
             produces: ["Infinite turns"],
             description: "Cast Time Walk.\nRepeat.",
             mana_needed: "{1}{U}",
             prerequisites: [
               "Black Lotus is untapped.",
               "Your library has cards.",
               "You can cast Time Walk."
             ],
             notes: "Keep priority."
           }
  end

  test "returns no combos without calling Commander Spellbook for an empty deck" do
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Empty"})

    assert {:ok, []} =
             Catalog.deck_combos(deck, fetch: fn _payload -> flunk("unexpected request") end)
  end

  test "rejects an unexpected response" do
    assert {:ok, %{cards_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Malformed"})
    assert {:ok, _card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    assert {:error, :commander_spellbook_unexpected_response} =
             Catalog.deck_combos(deck, fetch: fn _payload -> {:ok, %{}} end)
  end
end
