import test from "node:test"
import assert from "node:assert/strict"

import {
  filterEntries,
  normalizeScanList,
  scanListCsv,
  totalQuantity,
  totalValueCents,
  withPrinting,
} from "../src/pages/scan/scan-list.ts"
import {
  DEFAULT_SCAN_SETTINGS,
  normalizeScanSettings,
  soundForPrice,
} from "../src/pages/scan/scan-settings.ts"
import {
  fetchBundleFile,
  pruneBundleCaches,
  scannerCacheName,
} from "../src/pages/scan/recognition/bundle-cache.ts"

function entry(id, overrides = {}) {
  return {
    id,
    cardKey: id,
    illustrationId: null,
    name: "Lightning Bolt",
    scryfallId: `sf-${id}`,
    setCode: "m10",
    setName: "Magic 2010",
    collectorNumber: "146",
    rarity: "common",
    finish: "nonfoil",
    finishes: ["nonfoil", "foil"],
    language: "en",
    quantity: 1,
    prices: { nonfoil: 150, foil: 900, etched: null },
    imageUrl: null,
    resolved: true,
    scannedAt: 0,
    ...overrides,
  }
}

test("totals use each entry's finish price and quantity", () => {
  const entries = [
    entry("a", { quantity: 2 }),
    entry("b", { finish: "foil" }),
    entry("c", { prices: { nonfoil: null, foil: null, etched: null } }),
  ]
  assert.equal(totalValueCents(entries), 150 * 2 + 900)
  assert.equal(totalQuantity(entries), 4)
})

test("a minimum price leaves cheap cards out of the total, per copy not per stack", () => {
  const entries = [
    // 3 × $0.40 = $1.20 as a stack, but each copy is under the minimum.
    entry("bulk", { quantity: 3, prices: { nonfoil: 40, foil: 500, etched: null } }),
    entry("exactly", { prices: { nonfoil: 100, foil: null, etched: null } }),
    entry("foil", { finish: "foil", prices: { nonfoil: 40, foil: 900, etched: null } }),
    entry("unpriced", { prices: { nonfoil: null, foil: null, etched: null } }),
  ]
  assert.equal(totalValueCents(entries, 100), 100 + 900)
  assert.equal(totalValueCents(entries, 101), 900)
  assert.equal(totalValueCents(entries, 0), 120 + 100 + 900)
  assert.equal(totalValueCents(entries), totalValueCents(entries, 0))
})

test("CSV uses the collection import columns, oldest scan first, with quoting", () => {
  const csv = scanListCsv([
    entry("new", { name: "Borrowing 100,000 Arrows", finish: "foil", quantity: 3, language: "ja" }),
    entry("token", {
      name: "Treasure",
      setCode: "tcmm",
      collectorNumber: "12",
      layout: "token",
      back: { scryfallId: "sf-soldier", name: "Soldier", imageUrl: null },
    }),
    entry("old", { resolved: false }),
  ])
  assert.equal(
    csv,
    [
      "name,set_code,collector_number,quantity,finish,language,scryfall_id,back_scryfall_id",
      "Lightning Bolt,m10,146,1,nonfoil,en,sf-old,",
      "Treasure,tcmm,12,1,nonfoil,en,sf-token,sf-soldier",
      '"Borrowing 100,000 Arrows",m10,146,3,foil,ja,sf-new,',
      "",
    ].join("\n"),
  )
})

test("withPrinting swaps the printing but keeps quantity", () => {
  const updated = withPrinting(
    entry("a", { quantity: 4, resolved: false }),
    {
      scryfallId: "sf-2ed",
      name: "Lightning Bolt",
      setCode: "2ed",
      setName: "Unlimited Edition",
      collectorNumber: "162",
      lang: "en",
      rarity: "common",
      illustrationId: "x",
      ownedCount: 0,
      finishes: ["nonfoil"],
      promo: false,
      releasedAt: "1993-12-01",
      imageUrl: "https://cards.scryfall.io/normal/2ed.jpg",
      backImageUrl: null,
      layout: "normal",
      prices: { nonfoil: 9000, foil: null, etched: null },
    },
    "nonfoil",
  )
  assert.equal(updated.quantity, 4)
  assert.equal(updated.scryfallId, "sf-2ed")
  assert.equal(updated.resolved, true)
  assert.equal(updated.prices.nonfoil, 9000)
  assert.equal(updated.layout, "normal")
})

test("withPrinting keeps a token's picked back only for the same printing", () => {
  const back = { scryfallId: "sf-soldier", name: "Soldier", imageUrl: null }
  const printing = {
    scryfallId: "sf-treasure",
    name: "Treasure",
    setCode: "tcmm",
    setName: "Commander Masters Tokens",
    collectorNumber: "12",
    lang: "en",
    rarity: "common",
    illustrationId: "x",
    ownedCount: 0,
    finishes: ["nonfoil"],
    promo: false,
    releasedAt: "2023-08-04",
    imageUrl: null,
    backImageUrl: null,
    layout: "token",
    prices: { nonfoil: null, foil: null, etched: null },
  }
  const token = entry("t", { scryfallId: "sf-treasure", layout: "token", back })
  assert.deepEqual(withPrinting(token, printing, "nonfoil").back, back)
  assert.equal(
    withPrinting(token, { ...printing, scryfallId: "sf-treasure-other" }, "nonfoil").back,
    undefined,
  )
})

test("search matches name, set and number terms", () => {
  const entries = [
    entry("a"),
    entry("b", { name: "Counterspell", setCode: "7ed", collectorNumber: "67" }),
  ]
  assert.deepEqual(
    filterEntries(entries, "counter 7ed").map((e) => e.id),
    ["b"],
  )
  assert.deepEqual(
    filterEntries(entries, "  ").map((e) => e.id),
    ["a", "b"],
  )
})

test("stored lists and settings are sanitised", () => {
  assert.deepEqual(
    normalizeScanList([entry("ok"), { id: "bad" }, null, entry("zero", { quantity: 0 })]).map(
      (e) => e.id,
    ),
    ["ok"],
  )
  assert.deepEqual(normalizeScanList("nope"), [])
  assert.deepEqual(normalizeScanSettings(null), DEFAULT_SCAN_SETTINGS)
  const settings = normalizeScanSettings({
    lockedSets: ["LEB", " leb ", 3, ""],
    dingThresholdCents: -5,
    preferFoil: true,
  })
  assert.deepEqual(settings.lockedSets, ["leb"])
  assert.equal(settings.dingThresholdCents, 100)
  assert.equal(settings.preferFoil, true)
  // Settings stored before the total minimum existed count every card, as before.
  assert.equal(settings.totalMinCents, 0)
  assert.equal(normalizeScanSettings({ totalMinCents: 99.6 }).totalMinCents, 100)
  assert.equal(normalizeScanSettings({ totalMinCents: -1 }).totalMinCents, 0)
  // Threads: only the offered counts; anything else means "let the runtime pick".
  assert.equal(settings.threads, 0)
  assert.equal(normalizeScanSettings({ threads: 2 }).threads, 2)
  assert.equal(normalizeScanSettings({ threads: 3 }).threads, 0)
  assert.equal(normalizeScanSettings({ threads: "4" }).threads, 0)
  const preview = normalizeScanSettings({ previewZoom: 9, previewPanX: -1, previewPanY: "top" })
  assert.equal(preview.previewZoom, 2.5)
  assert.equal(preview.previewPanX, 0)
  assert.equal(preview.previewPanY, 0.5)
})

test("sounds: click, ding at $1, big ding at $10 by default", () => {
  assert.equal(soundForPrice(null, DEFAULT_SCAN_SETTINGS), "scan")
  assert.equal(soundForPrice(99, DEFAULT_SCAN_SETTINGS), "scan")
  assert.equal(soundForPrice(100, DEFAULT_SCAN_SETTINGS), "ding")
  assert.equal(soundForPrice(1000, DEFAULT_SCAN_SETTINGS), "big-ding")
  assert.equal(soundForPrice(5000, { ...DEFAULT_SCAN_SETTINGS, soundsEnabled: false }), "none")
})

function fakeCaches() {
  const stores = new Map()
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)
      return {
        match: async (url) => store.get(url)?.clone(),
        put: async (url, response) => void store.set(url, response),
        delete: async (url) => store.delete(url),
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  }
}

test("bundle files are downloaded once per version and old versions pruned", async () => {
  const cacheStorage = fakeCaches()
  let requests = 0
  const fetcher = async () => {
    requests += 1
    return new Response(new Uint8Array([1, 2, 3, 4]))
  }
  const progress = []
  const first = await fetchBundleFile("/f/v1/a", {
    version: "v1",
    size: 4,
    cacheStorage,
    fetcher,
    onProgress: (n) => progress.push(n),
  })
  assert.equal(first.cached, false)
  assert.deepEqual([...first.bytes], [1, 2, 3, 4])
  assert.equal(progress.at(-1), 4)

  const second = await fetchBundleFile("/f/v1/a", { version: "v1", size: 4, cacheStorage, fetcher })
  assert.equal(second.cached, true)
  assert.equal(requests, 1)

  await assert.rejects(
    fetchBundleFile("/f/v1/b", { version: "v1", size: 9, cacheStorage, fetcher }),
    /expected 9 bytes/,
  )

  await cacheStorage.open("manavault-pwa-v1")
  await fetchBundleFile("/f/v2/a", { version: "v2", cacheStorage, fetcher })
  await pruneBundleCaches("v2", cacheStorage)
  assert.deepEqual([...cacheStorage.stores.keys()].sort(), [
    "manavault-pwa-v1",
    scannerCacheName("v2"),
  ])
})
