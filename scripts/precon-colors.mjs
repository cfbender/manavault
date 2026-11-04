#!/usr/bin/env node
// Regenerates priv/data/precon_colors.json: each MTGJSON Commander precon's
// color identity, the union of its commanders' identities.
//
// MTGJSON's DeckList.json has no colors, and a deck file is a few hundred
// kilobytes, so the server ships this snapshot and only fetches the deck
// files of precons released after it was made. Run it when new precons come
// out:
//
//     mise exec -- node scripts/precon-colors.mjs
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

const API = "https://mtgjson.com/api/v5"
const WUBRG = ["W", "U", "B", "R", "G"]
const CONCURRENCY = 8
const output = resolve(import.meta.dirname, "../priv/data/precon_colors.json")

async function data(path) {
  const response = await fetch(`${API}/${path}`)
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()).data
}

const precons = (await data("DeckList.json")).filter((deck) => deck.type === "Commander Deck")
const decks = {}
let next = 0
async function worker() {
  while (next < precons.length) {
    const { fileName } = precons[next++]
    const deck = await data(`decks/${fileName}.json`)
    // A precon without a listed commander has no identity to show.
    if (!deck.commander?.length) continue
    const colors = new Set(deck.commander.flatMap((card) => card.colorIdentity ?? []))
    const identity = WUBRG.filter((color) => colors.has(color))
    decks[fileName] = identity.length ? identity : ["C"]
    process.stderr.write(`${Object.keys(decks).length}/${precons.length} ${fileName}\n`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const source =
  "MTGJSON deck files (mtgjson.com/api/v5/decks), Commander precons only: the union of each deck's commanders' color identities in WUBRG order, C when colorless. Regenerate with scripts/precon-colors.mjs."
// One precon per line, as the formatter (`vp fmt`) lays it out.
const lines = Object.entries(decks)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([fileName, colors]) =>
      `    ${JSON.stringify(fileName)}: ${JSON.stringify(colors).replaceAll(",", ", ")}`,
  )
writeFileSync(
  output,
  `{\n  "source": ${JSON.stringify(source)},\n  "decks": {\n${lines.join(",\n")}\n  }\n}\n`,
)
process.stderr.write(`wrote ${lines.length} precons to ${output}\n`)
