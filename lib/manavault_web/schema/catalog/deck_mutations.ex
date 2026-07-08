defmodule ManavaultWeb.Schema.Catalog.DeckMutations do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.{DeckCard, DeckTag}
  alias Manavault.Repo
  alias ManavaultWeb.Schema.Catalog.Errors
  alias ManavaultWeb.Schema.RelayHelpers

  def create_deck(_parent, %{input: input}, _resolution) do
    case Catalog.create_deck(input) do
      {:ok, deck} -> {:ok, deck}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def update_deck(_parent, %{id: id, input: input}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      deck = Catalog.get_deck!(id)

      case Catalog.update_deck(deck, input) do
        {:ok, deck} -> {:ok, Catalog.get_deck!(deck.id)}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def ensure_deck_share_token(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      id
      |> Catalog.get_deck!()
      |> Catalog.ensure_deck_share_token()
      |> case do
        {:ok, deck} -> {:ok, deck}
        {:error, :share_token_collision} -> {:error, "Could not generate a unique share link."}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def add_deck_card(_parent, %{deck_id: deck_id, input: input}, resolution) do
    with {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution),
         {:ok, input} <- normalize_deck_card_input(input, resolution) do
      deck = Catalog.get_deck!(deck_id)

      case Catalog.add_card_to_deck(deck, input) do
        {:ok, deck_card} ->
          {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}

        {:error, :card_not_found} ->
          {:error, "Card was not found."}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} when is_binary(reason) ->
          {:error, reason}

        {:error, reason} when is_atom(reason) ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def import_decklist(_parent, %{id: id, text: text} = args, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      deck = Catalog.get_deck!(id)
      opts = [replace?: Map.get(args, :replace_existing, false), zone: Map.get(args, :zone)]

      case Catalog.import_decklist(deck, text, opts) do
        {:ok, result} ->
          {:ok, result}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_import_error(reason)}
      end
    end
  end

  def delete_deck(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      deck = Catalog.get_deck!(id)

      case Catalog.delete_deck(deck) do
        {:ok, deck} ->
          {:ok, deck}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_import_error(reason)}
      end
    end
  end

  def preview_deck_disassembly(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      id
      |> Catalog.get_deck!()
      |> Catalog.preview_deck_disassembly()
      |> deck_disassembly_result()
    end
  end

  def disassemble_deck(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      id
      |> Catalog.get_deck!()
      |> Catalog.disassemble_deck()
      |> deck_disassembly_result()
    end
  end

  def update_deck_card(_parent, %{id: id, input: input}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck_card, resolution),
         {:ok, input} <- normalize_deck_card_input(input, resolution) do
      deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

      case Catalog.update_deck_card(deck_card, input) do
        {:ok, deck_card} ->
          {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def update_deck_cards_tag(_parent, %{deck_card_ids: deck_card_ids} = args, resolution) do
    with {:ok, deck_card_ids} <- parse_deck_card_ids(deck_card_ids, resolution) do
      case Catalog.update_deck_cards_tag(deck_card_ids, Map.get(args, :tag)) do
        {:ok, deck_cards} ->
          {:ok, Repo.preload(deck_cards, [:card, :preferred_printing])}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def bulk_update_deck_cards(_parent, %{deck_card_ids: deck_card_ids, input: input}, resolution) do
    with {:ok, deck_card_ids} <- parse_deck_card_ids(deck_card_ids, resolution) do
      case Catalog.bulk_update_deck_cards(deck_card_ids, input) do
        {:ok, deck_cards} ->
          {:ok, Repo.preload(deck_cards, [:card, :preferred_printing])}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def bulk_delete_deck_cards(_parent, %{deck_card_ids: deck_card_ids}, resolution) do
    with {:ok, deck_card_ids} <- parse_deck_card_ids(deck_card_ids, resolution) do
      case Catalog.bulk_delete_deck_cards(deck_card_ids) do
        {:ok, deck_cards} ->
          {:ok, deck_cards}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def optimize_deck_card_printings(_parent, %{deck_card_ids: deck_card_ids}, resolution) do
    with {:ok, deck_card_ids} <- parse_deck_card_ids(deck_card_ids, resolution) do
      case Catalog.optimize_deck_card_printings(deck_card_ids) do
        {:ok, deck_cards} ->
          {:ok, Repo.preload(deck_cards, [:card, :preferred_printing])}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def delete_deck_card(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck_card, resolution) do
      deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

      case Catalog.delete_deck_card(deck_card) do
        {:ok, deck_card} ->
          {:ok, deck_card}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def set_deck_commander(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck_card, resolution) do
      deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

      case Catalog.set_deck_commander(deck_card) do
        {:ok, deck_card} ->
          {:ok, deck_card}

        {:error, :not_legendary_creature} ->
          {:error, "card must be a legendary creature"}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def create_deck_tag(_parent, %{deck_id: deck_id, input: input}, resolution) do
    with {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution) do
      deck = Catalog.get_deck!(deck_id)

      case Catalog.create_deck_tag(deck, input) do
        {:ok, deck_tag} -> {:ok, deck_tag}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def update_deck_tag(_parent, %{id: id, input: input}, _resolution) do
    with {:ok, id} <- parse_raw_id(id),
         {:ok, deck_tag} <- fetch_deck_tag(id) do
      case Catalog.update_deck_tag(deck_tag, input) do
        {:ok, deck_tag} -> {:ok, deck_tag}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def delete_deck_tag(_parent, %{id: id}, _resolution) do
    with {:ok, id} <- parse_raw_id(id),
         {:ok, deck_tag} <- fetch_deck_tag(id) do
      case Catalog.delete_deck_tag(deck_tag) do
        {:ok, deck_tag} -> {:ok, deck_tag.id}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def reorder_deck_tags(_parent, %{deck_id: deck_id, tag_ids: tag_ids}, resolution) do
    with {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution),
         {:ok, tag_ids} <- parse_raw_ids(tag_ids) do
      deck = Catalog.get_deck!(deck_id)

      case Catalog.reorder_deck_tags(deck, tag_ids) do
        {:ok, deck_tags} -> {:ok, deck_tags}
        {:error, reason} -> {:error, Errors.deck_edit_error(reason)}
      end
    end
  end

  def replace_default_deck_tags(_parent, %{tags: tags}, _resolution) do
    entries = Enum.map(tags, &default_deck_tag_entry/1)

    case Catalog.replace_default_deck_tags(entries) do
      {:ok, tags} -> {:ok, tags}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def assign_deck_card_tag(_parent, %{deck_card_id: deck_card_id, tag_id: tag_id}, resolution) do
    with {:ok, deck_card_id} <- RelayHelpers.node_id(deck_card_id, :deck_card, resolution),
         {:ok, tag_id} <- parse_raw_id(tag_id) do
      deck_card_id |> Catalog.assign_deck_card_tag(tag_id) |> deck_card_tag_payload()
    end
  end

  def unassign_deck_card_tag(_parent, %{deck_card_id: deck_card_id, tag_id: tag_id}, resolution) do
    with {:ok, deck_card_id} <- RelayHelpers.node_id(deck_card_id, :deck_card, resolution),
         {:ok, tag_id} <- parse_raw_id(tag_id) do
      deck_card_id |> Catalog.unassign_deck_card_tag(tag_id) |> deck_card_tag_payload()
    end
  end

  defp deck_card_tag_payload({:ok, %DeckCard{} = deck_card}) do
    deck = Catalog.get_deck!(deck_card.deck_id)
    {:ok, %{deck_card: deck_card, deck_tags: Catalog.list_deck_tags(deck)}}
  end

  defp deck_card_tag_payload({:error, :deck_mismatch}) do
    {:error, "That tag belongs to a different deck."}
  end

  defp deck_card_tag_payload({:error, :not_found}) do
    {:error, "Deck card or deck tag was not found."}
  end

  defp fetch_deck_tag(id) do
    case Repo.get(DeckTag, id) do
      %DeckTag{} = deck_tag -> {:ok, deck_tag}
      nil -> {:error, "Deck tag was not found."}
    end
  end

  defp default_deck_tag_entry(%{name: name, color: color} = input) do
    %{name: name, color: color, target_count: Map.get(input, :target_count)}
  end

  defp parse_raw_ids(ids) do
    ids
    |> Enum.reduce_while({:ok, []}, fn id, {:ok, acc} ->
      case parse_raw_id(id) do
        {:ok, parsed} -> {:cont, {:ok, [parsed | acc]}}
        {:error, message} -> {:halt, {:error, message}}
      end
    end)
    |> case do
      {:ok, parsed} -> {:ok, Enum.reverse(parsed)}
      {:error, message} -> {:error, message}
    end
  end

  defp parse_raw_id(id) when is_integer(id), do: {:ok, id}

  defp parse_raw_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> {:ok, parsed}
      _other -> {:error, "Invalid ID: #{id}"}
    end
  end

  defp deck_disassembly_result({:ok, result}), do: {:ok, result}

  defp deck_disassembly_result({:error, %Ecto.Changeset{} = changeset}) do
    {:error, Errors.changeset_error_message(changeset)}
  end

  defp deck_disassembly_result({:error, reason}) when is_binary(reason), do: {:error, reason}

  defp deck_disassembly_result({:error, reason}) when is_atom(reason) do
    {:error, Atom.to_string(reason)}
  end

  defp parse_deck_card_ids(deck_card_ids, resolution) do
    deck_card_ids
    |> Enum.reduce_while({:ok, []}, fn deck_card_id, {:ok, ids} ->
      case RelayHelpers.node_id(deck_card_id, :deck_card, resolution) do
        {:ok, id} -> {:cont, {:ok, [id | ids]}}
        {:error, message} -> {:halt, {:error, message}}
      end
    end)
    |> case do
      {:ok, ids} -> {:ok, Enum.reverse(ids)}
      {:error, message} -> {:error, message}
    end
  end

  defp normalize_deck_card_input(input, resolution) do
    RelayHelpers.put_optional_node_id(input, :preferred_printing_id, :printing, resolution)
  end
end
