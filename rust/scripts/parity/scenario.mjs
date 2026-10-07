// The deterministic parity scenario. Every step runs on both backends; ids
// returned by one backend are captured into that backend's own context, so a
// divergence in ids shows up as a difference instead of breaking later steps.
//
// Printing ids below come from the catalog snapshot the harness runs against
// (full Scryfall default-cards catalog, 2026-10).

const P = {
  solRingFdc: "4f152dd9-2b35-45b2-90fe-8c71d0634226",
  solRingSldFoil: "bf6b187e-5ad0-4731-9c39-638451ac1e30",
  boltFdc: "0852f9f3-d7ef-4d31-93e3-93bc7c5a4ec9",
  counterspellFdc: "83390164-f00b-4be1-9cec-5de088c9debc",
  islandFra: "d8184e92-54e6-4ddc-86e8-67f5c5eb079d",
  snowIslandMb2: "16eb4c0a-962a-4df9-8101-a6baabfa80db",
  snowForestMb2: "ce561d66-bdfd-408f-bf5b-49b4a53d3807",
  forestFra: "613bc075-2fe4-421f-bfec-3786a5e37797",
  thrasiosFca: "5f13417d-3fe1-4357-b826-cb48dd111247",
  thrasiosCmrEtched: "845bf543-0367-4d2c-81ba-e424bfbfb7de",
  tymnaFca: "87eff269-c8d7-479e-ade4-383b8622e70d",
  rhysticWot: "043b2d30-a40f-4d47-933b-80544512f9c2",
  delverInr: "6904ea20-e504-47da-95a0-08739fdde260",
  krenkoFdn: "824b2d73-2151-4e5e-9f05-8f63e2bdcaa9",
  swordsFdc: "36959f2b-75b5-4d68-b193-ada980822fd9",
  brainstormFrc: "ec7d6864-7b6b-4f74-8474-9b9ec96b1d33",
  arcaneSignetFdc: "ee7710cf-e73d-479f-bc8d-0e78a0e324d9",
  commandTowerFrc: "1ac6cb62-45da-4e9a-84c6-09e6eacf0664",
  esperSentinelH2r: "8b5a916f-a6f2-4e89-b38f-7e5bc0c2e032",
  smotheringTitheWot: "f6c69c2f-729b-49ed-909d-57190a728e11",
  goblinGuideMb2: "1aac57a6-29c0-4ccb-b825-b1e04ae0ea3e",
  treasureTfdc: "3101b6f5-b3a7-43db-9454-9f42b9c34e53",
  treasureTfra: "03992f88-7a15-4234-9bed-b7617d7ff09c",
  goblinTokenTfrc: "0c7f299e-4774-4e8b-bb0e-db27d57d2621",
  missing: "00000000-0000-0000-0000-000000000000",
}

// Relay global id of a printing (`Printing:<scryfall id>`), the form the
// frontend passes for printing inputs (`printing.id`).
const G = (scryfallId) => Buffer.from(`Printing:${scryfallId}`).toString("base64")

const strip = (value) => {
  if (Array.isArray(value)) return value.map(strip)
  if (value && typeof value === "object") {
    const out = {}
    for (const [key, child] of Object.entries(value)) if (key !== "__typename") out[key] = strip(child)
    return out
  }
  return value
}

const edges = (connection) => (connection?.edges ?? []).map((edge) => edge.node)

const CARD_QUERIES = [
  "sol ring",
  "lightning",
  "t:creature c:g cmc<=2",
  'o:"draw a card" id:u',
  "is:commander c:wubg",
  "set:fdc r:mythic",
  "f:commander -t:land usd<1",
  "name:/^goblin/",
  "pow>=7 t:creature",
  "mv=3 t:artifact",
  "is:dfc t:creature",
  "kw:flying c:w r:rare",
  "e:sld t:land",
  "year>=2025 r:mythic",
  "c>=wu -c:b",
  "otag:ramp t:sorcery",
  "id<=g t:legendary t:creature",
  "t:token treasure",
  "is:foil set:fca",
  "!\"Sol Ring\"",
  "a:\"rebecca guay\"",
  "(t:goblin or t:elf) c:r",
  "not:reprint set:mh3 r:uncommon",
  "cn:1 set:lea",
  "lang:ja t:dragon",
  "t:",
  "zzzzznotacard",
]

const CARD_SORTS = ["name", "mana_value", "color", "type", "released", "rarity", "price"]
const COLLECTION_SORTS = ["quantity", "name", "set", "rarity", "price", "value_gain", "added"]

export async function scenario({ run, sql, live }) {
  // ---------------------------------------------------------------- empty
  await run("Home")
  await run("Collection", {})
  await run("Collection", { filters: null }, { label: "explicit null filters" })
  await run("CollectionValueDashboard")
  await run("Decks", { after: null })
  await run("RandomDeck", { excludeId: null }, { label: "no decks" })
  await run("TradeWants")
  await run("TokenItems", { q: null })
  await run("ApiKeys")
  await run("AISettings")
  await run("BackupSettings")
  await run("PricingSettings")
  await run("CollectionAutoSortSettings")
  await run("DefaultDeckTags")
  await run("DeckAnalysisRequests")
  await run("DeckSwapAiSettings")
  await run("TradeBinderCount")
  await run("TradeWantsShareToken")
  await run("TradeBinderShareToken")
  await run("CollectionItemFormOptions")
  await run("CollectionItemDeckOptions")
  await run("CardDeckOptions")

  // ---------------------------------------------------------------- catalog
  for (const q of CARD_QUERIES) {
    await run("Cards", { q, limit: 24, sort: null, after: null }, {
      label: q,
      capture: (c, data) => {
        c.cardsByQuery ??= {}
        c.cardsByQuery[q] = data.cards
      },
    })
  }
  for (const field of CARD_SORTS) {
    for (const direction of ["asc", "desc"]) {
      await run("Cards", { q: "t:legendary c:g r:mythic", limit: 12, sort: { field, direction }, after: null }, {
        label: `sort ${field} ${direction}`,
      })
    }
  }
  await run("Cards", { q: "t:goblin", limit: 5, sort: { field: "name", direction: "asc" }, after: null }, {
    label: "page 1",
    capture: (c, data) => (c.goblinCursor = data.cards.pageInfo.endCursor),
  })
  await run("Cards", (c) => ({ q: "t:goblin", limit: 5, sort: { field: "name", direction: "asc" }, after: c.goblinCursor }), {
    label: "page 2",
  })
  await run("Cards", { q: "sol ring", limit: 24, sort: { field: "bogus", direction: "sideways" }, after: null }, {
    label: "bogus sort",
  })

  await run("CardByName", { name: "Sol Ring" }, { capture: (c, data) => (c.solRingCardId = data.cardByName?.id) })
  await run("CardByName", { name: "Thrasios, Triton Hero" }, { capture: (c, data) => (c.thrasiosCardId = data.cardByName?.id) })
  await run("CardByName", { name: "Delver of Secrets" }, { label: "front face", capture: (c, data) => (c.delverCardId = data.cardByName?.id) })
  await run("CardByName", { name: "Krenko, Mob Boss" }, { capture: (c, data) => (c.krenkoCardId = data.cardByName?.id) })
  await run("CardByName", { name: "Not A Real Card" }, { label: "missing" })
  await run("Card", (c) => ({ id: c.solRingCardId }), { label: "sol ring" })
  await run("Card", (c) => ({ id: c.thrasiosCardId }), { label: "thrasios" })
  await run("Card", (c) => ({ id: c.delverCardId }), { label: "dfc" })
  await run("Card", { id: "bm90LWEtY2FyZA==" }, { label: "bad id" })
  await run("CardPrintings", (c) => ({ id: c.solRingCardId }))
  await run("CardPrintings", (c) => ({ id: c.krenkoCardId }))
  for (const [q, limit] of [["sol", 8], ["light", 8], ["snow-cov", 10], ["thras", 5], ["", 8], ["æther", 8]]) {
    await run("CardNameSuggestions", { q, limit }, { label: q })
  }
  for (const [q, limit] of [["mod", 8], ["sld", 8], ["foundations", 8], ["", 8], ["m2", 3]]) {
    await run("SetSuggestions", { q, limit }, { label: q })
  }
  await run("TokenPrintingSearch", { q: "treasure" })
  await run("TokenPrintingSearch", { q: "goblin" })
  await run("TokenPrintingSearch", { q: "" }, { label: "blank" })
  await run("TokenBackOptions", { scryfallId: P.treasureTfdc })
  await run("TokenBackOptions", { scryfallId: P.goblinTokenTfrc })
  await run("ScannerPrintings", { scryfallId: P.solRingFdc, illustrationId: null }, {
    capture: (c, data) => (c.solRingIllustration = data.scannerPrintings?.find((p) => p.scryfallId === P.solRingFdc)?.illustrationId),
  })
  await run("ScannerPrintings", (c) => ({ scryfallId: P.solRingFdc, illustrationId: c.solRingIllustration }), { label: "illustration" })
  await run("ScannerPrintings", { scryfallId: P.delverInr, illustrationId: null }, { label: "dfc" })
  await run("ScannerPrintings", { scryfallId: P.missing, illustrationId: null }, { label: "missing" })
  for (const tokens of [null, "EXCLUDE", "INCLUDE", "ONLY"]) {
    await run("ScannerCardSearch", { q: "goblin", tokens }, { label: `goblin ${tokens}` })
  }
  await run("ScannerCardSearch", { q: "sol ring", tokens: null }, { label: "sol ring" })
  await run("ScannerSetIllustrations", { setCodes: ["fdc", "mb2"] })
  await run("ScannerSetIllustrations", { setCodes: [] }, { label: "empty" })
  await run("LocationCoverCardSearch", { q: "sol ring", first: 12 })
  await run("LocationCoverCardSearch", { q: "", first: 12 }, { label: "blank" })
  await run("TradeWantPrintings", { name: "Sol Ring" })
  await run("CollectionItemPrintings", (c) => ({ cardId: c.solRingCardId }))
  await run("CardCollectionItems", (c) => ({ cardId: c.solRingCardId }), { label: "empty" })

  // ---------------------------------------------------------------- locations
  const location = (key) => ({
    capture: (c, data) => {
      const id = data.createLocation?.location?.id
      if (id) c[key] = id
    },
  })
  await run("CreateLocation", { input: { name: "Trade Binder", kind: "binder", description: "Haves", coverScryfallId: G(P.rhysticWot) } }, location("binder"))
  await run("CreateLocation", { input: { name: "Bulk Box", kind: "box" } }, location("box"))
  await run("CreateLocation", { input: { name: "Deck Box", kind: "deck_box", description: "" } }, location("deckBox"))
  await run("CreateLocation", { input: { name: "Temp", kind: "folder" } }, location("temp"))
  await run("CreateLocation", { input: { name: "", kind: "box" } }, { label: "blank name" })
  await run("CreateLocation", { input: { name: "Bad Kind", kind: "shoebox" } }, { label: "bad kind" })
  await run("CreateLocation", { input: { name: "Trade Binder", kind: "binder" } }, { label: "duplicate name" })
  await run("CreateLocation", { input: { name: "Bad Cover", coverScryfallId: G(P.missing) } }, { label: "missing cover" })
  await run("UpdateLocation", (c) => ({ id: c.temp, input: { name: "Temp Folder", description: "scratch", coverScryfallId: G(P.solRingFdc) } }))
  await run("UpdateLocation", (c) => ({ id: c.temp, input: { kind: "nope" } }), { label: "bad kind" })
  await run("UpdateLocation", { id: "TG9jYXRpb246OTk5OTk=", input: { name: "x" } }, { label: "missing" })
  await run("Location", (c) => ({ id: c.binder }))
  await run("Location", { id: "TG9jYXRpb246OTk5OTk=" }, { label: "missing" })

  // ---------------------------------------------------------------- collection
  const item = (key) => ({
    alignSecond: true,
    capture: (c, data) => {
      const id = data.createCollectionItem?.collectionItem?.id
      if (id) c[key] = id
    },
  })
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.solRingFdc), quantity: 3, condition: "near_mint", language: "en", finish: "nonfoil", locationId: c.binder, purchasePriceCents: 50, forTrade: true, forTradeQuantity: 2 } }), item("solRing"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.solRingSldFoil), quantity: 1, finish: "foil", locationId: c.deckBox, purchasePriceCents: 6000, notes: "Secret Lair" } }), item("solRingFoil"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.boltFdc), quantity: 4, condition: "lightly_played", locationId: c.box } }), item("bolt"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.counterspellFdc), quantity: 2, condition: "moderately_played", language: "ja", locationId: c.box, forTrade: true } }), item("counterspell"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.thrasiosFca), quantity: 1, finish: "foil", locationId: c.deckBox, purchasePriceCents: 25000 } }), item("thrasios"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.thrasiosCmrEtched), quantity: 1, finish: "etched", locationId: c.binder } }), item("thrasiosEtched"))
  await run("CreateCollectionItem", { input: { scryfallId: G(P.tymnaFca), quantity: 1 } }, item("tymna"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.rhysticWot), quantity: 1, condition: "heavily_played", locationId: c.binder, purchasePriceCents: 9000, forTrade: true, forTradeQuantity: 1 } }), item("rhystic"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.snowIslandMb2), quantity: 5, locationId: c.box } }), item("snowIsland"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.islandFra), quantity: 10, finish: "foil", locationId: c.box, purchasePriceCents: 10 } }), item("island"))
  await run("CreateCollectionItem", { input: { scryfallId: G(P.delverInr), quantity: 2, finish: "foil", condition: "damaged" } }, item("delver"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.swordsFdc), quantity: 2, locationId: c.deckBox, purchasePriceCents: 300 } }), item("swords"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.esperSentinelH2r), quantity: 1, locationId: c.binder, purchasePriceCents: 100000 } }), item("esper"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.arcaneSignetFdc), quantity: 6, locationId: c.box, purchasePriceCents: 25 } }), item("signet"))
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.solRingFdc), quantity: 1, condition: "lightly_played", locationId: c.box } }), item("solRingBox"))
  await run("CreateCollectionItem", { input: { scryfallId: G(P.solRingFdc), quantity: 0 } }, { label: "zero quantity" })
  await run("CreateCollectionItem", { input: { scryfallId: G(P.solRingFdc), finish: "etched" } }, { label: "unavailable finish" })
  await run("CreateCollectionItem", { input: { scryfallId: G(P.solRingFdc), condition: "mint" } }, { label: "bad condition" })
  await run("CreateCollectionItem", { input: { scryfallId: G(P.missing) } }, { label: "missing printing" })
  await run("CreateCollectionItem", (c) => ({ input: { scryfallId: G(P.boltFdc), quantity: 1, forTrade: true, forTradeQuantity: 5, locationId: c.box } }), { label: "trade qty > qty" })

  await run("UpdateCollectionItem", (c) => ({ id: c.bolt, input: { quantity: 3, notes: "played", purchasePriceCents: 75 } }))
  await run("UpdateCollectionItem", (c) => ({ id: c.tymna, input: { locationId: c.deckBox, condition: "near_mint" } }), { label: "move" })
  await run("UpdateCollectionItem", (c) => ({ id: c.delver, input: { scryfallId: G("871c4ccc-5a14-4583-b4c7-6f2d2aeb8253"), finish: "nonfoil" } }), { label: "change printing" })
  await run("UpdateCollectionItem", (c) => ({ id: c.bolt, input: { quantity: -1 } }), { label: "negative" })
  await run("UpdateCollectionItem", (c) => ({ id: c.bolt, input: { finish: "etched" } }), { label: "bad finish" })
  await run("UpdateCollectionItem", { id: "Q29sbGVjdGlvbkl0ZW06OTk5OTk5", input: { quantity: 1 } }, { label: "missing" })
  await run("CardCollectionItems", (c) => ({ cardId: c.solRingCardId }), { label: "owned" })
  await run("CollectionItemPrintings", (c) => ({ cardId: c.solRingCardId }), { label: "owned" })
  await run("CardPrintings", (c) => ({ id: c.solRingCardId }), { label: "owned" })

  const groupFilters = [
    {},
    { q: "sol" },
    { q: "t:instant" },
    { q: "c:u -t:land" },
    { finish: "foil" },
    { condition: "near_mint" },
    { language: "ja" },
    { forTrade: true },
    { unallocatedOnly: true },
    { addedWithinDays: 7 },
    { locationId: "unfiled" },
    "binder",
    "box",
  ]
  for (const filters of groupFilters) {
    const label = typeof filters === "string" ? `location ${filters}` : JSON.stringify(filters)
    await run("CollectionItemGroupsPage", (c) => ({
      filters: typeof filters === "string" ? { locationId: c[filters] } : filters,
      sort: null,
      first: 50,
      after: null,
    }), { label })
    await run("LocationCollectionCount", (c) => ({ filters: typeof filters === "string" ? { locationId: c[filters] } : filters }), { label })
  }
  for (const field of COLLECTION_SORTS) {
    for (const direction of ["asc", "desc"]) {
      await run("CollectionItemGroupsPage", { filters: {}, sort: { field, direction }, first: 50, after: null }, { label: `sort ${field} ${direction}` })
    }
  }
  await run("CollectionItemGroupsPage", { filters: {}, sort: { field: "name", direction: "asc" }, first: 3, after: null }, {
    label: "page 1",
    capture: (c, data) => (c.groupCursor = data.collectionItemGroups.pageInfo.endCursor),
  })
  await run("CollectionItemGroupsPage", (c) => ({ filters: {}, sort: { field: "name", direction: "asc" }, first: 3, after: c.groupCursor }), { label: "page 2" })
  await run("Collection", {}, { label: "populated" })
  await run("Collection", (c) => ({ filters: { locationId: c.box } }), { label: "box" })
  await run("CollectionValueDashboard", {}, { label: "populated" })
  await run("CollectionSellCards", { first: 5, after: null }, { capture: (c, data) => (c.sellCursor = data.collectionItems.pageInfo.endCursor) })
  await run("CollectionSellCards", (c) => ({ first: 5, after: c.sellCursor }), { label: "page 2" })
  await run("CollectionExportCsv", { filters: {} })
  await run("CollectionExportCsv", (c) => ({ filters: { locationId: c.binder } }), { label: "binder" })
  await run("CollectionExportText", { filters: {} })
  await run("CollectionExportText", { filters: { finish: "foil" } }, { label: "foil" })
  await run("Location", (c) => ({ id: c.binder }), { label: "populated" })
  await run("Home", {}, { label: "populated" })

  // ---------------------------------------------------------------- imports
  const textImport = [
    "4 Lightning Bolt (FDC) 163",
    "1 Sol Ring (FDC) 286",
    "2 Counterspell (FDC) 61 *F*",
    "1 Snow-Covered Forest (MB2) 120",
    "1 Delver of Secrets (INR) 60",
    "3 Island (FRA) 283",
    "1 Thrasios, Triton Hero [CMR] 538",
    "1 Not A Real Card",
    "",
    "garbage line ::",
  ].join("\n")
  await run("PreviewCollectionImport", (c) => ({ input: { text: textImport, format: "text", fileName: null, locationId: c.box, purchasePriceCents: 100 } }), {
    label: "text",
    capture: (c, data) => (c.textPreview = data.previewCollectionImport?.importPreview),
  })
  const csvImport = [
    "Name,Set code,Collector number,Quantity,Foil,Condition,Language,Purchase price",
    "Sol Ring,fdc,286,2,,near_mint,English,1.25",
    "Brainstorm,frc,39,1,foil,lightly played,en,",
    '"Thrasios, Triton Hero",cmr,538,1,etched,NM,en,20',
    "Arcane Signet,fdc,245,2,,,,",
    "Missing Card,zzz,1,1,,,,",
  ].join("\n")
  await run("PreviewCollectionImport", { input: { text: csvImport, format: null, fileName: "collection.csv", locationId: null, purchasePriceCents: null } }, {
    label: "csv",
    capture: (c, data) => (c.csvPreview = data.previewCollectionImport?.importPreview),
  })
  await run("PreviewCollectionImport", { input: { text: "Name,Quantity,Condition\nSol Ring,1,Lightly Played\nBrainstorm,1,NM\nCounterspell,1,lp", format: "csv" } }, { label: "capitalized conditions" })
  await run("PreviewCollectionImport", { input: { text: "Scryfall ID,Quantity\n" + P.brainstormFrc + ",2\n" + P.missing + ",1", format: "csv" } }, { label: "scryfall id csv" })
  await run("PreviewCollectionImport", { input: { text: "", format: "text" } }, { label: "empty" })
  await run("PreviewCollectionImport", { input: { text: "1 Sol Ring", format: "xlsx" } }, { label: "bad format" })
  // `commitImportRow` after `selectCandidate`: every row is sent; an
  // ambiguous row becomes exact with its first candidate's global id.
  const commitRows = (preview) =>
    (preview?.rows ?? []).map((row) => {
      const chosen = row.status === "ambiguous" && row.candidates?.length ? row.candidates[0] : null
      return {
        rowNumber: row.rowNumber,
        status: chosen ? "exact" : row.status,
        attrs: chosen ? { ...strip(row.attrs), scryfallId: chosen.id } : strip(row.attrs),
      }
    })
  await run("PreviewCollectionImportAutoSort", (c) => ({ input: { rows: commitRows(c.textPreview), autoSort: true } }), { label: "no rules" })
  await run("CommitCollectionImport", (c) => ({ input: { rows: commitRows(c.textPreview), autoSort: false } }), { label: "text", alignSecond: true })
  await run("CommitCollectionImport", (c) => ({ input: { rows: commitRows(c.csvPreview), autoSort: false } }), { label: "csv", alignSecond: true })
  await run("CommitCollectionImport", { input: { rows: [{ rowNumber: 1, status: "exact", attrs: { scryfallId: G(P.missing), quantity: 1 } }] } }, { label: "missing printing" })
  await run("CommitCollectionImport", { input: { rows: [] } }, { label: "empty" })
  await run("CollectionItemGroupsPage", { filters: {}, sort: { field: "added", direction: "desc" }, first: 100, after: null }, { label: "after import" })

  // ---------------------------------------------------------------- auto sort
  const rules = (c) => [
    { name: "Blue to binder", enabled: true, priority: 1, targetLocationId: c.binder, colorMode: "include_any", colors: ["U"], typeLineIncludes: [], typeLineExcludes: ["Land"], rarities: [], minPriceCents: null, maxPriceCents: null, setOperator: null, setCodes: null, releaseDateOperator: null, releaseDate: null },
    { name: "Pricey", enabled: true, priority: 2, targetLocationId: c.binder, colorMode: "any", colors: [], typeLineIncludes: [], typeLineExcludes: [], rarities: ["rare", "mythic"], minPriceCents: 1000, maxPriceCents: null, setOperator: "not_in", setCodes: ["lea"], releaseDateOperator: "after", releaseDate: "2000-01-01" },
    { name: "Lands", enabled: false, priority: 3, targetLocationId: c.box, colorMode: "colorless", colors: [], typeLineIncludes: ["Land"], typeLineExcludes: [], rarities: [], minPriceCents: null, maxPriceCents: 500, setOperator: "in", setCodes: ["mb2", "fra"], releaseDateOperator: "before", releaseDate: "2030-01-01" },
  ]
  await run("AutoSortCollection", (c) => ({ input: { sourceLocationId: c.box, dryRun: true, rules: rules(c) } }), { label: "dry run with rules" })
  await run("UpdateCollectionAutoSortRules", (c) => ({ input: rules(c) }), {
    capture: (c, data) => (c.ruleIds = data.updateCollectionAutoSortRules?.collectionAutoSortRules?.map((rule) => rule.id)),
  })
  await run("UpdateCollectionAutoSortRules", (c) => ({ input: [{ ...rules(c)[0], colorMode: "rainbow" }] }), { label: "bad color mode" })
  await run("UpdateCollectionAutoSortRules", (c) => ({ input: [{ ...rules(c)[0], name: "" }] }), { label: "blank name" })
  await run("CollectionAutoSortSettings", {}, { label: "with rules" })
  await run("Collection", {}, { label: "with rules" })
  await run("PreviewCollectionImportAutoSort", (c) => ({ input: { rows: commitRows(c.csvPreview), autoSort: true } }), { label: "with rules" })
  await run("AutoSortCollection", { input: { dryRun: true } }, { label: "saved rules dry run" })
  await run("AutoSortCollection", (c) => ({ input: { sourceLocationId: c.box, dryRun: false } }), { label: "apply box" })
  await run("AutoSortCollection", { input: null }, { label: "apply all" })
  await run("AutoSortCollection", (c) => ({ input: { sourceLocationId: c.deckBox, dryRun: true, rules: [{ ...rules(c)[0], targetLocationId: "TG9jYXRpb246OTk5OTk=" }] } }), { label: "missing target" })

  // ---------------------------------------------------------------- tokens
  const token = (key) => ({ capture: (c, data) => data.addTokenItem?.tokenItem?.id && (c[key] = data.addTokenItem.tokenItem.id) })
  await run("AddTokenItem", { input: { scryfallId: G(P.treasureTfdc), quantity: 5 } }, token("treasure"))
  await run("AddTokenItem", { input: { scryfallId: G(P.treasureTfdc), quantity: 2, finish: "foil" } }, token("treasureFoil"))
  await run("AddTokenItem", { input: { scryfallId: G(P.goblinTokenTfrc), backScryfallId: G(P.treasureTfra), quantity: 3 } }, token("goblin"))
  await run("AddTokenItem", { input: { scryfallId: G(P.treasureTfdc), quantity: 1 } }, { label: "merge" })
  await run("AddTokenItem", { input: { scryfallId: G(P.solRingFdc), quantity: 1 } }, { label: "not a token" })
  await run("AddTokenItem", { input: { scryfallId: G(P.treasureTfdc), quantity: 0 } }, { label: "zero" })
  await run("AddTokenItem", { input: { scryfallId: G(P.treasureTfdc), finish: "etched" } }, { label: "bad finish" })
  await run("TokenItems", { q: null }, { label: "populated" })
  await run("TokenItems", { q: "gob" }, { label: "q" })
  await run("UpdateTokenItem", (c) => ({ id: c.treasure, input: { quantity: 9 } }))
  await run("UpdateTokenItem", (c) => ({ id: c.treasure, input: { finish: "foil" } }), { label: "finish collides" })
  await run("UpdateTokenItem", (c) => ({ id: c.goblin, input: { quantity: 0 } }), { label: "zero" })
  await run("Collection", {}, { label: "token count" })

  // ---------------------------------------------------------------- decks
  const deck = (key) => ({ capture: (c, data) => data.createDeck?.deck?.id && (c[key] = data.createDeck.deck.id) })
  await run("CreateDeck", { input: { name: "Thrasios Tymna", format: "commander", status: "brewing" } }, deck("cmdr"))
  await run("CreateDeck", { input: { name: "Burn", format: "modern", status: "active", includedForPlay: true } }, deck("burn"))
  await run("CreateDeck", { input: { name: "Krenko", format: "commander" } }, deck("krenko"))
  await run("CreateDeck", { input: { name: "Scratch", format: "casual", status: "brewing" } }, deck("scratch"))
  await run("CreateDeck", { input: { name: "", format: "commander" } }, { label: "blank" })
  await run("CreateDeck", { input: { name: "Bad", format: "brawl" } }, { label: "bad format" })
  await run("CreateDeck", { input: { name: "Bad", status: "retired" } }, { label: "bad status" })

  const cmdrList = [
    "Commander",
    "1 Thrasios, Triton Hero",
    "",
    "Deck",
    "1 Tymna the Weaver",
    "1 Sol Ring",
    "1 Rhystic Study",
    "1 Esper Sentinel",
    "1 Swords to Plowshares",
    "1 Counterspell (FDC) 61",
    "1 Arcane Signet",
    "1 Command Tower",
    "1 Smothering Tithe",
    "1 Lightning Bolt",
    "8 Snow-Covered Island",
    "3 Snow-Covered Forest",
    "5 Island",
    "2 Brainstorm",
    "1 Totally Fake Card",
  ].join("\n")
  await run("ImportDecklist", (c) => ({ id: c.cmdr, text: cmdrList, replaceExisting: false, zone: null }), { label: "commander list" })
  await run("ImportDecklist", (c) => ({ id: c.cmdr, text: "1 Brainstorm\n1 Delver of Secrets", replaceExisting: false, zone: "considering" }), { label: "considering" })
  await run("ImportDecklist", (c) => ({ id: c.burn, text: "4 Lightning Bolt\n4 Goblin Guide\n20 Mountain\nSideboard\n2 Counterspell", replaceExisting: true, zone: null }), { label: "burn" })
  await run("ImportDecklist", (c) => ({ id: c.krenko, text: "1 Krenko, Mob Boss\n1 Sol Ring\n30 Mountain", replaceExisting: false, zone: null }), { label: "krenko" })
  await run("ImportDecklist", (c) => ({ id: c.scratch, text: "", replaceExisting: true, zone: null }), { label: "empty" })
  await run("ImportDecklist", (c) => ({ id: c.scratch, text: "1 Sol Ring", replaceExisting: false, zone: "sideboard" }), { label: "bad zone" })

  const captureDeck = (key) => ({
    capture: (c, data) => {
      c.deckCards ??= {}
      const cards = edges(data.deck?.deckCards)
      c.deckCards[key] = Object.fromEntries(cards.map((card) => [`${card.card.name}|${card.zone}`, card.id]))
      c.deckTagIds ??= {}
      c.deckTagIds[key] = (data.deck?.tags ?? []).map((tag) => tag.id)
    },
  })
  const dc = (c, deckKey, name, zone = "mainboard") => c.deckCards?.[deckKey]?.[`${name}|${zone}`]
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "imported", ...captureDeck("cmdr") })
  await run("Deck", (c) => ({ id: c.krenko, deckCardsAfter: null }), { label: "krenko", ...captureDeck("krenko") })
  await run("Deck", (c) => ({ id: c.burn, deckCardsAfter: null }), { label: "burn", ...captureDeck("burn") })
  await run("SetDeckCommander", (c) => ({ id: dc(c, "krenko", "Krenko, Mob Boss") }), { label: "krenko" })
  await run("SetDeckCommander", (c) => ({ id: dc(c, "burn", "Lightning Bolt") }), { label: "not legendary" })
  await run("AddDeckPartner", (c) => ({ id: dc(c, "cmdr", "Tymna the Weaver") }), { label: "tymna" })
  await run("AddDeckPartner", (c) => ({ id: dc(c, "cmdr", "Sol Ring") }), { label: "not a partner" })
  await run("AddDeckCard", (c) => ({ deckId: c.cmdr, input: { name: "Smothering Tithe", quantity: 1, zone: "considering" } }), { label: "considering duplicate name" })
  await run("AddDeckCard", (c) => ({ deckId: c.cmdr, input: { name: "Delver of Secrets", quantity: 1, zone: "mainboard", finish: "foil", tag: "getting" } }), { label: "dfc foil tag" })
  await run("AddDeckCard", (c) => ({ deckId: c.cmdr, input: { name: "Mystic Remora", quantity: 1, tag: "Card Draw" } }), { label: "bad tag" })
  await run("AddDeckCard", (c) => ({ deckId: c.cmdr, input: { name: "Goblin Guide", quantity: 1, preferredPrintingId: G(P.goblinGuideMb2) } }), { label: "preferred printing" })
  await run("AddDeckCard", (c) => ({ deckId: c.cmdr, input: { name: "Nope Not Real", quantity: 1 } }), { label: "unknown" })
  await run("AddDeckCard", (c) => ({ deckId: c.cmdr, input: { name: "Sol Ring", quantity: 1, zone: "graveyard" } }), { label: "bad zone" })
  await run("AddCardToDeck", (c) => ({ deckId: c.burn, input: { name: "Lightning Bolt", quantity: 1, zone: "mainboard" } }), { label: "existing" })
  await run("AddCardToDeck", (c) => ({ deckId: c.burn, input: { name: "Brainstorm", quantity: 2, zone: "considering" } }))
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "commanders", ...captureDeck("cmdr") })
  await run("Deck", (c) => ({ id: c.krenko, deckCardsAfter: null }), { label: "krenko commander", ...captureDeck("krenko") })

  // tags
  const tag = (key) => ({ capture: (c, data) => data.createDeckTag?.deckTag?.id && (c[key] = data.createDeckTag.deckTag.id) })
  await run("CreateDeckTag", (c) => ({ deckId: c.cmdr, input: { name: "Mana Rocks", color: "#22c55e", targetCount: 10 } }), tag("tagRamp"))
  await run("CreateDeckTag", (c) => ({ deckId: c.cmdr, input: { name: "Interaction", color: "#ef4444" } }), tag("tagRemoval"))
  await run("CreateDeckTag", (c) => ({ deckId: c.cmdr, input: { name: "Wincons" } }), tag("tagWin"))
  await run("CreateDeckTag", (c) => ({ deckId: c.cmdr, input: { name: "Mana Rocks" } }), { label: "duplicate" })
  await run("CreateDeckTag", (c) => ({ deckId: c.cmdr, input: { name: "" } }), { label: "blank" })
  await run("CreateDeckTag", (c) => ({ deckId: c.cmdr, input: { name: "Bad color", color: "green" } }), { label: "bad color" })
  await run("UpdateDeckTag", (c) => ({ id: c.tagWin, input: { name: "Win Conditions", color: "#a855f7", targetCount: 3 } }))
  await run("UpdateDeckTag", (c) => ({ id: c.tagWin, input: { name: "Mana Rocks" } }), { label: "duplicate" })
  await run("ReorderDeckTags", (c) => ({ deckId: c.cmdr, tagIds: [c.tagWin, c.tagRamp, c.tagRemoval] }))
  await run("ReorderDeckTags", (c) => ({ deckId: c.cmdr, tagIds: [c.tagWin] }), { label: "partial" })
  await run("AssignDeckCardTag", (c) => ({ deckCardId: dc(c, "cmdr", "Sol Ring"), tagId: c.tagRamp }))
  await run("AssignDeckCardTag", (c) => ({ deckCardId: dc(c, "cmdr", "Arcane Signet"), tagId: c.tagRamp }))
  await run("AssignDeckCardTag", (c) => ({ deckCardId: dc(c, "cmdr", "Swords to Plowshares"), tagId: c.tagRemoval }))
  await run("AssignDeckCardTag", (c) => ({ deckCardId: dc(c, "cmdr", "Sol Ring"), tagId: c.tagRamp }), { label: "again" })
  await run("AssignDeckCardTag", (c) => ({ deckCardId: dc(c, "burn", "Lightning Bolt"), tagId: c.tagRamp }), { label: "other deck" })
  await run("UnassignDeckCardTag", (c) => ({ deckCardId: dc(c, "cmdr", "Arcane Signet"), tagId: c.tagRamp }))
  await run("UpdateDeckCardsTag", (c) => ({ deckCardIds: [dc(c, "cmdr", "Rhystic Study"), dc(c, "cmdr", "Esper Sentinel")], tag: "consider_cutting" }))
  await run("UpdateDeckCardsTag", (c) => ({ deckCardIds: [dc(c, "cmdr", "Esper Sentinel")], tag: null }), { label: "clear" })
  await run("UpdateDeckCard", (c) => ({ id: dc(c, "cmdr", "Brainstorm"), input: { quantity: 1, finish: "foil" } }))
  await run("UpdateDeckCard", (c) => ({ id: dc(c, "cmdr", "Island"), input: { quantity: 4, preferredPrintingId: G(P.islandFra) } }), { label: "printing" })
  await run("UpdateDeckCard", (c) => ({ id: dc(c, "cmdr", "Lightning Bolt"), input: { zone: "considering" } }), { label: "zone" })
  await run("UpdateDeckCard", (c) => ({ id: dc(c, "cmdr", "Sol Ring"), input: { quantity: 0 } }), { label: "zero" })
  await run("UpdateDeckCard", (c) => ({ id: dc(c, "cmdr", "Sol Ring"), input: { preferredPrintingId: G(P.boltFdc) } }), { label: "wrong card printing" })
  await run("BulkUpdateDeckCards", (c) => ({ deckCardIds: [dc(c, "cmdr", "Counterspell"), dc(c, "cmdr", "Command Tower")], input: { finish: "nonfoil", tag: "getting" } }))
  await run("BulkUpdateDeckCards", (c) => ({ deckCardIds: [dc(c, "cmdr", "Counterspell")], input: { zone: "nowhere" } }), { label: "bad zone" })
  await run("OptimizeDeckCardPrintings", (c) => ({ deckCardIds: [dc(c, "cmdr", "Sol Ring"), dc(c, "cmdr", "Rhystic Study"), dc(c, "cmdr", "Snow-Covered Island")] }))
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "tagged", ...captureDeck("cmdr") })

  // allocation
  await run("AllocateDeckCardItem", (c) => ({ deckCardId: dc(c, "cmdr", "Sol Ring"), collectionItemId: c.solRingFoil }))
  await run("AllocateDeckCardItem", (c) => ({ deckCardId: dc(c, "cmdr", "Rhystic Study"), collectionItemId: c.rhystic }))
  await run("AllocateDeckCardItem", (c) => ({ deckCardId: dc(c, "cmdr", "Sol Ring"), collectionItemId: c.bolt }), { label: "wrong card" })
  await run("AllocateDeckCardItem", (c) => ({ deckCardId: dc(c, "cmdr", "Thrasios, Triton Hero", "commander"), collectionItemId: c.thrasios }), { label: "commander" })
  await run("AllocateDeckCardItem", (c) => ({ deckCardId: dc(c, "krenko", "Sol Ring"), collectionItemId: c.solRingFoil }), { label: "already allocated elsewhere" })
  await run("AllocateDeckCardProxy", (c) => ({ deckCardId: dc(c, "cmdr", "Smothering Tithe"), quantity: 1 }))
  await run("AllocateDeckCardProxy", (c) => ({ deckCardId: dc(c, "cmdr", "Command Tower"), quantity: 1 }))
  await run("AllocateDeckCardProxy", (c) => ({ deckCardId: dc(c, "cmdr", "Snow-Covered Island"), quantity: 3 }), { label: "owned copies" })
  await run("AllocateDeckCardProxy", (c) => ({ deckCardId: dc(c, "cmdr", "Smothering Tithe"), quantity: 5 }), { label: "too many" })
  await run("DeallocateDeckCardProxy", (c) => ({ deckCardId: dc(c, "cmdr", "Command Tower"), quantity: 1 }))
  await run("DeallocateDeckCardProxy", (c) => ({ deckCardId: dc(c, "cmdr", "Esper Sentinel"), quantity: 1 }), { label: "none" })
  await run("AllocateDeckPullList", (c) => ({
    deckId: c.cmdr,
    entries: [
      { deckCardId: dc(c, "cmdr", "Swords to Plowshares"), collectionItemId: c.swords, quantity: 1 },
      { deckCardId: dc(c, "cmdr", "Snow-Covered Island"), collectionItemId: c.snowIsland, quantity: 5 },
      { deckCardId: dc(c, "cmdr", "Arcane Signet"), collectionItemId: c.signet },
      { deckCardId: dc(c, "cmdr", "Esper Sentinel"), collectionItemId: c.bolt, quantity: 1 },
    ],
  }))
  await run("AddCollectionItemToDeck", (c) => ({ id: c.counterspell, deckId: c.burn, zone: "mainboard" }))
  await run("AddCollectionItemToDeck", (c) => ({ id: c.delver, deckId: c.burn, zone: "considering" }), { label: "considering" })
  await run("AddCollectionItemToDeck", (c) => ({ id: c.esper, deckId: c.burn, zone: "attic" }), { label: "bad zone" })
  await run("BulkAddCollectionItemsToDeck", (c) => ({ selector: { ids: [c.bolt, c.solRingBox] }, deckId: c.krenko, zone: "mainboard" }))
  await run("BulkAddCollectionItemsToDeck", (c) => ({ selector: { all: true, filters: { locationId: c.binder }, excludedIds: [c.esper] }, deckId: c.scratch, zone: "mainboard" }), { label: "all binder" })
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "allocated", ...captureDeck("cmdr") })
  await run("Deck", (c) => ({ id: c.krenko, deckCardsAfter: null }), { label: "krenko allocated", ...captureDeck("krenko") })
  await run("Deck", (c) => ({ id: c.scratch, deckCardsAfter: null }), { label: "scratch", ...captureDeck("scratch") })
  await run("DeallocateDeckCardItem", (c) => ({ deckCardId: dc(c, "cmdr", "Rhystic Study"), collectionItemId: c.rhystic }))
  await run("DeallocateDeckCardItem", (c) => ({ deckCardId: dc(c, "cmdr", "Rhystic Study"), collectionItemId: c.rhystic }), { label: "again" })
  await run("BulkDeallocateDeckCards", (c) => ({ deckCardIds: [dc(c, "cmdr", "Arcane Signet"), dc(c, "cmdr", "Snow-Covered Island")] }))
  await run("CollectionItemGroupsPage", { filters: { unallocatedOnly: true }, sort: { field: "name", direction: "asc" }, first: 100, after: null }, { label: "unallocated after allocation" })
  await run("CollectionItemGroupsPage", (c) => ({ filters: { cardId: c.solRingCardId }, sort: null, first: 100, after: null }), { label: "sol ring card" })
  await run("CardCollectionItems", (c) => ({ cardId: c.solRingCardId }), { label: "allocated" })

  // buylist
  for (const printingMode of ["none", "exact", "cheapest"]) {
    for (const [exportFormat, includeBasicLands, assumeNoOwned, includeConsidering] of [["text", false, false, false], ["csv", true, true, true], ["text", true, false, true]]) {
      await run("DeckBuylist", (c) => ({ id: c.cmdr, printingMode, exportFormat, includeBasicLands, assumeNoOwned, includeConsidering }), { label: `${printingMode} ${exportFormat} basics=${includeBasicLands} none-owned=${assumeNoOwned} considering=${includeConsidering}` })
    }
  }
  await run("DeckBuylist", (c) => ({ id: c.cmdr, printingMode: "fancy", exportFormat: "pdf", includeBasicLands: false, assumeNoOwned: false, includeConsidering: false }), { label: "bad modes" })

  // swaps
  const swap = (c) => ({
    cuts: [
      { deckCardId: dc(c, "cmdr", "Esper Sentinel"), quantity: 1, destination: "CONSIDERING" },
      { deckCardId: dc(c, "cmdr", "Island"), quantity: 2, destination: "REMOVE" },
    ],
    adds: [
      { deckCardId: dc(c, "cmdr", "Delver of Secrets // Insectile Aberration", "considering"), quantity: 1 },
      { name: "Mystic Remora", quantity: 1 },
      { name: "Made Up Card", quantity: 1 },
    ],
  })
  await run("DeckSwapPreview", (c) => ({ deckId: c.cmdr, input: swap(c) }))
  await run("DeckSwapPreview", (c) => ({ deckId: c.cmdr, input: { cuts: [], adds: [] } }), { label: "empty" })
  await run("ApplyDeckSwap", (c) => ({ deckId: c.cmdr, input: swap(c) }), { label: "unresolved add" })
  await run("ApplyDeckSwap", (c) => ({ deckId: c.cmdr, input: { ...swap(c), adds: swap(c).adds.slice(0, 2) } }))
  await run("ApplyDeckSwap", (c) => ({ deckId: c.cmdr, input: { cuts: [{ deckCardId: dc(c, "cmdr", "Sol Ring"), quantity: 9 }], adds: [] } }), { label: "cut too many" })
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "after swap", ...captureDeck("cmdr") })

  // deck metadata
  await run("UpdateDeck", (c) => ({ id: c.cmdr, input: { name: "Thrasios & Tymna", status: "active", primer: "# Primer\nDraw cards.", includedForPlay: true, coverDeckCardId: dc(c, "cmdr", "Rhystic Study") } }))
  await run("UpdateDeck", (c) => ({ id: c.burn, input: { playCount: 3, skipCount: 1, lastPlayedAt: "2026-09-01T12:00:00Z" } }), { label: "play stats" })
  await run("UpdateDeck", (c) => ({ id: c.burn, input: { format: "wizards" } }), { label: "bad format" })
  await run("UpdateDeck", (c) => ({ id: c.burn, input: { coverDeckCardId: dc(c, "cmdr", "Sol Ring") } }), { label: "foreign cover" })
  await run("RecordDeckPlay", (c) => ({ id: c.cmdr, outcome: "PLAYED" }))
  await run("RecordDeckPlay", (c) => ({ id: c.cmdr, outcome: "SKIPPED" }))
  await run("DeckPlayHistory", (c) => ({ id: c.cmdr }))
  await run("DeckPlayHistory", (c) => ({ id: c.burn }))
  await run("Decks", { after: null }, { label: "populated" })
  await run("CardDeckOptions", {}, { label: "populated" })
  await run("CollectionItemDeckOptions", {}, { label: "populated" })
  await run("RandomDeck", (c) => ({ excludeId: c.burn }), { label: "only active candidate" })
  await run("Home", {}, { label: "with decks" })

  // share
  await run("EnsureDeckShareToken", (c) => ({ id: c.cmdr }), {
    capture: (c, data) => {
      c.deckShare = data.ensureDeckShareToken?.deck?.shareToken
      c.secrets.add(c.deckShare)
    },
  })
  await run("EnsureDeckShareToken", (c) => ({ id: c.cmdr }), { label: "idempotent" })
  await run("Deck", (c) => ({ id: c.deckShare, deckCardsAfter: null }), { endpoint: "share", label: "public share" })
  await run("DeckBuylist", (c) => ({ id: c.deckShare, printingMode: "exact", exportFormat: "text", includeBasicLands: false, assumeNoOwned: true, includeConsidering: false }), { endpoint: "share", label: "public share" })
  await run("CardByName", { name: "Rhystic Study" }, { endpoint: "share", label: "public share" })
  await run("Card", (c) => ({ id: c.solRingCardId }), { endpoint: "share", label: "public share" })
  await run("Deck", { id: "not-a-token", deckCardsAfter: null }, { endpoint: "share", label: "public bad token" })
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { endpoint: "share", label: "public owner id" })
  await run("RotateDeckShareToken", (c) => ({ id: c.cmdr }), {
    capture: (c, data) => {
      c.oldDeckShare = c.deckShare
      c.deckShare = data.rotateDeckShareToken?.deck?.shareToken
      c.secrets.add(c.deckShare)
    },
  })
  await run("Deck", (c) => ({ id: c.oldDeckShare, deckCardsAfter: null }), { endpoint: "share", label: "public rotated-out token" })
  await run("Deck", (c) => ({ id: c.deckShare, deckCardsAfter: null }), { endpoint: "share", label: "public rotated token" })
  await run("DisableDeckSharing", (c) => ({ id: c.cmdr }))
  await run("Deck", (c) => ({ id: c.deckShare, deckCardsAfter: null }), { endpoint: "share", label: "public disabled" })
  await run("EnsureDeckShareToken", (c) => ({ id: c.burn }), {
    label: "burn",
    capture: (c, data) => {
      c.burnShare = data.ensureDeckShareToken?.deck?.shareToken
      c.secrets.add(c.burnShare)
    },
  })
  await run("Deck", (c) => ({ id: c.burnShare, deckCardsAfter: null }), { endpoint: "share", label: "public burn" })

  // ---------------------------------------------------------------- trade
  const want = (key) => ({ capture: (c, data) => data.createTradeWant?.tradeWant?.id && (c[key] = data.createTradeWant.tradeWant.id) })
  await run("CreateTradeWant", { name: "Mana Crypt", scryfallId: null, quantity: 1 }, want("wantCrypt"))
  await run("CreateTradeWant", { name: null, scryfallId: P.smotheringTitheWot, quantity: 2 }, want("wantTithe"))
  await run("CreateTradeWant", { name: "Lightning Bolt", scryfallId: null, quantity: null }, want("wantBolt"))
  await run("CreateTradeWant", { name: "Mana Crypt", scryfallId: null, quantity: 1 }, { label: "duplicate" })
  await run("CreateTradeWant", { name: "Definitely Not A Card", scryfallId: null, quantity: 1 }, { label: "unknown" })
  await run("CreateTradeWant", { name: null, scryfallId: null, quantity: 1 }, { label: "nothing" })
  await run("CreateTradeWantFromCard", { scryfallId: P.esperSentinelH2r, quantity: 1 })
  await run("CreateTradeWantFromCard", { scryfallId: P.missing, quantity: 1 }, { label: "missing" })
  await run("UpdateTradeWant", (c) => ({ id: c.wantBolt, quantity: 4 }))
  await run("UpdateTradeWant", (c) => ({ id: c.wantBolt, quantity: 0 }), { label: "zero" })
  await run("TradeWants", {}, { label: "populated" })
  await run("EnsureTradeWantsShareToken", {}, {
    capture: (c, data) => {
      c.wantsShare = data.ensureTradeWantsShareToken?.token
      c.secrets.add(c.wantsShare)
    },
  })
  await run("TradeWantsShareToken", {}, { label: "enabled" })
  await run("WantsList", (c) => ({ id: c.wantsShare }), { endpoint: "share", label: "public" })
  await run("WantsList", { id: "bogus" }, { endpoint: "share", label: "public bogus" })
  await run("RotateTradeWantsShareToken", {}, {
    capture: (c, data) => {
      const token = Object.values(data)[0]?.token
      c.oldWantsShare = c.wantsShare
      c.wantsShare = token
      c.secrets.add(token)
    },
  })
  await run("WantsList", (c) => ({ id: c.oldWantsShare }), { endpoint: "share", label: "public old token" })
  await run("WantsList", (c) => ({ id: c.wantsShare }), { endpoint: "share", label: "public rotated" })
  await run("DisableTradeWantsSharing")
  await run("WantsList", (c) => ({ id: c.wantsShare }), { endpoint: "share", label: "public disabled" })
  await run("TradeWantsShareToken", {}, { label: "disabled" })

  await run("SetCollectionItemsForTradeQuantity", (c) => ({ selector: { ids: [c.bolt, c.island] }, quantity: 2 }))
  await run("SetCollectionItemsForTradeQuantity", (c) => ({ selector: { all: true, filters: { locationId: c.binder }, excludedIds: [c.esper] }, quantity: 1 }), { label: "binder" })
  await run("SetCollectionItemsForTradeQuantity", (c) => ({ selector: { ids: [c.signet] }, quantity: -1 }), { label: "negative" })
  await run("SetCollectionItemsForTradeQuantity", { selector: {}, quantity: 1 }, { label: "empty selector" })
  await run("TradeBinderCount", {}, { label: "populated" })
  await run("EnsureTradeBinderShareToken", {}, {
    capture: (c, data) => {
      const token = Object.values(data)[0]?.token
      c.binderShare = token
      c.secrets.add(token)
    },
  })
  await run("TradeBinderShareToken", {}, { label: "enabled" })
  await run("BinderList", (c) => ({ id: c.binderShare }), { endpoint: "share", label: "public" })
  await run("RotateTradeBinderShareToken", {}, {
    capture: (c, data) => {
      const token = Object.values(data)[0]?.token
      c.oldBinderShare = c.binderShare
      c.binderShare = token
      c.secrets.add(token)
    },
  })
  await run("BinderList", (c) => ({ id: c.oldBinderShare }), { endpoint: "share", label: "public old" })
  await run("BinderList", (c) => ({ id: c.binderShare }), { endpoint: "share", label: "public rotated" })
  await run("DisableTradeBinderSharing")
  await run("BinderList", (c) => ({ id: c.binderShare }), { endpoint: "share", label: "public disabled" })
  await run("BinderList", { id: "" }, { endpoint: "share", label: "public blank" })

  const pasted = [
    "1 Sol Ring",
    "4 Lightning Bolt",
    "1 Rhystic Study",
    "2 Counterspell",
    "1 Smothering Tithe",
    "1 Mana Crypt",
    "1 Snow-Covered Island",
    "10 Island",
    "1 Esper Sentinel",
    "1 Unknown Thing",
  ].join("\n")
  await run("CollectionCheck", { url: null, text: pasted, includeConsidering: false })
  await run("CollectionCheck", { url: null, text: pasted, includeConsidering: true }, { label: "considering" })
  await run("CollectionCheck", { url: null, text: "", includeConsidering: false }, { label: "empty" })
  await run("CollectionCheck", { url: "https://example.com/not-a-deck", text: null, includeConsidering: false }, { label: "unsupported url" })
  await run("CollectionCheck", { url: null, text: null, includeConsidering: false }, { label: "nothing" })
  await run("TradeMatches", { url: null, text: pasted })
  await run("TradeMatches", { url: null, text: "" }, { label: "empty" })
  await run("TradeMatches", { url: "ftp://nope", text: null }, { label: "bad url" })
  await run("DeckDiff", (c) => ({ deckId: c.cmdr, url: null, text: pasted }))
  await run("DeckDiff", (c) => ({ deckId: c.burn, url: null, text: "4 Lightning Bolt\n2 Goblin Guide\n1 Shock" }), { label: "burn" })
  await run("DeckDiff", (c) => ({ deckId: c.burn, url: null, text: "" }), { label: "empty" })
  await run("DeleteTradeWant", (c) => ({ id: c.wantCrypt }))
  await run("DeleteTradeWant", (c) => ({ id: c.wantCrypt }), { label: "again" })
  await run("TradeWants", {}, { label: "after delete" })

  // ---------------------------------------------------------------- settings
  await run("UpdateAppearanceSettings", { palette: "nord", themeStyle: "classic" })
  await run("UpdateAppearanceSettings", { palette: "dracula", themeStyle: null }, { label: "palette only" })
  await run("UpdateAppearanceSettings", { palette: "neon", themeStyle: "glass" }, { label: "bad palette" })
  await run("UpdateAppearanceSettings", { palette: null, themeStyle: "brutalist" }, { label: "bad style" })
  await run("UpdatePricingSettings", { source: "cardkingdom" })
  await run("PricingSettings", {}, { label: "cardkingdom" })
  await run("CollectionValueDashboard", {}, { label: "cardkingdom" })
  await run("CollectionItemGroupsPage", { filters: {}, sort: { field: "price", direction: "desc" }, first: 100, after: null }, { label: "cardkingdom prices" })
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "cardkingdom prices" })
  await run("DeckBuylist", (c) => ({ id: c.cmdr, printingMode: "cheapest", exportFormat: "csv", includeBasicLands: true, assumeNoOwned: true, includeConsidering: true }), { label: "cardkingdom" })
  await run("Cards", { q: "sol ring", limit: 5, sort: { field: "price", direction: "desc" }, after: null }, { label: "cardkingdom prices" })
  await run("CollectionCheck", { url: null, text: pasted, includeConsidering: false }, { label: "cardkingdom" })
  await run("UpdatePricingSettings", { source: "manapool" })
  await run("CollectionValueDashboard", {}, { label: "manapool" })
  await run("UpdatePricingSettings", { source: "ebay" }, { label: "bad source" })
  await run("UpdatePricingSettings", { source: "scryfall" }, { label: "back to scryfall" })
  await run("PricingSettings", {}, { label: "scryfall" })

  await run("UpdateBackupSettings", { input: { enabled: false, provider: "s3", cron: "0 3 * * *", retentionCount: 7, s3Endpoint: "http://127.0.0.1:9", s3Bucket: "manavault", s3Region: "us-east-1", s3Prefix: "backups/", s3AccessKeyId: "AKIAEXAMPLE", s3SecretAccessKey: "secret-example" } })
  await run("BackupSettings", {}, { label: "s3" })
  await run("UpdateBackupSettings", { input: { cron: "not a cron" } }, { label: "bad cron" })
  await run("UpdateBackupSettings", { input: { provider: "dropbox" } }, { label: "bad provider" })
  await run("UpdateBackupSettings", { input: { retentionCount: 0 } }, { label: "bad retention" })
  await run("UpdateBackupSettings", { input: { enabled: true, provider: "google_drive", googleClientId: "id", googleClientSecret: "s", googleRefreshToken: "r", googleFolderId: "f" } }, { label: "google" })
  await run("BackupSettings", {}, { label: "google" })
  await run("UpdateBackupSettings", { input: { enabled: false, provider: "none" } }, { label: "none" })
  await run("CloudBackups", {}, { label: "provider none" })
  await run("RunCloudBackup", {}, { label: "provider none" })
  await run("StageCloudRestore", { id: "backup.db" }, { label: "provider none" })

  await run("CreateApiKey", { name: "CLI" }, {
    capture: (c, data) => {
      c.apiKey = data.createApiKey?.apiKey?.id
      c.secrets.add(data.createApiKey?.token)
    },
  })
  await run("CreateApiKey", { name: "" }, { label: "blank" })
  await run("ApiKeys", {}, { label: "one key" })
  await run("RevokeApiKey", (c) => ({ id: c.apiKey }))
  await run("RevokeApiKey", (c) => ({ id: c.apiKey }), { label: "again" })
  await run("ApiKeys", {}, { label: "revoked" })

  await run("ReplaceDefaultDeckTags", { tags: [{ name: "Ramp", color: "#22c55e", targetCount: 10 }, { name: "Draw", color: "#3b82f6", targetCount: null }, { name: "Removal", color: "#ef4444", targetCount: 8 }] })
  await run("DefaultDeckTags", {}, { label: "replaced" })
  await run("ReplaceDefaultDeckTags", { tags: [{ name: "Ramp", color: "#22c55e" }, { name: "Ramp", color: "#000000" }] }, { label: "duplicate" })
  await run("ReplaceDefaultDeckTags", { tags: [{ name: "Ramp", color: "red" }] }, { label: "bad color" })
  await run("CreateDeck", { input: { name: "Default Tags Deck", format: "commander" } }, { label: "default tags", ...deck("tagged") })
  await run("Deck", (c) => ({ id: c.tagged, deckCardsAfter: null }), { label: "default tags" })

  // ---------------------------------------------------------------- AI (no network: unconfigured, then queued jobs)
  await run("AnalyzeDeck", (c) => ({ id: c.cmdr }), { label: "unconfigured" })
  await run("AskDeckQuestion", (c) => ({ id: c.cmdr, question: "What should I cut?", conversationId: null }), { label: "unconfigured" })
  await run("AnalyzeDeckList", { url: null, text: "1 Sol Ring", format: "commander" }, { label: "unconfigured" })
  await run("RefreshAllDeckAnalyses", {}, { label: "unconfigured" })
  await run("UpdateAISettings", { input: { provider: "openrouter", apiKey: "sk-or-test-key", model: "openai/gpt-4o-mini", deckAnalysisInstructions: "Be terse." } })
  await run("UpdateAISettings", { input: { provider: "skynet", model: "x" } }, { label: "bad provider" })
  await run("UpdateAISettings", { input: { provider: "openrouter", model: "" } }, { label: "blank model" })
  // Saving AI settings validates the key against OpenRouter, which is
  // unreachable here; configure them directly (both backends read legacy
  // plaintext keys).
  await sql(
    "INSERT INTO ai_settings (id, provider, api_key, model, deck_analysis_instructions, inserted_at, updated_at) " +
      "VALUES (1, 'openrouter', 'sk-or-parity-key', 'openai/gpt-4o-mini', 'Be terse.', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z') " +
      "ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, api_key = excluded.api_key, model = excluded.model, " +
      "deck_analysis_instructions = excluded.deck_analysis_instructions",
  )
  await run("AISettings", {}, { label: "configured" })
  await run("DeckSwapAiSettings", {}, { label: "configured" })
  await run("AnalyzeDeck", (c) => ({ id: c.cmdr }), { label: "queued" })
  await run("AnalyzeDeck", (c) => ({ id: c.cmdr }), { label: "queued again" })
  await run("DeckAnalysisJob", (c) => ({ deckId: c.cmdr }))
  await run("DeckAnalysisJob", (c) => ({ deckId: c.burn }), { label: "none" })
  await run("RefreshAllDeckAnalyses", {}, { label: "configured" })
  await run("AskDeckQuestion", (c) => ({ id: c.cmdr, question: "What should I cut?", conversationId: null }), {
    label: "queued",
    capture: (c, data) => {
      c.questionId = data.askDeckQuestion?.questionAnswer?.id
      c.conversationId = data.askDeckQuestion?.questionAnswer?.conversationId
    },
  })
  await run("AskDeckQuestion", (c) => ({ id: c.cmdr, question: "And what to add?", conversationId: c.conversationId }), { label: "follow-up" })
  await run("AskDeckQuestion", (c) => ({ id: c.cmdr, question: "   ", conversationId: null }), { label: "blank" })
  await run("AskDeckSwapQuestion", (c) => ({ id: c.cmdr, question: "Is Mystic Remora good here?", threadId: "swap-thread-1", swapContext: { cuts: ["Esper Sentinel"], adds: ["Mystic Remora"] } }))
  await run("DeckQuestionAnswers", (c) => ({ deckId: c.cmdr }), { capture: (c) => c })
  await run("DeckSwapChat", (c) => ({ deckId: c.cmdr, threadId: "swap-thread-1" }))
  await run("DeckSwapChat", (c) => ({ deckId: c.cmdr, threadId: "nope" }), { label: "empty" })
  await run("DeleteDeckQuestionAnswer", (c) => ({ id: c.questionId }))
  await run("DeleteDeckQuestionAnswer", (c) => ({ id: c.questionId }), { label: "again" })
  await run("AnalyzeDeckList", { url: null, text: "", format: "commander" }, { label: "empty" })
  await run("AnalyzeDeckList", { url: null, text: "1 Sol Ring", format: "chess" }, { label: "bad format" })
  await run("AnalyzeDeckList", { url: null, text: "1 Nothing Real", format: "commander" }, { label: "unrecognized" })
  await run("AnalyzeDeckList", { url: null, text: "1 Sol Ring\n1 Counterspell", format: "commander" }, { label: "offline openrouter" })
  await run("DeckAnalysisRequests", {}, { label: "after" })

  // ---------------------------------------------------------------- external services without network
  await run("DeckEdhrec", (c) => ({ id: c.burn, excludeLands: true, commanderName: null, commanderTheme: null }), { label: "no commander" })
  await run("DeckRecommander", (c) => ({ id: c.scratch }), { label: "no commander" })
  await run("DeckCombos", (c) => ({ id: c.scratch }), { label: "scratch" })
  await run("LinkDeckExternalSource", (c) => ({ id: c.scratch, url: "https://example.com/decks/1" }), { label: "unsupported" })
  await run("LinkDeckExternalSource", (c) => ({ id: c.scratch, url: "not a url" }), { label: "invalid" })
  await run("SyncDeckExternalSource", (c) => ({ id: c.scratch }), { label: "not linked" })
  await run("UnlinkDeckExternalSource", (c) => ({ id: c.scratch }), { label: "not linked" })
  if (live) {
    await run("CardEdhrec", { name: "Sol Ring" }, { label: "live" })
    await run("DeckEdhrec", (c) => ({ id: c.cmdr, excludeLands: true, commanderName: null, commanderTheme: null }), { label: "live" })
    await run("DeckRecommander", (c) => ({ id: c.cmdr }), { label: "live" })
    await run("DeckCombos", (c) => ({ id: c.cmdr }), { label: "live" })
  } else {
    await run("CardEdhrec", { name: "Sol Ring" }, { label: "offline" })
    await run("DeckEdhrec", (c) => ({ id: c.cmdr, excludeLands: true, commanderName: null, commanderTheme: null }), { label: "offline" })
    await run("DeckEdhrec", (c) => ({ id: c.cmdr, excludeLands: false, commanderName: "Thrasios, Triton Hero", commanderTheme: "artifacts" }), { label: "offline theme" })
    await run("DeckRecommander", (c) => ({ id: c.cmdr }), { label: "offline" })
    await run("DeckCombos", (c) => ({ id: c.cmdr }), { label: "offline" })
    await run("LinkDeckExternalSource", (c) => ({ id: c.scratch, url: "https://moxfield.com/decks/abc123" }), { label: "offline moxfield" })
    await run("CollectionCheck", { url: "https://archidekt.com/decks/123/test", text: null, includeConsidering: false }, { label: "offline archidekt" })
    await run("TradeMatches", { url: "https://moxfield.com/decks/abc123", text: null }, { label: "offline moxfield" })
    await run("DeckDiff", (c) => ({ deckId: c.cmdr, url: "https://moxfield.com/decks/abc123", text: null }), { label: "offline moxfield" })
  }
  await run("SyncVendorPrices")
  await run("ReloadScryfallCatalog")
  await run("ReloadScryfallAssets")

  // ---------------------------------------------------------------- destructive collection ops
  await run("CollectionBulkClean", { maxPriceCents: 100, minCopies: 2, keepCopies: 1, preferKeepFoils: true, kept: null }, {
    capture: (c, data) => {
      c.bulkPulls = (data.collectionBulkClean?.cards ?? []).flatMap((card) => card.pulls.map((pull) => ({ collectionItemId: pull.collectionItemId, quantity: pull.quantity })))
    },
  })
  await run("CollectionBulkClean", { maxPriceCents: 5000, minCopies: 1, keepCopies: 0, preferKeepFoils: false, kept: null }, { label: "aggressive" })
  await run("CollectionBulkClean", (c) => ({ maxPriceCents: 100, minCopies: 2, keepCopies: 1, preferKeepFoils: true, kept: (c.bulkPulls ?? []).slice(0, 1) }), { label: "kept" })
  await run("CollectionBulkClean", { maxPriceCents: null, minCopies: null, keepCopies: null, preferKeepFoils: null, kept: null }, { label: "defaults" })
  await run("CollectionBulkClean", { maxPriceCents: -5, minCopies: 0, keepCopies: -1, preferKeepFoils: false, kept: null }, { label: "invalid" })
  await run("RemoveBulkCleanPulls", (c) => ({ pulls: c.bulkPulls ?? [] }))
  await run("RemoveBulkCleanPulls", (c) => ({ pulls: [{ collectionItemId: c.signet, quantity: 999 }] }), { label: "too many" })
  await run("BulkUpdateCollectionItems", (c) => ({ selector: { ids: [c.bolt, c.counterspell] }, input: { condition: "lightly_played", locationId: c.binder } }))
  await run("BulkUpdateCollectionItems", (c) => ({ selector: { all: true, filters: { locationId: "unfiled" }, excludedIds: [] }, input: { locationId: c.temp } }), { label: "file unfiled" })
  await run("BulkUpdateCollectionItems", (c) => ({ selector: { ids: [c.bolt] }, input: { condition: "pristine" } }), { label: "bad condition" })
  await run("BulkUpdateCollectionItems", (c) => ({ selector: { ids: [c.bolt] }, input: { forTrade: false } }), { label: "trade off" })
  await run("DeleteDeckCard", (c) => ({ id: dc(c, "cmdr", "Lightning Bolt", "considering") }))
  await run("DeleteDeckCard", (c) => ({ id: dc(c, "cmdr", "Lightning Bolt", "considering") }), { label: "again" })
  await run("BulkDeleteDeckCards", (c) => ({ deckCardIds: [dc(c, "cmdr", "Island"), dc(c, "cmdr", "Brainstorm")] }))
  await run("BulkDeleteDeckCards", { deckCardIds: [] }, { label: "empty" })
  await run("PreviewDeckDisassembly", (c) => ({ id: c.cmdr }))
  await run("DisassembleDeck", (c) => ({ id: c.cmdr }))
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "disassembled", ...captureDeck("cmdr") })
  await run("PreviewDeckDisassembly", (c) => ({ id: c.scratch }), { label: "scratch" })
  await run("DeleteTokenItem", (c) => ({ id: c.goblin }))
  await run("DeleteTokenItems", (c) => ({ ids: [c.treasure, c.treasureFoil] }))
  await run("DeleteTokenItems", { ids: [] }, { label: "empty" })
  await run("TokenItems", { q: null }, { label: "after delete" })
  await run("DeleteCollectionItem", (c) => ({ id: c.delver }))
  await run("DeleteCollectionItem", (c) => ({ id: c.delver }), { label: "again" })
  await run("BulkDeleteCollectionItems", (c) => ({ selector: { ids: [c.island, c.signet] } }))
  await run("BulkDeleteCollectionItems", (c) => ({ selector: { all: true, filters: { q: "sol" }, excludedIds: [c.solRingFoil] } }), { label: "filtered" })
  await run("BulkDeleteCollectionItems", { selector: {} }, { label: "empty selector" })
  await run("DeleteLocation", (c) => ({ id: c.temp }))
  await run("DeleteLocation", (c) => ({ id: c.temp }), { label: "again" })
  await run("DeleteDeck", (c) => ({ id: c.scratch }))
  await run("DeleteDeck", (c) => ({ id: c.scratch }), { label: "again" })
  await run("DeleteDeckTag", (c) => ({ id: c.tagRemoval }))
  await run("Deck", (c) => ({ id: c.cmdr, deckCardsAfter: null }), { label: "final" })
  await run("Deck", (c) => ({ id: c.krenko, deckCardsAfter: null }), { label: "krenko final" })
  await run("Decks", { after: null }, { label: "final" })
  await run("Collection", {}, { label: "final" })
  await run("CollectionValueDashboard", {}, { label: "final" })
  await run("CollectionItemGroupsPage", { filters: {}, sort: null, first: 200, after: null }, { label: "final" })
  await run("CollectionExportCsv", { filters: {} }, { label: "final" })
  await run("CollectionExportText", { filters: {} }, { label: "final" })
  await run("Home", {}, { label: "final" })

  // ---------------------------------------------------------------- ambiguous import rows
  // Last, because Elixir rejects the chosen candidate (see known.mjs) and the
  // collections diverge afterwards.
  await run("PreviewCollectionImport", { input: { text: "4 Lightning Bolt\n1 Delver of Secrets\n1 Not A Real Card", format: "text" } }, {
    label: "ambiguous",
    capture: (c, data) => (c.ambiguousPreview = data.previewCollectionImport?.importPreview),
  })
  await run("PreviewCollectionImportAutoSort", (c) => ({ input: { rows: commitRows(c.ambiguousPreview), autoSort: true } }), { label: "chosen candidates" })
  await run("CommitCollectionImport", (c) => ({ input: { rows: commitRows(c.ambiguousPreview), autoSort: false } }), { label: "chosen candidates", alignSecond: true })

  // ---------------------------------------------------------------- printing tie-breaks
  // Black Lotus has three unpriced printings, so the cheapest/exact buylist
  // printing is decided by the release-date tie-break alone.
  await run("CreateDeck", { input: { name: "Lotus", format: "vintage" } }, { label: "lotus", ...deck("lotus") })
  await run("ImportDecklist", (c) => ({ id: c.lotus, text: "1 Black Lotus\n1 Sol Ring", replaceExisting: false, zone: null }), { label: "lotus" })
  await run("Deck", (c) => ({ id: c.lotus, deckCardsAfter: null }), { label: "lotus" })
  await run("DeckBuylist", (c) => ({ id: c.lotus, printingMode: "cheapest", exportFormat: "text", includeBasicLands: false, assumeNoOwned: true, includeConsidering: false }), { label: "lotus cheapest" })
  await run("CollectionCheck", { url: null, text: "1 Black Lotus", includeConsidering: false }, { label: "lotus" })
  await run("UpdateDeck", (c) => ({ id: c.lotus, input: { status: "archived" } }), { label: "archive lotus" })
  await run("AddDeckCard", (c) => ({ deckId: c.lotus, input: { name: "Time Walk", quantity: 1 } }), { label: "archived deck" })
  await run("ImportDecklist", (c) => ({ id: c.lotus, text: "1 Ancestral Recall", replaceExisting: false, zone: null }), { label: "archived deck" })
  await run("LinkDeckExternalSource", (c) => ({ id: c.lotus, url: "https://moxfield.com/decks/abc123" }), { label: "archived deck" })
}
