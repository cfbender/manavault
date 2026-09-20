defmodule Manavault.Catalog.Decks.Cards do
  @moduledoc false

  alias Manavault.Catalog.Decks.{
    AddCardToDeck,
    AddDeckPartner,
    DeleteDeckCard,
    SetDeckCommander,
    UpdateDeckCard,
    UpdateDeckCards
  }

  defdelegate change_deck_card(deck_card, attrs \\ %{}), to: UpdateDeckCard, as: :change
  defdelegate add_card_to_deck(deck, attrs), to: AddCardToDeck, as: :run
  defdelegate update_deck_card(deck_card, attrs), to: UpdateDeckCard, as: :run
  defdelegate update_deck_cards_tag(deck_card_ids, tag), to: UpdateDeckCards, as: :tags
  defdelegate bulk_update_deck_cards(deck_card_ids, attrs), to: UpdateDeckCards, as: :bulk
  defdelegate bulk_delete_deck_cards(deck_card_ids), to: UpdateDeckCards, as: :delete
  defdelegate optimize_deck_card_printings(deck_card_ids), to: UpdateDeckCards, as: :optimize
  defdelegate set_deck_commander(deck_card), to: SetDeckCommander, as: :run
  defdelegate add_deck_partner(deck_card), to: AddDeckPartner, as: :run
  defdelegate delete_deck_card(deck_card), to: DeleteDeckCard, as: :run

  @doc false
  defdelegate delete_deck_card_for_deck_deletion(deck_card),
    to: DeleteDeckCard,
    as: :for_deck_deletion
end
