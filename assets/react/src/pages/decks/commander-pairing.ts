// Client-side mirror of Manavault.Catalog.CommanderRules: which cards can be
// paired together in a Commander deck's command zone. The backend re-validates
// every pairing; this only decides when to offer "Add as partner" in the UI.

export type CommanderPairingCard = {
  name?: string | null
  typeLine?: string | null
  oracleText?: string | null
}

export function isValidCommanderPair(
  cardA: CommanderPairingCard,
  cardB: CommanderPairingCard,
): boolean {
  return (
    partnerKeywordPair(cardA, cardB) ||
    partnerWithPair(cardA, cardB) ||
    friendsForeverPair(cardA, cardB) ||
    doctorsCompanionPair(cardA, cardB) ||
    backgroundPair(cardA, cardB)
  )
}

function oracleLines(card: CommanderPairingCard): string[] {
  return (card.oracleText || "").split("\n").map((line) => line.trim())
}

function partnerKeywordPair(cardA: CommanderPairingCard, cardB: CommanderPairingCard) {
  const labelA = partnerLabel(cardA)
  const labelB = partnerLabel(cardB)
  return labelA !== null && labelB !== null && labelA.label === labelB.label
}

// Matches the Partner keyword, including restricted variants such as
// "Partner—Survivors" (whose labels must match between the two commanders).
// "Partner with <name>" is a different mechanic and is deliberately not
// matched here.
function partnerLabel(card: CommanderPairingCard): { label: string | null } | null {
  for (const line of oracleLines(card)) {
    const match = line.match(/^Partner(?:\s*[—–-]\s*([^(]+?))?\s*(?:\(|$)/u)
    if (match) return { label: match[1] ? match[1].trim().toLowerCase() : null }
  }
  return null
}

function partnerWithPair(cardA: CommanderPairingCard, cardB: CommanderPairingCard) {
  return partnerWith(cardA, cardB) && partnerWith(cardB, cardA)
}

function partnerWith(card: CommanderPairingCard, otherCard: CommanderPairingCard) {
  const otherName = cardBaseName(otherCard)
  if (!otherName) return false
  const pattern = new RegExp(`^Partner with ${escapeRegExp(otherName)}(?:$|\\s*\\()`, "iu")
  return oracleLines(card).some((line) => pattern.test(line))
}

function friendsForeverPair(cardA: CommanderPairingCard, cardB: CommanderPairingCard) {
  return friendsForever(cardA) && friendsForever(cardB)
}

function friendsForever(card: CommanderPairingCard) {
  return oracleLines(card).some((line) => /^Friends forever(?:$|\s*\()/iu.test(line))
}

function doctorsCompanionPair(cardA: CommanderPairingCard, cardB: CommanderPairingCard) {
  return (doctorsCompanion(cardA) && doctor(cardB)) || (doctorsCompanion(cardB) && doctor(cardA))
}

function doctorsCompanion(card: CommanderPairingCard) {
  return oracleLines(card).some((line) => /^Doctor['’]s companion(?:$|\s*\()/iu.test(line))
}

function doctor(card: CommanderPairingCard) {
  return (card.typeLine || "").includes("Time Lord Doctor")
}

function backgroundPair(cardA: CommanderPairingCard, cardB: CommanderPairingCard) {
  return (
    (choosesBackground(cardA) && background(cardB)) ||
    (choosesBackground(cardB) && background(cardA))
  )
}

function choosesBackground(card: CommanderPairingCard) {
  return oracleLines(card).some((line) => /^Choose a Background(?:$|\s*\()/iu.test(line))
}

function background(card: CommanderPairingCard) {
  return (card.typeLine || "").includes("Background")
}

function cardBaseName(card: CommanderPairingCard): string | null {
  const name = card.name
  if (!name) return null
  return name.split(" // ")[0] ?? null
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
