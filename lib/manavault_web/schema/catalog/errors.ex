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

  def not_found_error(:deck_card), do: "Deck card was not found."
  def not_found_error(:deck_tag), do: "Deck tag was not found."
  def not_found_error(:location), do: "Location was not found."
  def not_found_error(:auto_sort_target_location), do: "Auto-sort target location was not found."

  def commander_error(:not_commander_eligible), do: "card can't be your commander"
  def commander_error(:already_commander), do: "card is already in the command zone"
  def commander_error(:no_commander), do: "deck has no commander to pair with"
  def commander_error(:command_zone_full), do: "deck already has two commanders"

  def commander_error(:invalid_commander_pair) do
    "card can't be paired with the current commander; two commanders require a pairing ability such as Partner, Partner with, Friends forever, Doctor's companion, or Choose a Background"
  end

  def commander_error(reason), do: deck_edit_error(reason)

  def import_error(:location_not_found), do: "Import location was not found."
  def import_error(:invalid_import_format), do: "Import file must be a CSV or TXT file."
  def import_error(:invalid_import_file), do: "Could not parse that import file."
  def import_error(:invalid_purchase_price), do: "Import purchase price must be a dollar amount."
  def import_error(_reason), do: "Could not import collection file."

  def deck_edit_error(:not_found), do: not_found_error(:deck_card)
  def deck_edit_error(:deck_archived), do: "Unarchive this deck before editing its decklist."

  def deck_edit_error(:deck_linked),
    do: "This deck is linked to an external deck; edit it there and sync."

  def deck_edit_error(reason) when is_binary(reason), do: reason
  def deck_edit_error(reason) when is_atom(reason), do: Atom.to_string(reason)
  def deck_edit_error(_reason), do: "Could not edit decklist."

  def deck_swap_error(%Ecto.Changeset{} = changeset), do: changeset_error_message(changeset)
  def deck_swap_error(:empty_swap), do: "Stage at least one cut or add before swapping."
  def deck_swap_error(:invalid_swap), do: "Each staged card needs a positive quantity."
  def deck_swap_error(:duplicate_swap_entry), do: "Each card can only be staged once per swap."
  def deck_swap_error(:swap_cut_not_in_deck), do: "Only cards in the deck can be cut."

  def deck_swap_error(:swap_add_not_considering),
    do: "Only Considering cards can be moved into the deck."

  def deck_swap_error(:swap_quantity_exceeds_deck_card),
    do: "A staged quantity is larger than the copies in the deck."

  def deck_swap_error(:card_not_found), do: "One or more added cards were not found."
  def deck_swap_error(reason), do: deck_edit_error(reason)

  def deck_allocation_error(:deck_archived),
    do: "Unarchive this deck before changing allocations."

  def deck_allocation_error(:deck_linked), do: deck_edit_error(:deck_linked)

  def deck_allocation_error(:collection_item_mismatch),
    do: "Collection item does not match that deck card."

  def deck_allocation_error(:allocation_list_location),
    do: "List items cannot be allocated to decks."

  def deck_allocation_error(:considering_not_allocatable),
    do: "Considering cards cannot be allocated."

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

  def deck_import_error(:deck_archived), do: "Unarchive this deck before importing a decklist."
  def deck_import_error(:deck_linked), do: deck_edit_error(:deck_linked)
  def deck_import_error(:card_not_found), do: "One or more decklist cards were not found."
  def deck_import_error(reason) when is_binary(reason), do: reason
  def deck_import_error(_reason), do: "Could not import decklist."

  def external_source_error(:deck_archived),
    do: "Unarchive this deck before linking an external deck."

  def external_source_error(:invalid_external_url),
    do: "Enter a Moxfield or Archidekt deck link."

  def external_source_error(:deck_not_linked), do: "This deck is not linked to an external deck."

  def external_source_error(:forbidden),
    do: "The deck site refused the request (HTTP 403). Try again later."

  def external_source_error(:timeout), do: "Timed out reaching the deck site."
  def external_source_error(:request_failed), do: "Could not reach the deck site."

  def external_source_error({:http_error, 404}),
    do: "That deck was not found; it may be private or deleted."

  def external_source_error({:http_error, status}), do: "The deck site returned HTTP #{status}."
  def external_source_error(%Ecto.Changeset{} = changeset), do: changeset_error_message(changeset)
  def external_source_error(reason) when is_binary(reason), do: reason
  def external_source_error(_reason), do: "Could not sync the external deck."

  def edhrec_error(:edhrec_missing_commander), do: "EDHREC requires a commander."
  def edhrec_error(:edhrec_empty_deck), do: "EDHREC requires cards in the deck."
  def edhrec_error(:edhrec_unexpected_response), do: "EDHREC returned an unexpected response."
  def edhrec_error({:edhrec_http_error, status}), do: "EDHREC returned HTTP #{status}."
  def edhrec_error({:edhrec_request_failed, reason}), do: "Could not reach EDHREC: #{reason}"
  def edhrec_error(reason) when is_binary(reason), do: reason
  def edhrec_error(_reason), do: "Could not load EDHREC data."

  def recommander_error(:recommander_missing_commander),
    do: "Recommander requires a commander."

  def recommander_error(:recommander_too_many_commanders),
    do: "Recommander supports a commander and at most one partner."

  def recommander_error(:recommander_unexpected_response),
    do: "Recommander returned an unexpected response."

  def recommander_error({:recommander_http_error, status}),
    do: "Recommander returned HTTP #{status}."

  def recommander_error({:recommander_request_failed, reason}),
    do: "Could not reach Recommander: #{reason}"

  def recommander_error({:recommander_api_error, code, messages}) do
    case {code, messages} do
      {"error_rate_limited", _messages} ->
        "Recommander is rate limiting requests; try again in a minute."

      {code, _messages} when code in ["error_booting", "error_model_loading"] ->
        "Recommander is starting up; try again in a moment."

      {code, _messages} when code in ["error_invalid_deck", "error_invalid_cards"] ->
        "Recommander could not understand this deck's cards."

      {"error_not_found", _messages} ->
        "Recommander does not have data for this commander."

      {_code, [message | _rest]} ->
        "Recommander error: #{message}"

      {code, _messages} ->
        "Recommander returned an error (#{code})."
    end
  end

  def recommander_error(reason) when is_binary(reason), do: reason
  def recommander_error(_reason), do: "Could not load Recommander data."

  def commander_spellbook_error(:commander_spellbook_unexpected_response),
    do: "Commander Spellbook returned an unexpected response."

  def commander_spellbook_error({:commander_spellbook_http_error, status}),
    do: "Commander Spellbook returned HTTP #{status}."

  def commander_spellbook_error({:commander_spellbook_request_failed, _reason}),
    do: "Could not reach Commander Spellbook. Try again in a moment."

  def commander_spellbook_error(_reason), do: "Could not load Commander Spellbook combos."
end
