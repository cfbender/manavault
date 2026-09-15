defmodule Manavault.Catalog.CommanderRules do
  @moduledoc """
  Shared rules for which cards can be paired together in a Commander deck's
  command zone.

  Supports every current two-commander mechanic generically: the Partner
  keyword (including restricted variants such as "Partner—Survivors"),
  "Partner with <name>", Friends forever, Doctor's companion, and Choose a
  Background.
  """

  alias Manavault.Catalog.Card

  @doc """
  Returns true when the two cards form a legal two-commander pairing.
  """
  def valid_pair?(%Card{} = card_a, %Card{} = card_b) do
    partner_keyword_pair?(card_a, card_b) or
      partner_with_pair?(card_a, card_b) or
      friends_forever_pair?(card_a, card_b) or
      doctors_companion_pair?(card_a, card_b) or
      background_pair?(card_a, card_b)
  end

  def valid_pair?(_card_a, _card_b), do: false

  defp partner_keyword_pair?(card_a, card_b) do
    case {partner_label(card_a), partner_label(card_b)} do
      {{:partner, label}, {:partner, label}} -> true
      _labels -> false
    end
  end

  # Matches the Partner keyword, including restricted variants such as
  # "Partner—Survivors" (whose labels must match between the two commanders).
  # "Partner with <name>" is a different mechanic and is deliberately not
  # matched here.
  defp partner_label(card) do
    card
    |> oracle_lines()
    |> Enum.find_value(fn line ->
      case Regex.run(~r/^Partner(?:\s*[—–-]\s*([^(]+?))?\s*(?:\(|$)/u, line) do
        [_match] -> {:partner, nil}
        [_match, label] -> {:partner, label |> String.trim() |> String.downcase()}
        nil -> nil
      end
    end)
  end

  defp partner_with_pair?(card_a, card_b) do
    partner_with?(card_a, card_b) and partner_with?(card_b, card_a)
  end

  defp partner_with?(card, other_card) do
    other_name = card_base_name(other_card)

    is_binary(other_name) and
      Enum.any?(oracle_lines(card), fn line ->
        Regex.match?(~r/^Partner with #{Regex.escape(other_name)}(?:$|\s*\()/iu, line)
      end)
  end

  defp friends_forever_pair?(card_a, card_b) do
    friends_forever?(card_a) and friends_forever?(card_b)
  end

  defp friends_forever?(card) do
    Enum.any?(oracle_lines(card), &Regex.match?(~r/^Friends forever(?:$|\s*\()/iu, &1))
  end

  defp doctors_companion_pair?(card_a, card_b) do
    (doctors_companion?(card_a) and doctor?(card_b)) or
      (doctors_companion?(card_b) and doctor?(card_a))
  end

  defp doctors_companion?(card) do
    Enum.any?(oracle_lines(card), &Regex.match?(~r/^Doctor['’]s companion(?:$|\s*\()/iu, &1))
  end

  defp doctor?(%Card{type_line: type_line}) when is_binary(type_line) do
    String.contains?(type_line, "Time Lord Doctor")
  end

  defp doctor?(_card), do: false

  defp background_pair?(card_a, card_b) do
    (chooses_background?(card_a) and background?(card_b)) or
      (chooses_background?(card_b) and background?(card_a))
  end

  defp chooses_background?(card) do
    Enum.any?(oracle_lines(card), &Regex.match?(~r/^Choose a Background(?:$|\s*\()/iu, &1))
  end

  defp background?(%Card{type_line: type_line}) when is_binary(type_line) do
    String.contains?(type_line, "Background")
  end

  defp background?(_card), do: false

  defp oracle_lines(%Card{oracle_text: text}) when is_binary(text) do
    text
    |> String.split("\n")
    |> Enum.map(&String.trim/1)
  end

  defp oracle_lines(_card), do: []

  defp card_base_name(%Card{name: name}) when is_binary(name) do
    name
    |> String.split(" // ")
    |> List.first()
  end

  defp card_base_name(_card), do: nil
end
