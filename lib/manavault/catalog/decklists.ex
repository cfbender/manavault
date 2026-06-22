defmodule Manavault.Catalog.Decklists do
  @moduledoc false

  alias Manavault.Catalog.{DeckCard, Printing, Search, Util}

  def parse(text) when is_binary(text) do
    text
    |> String.split(~r/\R/u)
    |> Enum.reduce({[], "mainboard"}, fn line, {entries, zone} ->
      parse_line(line, zone, entries)
    end)
    |> elem(0)
    |> Enum.reverse()
    |> dedupe_entries()
  end

  def export(deck_cards) when is_list(deck_cards) do
    DeckCard.zones()
    |> Enum.map(fn zone ->
      deck_cards
      |> Enum.filter(&(&1.zone == zone))
      |> export_zone(zone)
    end)
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n\n")
  end

  def normalize_card_name(name) when is_binary(name) do
    name
    |> String.trim()
    |> String.replace(~r/\s+\[[^\]]+\]\s*$/u, "")
    |> String.replace(~r/\s+\*[A-Z]+\*\s*$/u, "")
    |> String.trim()
  end

  defp parse_line(line, current_zone, entries) do
    line = line |> String.trim() |> strip_comment()

    cond do
      line == "" ->
        {entries, current_zone}

      zone = zone_heading(line) ->
        {entries, zone}

      true ->
        case parse_card_line(line, current_zone) do
          nil -> {entries, current_zone}
          entry -> {[entry | entries], current_zone}
        end
    end
  end

  defp parse_card_line("SB:" <> rest, _current_zone),
    do: parse_card_line(String.trim(rest), "sideboard")

  defp parse_card_line(line, current_zone) do
    with [_, quantity, name] <- Regex.run(~r/^\s*(\d+)\s*x?\s+(.+?)\s*$/i, line) do
      {name, preferred_printing_id} = parse_card_name_and_printing(name)

      %{
        "quantity" => quantity,
        "name" => name,
        "zone" => current_zone,
        "finish" => parse_finish(line),
        "preferred_printing_id" => preferred_printing_id
      }
    else
      _no_match -> nil
    end
  end

  defp parse_card_name_and_printing(name) do
    cleaned_name = normalize_card_name(name)

    case Regex.run(~r/^(.+?)\s+\(([A-Za-z0-9]+)\)\s+([^\s]+)\s*$/, cleaned_name) do
      [_, card_name, set_code, collector_number] ->
        printing = Search.get_printing(set_code, collector_number)
        {normalize_card_name(card_name), printing && printing.scryfall_id}

      _no_printing ->
        {cleaned_name, nil}
    end
  end

  defp parse_finish(line) do
    cond do
      Regex.match?(~r/\*F\*\s*$/i, line) -> "foil"
      Regex.match?(~r/\*E\*\s*$/i, line) -> "etched"
      true -> "nonfoil"
    end
  end

  defp dedupe_entries(entries) do
    {deduped, order} =
      Enum.reduce(entries, {%{}, []}, fn entry, {deduped, order} ->
        key = entry_key(entry)
        quantity = Util.parse_quantity(entry["quantity"])
        normalized_entry = Map.put(entry, "quantity", quantity)

        if Map.has_key?(deduped, key) do
          {
            Map.update!(deduped, key, fn existing ->
              existing
              |> Map.put("quantity", max(Util.parse_quantity(existing["quantity"]), quantity))
              |> prefer_present_printing(entry)
            end),
            order
          }
        else
          {Map.put(deduped, key, normalized_entry), [key | order]}
        end
      end)

    order
    |> Enum.reverse()
    |> Enum.map(&Map.fetch!(deduped, &1))
  end

  defp entry_key(entry) do
    {
      String.downcase(entry["name"] || ""),
      entry["zone"],
      entry["preferred_printing_id"],
      entry["finish"]
    }
  end

  defp prefer_present_printing(existing, %{"preferred_printing_id" => preferred_printing_id})
       when is_binary(preferred_printing_id) do
    Map.put(existing, "preferred_printing_id", preferred_printing_id)
  end

  defp prefer_present_printing(existing, _entry), do: existing

  defp strip_comment(line) do
    line
    |> String.replace(~r/\s+#.*$/u, "")
    |> String.trim()
  end

  defp zone_heading(line) do
    case line |> String.downcase() |> String.trim_trailing(":") do
      "main" -> "mainboard"
      "mainboard" -> "mainboard"
      "deck" -> "mainboard"
      "side" -> "sideboard"
      "sideboard" -> "sideboard"
      "commander" -> "commander"
      "commanders" -> "commander"
      "maybe" -> "maybeboard"
      "maybeboard" -> "maybeboard"
      _other -> nil
    end
  end

  defp export_zone([], _zone), do: nil

  defp export_zone(cards, zone) do
    lines =
      cards
      |> Enum.sort_by(& &1.card.name)
      |> Enum.map_join("\n", &export_line/1)

    "#{zone_label(zone)}\n#{lines}"
  end

  defp export_line(%DeckCard{} = deck_card) do
    [
      "#{deck_card.quantity}x",
      deck_card.card.name,
      export_printing(deck_card.preferred_printing),
      export_finish(deck_card.finish)
    ]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" ")
  end

  defp export_printing(%Printing{} = printing) do
    "(#{String.upcase(printing.set_code || "")}) #{printing.collector_number}"
  end

  defp export_printing(_printing), do: nil

  defp export_finish("foil"), do: "*F*"
  defp export_finish("etched"), do: "*E*"
  defp export_finish(_finish), do: nil

  defp zone_label("mainboard"), do: "Mainboard"
  defp zone_label("sideboard"), do: "Sideboard"
  defp zone_label("commander"), do: "Commander"
  defp zone_label("maybeboard"), do: "Maybeboard"
  defp zone_label(zone), do: String.capitalize(zone)
end
