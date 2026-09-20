defmodule Manavault.AI.DeckAnalysis.Result do
  @moduledoc false

  def normalize(result, payload, custom_instructions \\ nil)

  def normalize(result, payload, custom_instructions) when is_map(result) do
    with {:ok, normalized} <- normalized_fields(result),
         normalized <- maybe_clear_custom_sections(normalized, custom_instructions),
         normalized <-
           Map.merge(normalized, %{
             official_bracket: value(result, :official_bracket),
             play_bracket: value(result, :play_bracket)
           }) do
      normalized_brackets(normalized, payload)
    end
  end

  def normalize(_result, _payload, _custom_instructions),
    do: {:error, "The AI provider returned an invalid analysis."}

  def render_markdown(result) do
    standard_sections = [
      section("Overview", result.summary),
      list_section("Goals and themes", result.themes),
      section("How it plays", result.game_plan),
      section("What it's like to play against it", result.opponent_experience),
      section("Bracket read", bracket_section(result)),
      list_section("Strengths", result.strengths),
      list_section("Pressure points", result.weaknesses),
      list_section("Ways to power it up", result.power_up),
      list_section("Ways to power it down", result.power_down),
      list_section("Consistency improvements", result.consistency),
      list_section("Mulligan guide", result.mulligan_guide)
    ]

    custom_sections = Enum.map(result.custom_sections, &section(&1.title, &1.content))
    Enum.join(standard_sections ++ custom_sections, "\n\n")
  end

  def bracket_label(official, practical) when practical in 1..5 and practical != official,
    do: "Bracket #{official} (plays like Bracket #{practical})"

  def bracket_label(official, _practical), do: "Bracket #{official}"

  defp maybe_clear_custom_sections(normalized, instructions) do
    if custom_instructions?(instructions),
      do: normalized,
      else: Map.put(normalized, :custom_sections, [])
  end

  defp bracket_section(%{official_bracket: nil} = result), do: result.bracket_rationale

  defp bracket_section(result) do
    label = bracket_label(result.official_bracket, result.play_bracket)
    "**#{label}**\n\n#{result.bracket_rationale}"
  end

  defp normalized_fields(result) do
    string_fields = ~w(summary game_plan opponent_experience bracket_rationale)a
    list_fields = ~w(themes strengths weaknesses power_up power_down consistency mulligan_guide)a
    custom_sections = value(result, :custom_sections)

    with true <- Enum.all?(string_fields, &valid_string?(value(result, &1))),
         true <- Enum.all?(list_fields, &valid_string_list?(value(result, &1))),
         true <- valid_custom_sections?(custom_sections) do
      normalized = normalize_standard_fields(result, string_fields, list_fields)
      {:ok, Map.put(normalized, :custom_sections, normalize_sections(custom_sections))}
    else
      _invalid -> {:error, "The AI provider returned an incomplete analysis."}
    end
  end

  defp normalize_standard_fields(result, string_fields, list_fields) do
    normalized =
      Map.new(string_fields, fn field -> {field, result |> value(field) |> String.trim()} end)

    Enum.reduce(list_fields, normalized, fn field, acc ->
      values = result |> value(field) |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
      Map.put(acc, field, values)
    end)
  end

  defp normalize_sections(sections) do
    Enum.map(sections, fn section ->
      %{
        title: section |> value(:title) |> String.trim(),
        content: section |> value(:content) |> String.trim()
      }
    end)
  end

  defp normalized_brackets(result, payload) do
    official = value(result, :official_bracket)
    practical = value(result, :play_bracket)

    if payload.deck.format == "commander" do
      normalize_commander_brackets(result, official, practical, payload.facts.game_changer_count)
    else
      {:ok, Map.merge(result, %{official_bracket: nil, play_bracket: nil})}
    end
  end

  defp normalize_commander_brackets(result, official, practical, game_changer_count) do
    with true <- valid_bracket?(official),
         true <- valid_bracket?(practical) do
      minimum = game_changer_minimum(game_changer_count)

      result =
        Map.merge(result, %{official_bracket: max(official, minimum), play_bracket: practical})

      result = maybe_correct_rationale(result, official, minimum, practical, game_changer_count)
      {:ok, result}
    else
      _invalid -> {:error, "The AI provider returned an invalid Commander bracket."}
    end
  end

  defp maybe_correct_rationale(result, official, minimum, practical, count)
       when official < minimum do
    Map.put(result, :bracket_rationale, corrected_bracket_rationale(count, minimum, practical))
  end

  defp maybe_correct_rationale(result, _official, _minimum, _practical, _count), do: result

  defp value(map, key), do: Map.get(map, key) || Map.get(map, Atom.to_string(key))
  defp valid_string?(value), do: is_binary(value) and String.trim(value) != ""
  defp valid_string_list?(values), do: is_list(values) and Enum.all?(values, &is_binary/1)

  defp valid_custom_sections?(sections) do
    is_list(sections) and
      Enum.all?(sections, fn section ->
        is_map(section) and valid_string?(value(section, :title)) and
          valid_string?(value(section, :content))
      end)
  end

  defp valid_bracket?(value), do: is_integer(value) and value in 1..5
  defp game_changer_minimum(0), do: 1
  defp game_changer_minimum(count) when count <= 3, do: 3
  defp game_changer_minimum(_count), do: 4

  defp corrected_bracket_rationale(game_changer_count, minimum, practical) do
    game_changers =
      if game_changer_count == 1,
        do: "1 Game Changer",
        else: "#{game_changer_count} Game Changers"

    "The official Commander Brackets guidelines require at least Bracket #{minimum} because " <>
      "the deck contains #{game_changers}. Based on the rest of the list, it is expected to " <>
      "play like Bracket #{practical}."
  end

  defp custom_instructions?(instructions),
    do: is_binary(instructions) and String.trim(instructions) != ""

  defp section(title, content), do: "## #{title}\n\n#{content}"

  defp list_section(title, items) do
    content =
      if items == [],
        do: "No specific changes recommended.",
        else: Enum.map_join(items, "\n", &("- " <> &1))

    section(title, content)
  end
end
