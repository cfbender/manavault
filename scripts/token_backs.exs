# Regenerates priv/data/token_backs.json: which tokens are printed on the back of which.
#
# Scryfall lists most double-sided precon tokens as separate single-faced
# printings, but Wizards' card image galleries (magic.wizards.com) carry both
# face images per physical token. The galleries read from a public Contentful
# space; grab the bearer token from the `Authorization` header of any
# `cdn.contentful.com` request the gallery page makes, then run:
#
#     WOTC_CONTENTFUL_TOKEN=... mise exec -- mix run scripts/token_backs.exs
#
# Each gallery entry has a front image and (for double-sided tokens) a back
# image. A back is identified by finding the entry whose front is that image,
# then both faces are resolved to Scryfall printings in the local catalog by
# token set code (`t` + set) and collector number, requiring the name to agree
# because the galleries attribute Commander tokens to the main set and the
# commander set interchangeably. Faces with no token printing in the catalog
# (helper cards such as The Monarch, punch-out counters) are dropped.

import Ecto.Query

alias Manavault.Catalog.{Card, Printing}
alias Manavault.Repo

defmodule TokenBacks.Gallery do
  @moduledoc false

  @base "https://cdn.contentful.com/spaces/s5n2t79q9icq/environments/master/entries"
  @page 200

  def fetch_entries(token) do
    [
      %{"fields.rarity" => "Token"},
      %{"fields.rarity" => "Emblem"},
      %{"fields.rarity" => "Helper"},
      %{"fields.back[exists]" => "true"}
    ]
    |> Enum.reduce({%{}, %{}}, fn filter, {entries, sets} ->
      {page_entries, page_sets} = fetch_all(token, filter, 0, [], %{})
      {Map.merge(entries, Map.new(page_entries, &{&1["sys"]["id"], &1})), Map.merge(sets, page_sets)}
    end)
  end

  defp fetch_all(token, filter, skip, acc, sets) do
    params =
      Map.merge(filter, %{
        "content_type" => "magicCard",
        "limit" => @page,
        "skip" => skip,
        "include" => 1
      })

    %{status: 200, body: body} =
      Req.get!(@base, params: params, headers: [authorization: "Bearer #{token}"], retry: :transient)

    items = body["items"]

    sets =
      body
      |> get_in(["includes", "Entry"])
      |> List.wrap()
      |> Enum.reduce(sets, fn entry, acc ->
        case entry["fields"]["abbreviation"] do
          nil -> acc
          abbreviation -> Map.put(acc, entry["sys"]["id"], String.downcase(abbreviation))
        end
      end)

    IO.puts(:stderr, "#{inspect(filter)} #{skip + length(items)}/#{body["total"]}")

    if skip + length(items) >= body["total"] or items == [] do
      {acc ++ items, sets}
    else
      fetch_all(token, filter, skip + length(items), acc ++ items, sets)
    end
  end
end

defmodule TokenBacks.Resolve do
  @moduledoc false

  @token_rarities ~w(Token Emblem Helper)

  @doc "Undirected `{front, back}` face pairs, each face a list of candidate `{set, number, names}`."
  def pairs(entries, sets) do
    fields = entries |> Map.values() |> Enum.map(& &1["fields"])
    by_face = Enum.group_by(fields, & &1["face"])

    fields
    |> Enum.filter(fn f ->
      f["rarity"] in @token_rarities and is_binary(f["back"]) and f["back"] != f["face"]
    end)
    |> Enum.flat_map(fn front ->
      by_face
      |> Map.get(front["back"], [])
      |> Enum.map(fn back -> {face(front, sets), face(back, sets)} end)
    end)
    |> Enum.uniq()
  end

  # Candidate set codes in preference order: the subset (e.g. m3c) then the
  # product set it was found in (e.g. mh3, where Scryfall files M3C #37+).
  defp face(fields, sets) do
    codes =
      [fields["subset"], fields["foundInSet"]]
      |> Enum.map(&(&1 && sets[&1["sys"]["id"]]))
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    name = fields["name"] |> String.split(" // ") |> hd() |> String.trim()
    {codes, fields["collectorNumber"], name}
  end

  def printing({codes, number, name}, lookup) do
    wanted = normalize(name)

    Enum.find_value(codes, fn code ->
      lookup.("t" <> code, number)
      |> Enum.find(fn printing ->
        got = normalize(printing.card.name)
        got == wanted or String.starts_with?(wanted, got <> " ")
      end)
    end)
  end

  defp normalize(name) do
    name
    |> String.downcase()
    |> String.replace(~r/\s*\(.*?\)\s*/, " ")
    |> String.replace(~r/\btoken\b/, "")
    |> String.replace(~r/[^a-z0-9 ]/, "")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end
end

token =
  System.get_env("WOTC_CONTENTFUL_TOKEN") ||
    raise "set WOTC_CONTENTFUL_TOKEN (see the comment at the top of this script)"

{entries, sets} = TokenBacks.Gallery.fetch_entries(token)
face_pairs = TokenBacks.Resolve.pairs(entries, sets)

lookup = fn set_code, number ->
  Repo.all(
    from p in Printing,
      join: c in assoc(p, :card),
      where: p.set_code == ^set_code and p.collector_number == ^number,
      where: c.layout in ^Card.token_layouts(),
      preload: [card: c]
  )
end

{resolved, dropped} =
  face_pairs
  |> Enum.map(fn {front, back} ->
    {TokenBacks.Resolve.printing(front, lookup), TokenBacks.Resolve.printing(back, lookup), front,
     back}
  end)
  |> Enum.split_with(fn {front, back, _, _} -> front != nil and back != nil end)

for {_, _, front, back} <- dropped do
  IO.puts(:stderr, "dropped: #{inspect(front)} // #{inspect(back)}")
end

key = fn printing -> "#{printing.set_code}/#{printing.collector_number}" end

pairs =
  resolved
  |> Enum.map(fn {front, back, _, _} -> Enum.sort_by([front, back], key) end)
  |> Enum.reject(fn [front, back] -> front.scryfall_id == back.scryfall_id end)
  |> Enum.uniq_by(fn [front, back] -> {front.scryfall_id, back.scryfall_id} end)
  |> Enum.sort_by(fn [front, back] -> {key.(front), key.(back)} end)
  |> Enum.map(fn [front, back] ->
    %{front: key.(front), back: key.(back), names: "#{front.card.name} // #{back.card.name}"}
  end)

output = %{
  source:
    "Wizards of the Coast card image galleries (magic.wizards.com), which show both faces of " <>
      "double-sided tokens; faces resolved to Scryfall set code/collector number by name. " <>
      "Regenerate with scripts/token_backs.exs. Pairs are undirected.",
  pairs: pairs
}

path = Path.join([File.cwd!(), "priv", "data", "token_backs.json"])
File.write!(path, Jason.encode!(output, pretty: true) <> "\n")
IO.puts("wrote #{length(pairs)} pairs (#{length(dropped)} unresolved faces dropped) to #{path}")
