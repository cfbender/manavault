defmodule Manavault.Trade.ListSource.Archidekt do
  @moduledoc """
  Validates Archidekt deck links and fetches the deck from Archidekt's public
  API. Only `archidekt.com` is ever requested, and only with an id that
  already matched `@id_pattern`.
  """

  alias Manavault.Trade.ListSource.Http

  @hosts ~w(archidekt.com www.archidekt.com)
  @id_pattern ~r/^\d{1,12}$/
  @api_base "https://archidekt.com/api/decks/"
  @friendly_error "Couldn't fetch that Archidekt deck (it may be private). Paste the deck export text instead."

  def host?(host) when is_binary(host), do: String.downcase(host) in @hosts
  def host?(_host), do: false

  @doc "Extracts and validates a deck id from a `/decks/<id>[...]` path."
  def deck_id(path) when is_binary(path) do
    case String.split(path, "/", trim: true) do
      ["decks", id | _rest] -> validate_id(id)
      _other -> :error
    end
  end

  def deck_id(_path), do: :error

  @doc "Fetches and normalizes the deck for a validated `id`."
  def fetch(id) when is_binary(id) do
    case Http.get_json(@api_base <> id <> "/", req_options: req_options()) do
      {:ok, payload} -> {:ok, entries_from_payload(payload)}
      {:error, _reason} -> {:error, @friendly_error}
    end
  end

  defp validate_id(id) do
    if Regex.match?(@id_pattern, id), do: {:ok, id}, else: :error
  end

  defp entries_from_payload(payload) do
    entries =
      payload
      |> Map.get("cards", [])
      |> Enum.map(&normalize_entry/1)
      |> Enum.reject(&is_nil/1)

    %{source_name: Map.get(payload, "name"), entries: entries}
  end

  defp normalize_entry(%{"card" => %{"oracleCard" => %{"name" => name}}} = entry)
       when is_binary(name) and name != "" do
    %{
      name: name,
      quantity: entry |> Map.get("quantity", 1) |> to_quantity(),
      zone: zone_from_categories(Map.get(entry, "categories", [])),
      set_code: nil,
      collector_number: nil
    }
  end

  defp normalize_entry(_entry), do: nil

  defp zone_from_categories(categories) when is_list(categories) do
    cond do
      "Maybeboard" in categories -> "considering"
      "Sideboard" in categories -> "considering"
      "Commander" in categories -> "commander"
      true -> "mainboard"
    end
  end

  defp zone_from_categories(_categories), do: "mainboard"

  defp to_quantity(quantity) when is_integer(quantity) and quantity > 0, do: quantity
  defp to_quantity(_quantity), do: 1

  defp req_options, do: Application.get_env(:manavault, :trade_archidekt_req_options, [])
end
