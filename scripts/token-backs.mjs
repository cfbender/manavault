#!/usr/bin/env node
// Regenerates priv/data/token_backs.json: which tokens are printed on the back of which.
//
// Scryfall lists most double-sided precon tokens as separate single-faced
// printings, but Wizards' card image galleries (magic.wizards.com) carry both
// face images per physical token. The galleries read from a public Contentful
// space; grab the bearer token from the `Authorization` header of any
// `cdn.contentful.com` request the gallery page makes, then run against a
// database with a synced catalog:
//
//     WOTC_CONTENTFUL_TOKEN=... node scripts/token-backs.mjs [manavault_dev.db]
//
// Each gallery entry has a front image and (for double-sided tokens) a back
// image. A back is identified by finding the entry whose front is that image,
// then both faces are resolved to Scryfall printings in the local catalog by
// token set code (`t` + set) and collector number, requiring the name to agree
// because the galleries attribute Commander tokens to the main set and the
// commander set interchangeably. Faces with no token printing in the catalog
// (helper cards such as The Monarch, punch-out counters) are dropped.
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

const BASE = "https://cdn.contentful.com/spaces/s5n2t79q9icq/environments/master/entries"
const PAGE = 200
const TOKEN_RARITIES = ["Token", "Emblem", "Helper"]
const TOKEN_LAYOUTS = ["token", "double_faced_token", "emblem"]

const token = process.env.WOTC_CONTENTFUL_TOKEN
if (!token) throw new Error("set WOTC_CONTENTFUL_TOKEN (see the comment at the top of this script)")
const databasePath = resolve(process.argv[2] ?? "manavault_dev.db")

async function fetchAll(filter) {
  const entries = []
  const sets = {}
  let skip = 0
  for (;;) {
    const params = new URLSearchParams({
      ...filter,
      content_type: "magicCard",
      limit: String(PAGE),
      skip: String(skip),
      include: "1",
    })
    const response = await fetch(`${BASE}?${params}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (response.status !== 200) throw new Error(`Contentful returned HTTP ${response.status}`)
    const body = await response.json()
    for (const entry of body.includes?.Entry ?? []) {
      const abbreviation = entry.fields?.abbreviation
      if (abbreviation) sets[entry.sys.id] = abbreviation.toLowerCase()
    }
    entries.push(...body.items)
    process.stderr.write(`${JSON.stringify(filter)} ${skip + body.items.length}/${body.total}\n`)
    skip += body.items.length
    if (skip >= body.total || body.items.length === 0) return { entries, sets }
  }
}

async function fetchEntries() {
  const entries = new Map()
  const sets = {}
  for (const filter of [
    { "fields.rarity": "Token" },
    { "fields.rarity": "Emblem" },
    { "fields.rarity": "Helper" },
    { "fields.back[exists]": "true" },
  ]) {
    const page = await fetchAll(filter)
    for (const entry of page.entries) entries.set(entry.sys.id, entry)
    Object.assign(sets, page.sets)
  }
  return { entries: [...entries.values()], sets }
}

// Candidate set codes in preference order: the subset (e.g. m3c) then the
// product set it was found in (e.g. mh3, where Scryfall files M3C #37+).
function face(fields, sets) {
  const codes = [
    ...new Set(
      [fields.subset, fields.foundInSet].map((ref) => ref && sets[ref.sys.id]).filter(Boolean),
    ),
  ]
  const name = fields.name.split(" // ")[0].trim()
  return { codes, number: fields.collectorNumber, name }
}

// Undirected front/back face pairs.
function pairs(entries, sets) {
  const fields = entries.map((entry) => entry.fields)
  const byFace = new Map()
  for (const field of fields) {
    byFace.set(field.face, [...(byFace.get(field.face) ?? []), field])
  }
  const seen = new Set()
  const result = []
  for (const front of fields) {
    if (!TOKEN_RARITIES.includes(front.rarity)) continue
    if (typeof front.back !== "string" || front.back === front.face) continue
    for (const back of byFace.get(front.back) ?? []) {
      const pair = [face(front, sets), face(back, sets)]
      const key = JSON.stringify(pair)
      if (!seen.has(key)) {
        seen.add(key)
        result.push(pair)
      }
    }
  }
  return result
}

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\btoken\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const db = new DatabaseSync(databasePath, { readOnly: true })
const lookupStatement = db.prepare(
  `SELECT p.scryfall_id, p.set_code, p.collector_number, c.name
   FROM scryfall_printings AS p JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
   WHERE p.set_code = ? AND p.collector_number = ?
     AND c.layout IN (${TOKEN_LAYOUTS.map(() => "?").join(", ")})`,
)

function printing({ codes, number, name }) {
  const wanted = normalize(name)
  for (const code of codes) {
    const found = lookupStatement.all(`t${code}`, number, ...TOKEN_LAYOUTS).find((row) => {
      const got = normalize(row.name)
      return got === wanted || wanted.startsWith(`${got} `)
    })
    if (found) return found
  }
  return null
}

const { entries, sets } = await fetchEntries()
const resolved = []
let dropped = 0
for (const [front, back] of pairs(entries, sets)) {
  const frontPrinting = printing(front)
  const backPrinting = printing(back)
  if (frontPrinting && backPrinting) {
    resolved.push([frontPrinting, backPrinting])
  } else {
    dropped += 1
    process.stderr.write(`dropped: ${JSON.stringify(front)} // ${JSON.stringify(back)}\n`)
  }
}

const key = (row) => `${row.set_code}/${row.collector_number}`
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const unique = new Map()
for (const pair of resolved) {
  const [front, back] = pair.sort((a, b) => compare(key(a), key(b)))
  if (front.scryfall_id === back.scryfall_id) continue
  const id = `${front.scryfall_id}|${back.scryfall_id}`
  if (!unique.has(id)) unique.set(id, [front, back])
}
const output = {
  source:
    "Wizards of the Coast card image galleries (magic.wizards.com), which show both faces of " +
    "double-sided tokens; faces resolved to Scryfall set code/collector number by name. " +
    "Regenerate with scripts/token-backs.mjs. Pairs are undirected.",
  pairs: [...unique.values()]
    .sort(([a1, b1], [a2, b2]) => compare(key(a1), key(a2)) || compare(key(b1), key(b2)))
    .map(([front, back]) => ({
      names: `${front.name} // ${back.name}`,
      front: key(front),
      back: key(back),
    })),
}

const path = resolve("priv/data/token_backs.json")
writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`)
console.log(`wrote ${output.pairs.length} pairs (${dropped} unresolved faces dropped) to ${path}`)
