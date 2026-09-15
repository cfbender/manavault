defmodule Manavault.Trade.DeckDiff do
  @moduledoc """
  Diffs resolved list entries (see `Manavault.Trade.EntryResolver`) against a
  deck's cards, excluding the considering zone on both sides: cards only in
  the external list are `adds`, cards only in the deck are `cuts`, and cards
  in both at different quantities are `changes`.
  """

  import Ecto.Query

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, Deck, DeckCard, Printing, Util}
  alias Manavault.Repo

  @excluded_zone "considering"
  @not_found_error "That deck couldn't be found."
  @basic_land_base_names ~w(plains island swamp mountain forest wastes)
  @basic_land_names MapSet.new(
                      @basic_land_base_names ++
                        Enum.map(@basic_land_base_names, &("snow-covered " <> &1))
                    )

  @doc """
  Diffs `entries` against `deck_id` (an already-decoded integer id). Returns
  `{:ok, result}`, or `{:error, message}` if the deck can't be found.
  """
  def diff(deck_id, source_name, %{entries: entries, unrecognized: unrecognized}) do
    deck = Catalog.get_deck!(deck_id)
    deck_cards = considered_deck_cards(deck)
    considered_entries = Enum.reject(entries, &(&1.zone == @excluded_zone))
    entry_cards = load_entry_cards(considered_entries)

    {basic_deck_cards, nonbasic_deck_cards} = Enum.split_with(deck_cards, &deck_card_basic?/1)

    {basic_entries, nonbasic_entries} =
      Enum.split_with(considered_entries, &entry_basic?(&1, entry_cards))

    deck_totals = deck_totals_by_oracle(nonbasic_deck_cards)
    {entry_totals, name_only_adds} = entry_totals(nonbasic_entries)

    basic_deck_totals = basic_deck_totals_by_name(basic_deck_cards)
    basic_entry_totals = basic_entry_totals_by_name(basic_entries, entry_cards)

    {:ok,
     %{
       source_name: source_name,
       unrecognized: unrecognized,
       adds:
         adds(entry_totals, deck_totals) ++
           name_only_adds ++ basic_adds(basic_entry_totals, basic_deck_totals),
       cuts: cuts(entry_totals, deck_totals) ++ basic_cuts(basic_entry_totals, basic_deck_totals),
       changes:
         changes(entry_totals, deck_totals) ++
           basic_changes(basic_entry_totals, basic_deck_totals)
     }}
  rescue
    Ecto.NoResultsError -> {:error, @not_found_error}
  end

  defp considered_deck_cards(%Deck{deck_cards: deck_cards}) do
    Enum.reject(deck_cards, &(&1.zone == @excluded_zone))
  end

  defp deck_totals_by_oracle(deck_cards) do
    Enum.reduce(deck_cards, %{}, fn deck_card, totals ->
      Map.update(
        totals,
        deck_card.oracle_id,
        %{quantity: deck_card.quantity, deck_card: deck_card, deck_cards: [deck_card]},
        fn existing ->
          %{
            existing
            | quantity: existing.quantity + deck_card.quantity,
              deck_cards: [deck_card | existing.deck_cards]
          }
        end
      )
    end)
  end

  # Splits (already non-basic) entries into oracle-known totals (comparable
  # against the deck) and unresolved, name-only entries — the latter can
  # never match a deck card, so they always surface as adds.
  defp entry_totals(entries) do
    {known, unknown} = Enum.split_with(entries, &(&1.oracle_id != nil))

    totals =
      Enum.reduce(known, %{}, fn entry, totals ->
        Map.update(
          totals,
          entry.oracle_id,
          %{quantity: entry.quantity, name: entry.name},
          fn existing -> %{existing | quantity: existing.quantity + entry.quantity} end
        )
      end)

    name_only_adds =
      unknown
      |> Enum.group_by(& &1.name)
      |> Enum.map(fn {name, group} ->
        %{
          card_name: name,
          quantity: Enum.sum(Enum.map(group, & &1.quantity)),
          oracle_id: nil,
          image_url: nil
        }
      end)

    {totals, name_only_adds}
  end

  defp adds(entry_totals, deck_totals) do
    entry_totals
    |> Enum.reject(fn {oracle_id, _totals} -> Map.has_key?(deck_totals, oracle_id) end)
    |> Enum.map(fn {oracle_id, %{quantity: quantity, name: name}} ->
      %{
        card_name: name,
        quantity: quantity,
        oracle_id: oracle_id,
        image_url: representative_image_url(oracle_id)
      }
    end)
  end

  defp cuts(entry_totals, deck_totals) do
    deck_totals
    |> Enum.reject(fn {oracle_id, _totals} -> Map.has_key?(entry_totals, oracle_id) end)
    |> Enum.map(fn {oracle_id, %{quantity: quantity, deck_card: deck_card} = totals} ->
      %{
        card_name: deck_card.card.name,
        quantity: quantity,
        oracle_id: oracle_id,
        image_url: deck_card_image_url(deck_card),
        deck_card_ids: deck_card_ids(totals)
      }
    end)
  end

  # Every deck card row behind a cut (a cut can span zones, e.g. mainboard +
  # commander), so the UI can tag them all as consider_cutting.
  defp deck_card_ids(%{deck_cards: deck_cards}) do
    deck_cards |> Enum.map(& &1.id) |> Enum.sort()
  end

  defp changes(entry_totals, deck_totals) do
    Enum.flat_map(entry_totals, fn {oracle_id, %{quantity: to_quantity, name: name}} ->
      case Map.get(deck_totals, oracle_id) do
        %{quantity: from_quantity} = totals when from_quantity != to_quantity ->
          [
            %{
              card_name: name,
              from_quantity: from_quantity,
              to_quantity: to_quantity,
              oracle_id: oracle_id,
              deck_card_ids: deck_card_ids(totals)
            }
          ]

        _match_or_missing ->
          []
      end
    end)
  end

  # Basic lands are aggregated by card name rather than oracle_id: Scryfall
  # sometimes assigns different oracle_ids to the same basic land printed in
  # different sets, which would otherwise surface as a spurious cut+add pair
  # for a deck that already has the "right" number of, say, Plains.
  defp deck_card_basic?(%DeckCard{card: %Card{type_line: type_line}}) do
    basic_type_line?(type_line)
  end

  defp entry_basic?(%{oracle_id: nil, name: name}, _entry_cards), do: basic_name?(name)

  defp entry_basic?(%{oracle_id: oracle_id}, entry_cards) do
    case Map.get(entry_cards, oracle_id) do
      %{type_line: type_line} -> basic_type_line?(type_line)
      _no_card -> false
    end
  end

  defp basic_type_line?(type_line) when is_binary(type_line),
    do: String.starts_with?(type_line, "Basic Land")

  defp basic_type_line?(_type_line), do: false

  defp basic_name?(name) when is_binary(name) do
    key = name |> String.downcase() |> String.trim()
    MapSet.member?(@basic_land_names, key)
  end

  defp basic_name?(_name), do: false

  # One bounded query for every oracle_id referenced by the entries, used
  # both to classify basics and to resolve their canonical catalog name.
  defp load_entry_cards(entries) do
    case entries |> Enum.map(& &1.oracle_id) |> Enum.reject(&is_nil/1) |> Enum.uniq() do
      [] ->
        %{}

      oracle_ids ->
        Card
        |> where([card], card.oracle_id in ^oracle_ids)
        |> select([card], %{
          oracle_id: card.oracle_id,
          name: card.name,
          type_line: card.type_line
        })
        |> Repo.all()
        |> Map.new(&{&1.oracle_id, &1})
    end
  end

  defp basic_deck_totals_by_name(deck_cards) do
    Enum.reduce(deck_cards, %{}, fn deck_card, totals ->
      Map.update(
        totals,
        deck_card.card.name,
        %{quantity: deck_card.quantity, deck_card: deck_card, deck_cards: [deck_card]},
        fn existing ->
          %{
            existing
            | quantity: existing.quantity + deck_card.quantity,
              deck_cards: [deck_card | existing.deck_cards]
          }
        end
      )
    end)
  end

  defp basic_entry_totals_by_name(entries, entry_cards) do
    Enum.reduce(entries, %{}, fn entry, totals ->
      Map.update(
        totals,
        basic_entry_name(entry, entry_cards),
        %{quantity: entry.quantity, oracle_id: entry.oracle_id},
        fn existing -> %{existing | quantity: existing.quantity + entry.quantity} end
      )
    end)
  end

  defp basic_entry_name(%{oracle_id: nil, name: name}, _entry_cards), do: name

  defp basic_entry_name(%{oracle_id: oracle_id, name: name}, entry_cards) do
    case Map.get(entry_cards, oracle_id) do
      %{name: card_name} -> card_name
      _no_card -> name
    end
  end

  defp basic_adds(entry_totals, deck_totals) do
    entry_totals
    |> Enum.reject(fn {name, _totals} -> Map.has_key?(deck_totals, name) end)
    |> Enum.map(fn {name, %{quantity: quantity, oracle_id: oracle_id}} ->
      %{
        card_name: name,
        quantity: quantity,
        oracle_id: oracle_id,
        image_url: basic_entry_image_url(oracle_id)
      }
    end)
  end

  defp basic_cuts(entry_totals, deck_totals) do
    deck_totals
    |> Enum.reject(fn {name, _totals} -> Map.has_key?(entry_totals, name) end)
    |> Enum.map(fn {name, %{quantity: quantity, deck_card: deck_card} = totals} ->
      %{
        card_name: name,
        quantity: quantity,
        oracle_id: deck_card.oracle_id,
        image_url: deck_card_image_url(deck_card),
        deck_card_ids: deck_card_ids(totals)
      }
    end)
  end

  defp basic_changes(entry_totals, deck_totals) do
    Enum.flat_map(entry_totals, fn {name, %{quantity: to_quantity, oracle_id: oracle_id}} ->
      case Map.get(deck_totals, name) do
        %{quantity: from_quantity} = totals when from_quantity != to_quantity ->
          [
            %{
              card_name: name,
              from_quantity: from_quantity,
              to_quantity: to_quantity,
              oracle_id: oracle_id,
              deck_card_ids: deck_card_ids(totals)
            }
          ]

        _match_or_missing ->
          []
      end
    end)
  end

  defp basic_entry_image_url(nil), do: nil
  defp basic_entry_image_url(oracle_id), do: representative_image_url(oracle_id)

  defp representative_image_url(oracle_id) do
    case Catalog.get_card_with_printings(oracle_id) do
      %Card{printings: [printing | _rest]} -> printing_image_url(printing)
      _no_card -> nil
    end
  end

  defp deck_card_image_url(%DeckCard{preferred_printing: %Printing{} = printing}) do
    printing_image_url(printing)
  end

  defp deck_card_image_url(%DeckCard{card: %Card{printings: [printing | _rest]}}) do
    printing_image_url(printing)
  end

  defp deck_card_image_url(_deck_card), do: nil

  defp printing_image_url(%Printing{image_uris: image_uris}) do
    image_uris |> Util.decode_json(%{}) |> image_url()
  end

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil
end
