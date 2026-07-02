defmodule Manavault.Catalog.EDHRec.Response.CardLookup do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Deck, Printing}
  alias Manavault.Repo

  @deck_zone_priority %{"mainboard" => 0, "sideboard" => 1, "maybeboard" => 2, "commander" => 3}

  def local_card(identifier, name) when is_binary(identifier) and identifier != "" do
    local_card_by_oracle_id(identifier) ||
      local_card_by_printing_id(identifier) ||
      local_card_by_name(name)
  end

  def local_card(_identifier, name), do: local_card_by_name(name)

  # Batched card resolution: build one lookup (three grouped queries) with
  # local_card_lookup/2, then resolve each entry through local_card/3 with the
  # same oracle_id -> printing_id -> name precedence as local_card/2 — avoiding
  # up to three queries per entry across a whole EDHRec response.
  def local_card_lookup(identifiers, names) do
    identifiers = identifiers |> Enum.reject(&(&1 in [nil, ""])) |> Enum.uniq()

    trimmed_names =
      names
      |> Enum.map(&(&1 |> to_string() |> String.trim()))
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    %{
      by_oracle_id: cards_by_oracle_ids(identifiers),
      by_printing_id: cards_by_printing_ids(identifiers),
      by_name: cards_by_names(trimmed_names)
    }
  end

  def local_card(identifier, name, lookup) when is_binary(identifier) and identifier != "" do
    Map.get(lookup.by_oracle_id, identifier) ||
      Map.get(lookup.by_printing_id, identifier) ||
      Map.get(lookup.by_name, name_key(name))
  end

  def local_card(_identifier, name, lookup), do: Map.get(lookup.by_name, name_key(name))

  def matching_deck_card(%Deck{} = deck, oracle_id, name) do
    deck.deck_cards
    |> Enum.filter(&matching_deck_card?(&1, oracle_id, name))
    |> Enum.sort_by(&deck_card_zone_priority/1)
    |> List.first()
  end

  def local_card_oracle_id(%Card{oracle_id: oracle_id}), do: oracle_id
  def local_card_oracle_id(_card), do: nil

  def entry_name(%{"name" => name}) when is_binary(name), do: name
  def entry_name(%{name: name}) when is_binary(name), do: name
  def entry_name(_entry), do: ""

  def entry_oracle_id(%{"oracle_id" => oracle_id}) when is_binary(oracle_id), do: oracle_id
  def entry_oracle_id(%{oracle_id: oracle_id}) when is_binary(oracle_id), do: oracle_id
  def entry_oracle_id(_entry), do: nil

  def entry_string(entry, key) do
    case Map.get(entry, key) || Map.get(entry, existing_atom(key)) do
      value when is_binary(value) -> value
      _value -> nil
    end
  end

  def entry_number(entry, key) do
    case Map.get(entry, key) || Map.get(entry, existing_atom(key)) do
      value when is_integer(value) -> value
      value when is_float(value) -> value
      _value -> nil
    end
  end

  # Look up the atom-keyed variant without minting atoms from external data. If
  # the map really has an atom key that atom already exists, so this still finds
  # it; otherwise there is nothing to match.
  defp existing_atom(key) do
    String.to_existing_atom(key)
  rescue
    ArgumentError -> nil
  end

  def card_slug(name) do
    name
    |> String.downcase()
    |> String.replace(~r/['’,]/u, "")
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end

  defp local_card_by_oracle_id(oracle_id), do: Repo.get(Card, oracle_id)

  defp local_card_by_printing_id(scryfall_id) do
    case Repo.get(Printing, scryfall_id) do
      nil -> nil
      printing -> printing |> Repo.preload(:card) |> Map.get(:card)
    end
  end

  defp local_card_by_name(name) do
    name = name |> to_string() |> String.trim()

    Card
    |> where([card], fragment("? = ? COLLATE NOCASE", card.name, ^name))
    |> limit(1)
    |> Repo.one()
  end

  defp cards_by_oracle_ids([]), do: %{}

  defp cards_by_oracle_ids(oracle_ids) do
    Card
    |> where([card], card.oracle_id in ^oracle_ids)
    |> Repo.all()
    |> Map.new(&{&1.oracle_id, &1})
  end

  defp cards_by_printing_ids([]), do: %{}

  defp cards_by_printing_ids(scryfall_ids) do
    Printing
    |> where([printing], printing.scryfall_id in ^scryfall_ids)
    |> preload(:card)
    |> Repo.all()
    |> Enum.reduce(%{}, fn printing, acc ->
      case printing.card do
        %Card{} = card -> Map.put_new(acc, printing.scryfall_id, card)
        _no_card -> acc
      end
    end)
  end

  defp cards_by_names([]), do: %{}

  defp cards_by_names(names) do
    # COLLATE NOCASE matches case-insensitively exactly like local_card_by_name/1;
    # key results by an ASCII-only fold so it matches SQLite's NOCASE folding.
    Card
    |> where([card], fragment("? COLLATE NOCASE", card.name) in ^names)
    |> Repo.all()
    |> Enum.reduce(%{}, fn card, acc -> Map.put_new(acc, name_key(card.name), card) end)
  end

  defp name_key(name) do
    name |> to_string() |> String.trim() |> ascii_downcase()
  end

  defp ascii_downcase(string) do
    for <<byte <- string>>, into: "", do: <<downcase_ascii_byte(byte)>>
  end

  defp downcase_ascii_byte(byte) when byte in ?A..?Z, do: byte + 32
  defp downcase_ascii_byte(byte), do: byte

  # Printings are intentionally NOT preloaded here. Eagerly loading every
  # printing of every recommended card pulled tens of thousands of rows per
  # response; the GraphQL :card type resolves printings through the batched,
  # lazy dataloader instead, so they load once across all cards and only when
  # the client actually requests them.

  defp matching_deck_card?(deck_card, oracle_id, name) do
    deck_card.oracle_id == oracle_id or
      normalize_name(deck_card.card.name) == normalize_name(name)
  end

  defp deck_card_zone_priority(%{zone: zone}), do: Map.get(@deck_zone_priority, zone, 4)

  defp normalize_name(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.replace(~r/[^[:alnum:]]+/u, " ")
    |> String.trim()
  end
end
