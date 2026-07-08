defmodule Manavault.Catalog.Decks.Tags do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Deck, DeckCard, DeckCardTag, DeckTag}
  alias Manavault.Repo

  @default_color "#7C5CFF"

  def list_deck_tags(%Deck{id: deck_id}) do
    DeckTag
    |> where([tag], tag.deck_id == ^deck_id)
    |> join(:left, [tag], dct in DeckCardTag, on: dct.deck_tag_id == tag.id)
    |> join(:left, [tag, dct], deck_card in DeckCard, on: deck_card.id == dct.deck_card_id)
    |> group_by([tag], tag.id)
    |> order_by([tag], asc: tag.position)
    |> select([tag, _dct, deck_card], %{tag | card_count: coalesce(sum(deck_card.quantity), 0)})
    |> Repo.all()
  end

  def create_deck_tag(%Deck{id: deck_id} = deck, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> stringify_keys()
      |> normalize_deck_tag_color()
      |> Map.put("deck_id", deck_id)
      |> Map.put_new("position", next_deck_tag_position(deck))

    %DeckTag{}
    |> DeckTag.changeset(attrs)
    |> Repo.insert()
    |> with_card_count()
  end

  def update_deck_tag(%DeckTag{} = deck_tag, attrs) when is_map(attrs) do
    deck_tag
    |> DeckTag.changeset(attrs |> stringify_keys() |> normalize_blank_deck_tag_color())
    |> Repo.update()
    |> with_card_count()
  end

  def delete_deck_tag(%DeckTag{} = deck_tag) do
    Repo.delete(deck_tag)
  end

  def reorder_deck_tags(%Deck{id: deck_id} = deck, ordered_tag_ids)
      when is_list(ordered_tag_ids) do
    Repo.transact(fn ->
      deck_tag_ids =
        DeckTag
        |> where([tag], tag.deck_id == ^deck_id and tag.id in ^ordered_tag_ids)
        |> select([tag], tag.id)
        |> Repo.all()
        |> MapSet.new()

      ordered_tag_ids
      |> Enum.filter(&MapSet.member?(deck_tag_ids, &1))
      |> Enum.with_index()
      |> Enum.each(fn {deck_tag_id, position} ->
        DeckTag
        |> where([tag], tag.id == ^deck_tag_id)
        |> Repo.update_all(set: [position: position])
      end)

      {:ok, list_deck_tags(deck)}
    end)
  end

  def assign_deck_card_tag(deck_card_id, deck_tag_id) do
    with {:ok, deck_card, deck_tag} <- fetch_deck_card_and_tag(deck_card_id, deck_tag_id) do
      if deck_card.deck_id == deck_tag.deck_id do
        %DeckCardTag{}
        |> DeckCardTag.changeset(%{
          deck_card_id: deck_card.id,
          deck_tag_id: deck_tag.id,
          deck_id: deck_card.deck_id
        })
        |> Repo.insert(on_conflict: :nothing, conflict_target: [:deck_card_id, :deck_tag_id])

        {:ok, put_deck_card_tag_ids_one(deck_card)}
      else
        {:error, :deck_mismatch}
      end
    end
  end

  def unassign_deck_card_tag(deck_card_id, deck_tag_id) do
    case Repo.get(DeckCard, deck_card_id) do
      nil ->
        {:error, :not_found}

      %DeckCard{} = deck_card ->
        DeckCardTag
        |> where([dct], dct.deck_card_id == ^deck_card_id and dct.deck_tag_id == ^deck_tag_id)
        |> Repo.delete_all()

        {:ok, put_deck_card_tag_ids_one(deck_card)}
    end
  end

  def put_deck_card_tag_ids([]), do: []

  def put_deck_card_tag_ids(deck_cards) when is_list(deck_cards) do
    persisted_ids = deck_cards |> Enum.filter(&is_integer(&1.id)) |> Enum.map(& &1.id)
    tag_ids_by_deck_card_id = deck_card_tag_ids_by_deck_card_id(persisted_ids)

    Enum.map(deck_cards, fn %DeckCard{} = deck_card ->
      tag_ids =
        tag_ids_by_deck_card_id
        |> Map.get(deck_card.id, [])
        |> Enum.map(&to_string/1)

      %{deck_card | tag_ids: tag_ids}
    end)
  end

  defp put_deck_card_tag_ids_one(%DeckCard{} = deck_card) do
    [updated] = put_deck_card_tag_ids([deck_card])
    updated
  end

  defp fetch_deck_card_and_tag(deck_card_id, deck_tag_id) do
    deck_card = Repo.get(DeckCard, deck_card_id)
    deck_tag = Repo.get(DeckTag, deck_tag_id)

    case {deck_card, deck_tag} do
      {%DeckCard{}, %DeckTag{}} -> {:ok, deck_card, deck_tag}
      _neither_or_missing -> {:error, :not_found}
    end
  end

  defp deck_card_tag_ids_by_deck_card_id([]), do: %{}

  defp deck_card_tag_ids_by_deck_card_id(deck_card_ids) do
    DeckCardTag
    |> where([dct], dct.deck_card_id in ^deck_card_ids)
    |> select([dct], {dct.deck_card_id, dct.deck_tag_id})
    |> Repo.all()
    |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
  end

  defp next_deck_tag_position(%Deck{id: deck_id}) do
    case Repo.one(from tag in DeckTag, where: tag.deck_id == ^deck_id, select: max(tag.position)) do
      nil -> 0
      max -> max + 1
    end
  end

  defp stringify_keys(attrs) do
    Map.new(attrs, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_deck_tag_color(attrs) do
    case Map.get(attrs, "color") do
      color when color in [nil, ""] -> Map.put(attrs, "color", @default_color)
      _color -> attrs
    end
  end

  defp normalize_blank_deck_tag_color(attrs) do
    case Map.fetch(attrs, "color") do
      {:ok, color} when color in [nil, ""] -> Map.put(attrs, "color", @default_color)
      _key_absent_or_present -> attrs
    end
  end

  defp with_card_count({:ok, %DeckTag{} = deck_tag}), do: {:ok, put_card_count(deck_tag)}
  defp with_card_count({:error, _changeset} = error), do: error

  defp put_card_count(%DeckTag{id: id} = deck_tag) do
    %{deck_tag | card_count: deck_tag_card_count(id)}
  end

  defp deck_tag_card_count(deck_tag_id) do
    DeckCardTag
    |> where([dct], dct.deck_tag_id == ^deck_tag_id)
    |> join(:inner, [dct], deck_card in DeckCard, on: deck_card.id == dct.deck_card_id)
    |> select([dct, deck_card], coalesce(sum(deck_card.quantity), 0))
    |> Repo.one()
  end
end
