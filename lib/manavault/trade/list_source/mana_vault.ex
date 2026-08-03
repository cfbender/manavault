defmodule Manavault.Trade.ListSource.ManaVault do
  @moduledoc """
  Resolves a *relative* (host-less) `/share/decks/<token>` or
  `/share/wants/<token>` link entirely locally by share token lookup — no
  outbound request is ever made here. An absolute link (one with a host,
  even when that host happens to be this instance) is never resolved by
  this module; see `Manavault.Trade.ListSource.ManaVaultRemote`, which
  always fetches such links over HTTP so a foreign instance's token is
  never mistaken for a local one.
  """

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, Deck, DeckCard}
  alias Manavault.Trade

  @deck_path_pattern ~r{^/share/decks/([^/?#]+)/?$}
  @wants_path_pattern ~r{^/share/wants/([^/?#]+)/?$}
  @wants_source_name "Shared wants"
  @deck_not_found_error "That share link doesn't match a deck on this ManaVault instance. " <>
                          "If it came from another vault, paste the list text instead."
  @wants_not_found_error "That share link doesn't match a shared want list on this ManaVault " <>
                           "instance. If it came from another vault, paste the list text instead."

  @doc """
  Extracts the share kind (`:deck` or `:wants`) and token from a
  `/share/decks/<token>` or `/share/wants/<token>` path, if present.
  """
  def share_path(path) when is_binary(path) do
    with :error <- match_path(@deck_path_pattern, :deck, path) do
      match_path(@wants_path_pattern, :wants, path)
    end
  end

  def share_path(_path), do: :error

  @doc "Resolves the local share for `kind` (`:deck` or `:wants`) and `token`."
  def fetch(:deck, token) when is_binary(token) do
    case Catalog.get_deck_by_share_token(token) do
      %Deck{} = deck -> {:ok, entries_from_deck(deck)}
      nil -> {:error, @deck_not_found_error}
    end
  end

  def fetch(:wants, token) when is_binary(token) do
    case Trade.wants_list_by_share_token(token) do
      %{entries: entries} -> {:ok, entries_from_wants(entries)}
      nil -> {:error, @wants_not_found_error}
    end
  end

  defp match_path(pattern, kind, path) do
    case Regex.run(pattern, path) do
      [_full, token] -> {:ok, kind, URI.decode(token)}
      nil -> :error
    end
  end

  defp entries_from_deck(%Deck{deck_cards: deck_cards} = deck) when is_list(deck_cards) do
    entries =
      deck_cards
      |> Enum.filter(&match?(%DeckCard{card: %Card{}}, &1))
      |> Enum.map(&normalize_deck_entry/1)

    %{source_name: deck.name, entries: entries}
  end

  defp entries_from_deck(%Deck{name: name}), do: %{source_name: name, entries: []}

  defp normalize_deck_entry(%DeckCard{card: %Card{name: name}} = deck_card) do
    %{
      name: name,
      quantity: deck_card.quantity,
      zone: deck_card.zone,
      set_code: nil,
      collector_number: nil
    }
  end

  defp entries_from_wants(entries) when is_list(entries) do
    %{source_name: @wants_source_name, entries: Enum.map(entries, &normalize_want_entry/1)}
  end

  defp normalize_want_entry(%{card_name: name} = entry) do
    %{
      name: name,
      quantity: Map.get(entry, :quantity, 1),
      zone: "mainboard",
      set_code: Map.get(entry, :set_code),
      collector_number: Map.get(entry, :collector_number)
    }
  end
end
