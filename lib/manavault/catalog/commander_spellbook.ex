defmodule Manavault.Catalog.CommanderSpellbook do
  @moduledoc false

  alias Manavault.Catalog.Deck
  alias Manavault.Repo

  @find_my_combos_url "https://backend.commanderspellbook.com/find-my-combos/?limit=1000"
  @headers [
    {"accept", "application/json"},
    {"content-type", "application/json"},
    {"user-agent", "ManaVault/1.0"}
  ]

  def combos(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, [deck_cards: :card], force: true)
    payload = payload(deck)

    if payload["main"] == [] and payload["commanders"] == [] do
      {:ok, []}
    else
      fetch = Keyword.get(opts, :fetch, &fetch/1)

      with {:ok, response} <- fetch.(payload) do
        normalize(response)
      end
    end
  end

  defp payload(deck) do
    %{
      "main" => entries_for_zone(deck.deck_cards, "mainboard"),
      "commanders" => entries_for_zone(deck.deck_cards, "commander")
    }
  end

  defp entries_for_zone(deck_cards, zone) do
    deck_cards
    |> Enum.filter(&(&1.zone == zone))
    |> Enum.sort_by(&{&1.card.name, &1.id})
    |> Enum.map(&%{"card" => &1.card.name, "quantity" => &1.quantity})
  end

  defp fetch(payload) do
    case Req.post(@find_my_combos_url,
           json: payload,
           headers: @headers,
           receive_timeout: 20_000
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 and is_map(body) ->
        {:ok, body}

      {:ok, %{status: status}} ->
        {:error, {:commander_spellbook_http_error, status}}

      {:error, exception} ->
        {:error, {:commander_spellbook_request_failed, Exception.message(exception)}}
    end
  end

  defp normalize(%{"results" => %{"included" => included}}) when is_list(included) do
    {:ok, Enum.map(included, &normalize_combo/1)}
  end

  defp normalize(_response), do: {:error, :commander_spellbook_unexpected_response}

  defp normalize_combo(combo) do
    id = Map.get(combo, "id", "")

    %{
      id: id,
      url: "https://commanderspellbook.com/combo/#{URI.encode(id)}",
      cards: normalize_cards(Map.get(combo, "uses", [])),
      produces: normalize_produces(Map.get(combo, "produces", [])),
      description: string_value(combo, "description"),
      mana_needed: optional_string(combo, "manaNeeded"),
      prerequisites:
        lines(string_value(combo, "easyPrerequisites")) ++
          lines(string_value(combo, "notablePrerequisites")),
      notes: optional_string(combo, "notes")
    }
  end

  defp normalize_cards(uses) when is_list(uses) do
    Enum.flat_map(uses, fn
      %{"card" => %{"name" => name} = card} = use when is_binary(name) ->
        [
          %{
            name: name,
            quantity: positive_integer(Map.get(use, "quantity")),
            image_url: card["imageUriFrontSmall"] || card["imageUriFrontNormal"]
          }
        ]

      _use ->
        []
    end)
  end

  defp normalize_cards(_uses), do: []

  defp normalize_produces(produces) when is_list(produces) do
    Enum.flat_map(produces, fn
      %{"feature" => %{"name" => name}} when is_binary(name) -> [name]
      _produce -> []
    end)
  end

  defp normalize_produces(_produces), do: []

  defp string_value(map, key) do
    case Map.get(map, key) do
      value when is_binary(value) -> value
      _value -> ""
    end
  end

  defp optional_string(map, key) do
    case String.trim(string_value(map, key)) do
      "" -> nil
      value -> value
    end
  end

  defp lines(value) do
    value
    |> String.split(~r/\R/u)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp positive_integer(value) when is_integer(value) and value > 0, do: value
  defp positive_integer(_value), do: 1
end
