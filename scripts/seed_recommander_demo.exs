# Seeds the dev DB with a small enchantress commander deck (the example from
# Recommander's API docs) plus likely recommendation targets, so the
# Recommander dialog can be exercised end to end against the live API.
#
# Run with: mise exec -- mix run scripts/seed_recommander_demo.exs

alias Manavault.Catalog

deck_names = [
  "Sythis, Harvest's Hand",
  "Arbor Elf",
  "Beast Within",
  "Cultivate",
  "Danitha Capashen, Paragon",
  "Eidolon of Blossoms",
  "Heliod's Pilgrim",
  "Jukai Naturalist",
  "Kor Spiritdancer",
  "Mesa Enchantress",
  "Sanctum Weaver",
  "Utopia Sprawl"
]

# Likely recommendations, imported so tiles resolve to local cards.
extra_names = [
  "Enchantress's Presence",
  "Canopy Vista",
  "Swiftfoot Boots",
  "Temple of Plenty",
  "Heroic Intervention",
  "Archon of Sun's Grace",
  "Setessan Champion",
  "Sol Ring",
  "Verduran Enchantress",
  "Sterling Grove"
]

fetch_card = fn name ->
  get = fn ->
    Req.get!("https://api.scryfall.com/cards/named",
      params: [exact: name],
      headers: [{"accept", "application/json"}, {"user-agent", "ManaVault/0.1"}],
      receive_timeout: 20_000
    )
  end

  body =
    case get.() do
      %{status: 200, body: body} ->
        body

      %{status: 429} ->
        IO.puts("rate limited fetching #{name}; retrying in 65s")
        Process.sleep(65_000)
        %{status: 200, body: body} = get.()
        body
    end

  Process.sleep(250)
  body
end

cards = Enum.map(deck_names ++ extra_names, fetch_card)
{:ok, counts} = Catalog.import_cards(cards)
IO.inspect(counts, label: "imported")

{:ok, deck} = Catalog.create_deck(%{"name" => "Sythis Enchantress", "format" => "commander"})

{:ok, _} =
  Catalog.add_card_to_deck(deck, %{"name" => "Sythis, Harvest's Hand", "zone" => "commander"})

for name <- deck_names -- ["Sythis, Harvest's Hand"] do
  {:ok, _} = Catalog.add_card_to_deck(deck, %{"name" => name})
end

# Own a couple of the likely recommendations so collection badges show up.
owned = ["Swiftfoot Boots", "Heroic Intervention", "Sol Ring"]

for card <- cards, card["name"] in owned do
  {:ok, _} = Catalog.create_collection_item(%{"scryfall_id" => card["id"], "quantity" => 1})
end

IO.puts("deck id: #{deck.id}")
