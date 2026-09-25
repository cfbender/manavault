defmodule Manavault.AI.CardLookupTool do
  @moduledoc """
  Function tool that lets the AI provider look up cards in ManaVault's local
  Scryfall catalog. Models cannot know cards printed after their training
  data, so before recommending an addition they can fetch the card's real
  rules text, color identity, and legality from the same catalog ManaVault
  uses to validate recommendations.
  """

  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Catalog.Util

  @tool_name "lookup_cards"
  @max_names 20

  def tool_name, do: @tool_name

  @doc "OpenAI-style function tool definitions to send with every completion request."
  def definitions do
    [
      %{
        type: "function",
        function: %{
          name: @tool_name,
          description:
            "Look up Magic: The Gathering cards by exact name in ManaVault's Scryfall catalog. " <>
              "Returns each card's mana cost, type line, oracle text, color identity, and the " <>
              "formats it is legal in. Use it to verify any card you consider recommending " <>
              "that is not in the deck, especially cards from recent sets that may be newer " <>
              "than your training data. Names not found in the catalog are listed in not_found.",
          parameters: %{
            type: "object",
            additionalProperties: false,
            properties: %{
              names: %{
                type: "array",
                items: %{type: "string"},
                minItems: 1,
                maxItems: @max_names,
                description:
                  "Exact English card names to look up (up to #{@max_names}). " <>
                    "The front face name is enough for double-faced cards."
              }
            },
            required: ["names"]
          }
        }
      }
    ]
  end

  @doc """
  Executes a tool call. Always returns a JSON-encodable map so the model gets
  actionable feedback (including for malformed calls) instead of the request
  failing.
  """
  def call(@tool_name, %{"names" => names}) when is_list(names) do
    names =
      names
      |> Enum.filter(&is_binary/1)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq_by(&CardsByName.key/1)
      |> Enum.take(@max_names)

    cards = CardsByName.by_names(names)

    {found, not_found} =
      Enum.reduce(names, {[], []}, fn name, {found, not_found} ->
        case Map.get(cards, CardsByName.key(name)) do
          nil -> {found, [name | not_found]}
          card -> {[card_details(card) | found], not_found}
        end
      end)

    %{cards: Enum.reverse(found), not_found: Enum.reverse(not_found)}
  end

  def call(@tool_name, _arguments) do
    %{error: "Provide a names array of exact card names."}
  end

  def call(name, _arguments) do
    %{error: "Unknown tool #{inspect(name)}. Only #{@tool_name} is available."}
  end

  defp card_details(card) do
    legalities = Util.decode_json(card.legalities, %{})

    %{
      name: card.name,
      mana_cost: card.mana_cost,
      mana_value: card.cmc,
      type_line: card.type_line,
      oracle_text: card.oracle_text,
      color_identity: Util.decode_json(card.color_identity, []),
      legal_in: legalities |> Enum.filter(&legal?/1) |> Enum.map(&elem(&1, 0)) |> Enum.sort(),
      game_changer: card.game_changer || false
    }
  end

  defp legal?({_format, status}), do: status in ~w(legal restricted)
end
