defmodule ManavaultWeb.Schema.DeckDiffIdsTest do
  use ManavaultWeb.ConnCase

  alias Absinthe.Relay.Node
  alias Manavault.Catalog
  alias ManavaultWeb.Schema

  test "deckDiff cut and change rows expose relay DeckCard ids that decode back" do
    {:ok, _} =
      Catalog.import_cards([
        %{
          "id" => "printing-diff-ids",
          "oracle_id" => "oracle-diff-ids",
          "name" => "Diff Ids Card",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "dif",
          "set_name" => "Diff Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Diff Ids Deck"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Diff Ids Card"})

    deck_global_id = Node.to_global_id(:deck, deck.id, Schema)

    assert {:ok, %{data: %{"deckDiff" => %{"cuts" => [cut]}}}} =
             Absinthe.run(
               """
               query DeckDiffIds($deckId: ID!, $text: String) {
                 deckDiff(deckId: $deckId, text: $text) {
                   cuts {
                     cardName
                     deckCardIds
                   }
                 }
               }
               """,
               Schema,
               variables: %{"deckId" => deck_global_id, "text" => "1 Unrelated Placeholder"}
             )

    assert cut["cardName"] == "Diff Ids Card"
    assert [global_id] = cut["deckCardIds"]

    expected_id = to_string(deck_card.id)
    assert {:ok, %{type: :deck_card, id: ^expected_id}} = Node.from_global_id(global_id, Schema)
  end
end
