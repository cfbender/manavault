defmodule ManavaultWeb.Schema.Catalog.Errors do
  @moduledoc false

  def changeset_error_message(%Ecto.Changeset{} = changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
    |> Enum.map_join(", ", fn {field, messages} -> "#{field} #{Enum.join(messages, ", ")}" end)
  end

  def import_error(:location_not_found), do: "Import location was not found."
  def import_error(:invalid_import_format), do: "Import file must be a CSV or TXT file."
  def import_error(:invalid_import_file), do: "Could not parse that import file."
  def import_error(:invalid_purchase_price), do: "Import purchase price must be a dollar amount."
  def import_error(_reason), do: "Could not import collection file."

  def deck_allocation_error(:collection_item_mismatch),
    do: "Collection item does not match that deck card."

  def deck_allocation_error(:allocation_list_location),
    do: "List items cannot be allocated to decks."

  def deck_allocation_error(:allocation_card_mismatch),
    do: "Collection item does not match that deck card."

  def deck_allocation_error(:allocation_finish_mismatch),
    do: "Collection item finish does not match that deck card."

  def deck_allocation_error(:allocation_exceeds_quantity),
    do: "No available copies remain for that collection item."

  def deck_allocation_error(:allocation_exceeds_deck_card_quantity),
    do: "That deck card already has enough allocated copies."

  def deck_allocation_error(:not_enough_available),
    do: "No available copies remain for that collection item."

  def deck_allocation_error(:deck_card_already_allocated),
    do: "That deck card already has enough allocated copies."

  def deck_allocation_error(:proxy_allocation_not_found), do: "Proxy allocation not found."
  def deck_allocation_error(:invalid_allocation_quantity), do: "Allocation quantity is invalid."
  def deck_allocation_error(:allocation_not_found), do: "Allocation not found."
  def deck_allocation_error(reason) when is_binary(reason), do: reason
  def deck_allocation_error(_reason), do: "Could not add collection item to deck."

  def deck_import_error(:card_not_found), do: "One or more decklist cards were not found."
  def deck_import_error(reason) when is_binary(reason), do: reason
  def deck_import_error(_reason), do: "Could not import decklist."

  def edhrec_error(:edhrec_missing_commander), do: "EDHREC requires a commander."
  def edhrec_error(:edhrec_empty_deck), do: "EDHREC requires cards in the deck."
  def edhrec_error(:edhrec_unexpected_response), do: "EDHREC returned an unexpected response."
  def edhrec_error({:edhrec_http_error, status}), do: "EDHREC returned HTTP #{status}."
  def edhrec_error({:edhrec_request_failed, reason}), do: "Could not reach EDHREC: #{reason}"
  def edhrec_error(reason) when is_binary(reason), do: reason
  def edhrec_error(_reason), do: "Could not load EDHREC data."
end
