defmodule Manavault.Catalog.Decks.Preloads do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{DeckCard, Printing}

  def deck_preloads do
    [
      deck_cards:
        {from(deck_card in DeckCard,
           join: card in assoc(deck_card, :card),
           left_join: preferred_printing in assoc(deck_card, :preferred_printing),
           order_by: [
             asc: deck_card.zone,
             asc: card.name,
             asc: deck_card.id
           ],
           preload: [
             card:
               {card,
                printings:
                  ^from(printing in Printing,
                    order_by: [desc: printing.released_at, asc: printing.set_code]
                  )},
             preferred_printing: preferred_printing
           ]
         ), []}
    ]
  end
end
