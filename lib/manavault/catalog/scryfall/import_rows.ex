defmodule Manavault.Catalog.Scryfall.ImportRows do
  @moduledoc false

  alias Manavault.Catalog.ScryfallOracleTags

  def card_rows(cards, now, oracle_tag_index) when is_list(cards) do
    Enum.flat_map(cards, &card_row(&1, now, oracle_tag_index))
  end

  def printing_rows(cards, now) when is_list(cards) do
    Enum.flat_map(cards, &printing_row(&1, now))
  end

  def printing_search_rows(cards) when is_list(cards) do
    Enum.flat_map(cards, &printing_search_row/1)
  end

  defp card_row(%{"oracle_id" => oracle_id, "name" => name} = card, now, oracle_tag_index)
       when is_binary(oracle_id) and is_binary(name) do
    tag_fields = ScryfallOracleTags.fields_for_card(card, oracle_tag_index)

    [
      %{
        oracle_id: oracle_id,
        name: name,
        type_line: card["type_line"],
        oracle_text: oracle_text(card),
        mana_cost: card["mana_cost"],
        cmc: card["cmc"],
        colors: encode_json(colors(card)),
        color_identity: encode_json(card["color_identity"] || []),
        legalities: encode_json(card["legalities"] || %{}),
        oracle_tags: tag_fields.oracle_tags,
        deck_category: tag_fields.deck_category,
        deck_themes: tag_fields.deck_themes,
        rulings_uri: card["rulings_uri"],
        inserted_at: now,
        updated_at: now
      }
    ]
  end

  defp card_row(_card, _now, _oracle_tag_index), do: []

  defp printing_row(%{"id" => scryfall_id, "oracle_id" => oracle_id} = card, now)
       when is_binary(scryfall_id) and is_binary(oracle_id) do
    [
      %{
        scryfall_id: scryfall_id,
        oracle_id: oracle_id,
        set_code: String.downcase(card["set"] || ""),
        set_name: card["set_name"],
        collector_number: card["collector_number"] || "",
        flavor_name: flavor_name(card),
        flavor_text: flavor_text(card),
        lang: card["lang"] || "en",
        rarity: card["rarity"],
        finishes: encode_json(card["finishes"] || []),
        image_uris: encode_json(image_uris(card)),
        prices: encode_json(card["prices"] || %{}),
        released_at: parse_date(card["released_at"]),
        inserted_at: now,
        updated_at: now
      }
    ]
  end

  defp printing_row(_card, _now), do: []

  defp printing_search_row(%{"id" => scryfall_id, "name" => name} = card)
       when is_binary(scryfall_id) and is_binary(name) do
    oracle_text = oracle_text(card) || ""

    [
      %{
        scryfall_id: scryfall_id,
        name: normalize_search_text(name),
        compact_name: compact_search_text(name),
        flavor_name: normalize_search_text(flavor_name(card) || ""),
        compact_flavor_name: compact_search_text(flavor_name(card) || ""),
        flavor_text: normalize_search_text(flavor_text(card) || ""),
        compact_flavor_text: compact_search_text(flavor_text(card) || ""),
        type_line: normalize_search_text(card["type_line"] || ""),
        oracle_text: normalize_search_text(oracle_text),
        compact_oracle_text: compact_search_text(oracle_text),
        set_code: normalize_search_text(card["set"] || ""),
        collector_number: normalize_search_text(card["collector_number"] || "")
      }
    ]
  end

  defp printing_search_row(_card), do: []

  defp normalize_search_text(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, " ")
    |> String.trim()
  end

  defp compact_search_text(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "")
  end

  defp colors(%{"colors" => colors}) when is_list(colors), do: colors

  defp colors(%{"card_faces" => [%{"colors" => colors} | _faces]}) when is_list(colors),
    do: colors

  defp colors(_card), do: []

  defp flavor_name(%{"flavor_name" => name}) when is_binary(name), do: name

  defp flavor_name(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "flavor_name"))
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n---\n")
  end

  defp flavor_name(_card), do: nil

  defp flavor_text(%{"flavor_text" => text}) when is_binary(text), do: text

  defp flavor_text(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "flavor_text"))
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n---\n")
  end

  defp flavor_text(_card), do: nil

  defp oracle_text(%{"oracle_text" => text}) when is_binary(text), do: text

  defp oracle_text(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "oracle_text"))
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n---\n")
  end

  defp oracle_text(_card), do: nil

  defp image_uris(%{"image_uris" => image_uris}) when is_map(image_uris), do: image_uris

  defp image_uris(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "image_uris"))
    |> Enum.reject(&is_nil/1)
  end

  defp image_uris(_card), do: %{}

  defp encode_json(value), do: Jason.encode!(value)

  defp parse_date(nil), do: nil

  defp parse_date(date) when is_binary(date) do
    case Date.from_iso8601(date) do
      {:ok, parsed} -> parsed
      {:error, _reason} -> nil
    end
  end
end
