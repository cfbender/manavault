defmodule ManavaultWeb.Schema.Catalog.DeckMutations do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.DeckCard
  alias Manavault.Repo
  alias ManavaultWeb.Schema.Catalog.Errors

  def create_deck(_parent, %{input: input}, _resolution) do
    case Catalog.create_deck(input) do
      {:ok, deck} -> {:ok, deck}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def update_deck(_parent, %{id: id, input: input}, _resolution) do
    deck = Catalog.get_deck!(id)

    case Catalog.update_deck(deck, input) do
      {:ok, deck} -> {:ok, Catalog.get_deck!(deck.id)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def ensure_deck_share_token(_parent, %{id: id}, _resolution) do
    id
    |> Catalog.get_deck!()
    |> Catalog.ensure_deck_share_token()
    |> case do
      {:ok, deck} -> {:ok, deck}
      {:error, :share_token_collision} -> {:error, "Could not generate a unique share link."}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def add_deck_card(_parent, %{deck_id: deck_id, input: input}, _resolution) do
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
        {:error, Atom.to_string(reason)}
    end
  end

  def import_decklist(_parent, %{id: id, text: text} = args, _resolution) do
    deck = Catalog.get_deck!(id)
    opts = [replace?: Map.get(args, :replace_existing, false)]

    case Catalog.import_decklist(deck, text, opts) do
      {:ok, result} ->
        {:ok, result}

      {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
        {:error, Errors.changeset_error_message(changeset)}

      {:error, reason} ->
        {:error, Errors.deck_import_error(reason)}
    end
  end

  def delete_deck(_parent, %{id: id}, _resolution) do
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

  def update_deck_card(_parent, %{id: id, input: input}, _resolution) do
    deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

    case Catalog.update_deck_card(deck_card, input) do
      {:ok, deck_card} -> {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def update_deck_cards_tag(_parent, %{deck_card_ids: deck_card_ids} = args, _resolution) do
    case Catalog.update_deck_cards_tag(deck_card_ids, Map.get(args, :tag)) do
      {:ok, deck_cards} -> {:ok, Repo.preload(deck_cards, [:card, :preferred_printing])}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def delete_deck_card(_parent, %{id: id}, _resolution) do
    deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

    case Catalog.delete_deck_card(deck_card) do
      {:ok, deck_card} -> {:ok, deck_card}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def set_deck_commander(_parent, %{id: id}, _resolution) do
    deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

    case Catalog.set_deck_commander(deck_card) do
      {:ok, deck_card} -> {:ok, deck_card}
      {:error, :not_legendary_creature} -> {:error, "card must be a legendary creature"}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end
end
