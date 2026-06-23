defmodule Manavault.Catalog.DecklistTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    DeckCard
  }

  test "decklist import and export support zones and set collector preferences" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Import Test"})

    text = """
    Commander
    1 Time Walk (LEA) 84 *F*

    Mainboard
    1 Black Lotus (LEA) 232
    2x Black Lotus

    Sideboard
    1 Missing Card

    Maybeboard
    SB: 1 Time Walk
    """

    assert {:ok, %{imported: 4, unresolved: ["Missing Card"]}} =
             Catalog.import_decklist(deck, text)

    loaded = Catalog.get_deck!(deck.id)

    assert %DeckCard{quantity: 3, preferred_printing_id: "scryfall-printing-1"} =
             Enum.find(loaded.deck_cards, &(&1.card.name == "Black Lotus"))

    assert Enum.any?(loaded.deck_cards, &(&1.card.name == "Time Walk" and &1.zone == "commander"))
    assert Enum.any?(loaded.deck_cards, &(&1.card.name == "Time Walk" and &1.zone == "sideboard"))

    export = Catalog.export_decklist(loaded)
    assert export =~ "Commander\n1x Time Walk (LEA) 84 *F*"
    assert export =~ "Mainboard\n3x Black Lotus (LEA) 232"
    assert export =~ "Sideboard\n1x Time Walk"
  end

  test "decklist import ignores comments and deduplicates stable aliases" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([@black_lotus])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Commented Import"})

    text = """
    Deck:
    1 Black Lotus # exported note
    3x Black Lotus

    Maybe:
    2x Black Lotus *F*
    """

    assert {:ok, %{imported: 2, unresolved: [], skipped_printings: []}} =
             Catalog.import_decklist(deck, text)

    loaded = Catalog.get_deck!(deck.id)

    assert %DeckCard{quantity: 3, finish: "nonfoil", zone: "mainboard"} =
             Enum.find(loaded.deck_cards, &(&1.zone == "mainboard"))

    assert %DeckCard{quantity: 2, finish: "foil", zone: "maybeboard"} =
             Enum.find(loaded.deck_cards, &(&1.zone == "maybeboard"))
  end

  test "decklist import keeps card identities when preferred printing data is unusable" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Mismatched Printing"})

    assert {:ok, %{imported: 1, unresolved: [], skipped_printings: ["Black Lotus"]}} =
             Catalog.import_decklist(deck, "1x Black Lotus (LEA) 84 *F*")

    loaded = Catalog.get_deck!(deck.id)

    assert [
             %DeckCard{
               quantity: 1,
               oracle_id: "oracle-1",
               preferred_printing_id: nil,
               card: %Card{name: "Black Lotus"}
             }
           ] = loaded.deck_cards
  end

  @iroh_grand_lotus_list """
  1x Iroh, Grand Lotus (TLA) 349
  1x Aang's Journey (TLA) 1
  1x Arcane Signet (SLD) 820
  1x Ash Barrens (M3C) 318 *F*
  1x Bountiful Landscape (MH3) 217
  1x Cycle of Renewal (TLA) 170
  1x Elemental Teachings (TLA) 178
  1x Evolving Wilds (FIC) 389 *F*
  1x Fabled Passage (BLB) 252
  1x Hermitic Herbalist (TLA) 226
  1x Jeong Jeong, the Deserter (TLA) 142
  1x Mana Geyser (SLD) 1821
  1x Manamorphose (PLST) SHM-211
  1x Price of Freedom (TLA) 149
  1x Rampant Growth (SLD) 1370 *F*
  1x Resonating Lute (SOS) 221 *F*
  1x Shared Roots (SOA) 58
  1x Sol Ring (SOC) 427 *F*
  1x Storm-Kiln Artist (STX) 115 *F*
  1x Uncle Iroh (TLA) 248
  1x Abandon Attachments (TLA) 205 *F*
  1x Accumulate Wisdom (TLA) 44
  1x Agna Qel'a (TLA) 264
  1x Archmage Emeritus (SPG) 150
  1x Artist's Talent (BLB) 124
  1x Boomerang Basics (TLA) 46
  1x Bountiful Landscape (MH3) 217
  1x Chakra Meditation (TLE) 91 *F*
  1x Energybending (TLA) 2
  1x Fiery Islet (WHO) 278
  1x Gran-Gran (TLA) 54 *F*
  1x Guru Pathik (TLA) 223
  1x Illuminate History (STX) 108
  1x Introduction to Prophecy (STX) 4
  1x Lost Days (TLA) 62
  1x Manamorphose (PLST) SHM-211
  1x Price of Freedom (TLA) 149
  1x Resonating Lute (SOS) 221 *F*
  1x Secrets of the Dead (C19) 95
  1x Seismic Sense (TLA) 195
  1x Sheltered Thicket (DRC) 169
  1x Stock Up (SOA) 24
  1x Teachings of the Archaics (STX) 57 *F*
  1x True Ancestry (TLA) 199 *F*
  1x Waterbending Lesson (TLA) 80
  1x Waterlogged Grove (WHO) 331
  1x Boomerang Basics (TLA) 46
  1x Combustion Technique (TLA) 301
  1x Grapeshot (TSR) 166
  1x Introduction to Annihilation (STX) 3
  1x Iroh's Demonstration (TLA) 141
  1x Lost Days (TLA) 62
  1x Origin of Metalbending (TLA) 187 *F*
  1x Pongify (M3C) 190
  1x Price of Freedom (TLA) 149
  1x Snap (DMR) 66
  1x Start from Scratch (STX) 114
  1x Zuko's Exile (TLA) 3
  1x Iroh's Demonstration (TLA) 141
  1x Aang's Journey (TLA) 1
  1x Ash Barrens (M3C) 318 *F*
  1x Price of Freedom (TLA) 149
  1x Octopus Form (TLA) 66
  1x Origin of Metalbending (TLA) 187 *F*
  1x Redirect Lightning (TLA) 151 *F*
  1x Snakeskin Veil (CMM) 323
  1x Chakra Meditation (TLE) 91 *F*
  1x True Ancestry (TLA) 199 *F*
  1x Craterhoof Behemoth (TDM) 346
  1x Archmage Emeritus (SPG) 150
  1x Artist's Talent (BLB) 124
  1x Chakra Meditation (TLE) 91 *F*
  1x Coruscation Mage (BLB) 131
  1x Electrostatic Field (PLST) GRN-97
  1x Gran-Gran (TLA) 54 *F*
  1x Great Hall of the Biblioplex (SOS) 257
  1x Jeong Jeong, the Deserter (TLA) 142
  1x Murmuring Mystic (SPG) 151 *F*
  1x Prismari, the Inspiration (SOS) 212
  1x Resonating Lute (SOS) 221 *F*
  1x Rite of the Dragoncaller (FDN) 92
  1x Storm-Kiln Artist (STX) 115 *F*
  1x Stormcatch Mentor (BLB) 234
  1x Thunderclap Drake (SOC) 204
  1x Uncle Iroh (TLA) 248
  1x Young Pyromancer (2X2) 131
  1x Artist's Talent (BLB) 124
  1x Boomerang Basics (TLA) 46
  1x Coruscation Mage (BLB) 131
  1x Energybending (TLA) 2
  1x Gran-Gran (TLA) 54 *F*
  1x Introduction to Prophecy (STX) 4
  1x Mana Geyser (SLD) 1821
  1x Manamorphose (PLST) SHM-211
  1x Price of Freedom (TLA) 149
  1x Stormcatch Mentor (BLB) 234
  1x Thunderclap Drake (SOC) 204
  1x Uncle Iroh (TLA) 248
  1x Archmage Emeritus (SPG) 150
  1x Electrostatic Field (PLST) GRN-97
  1x Great Hall of the Biblioplex (SOS) 257
  1x Murmuring Mystic (SPG) 151 *F*
  1x Prismari, the Inspiration (SOS) 212
  1x Resonating Lute (SOS) 221 *F*
  1x Rite of the Dragoncaller (FDN) 92
  1x Storm-Kiln Artist (STX) 115 *F*
  1x Stormcatch Mentor (BLB) 234
  1x Thunderclap Drake (SOC) 204
  1x Uncle Iroh (TLA) 248
  1x Young Pyromancer (2X2) 131
  1x Agna Qel'a (TLA) 264
  1x Ash Barrens (M3C) 318 *F*
  1x Bountiful Landscape (MH3) 217
  1x Cascade Bluffs (EOC) 153
  1x Cinder Glade (WHO) 262 *F*
  1x Command Tower (SLD) 758
  1x Dreamroot Cascade (SOS) 254
  1x Evolving Wilds (FIC) 389 *F*
  1x Exotic Orchard (MOC) 398
  1x Fabled Passage (BLB) 252
  1x Fiery Islet (WHO) 278
  1x Flooded Grove (LTC) 309
  4x Forest (7ED) 329
  1x Great Hall of the Biblioplex (SOS) 257
  1x Hinterland Harbor (DSC) 284
  5x Island (J25) 86
  5x Mountain (7ED) 340
  1x Reliquary Tower (MB2) 111
  1x Rockfall Vale (MID) 266
  1x Rootbound Crag (FIC) 416
  1x Sheltered Thicket (DRC) 169
  1x Spectacle Summit (SOS) 262
  1x Sulfur Falls (DOM) 247
  1x Waterlogged Grove (WHO) 331
  1x White Lotus Hideout (TLA) 281 *F*
  1x Chatterstorm (MH2) 152
  1x Elemental Summoning (STX) 183
  1x Germination Practicum (SOS) 296
  1x Improvisation Capstone (SOS) 120
  1x It'll Quench Ya! (TLA) 58 *F*
  1x Mascot Exhibition (STX) 5 *F*
  1x Match the Odds (TLE) 253 *F*
  1x Secret of Bloodbending (TLA) 337 *F*
  1x Solstice Revelations (TLA) 153
  """

  test "decklist import dedupes the exact Iroh list to 100 cards with printings and finishes" do
    expected = expected_decklist_entries(@iroh_grand_lotus_list)

    assert Enum.count(expected) == 89
    assert expected |> Map.values() |> Enum.map(& &1.quantity) |> Enum.sum() == 100

    assert {:ok, %{cards_count: 89, printings_count: 89}} =
             Catalog.import_cards(cards_from_expected_entries(expected))

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Iroh, Grand Lotus"})

    assert {:ok, %{imported: 89, unresolved: [], skipped_printings: []}} =
             Catalog.import_decklist(deck, @iroh_grand_lotus_list)

    loaded = Catalog.get_deck!(deck.id)
    stats = Catalog.deck_stats(loaded)

    assert stats.total == 100
    assert length(loaded.deck_cards) == 89

    for deck_card <- loaded.deck_cards do
      expected_entry = Map.fetch!(expected, deck_card.card.name)

      assert deck_card.quantity == expected_entry.quantity
      assert deck_card.finish == expected_entry.finish
      assert deck_card.preferred_printing.set_code == String.downcase(expected_entry.set_code)
      assert deck_card.preferred_printing.collector_number == expected_entry.collector_number
    end
  end
end
