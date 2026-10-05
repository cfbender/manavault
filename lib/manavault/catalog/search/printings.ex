defmodule Manavault.Catalog.Search.Printings do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, Printing, Util}
  alias Manavault.Catalog.Search.NameMatch
  alias Manavault.Repo

  def get_printing_by_scryfall_id(scryfall_id) when is_binary(scryfall_id) do
    Printing
    |> Repo.get(scryfall_id)
    |> Repo.preload(:card)
  end

  def scanner_printings(scryfall_id, illustration_id \\ nil) when is_binary(scryfall_id) do
    scryfall_id = strip_face_suffix(scryfall_id)

    case scanner_printing(scryfall_id, illustration_id) do
      nil ->
        []

      printing ->
        target_illustration_id = illustration_id || printing.illustration_id
        owned_counts = printing_owned_counts(printing.oracle_id)

        Printing
        |> where([candidate], candidate.oracle_id == ^printing.oracle_id)
        |> scanner_order(target_illustration_id, printing.scryfall_id)
        |> limit(300)
        |> preload(:card)
        |> Repo.all()
        |> Enum.map(&%{&1 | owned_count: Map.get(owned_counts, &1.scryfall_id, 0)})
    end
  end

  # Scanner gallery IDs name separate printed faces `<uuid>-<face>`; only a suffix after a
  # complete UUID is a face, since a UUID's own last group can be all digits.
  @face_suffix ~r/\A([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+\z/i

  defp strip_face_suffix(id) do
    case Regex.run(@face_suffix, id) do
      [_match, uuid] -> uuid
      nil -> id
    end
  end

  defp scanner_printing(scryfall_id, illustration_id) do
    Repo.get(Printing, scryfall_id) || printing_by_illustration_id(illustration_id)
  end

  defp printing_by_illustration_id(nil), do: nil

  defp printing_by_illustration_id(illustration_id) do
    Repo.one(
      from printing in Printing, where: printing.illustration_id == ^illustration_id, limit: 1
    )
  end

  defp scanner_order(query, nil, found_id) do
    order_by(query, [printing],
      asc: fragment("CASE WHEN ? = ? THEN 0 ELSE 1 END", printing.scryfall_id, ^found_id),
      desc: printing.released_at,
      asc: printing.set_code,
      asc: printing.collector_number
    )
  end

  defp scanner_order(query, illustration_id, found_id) do
    order_by(query, [printing],
      asc:
        fragment(
          "CASE WHEN ? = ? OR ? = ? THEN 0 ELSE 1 END",
          printing.illustration_id,
          ^illustration_id,
          printing.scryfall_id,
          ^found_id
        ),
      desc: printing.released_at,
      asc: printing.set_code,
      asc: printing.collector_number
    )
  end

  @doc "Distinct illustration IDs printed in any of the given sets (the scanner's set lock)."
  def set_illustration_ids([]), do: []

  def set_illustration_ids(set_codes) when is_list(set_codes) do
    codes = Enum.map(set_codes, &String.downcase/1)

    Repo.all(
      from printing in Printing,
        where: printing.set_code in ^codes and not is_nil(printing.illustration_id),
        distinct: true,
        select: printing.illustration_id
    )
  end

  def get_printing(set_code, collector_number)
      when is_binary(set_code) and is_binary(collector_number) do
    Repo.one(
      from printing in Printing,
        where:
          printing.set_code == ^String.downcase(set_code) and
            printing.collector_number == ^collector_number,
        limit: 1
    )
  end

  def get_card_with_printings(oracle_id) when is_binary(oracle_id) do
    case Repo.get(Card, oracle_id) do
      nil ->
        nil

      card ->
        owned_counts = printing_owned_counts(oracle_id)

        Repo.preload(card,
          printings: from(printing in Printing, order_by: [desc: printing.released_at])
        )
        |> Map.update!(:printings, fn printings ->
          Enum.map(printings, &%{&1 | owned_count: Map.get(owned_counts, &1.scryfall_id, 0)})
        end)
    end
  end

  defp printing_owned_counts(oracle_id) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:left, [item, _printing], location in assoc(item, :location_assoc))
    |> where([_item, printing, _location], printing.oracle_id == ^oracle_id)
    |> where([_item, _printing, location], is_nil(location.id) or location.kind != "list")
    |> group_by([item, _printing, _location], item.scryfall_id)
    |> select([item, _printing, _location], {item.scryfall_id, coalesce(sum(item.quantity), 0)})
    |> Repo.all()
    |> Map.new()
  end

  def search_printings(filters, opts \\ []) when is_list(filters) do
    limit = Keyword.get(opts, :limit, 50)
    name = filters |> Keyword.get(:name, "") |> Util.normalize_filter()

    set_code =
      filters |> Keyword.get(:set_code, "") |> Util.normalize_filter() |> String.downcase()

    collector_number = filters |> Keyword.get(:collector_number, "") |> Util.normalize_filter()

    if name == "" and set_code == "" and collector_number == "" do
      []
    else
      Printing
      |> join(:inner, [printing], card in assoc(printing, :card), as: :card)
      |> where(^Card.non_token())
      |> maybe_filter_card_name(name)
      |> maybe_filter_set_code(set_code)
      |> maybe_filter_collector_number(collector_number)
      |> preload([_printing, card], card: card)
      |> order_by([printing, card],
        asc: card.name,
        asc: printing.set_code,
        asc: printing.collector_number
      )
      |> limit(^limit)
      |> Repo.all()
    end
  end

  def search_sets(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 12)
    query = Util.normalize_filter(term)

    if query == "" do
      []
    else
      pattern = "%#{String.downcase(query)}%"

      Printing
      |> where(
        [printing],
        fragment("lower(?) LIKE ?", printing.set_code, ^pattern) or
          fragment("lower(coalesce(?, '')) LIKE ?", printing.set_name, ^pattern)
      )
      |> group_by([printing], [printing.set_code, printing.set_name])
      |> order_by([printing], asc: printing.set_name, asc: printing.set_code)
      |> select([printing], %{set_code: printing.set_code, set_name: printing.set_name})
      |> limit(^limit)
      |> Repo.all()
    end
  end

  def list_printings_for_oracle_id(oracle_id) do
    Printing
    |> where([printing], printing.oracle_id == ^oracle_id)
    |> order_by([printing],
      desc: printing.released_at,
      asc: printing.set_code,
      asc: printing.collector_number
    )
    |> Repo.all()
    |> Repo.preload(:card)
  end

  defp maybe_filter_card_name(query, ""), do: query

  defp maybe_filter_card_name(query, name) do
    pattern = NameMatch.like_pattern(name)

    where(
      query,
      [printing, card],
      fragment("? LIKE ? ESCAPE '\\'", card.normalized_name, ^pattern) or
        fragment("? LIKE ? ESCAPE '\\'", printing.normalized_flavor_name, ^pattern)
    )
  end

  defp maybe_filter_set_code(query, ""), do: query

  defp maybe_filter_set_code(query, set_code) do
    where(query, [printing, _card], printing.set_code == ^set_code)
  end

  defp maybe_filter_collector_number(query, ""), do: query

  defp maybe_filter_collector_number(query, collector_number) do
    where(query, [printing, _card], printing.collector_number == ^collector_number)
  end
end
