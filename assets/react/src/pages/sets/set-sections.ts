// A set's printings split into treatment sections, the way Scryfall's set
// pages split them: the main set, then Borderless, Extended Art, Fracture Foil
// Japan Showcase, and so on, then promos. Scryfall curates its section names
// by hand; these are named from each printing's frame, border, and promo
// types, so they read "Borderless Showcase" where Scryfall might say
// "Viewport Lands".

export type SetPrintingTraits = {
  collectorNumber?: string | null
  promo?: boolean | null
  promoTypes?: readonly (string | null)[] | null
  frameEffects?: readonly string[] | null
  borderColor?: string | null
  fullArt?: boolean | null
  finishes?: readonly (string | null)[] | null
  card?: { typeLine?: string | null } | null
}

export type SetSection<P> = {
  key: string
  label: string
  printings: P[]
}

export const MAIN_SECTION_LABEL = "Main set"
export const PROMO_SECTION_LABEL = "Promos"

// Ordered: the first one a printing has names its foil. Any other promo type
// ending in "foil" is named from its prefix.
const FOIL_TREATMENTS: [string, string][] = [
  ["serialized", "Serialized"],
  ["fracturefoil", "Fracture Foil"],
  ["galaxyfoil", "Galaxy Foil"],
  ["surgefoil", "Surge Foil"],
  ["textured", "Textured Foil"],
  ["halofoil", "Halo Foil"],
  ["confettifoil", "Confetti Foil"],
  ["oilslick", "Oil Slick"],
  ["gilded", "Gilded Foil"],
  ["neonink", "Neon Ink"],
  ["stepandcompleat", "Step-and-Compleat Foil"],
  ["doublerainbow", "Double Rainbow"],
  ["ripplefoil", "Ripple Foil"],
  ["raisedfoil", "Raised Foil"],
  ["rainbowfoil", "Rainbow Foil"],
  ["silverfoil", "Silver Foil"],
  ["manafoil", "Mana Foil"],
  ["cosmicfoil", "Cosmic Foil"],
  ["singularityfoil", "Singularity Foil"],
  ["dragonscalefoil", "Dragon Scale Foil"],
  ["invisibleink", "Invisible Ink"],
  ["embossed", "Embossed Foil"],
]

function words(values: readonly (string | null)[] | null | undefined) {
  return new Set((values ?? []).filter((value): value is string => Boolean(value)))
}

function foilLabel(promoTypes: Set<string>) {
  for (const [type, label] of FOIL_TREATMENTS) {
    if (promoTypes.has(type)) return label
  }
  for (const type of promoTypes) {
    const match = /^([a-z]+)foil$/.exec(type)
    if (match) return `${match[1][0].toUpperCase()}${match[1].slice(1)} Foil`
  }
  return null
}

/** The section a printing belongs to, such as "Borderless Extended Art". */
export function treatmentLabel(printing: SetPrintingTraits) {
  const promoTypes = words(printing.promoTypes)
  const frameEffects = words(printing.frameEffects)
  const finishes = words(printing.finishes)
  if (printing.promo) return PROMO_SECTION_LABEL

  const basicLand = /\bBasic\b.*\bLand\b/.test(printing.card?.typeLine ?? "")
  const etchedOnly = finishes.size > 0 && [...finishes].every((finish) => finish === "etched")
  const frame = promoTypes.has("japanshowcase")
    ? "Japan Showcase"
    : frameEffects.has("showcase")
      ? "Showcase"
      : frameEffects.has("extendedart")
        ? "Extended Art"
        : printing.fullArt && !basicLand
          ? "Full Art"
          : null
  const parts = [
    foilLabel(promoTypes) ?? (etchedOnly || frameEffects.has("etched") ? "Foil Etched" : null),
    printing.borderColor === "borderless" ? "Borderless" : null,
    frame,
  ].filter((part): part is string => Boolean(part))

  if (!parts.length) return MAIN_SECTION_LABEL
  return basicLand ? `${parts.join(" ")} Basic Lands` : parts.join(" ")
}

/** Orders collector numbers as a set lists them: 2, 2a, 10, 300, ★1. */
export function compareCollectorNumbers(a?: string | null, b?: string | null) {
  const left = /^(\d+)(.*)$/.exec(a ?? "")
  const right = /^(\d+)(.*)$/.exec(b ?? "")
  if (left && right) {
    return Number(left[1]) - Number(right[1]) || left[2].localeCompare(right[2])
  }
  if (left || right) return left ? -1 : 1
  return (a ?? "").localeCompare(b ?? "")
}

/**
 * Splits printings into treatment sections in the order the set numbers them
 * (each section where its lowest collector number falls, promos last). The
 * printings keep their given order within a section, so a sort still applies.
 * Ungrouped, everything is one "All cards" section.
 */
export function setSections<P extends SetPrintingTraits>(
  printings: readonly P[],
  grouped = true,
): SetSection<P>[] {
  if (!printings.length) return []
  if (!grouped) return [{ key: "all", label: "All cards", printings: [...printings] }]

  const sections = new Map<string, SetSection<P> & { first: string | null | undefined }>()
  for (const printing of printings) {
    const label = treatmentLabel(printing)
    const section = sections.get(label)
    if (!section) {
      sections.set(label, {
        key: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
        label,
        printings: [printing],
        first: printing.collectorNumber,
      })
      continue
    }
    section.printings.push(printing)
    if (compareCollectorNumbers(printing.collectorNumber, section.first) < 0) {
      section.first = printing.collectorNumber
    }
  }

  return [...sections.values()]
    .sort(
      (a, b) =>
        Number(a.label === PROMO_SECTION_LABEL) - Number(b.label === PROMO_SECTION_LABEL) ||
        compareCollectorNumbers(a.first, b.first),
    )
    .map(({ key, label, printings }) => ({ key, label, printings }))
}
