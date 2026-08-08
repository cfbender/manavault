defmodule Manavault.Catalog.Search.CardsByName do
  @moduledoc """
  Exact card resolution by name — the single query path for turning a
  user- or import-provided card name into a `Card`.

  Every exact-name lookup (deck-card creation, decklist import, trade
  wants/list sources, EDHRec responses) resolves through here so the
  semantics cannot drift: names are cleaned of decklist annotations
  (`Decklists.normalize_card_name/1`), then matched case-, diacritic-, and
  apostrophe-insensitively against the persisted, indexed
  `Card.normalized_name` (`NameMatch.sql_normalize/1`). When several cards
  share a normalized name, the alphabetically-first card name wins.
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
        Card
        |> where([card], card.normalized_name == ^key)
        |> order_by([card], asc: card.name)
        |> limit(1)
        |> Repo.one()
    end
  end

  @doc """
  Batched lookup: a map of `key/1` => `Card` covering every name in `names`
  that resolves. Look entries up with `Map.get(cards, key(name))`.
  """
  def by_names(names) when is_list(names) do
    keys =
      names
      |> Enum.map(&key/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    Card
    |> where([card], card.normalized_name in ^keys)
    |> order_by([card], asc: card.name)
    |> Repo.all()
    |> Enum.reduce(%{}, fn card, cards ->
      Map.put_new(cards, card.normalized_name, card)
    end)
  end
end
