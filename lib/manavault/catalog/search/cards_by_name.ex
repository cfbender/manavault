defmodule Manavault.Catalog.Search.CardsByName do
  @moduledoc """
  Exact card resolution by name — the single query path for turning a
  user- or import-provided card name into a `Card`.

  Every exact-name lookup (deck-card creation, decklist import, trade
  wants/list sources, EDHRec responses) resolves through here so the
  semantics cannot drift: names are cleaned of decklist annotations
  (`Decklists.normalize_card_name/1`), then matched case-, diacritic-, and
  apostrophe-insensitively against the persisted, indexed
  `Card.normalized_name` (`NameMatch.sql_normalize/1`). The front face of a
  multi-faced card also resolves to its combined catalog name. Exact matches
  take precedence; otherwise the alphabetically-first card name wins.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, Decklists}
  alias Manavault.Catalog.Search.NameMatch
  alias Manavault.Repo

  @doc """
  Lookup key for `name`; also the key of maps returned by `by_names/1`.
  Non-binary names key to `""`, which never matches a card.
  """
  def key(name) when is_binary(name) do
    name |> Decklists.normalize_card_name() |> NameMatch.sql_normalize()
  end

  def key(_name), do: ""

  @doc "The card whose normalized name matches `name`, or `nil`."
  def find(name) do
    case key(name) do
      "" ->
        nil

      key ->
        [name]
        |> by_names()
        |> Map.get(key)
    end
  end

  @doc """
  Batched lookup: a map of `key/1` => `Card` covering every name in `names`
  that resolves, including front-face aliases for multi-faced cards. Look
  entries up with `Map.get(cards, key(name))`.
  """
  def by_names(names) when is_list(names) do
    keys =
      names
      |> Enum.map(&key/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    cards =
      Card
      |> where(
        [card],
        card.normalized_name in ^keys or
          (fragment("instr(?, ' // ') > 0", card.normalized_name) and
             fragment(
               "substr(?, 1, instr(?, ' // ') - 1)",
               card.normalized_name,
               card.normalized_name
             ) in ^keys)
      )
      |> order_by([card], asc: card.name)
      |> Repo.all()

    exact_matches =
      Enum.reduce(cards, %{}, fn card, matches ->
        Map.put_new(matches, card.normalized_name, card)
      end)

    Enum.reduce(cards, exact_matches, fn card, matches ->
      case front_face_key(card.normalized_name) do
        nil -> matches
        front_face_key -> Map.put_new(matches, front_face_key, card)
      end
    end)
  end

  defp front_face_key(normalized_name) do
    case String.split(normalized_name, " // ", parts: 2) do
      [front_face, _back_face] -> front_face
      _single_face -> nil
    end
  end
end
