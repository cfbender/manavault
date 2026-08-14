defmodule Manavault.Catalog.EDHRec.Response.CardPage do
  @moduledoc false

  alias Manavault.Catalog.EDHRec.Response.CardLookup

  @section_tags ["topcommanders", "newcommanders", "newcards", "highliftcards"]
  @section_limit 5

  def normalize(page) when is_map(page) do
    sections =
      page
      |> get_in(["container", "json_dict", "cardlists"])
      |> requested_sections()

    entries = Enum.flat_map(sections, &cardviews/1)

    card_lookup =
      CardLookup.local_card_lookup(
        Enum.map(entries, &CardLookup.entry_string(&1, "id")),
        Enum.map(entries, &CardLookup.entry_name/1)
      )

    %{
      url: card_page_url(page),
      sections: Enum.map(sections, &normalize_section(&1, card_lookup))
    }
  end

  defp requested_sections(cardlists) when is_list(cardlists) do
    Enum.filter(cardlists, fn
      section when is_map(section) -> Map.get(section, "tag") in @section_tags
      _section -> false
    end)
  end

  defp requested_sections(_cardlists), do: []

  defp normalize_section(section, card_lookup) do
    %{
      header: CardLookup.entry_string(section, "header") || "Cards",
      tag: CardLookup.entry_string(section, "tag"),
      cards:
        section
        |> cardviews()
        |> Enum.take(@section_limit)
        |> Enum.map(&normalize_card(&1, card_lookup))
        |> Enum.reject(&is_nil/1)
    }
  end

  defp normalize_card(entry, card_lookup) when is_map(entry) do
    name = CardLookup.entry_name(entry)
    scryfall_id = CardLookup.entry_string(entry, "id")

    if name == "" do
      nil
    else
      %{
        name: name,
        scryfall_id: scryfall_id,
        lift: CardLookup.entry_number(entry, "lift"),
        num_decks: CardLookup.entry_number(entry, "num_decks"),
        potential_decks: CardLookup.entry_number(entry, "potential_decks"),
        url: edhrec_url(entry, name),
        card: CardLookup.local_card(scryfall_id, name, card_lookup)
      }
    end
  end

  defp normalize_card(_entry, _card_lookup), do: nil

  defp cardviews(%{"cardviews" => cardviews}) when is_list(cardviews), do: cardviews
  defp cardviews(_section), do: []

  defp card_page_url(page) do
    page
    |> get_in(["container", "json_dict", "card", "name"])
    |> case do
      name when is_binary(name) and name != "" ->
        "https://edhrec.com/cards/#{CardLookup.card_slug(name)}"

      _name ->
        "https://edhrec.com"
    end
  end

  defp edhrec_url(entry, name) do
    case CardLookup.entry_string(entry, "url") do
      "/" <> path -> "https://edhrec.com/#{path}"
      "https://edhrec.com/" <> _path = url -> url
      _url -> "https://edhrec.com/cards/#{CardLookup.card_slug(name)}"
    end
  end
end
