defmodule Manavault.Catalog.Decks.DefaultTags do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Deck, DefaultDeckTag, DeckTag}
  alias Manavault.Repo

  def list_default_deck_tags do
    DefaultDeckTag
    |> order_by([tag], asc: tag.position)
    |> Repo.all()
  end

  def replace_default_deck_tags(entries) when is_list(entries) do
    Repo.transact(fn ->
      Repo.delete_all(DefaultDeckTag)

      tags =
        entries
        |> Enum.with_index()
        |> Enum.map(fn {attrs, index} ->
          attrs = attrs |> stringify_keys() |> Map.put("position", index)

          %DefaultDeckTag{}
          |> DefaultDeckTag.changeset(attrs)
          |> Repo.insert()
          |> case do
            {:ok, tag} -> tag
            {:error, changeset} -> Repo.rollback(changeset)
          end
        end)

      {:ok, tags}
    end)
  end

  def seed_deck_default_tags(%Deck{id: deck_id}) do
    list_default_deck_tags()
    |> Enum.reduce_while({:ok, []}, fn %DefaultDeckTag{} = default_tag, {:ok, acc} ->
      %DeckTag{}
      |> DeckTag.changeset(%{
        "deck_id" => deck_id,
        "name" => default_tag.name,
        "color" => default_tag.color,
        "target_count" => default_tag.target_count,
        "position" => default_tag.position
      })
      |> Repo.insert()
      |> case do
        {:ok, deck_tag} -> {:cont, {:ok, [deck_tag | acc]}}
        {:error, changeset} -> {:halt, {:error, changeset}}
      end
    end)
    |> case do
      {:ok, deck_tags} -> {:ok, Enum.reverse(deck_tags)}
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp stringify_keys(attrs) do
    Map.new(attrs, fn {key, value} -> {to_string(key), value} end)
  end
end
