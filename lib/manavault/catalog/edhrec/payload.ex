defmodule Manavault.Catalog.EDHRec.Payload do
  @moduledoc false

  alias Manavault.Catalog.{Deck, Decklists}
  alias Manavault.Catalog.Decks.Preloads
  alias Manavault.Repo

  def recs_payload(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, Preloads.deck_preloads(), force: true)

    %{
      "cards" =>
        deck.deck_cards
        |> Enum.reject(&(&1.zone == "considering"))
        |> Enum.sort_by(&{zone_order(&1.zone), &1.card.name, &1.id})
        |> Enum.map(&Decklists.export_line/1),
      "commanders" =>
        deck.deck_cards
        |> Enum.filter(&(&1.zone == "commander"))
        |> Enum.sort_by(& &1.card.name)
        |> Enum.map(& &1.card.name),
      "name" => "",
      "options" => %{
        "excludeLands" => Keyword.get(opts, :exclude_lands, false),
        "offset" => Keyword.get(opts, :offset, 0)
      }
    }
  end

  def validate_payload(%{"commanders" => [_ | _], "cards" => [_ | _]}), do: :ok
  def validate_payload(%{"commanders" => []}), do: {:error, :edhrec_missing_commander}
  def validate_payload(%{"cards" => []}), do: {:error, :edhrec_empty_deck}
  def validate_payload(_payload), do: {:error, :edhrec_invalid_deck}

  defp zone_order("commander"), do: 0
  defp zone_order("mainboard"), do: 1
  defp zone_order("considering"), do: 2
  defp zone_order(_zone), do: 3
end
