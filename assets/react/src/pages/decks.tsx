import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Box, ChevronDown, Circle, Crown, Droplets, Eye, Gem, Hash, Layers, MoreVertical, MoveRight, Palette, PawPrint, Plus, Star, WandSparkles, Zap } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react"
import { PageHeader, PageSection } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { ImageSummaryCard } from "../components/image-summary-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import type { DeckQuery, DecksQuery } from "../gql/graphql"
import { request } from "../lib/graphql"
import { cn, compactNumber, present, titleize } from "../lib/utils"

const DecksDocument = graphql(`
  query Decks {
    decks {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        preferredPrinting { imageUrl artCropUrl }
        card { printings { imageUrl artCropUrl } }
      }
    }
  }
`)

const CreateDeckDocument = graphql(`
  mutation CreateDeck($input: DeckInput!) {
    createDeck(input: $input) {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        preferredPrinting { imageUrl artCropUrl }
        card { printings { imageUrl artCropUrl } }
      }
    }
  }
`)

const DeckDocument = graphql(`
  query Deck($id: ID!) {
    deck(id: $id) {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        id
        quantity
        zone
        finish
        card {
          oracleId
          name
          typeLine
          cmc
          colors
          colorIdentity
          printings { imageUrl artCropUrl setCode setName collectorNumber rarity }
        }
        preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }
      }
    }
  }
`)

const UpdateDeckCardDocument = graphql(`
  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
    updateDeckCard(id: $id, input: $input) {
      id
      quantity
      zone
      finish
      card { oracleId name typeLine }
      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }
    }
  }
`)

const SetDeckCommanderDocument = graphql(`
  mutation SetDeckCommander($id: ID!) {
    setDeckCommander(id: $id) {
      id
      quantity
      zone
      finish
      card { oracleId name typeLine }
      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }
    }
  }
`)

export function DecksPage() {
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ["decks"], queryFn: () => request(DecksDocument) })
  const deckGroups = groupDecksByFormat(data?.decks || [])

  return (
    <>
      <PageHeader
        title="Decks"
        eyebrow="ManaVault Decks"
        description="Build lists by card identity, then choose exact printings when that matters."
        actions={
          <Button type="button" onClick={() => setIsNewDeckOpen(true)}>
            <Plus className="h-4 w-4" />
            New deck
          </Button>
        }
      />
      {isLoading ? (
        <EmptyState title="Loading decks..." />
      ) : deckGroups.length ? (
        <PageSection count={`${data?.decks?.length || 0} total`}>
          <div className="space-y-10">
            {deckGroups.map(([format, decks]) => (
              <section key={format} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-black tracking-normal">{titleize(format)}</h3>
                  <span className="badge border-transparent bg-base-200 text-sm">{decks.length}</span>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  {decks.map(deck => (
                    <Link key={deck.id} to="/decks/$id" params={{ id: deck.id }} className="block">
                      <ImageSummaryCard
                        imageUrl={deckCoverUrl(deck)}
                        fallback={<Layers className="h-12 w-12" />}
                        typeLine={<Badge>{titleize(deck.format)}</Badge>}
                        countLine={`${compactNumber(deck.cardCount || 0)} cards`}
                        detailLine={
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={deck.status === "active" ? "success" : "neutral"}>{titleize(deck.status)}</Badge>
                            <span>{compactNumber(deck.uniqueCardCount || 0)} unique</span>
                          </div>
                        }
                        nameLine={deck.name}
                      />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </PageSection>
      ) : (
        <EmptyState title="No decks yet" />
      )}
      <NewDeckDialog open={isNewDeckOpen} onOpenChange={setIsNewDeckOpen} />
    </>
  )
}

export function DeckDetailPage({ id }: { id: string }) {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>("type")
  const [moveTarget, setMoveTarget] = useState<DeckCardEntry | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["deck", id], queryFn: () => request(DeckDocument, { id }) })
  const deck = data?.deck
  const deckCards = useMemo(() => (deck?.deckCards || []).filter(present), [deck?.deckCards])
  const stackDeckCards = useMemo(() => deckCards.filter(deckCard => deckCard.zone !== "sideboard" && deckCard.zone !== "maybeboard"), [deckCards])
  const sideboardCards = useMemo(() => deckCards.filter(deckCard => deckCard.zone === "sideboard").sort(compareDeckCards), [deckCards])
  const maybeboardCards = useMemo(() => deckCards.filter(deckCard => deckCard.zone === "maybeboard").sort(compareDeckCards), [deckCards])
  const groupedCards = useMemo(() => groupDeckCards(stackDeckCards, groupBy), [stackDeckCards, groupBy])
  const zoneCounts = useMemo(() => countDeckZones(deckCards), [deckCards])

  const updateDeckCard = useMutation({
    mutationFn: ({ deckCardId, zone }: { deckCardId: string; zone: DeckZone }) => request(UpdateDeckCardDocument, { id: deckCardId, input: { zone } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setMoveTarget(null)
      setMoveError(null)
    },
    onError: error => setMoveError(error instanceof Error ? error.message : "Could not update deck card"),
  })

  const setDeckCommander = useMutation({
    mutationFn: (deckCardId: string) => request(SetDeckCommanderDocument, { id: deckCardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setMoveError(null)
    },
    onError: error => setMoveError(error instanceof Error ? error.message : "Could not set commander"),
  })
  const isUpdatingDeckCard = updateDeckCard.isPending || setDeckCommander.isPending

  if (isLoading) return <EmptyState title="Loading deck..." />
  if (!deck) return <EmptyState title="Deck not found" />

  function moveDeckCard(deckCard: DeckCardEntry, zone: DeckZone) {
    updateDeckCard.mutate({ deckCardId: deckCard.id, zone })
  }

  return (
    <>
      <div className="space-y-7">
        <Button asChild variant="outline" size="sm">
          <Link to="/decks">Back to decks</Link>
        </Button>

        <ImageSummaryCard
          imageUrl={deckDetailCoverUrl(deckCards)}
          fallback={<Layers className="h-12 w-12" />}
          interactive={false}
          typeLine={<Badge>{titleize(deck.format)}</Badge>}
          countLine={`${compactNumber(deck.cardCount || 0)} cards`}
          detailLine={
            <div className="flex flex-wrap items-center gap-2 text-base">
              <Badge tone={deck.status === "active" ? "success" : "neutral"}>{titleize(deck.status)}</Badge>
              <span>{compactNumber(deck.uniqueCardCount || 0)} unique</span>
            </div>
          }
          nameLine={deck.name}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-4">
          <div className="flex flex-wrap gap-2">
            {(["commander", "mainboard", "sideboard", "maybeboard"] as DeckZone[]).map(zone => (
              <Badge key={zone} tone={zone === "commander" ? "primary" : "neutral"} className="h-7 px-3 text-xs">
                {titleize(zone)} {zoneCounts[zone] || 0}
              </Badge>
            ))}
          </div>
          <DeckGroupMenu value={groupBy} onChange={setGroupBy} />
        </div>

        {groupedCards.length ? (
          <DeckGroupGrid
            canSetCommander={deck.format === "commander"}
            groups={groupedCards}
            isUpdating={isUpdatingDeckCard}
            onMove={deckCard => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
            onSetCommander={deckCard => setDeckCommander.mutate(deckCard.id)}
          />
        ) : (
          <EmptyState title="No cards in this deck" />
        )}

        <div className="space-y-3">
          <DeckZoneTable
            cards={sideboardCards}
            isUpdating={isUpdatingDeckCard}
            title="Sideboard"
            onMove={deckCard => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
          />
          <DeckZoneTable
            cards={maybeboardCards}
            isUpdating={isUpdatingDeckCard}
            title="Maybeboard"
            onMove={deckCard => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
          />
        </div>
      </div>

      <MoveDeckCardDialog
        deckCard={moveTarget}
        error={moveError}
        isPending={isUpdatingDeckCard}
        onClose={() => {
          if (!updateDeckCard.isPending) {
            setMoveError(null)
            setMoveTarget(null)
          }
        }}
        onMove={zone => {
          if (moveTarget) moveDeckCard(moveTarget, zone)
        }}
        zoneCounts={zoneCounts}
      />
    </>
  )
}

type DeckSummary = DecksQuery["decks"][number]
type DeckDetail = NonNullable<DeckQuery["deck"]>
type DeckCardEntry = NonNullable<NonNullable<DeckDetail["deckCards"]>[number]>
type DeckZone = "mainboard" | "sideboard" | "commander" | "maybeboard"
type DeckGroupBy = "type" | "color" | "colorIdentity" | "manaValue" | "rarity" | "set" | "none"
type DeckGroup = {
  cards: DeckCardEntry[]
  icon: DeckGroupIcon
  key: string
  label: string
  order: number
  quantity: number
}
type DeckGroupIcon = "commander" | "creature" | "instant" | "sorcery" | "artifact" | "enchantment" | "planeswalker" | "land" | "color" | "mana" | "rarity" | "set" | "none"

const DECK_GROUP_OPTIONS: Array<{ label: string; value: DeckGroupBy }> = [
  { label: "Type", value: "type" },
  { label: "Color", value: "color" },
  { label: "Color Identity", value: "colorIdentity" },
  { label: "Mana Value", value: "manaValue" },
  { label: "Rarity", value: "rarity" },
  { label: "Set", value: "set" },
  { label: "None", value: "none" },
]
const DECK_FORMATS = ["commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper", "limited", "casual"] as const
const DECK_STATUSES = ["brewing", "active", "archived"] as const
const MOVE_TARGET_ZONES: DeckZone[] = ["mainboard", "sideboard", "maybeboard"]
const TYPE_ORDER = ["commander", "creature", "instant", "sorcery", "artifact", "enchantment", "planeswalker", "battle", "land", "other"]
const COLOR_ORDER = ["W", "U", "B", "R", "G", "M", "C"]
const DECK_STACK_COLUMN_WIDTH_REM = 14
const DECK_STACK_OFFSET = 34
const DECK_STACK_CARD_HEIGHT = 314
const DECK_STACK_REVEAL_OFFSET = DECK_STACK_CARD_HEIGHT - DECK_STACK_OFFSET

function groupDecksByFormat(decks: DeckSummary[]) {
  const grouped = new Map<string, DeckSummary[]>()
  for (const deck of decks) {
    const group = grouped.get(deck.format) || []
    group.push(deck)
    grouped.set(deck.format, group)
  }

  return [...grouped.entries()].sort(([left], [right]) => formatSortValue(left) - formatSortValue(right) || left.localeCompare(right))
}

function formatSortValue(format: string) {
  const index = DECK_FORMATS.indexOf(format as (typeof DECK_FORMATS)[number])
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function deckCoverUrl(deck: DeckSummary) {
  const cover = deck.deckCards?.find(card => card?.preferredPrinting?.artCropUrl || card?.preferredPrinting?.imageUrl || card?.card?.printings?.[0]?.artCropUrl || card?.card?.printings?.[0]?.imageUrl)
  return cover?.preferredPrinting?.artCropUrl || cover?.preferredPrinting?.imageUrl || cover?.card?.printings?.[0]?.artCropUrl || cover?.card?.printings?.[0]?.imageUrl
}

function countDeckZones(deckCards: DeckCardEntry[]) {
  return deckCards.reduce<Record<DeckZone, number>>(
    (counts, deckCard) => {
      counts[deckCard.zone as DeckZone] = (counts[deckCard.zone as DeckZone] || 0) + deckCard.quantity
      return counts
    },
    { commander: 0, mainboard: 0, maybeboard: 0, sideboard: 0 }
  )
}

function groupDeckCards(deckCards: DeckCardEntry[], groupBy: DeckGroupBy) {
  const groups = new Map<string, DeckGroup>()

  for (const deckCard of deckCards) {
    const descriptor = deckCardGroupDescriptor(deckCard, groupBy)
    const existing =
      groups.get(descriptor.key) ||
      ({
        cards: [],
        icon: descriptor.icon,
        key: descriptor.key,
        label: descriptor.label,
        order: descriptor.order,
        quantity: 0,
      } satisfies DeckGroup)

    existing.cards.push(deckCard)
    existing.quantity += deckCard.quantity
    groups.set(descriptor.key, existing)
  }

  return [...groups.values()]
    .map(group => ({ ...group, cards: group.cards.sort(compareDeckCards) }))
    .sort((left, right) => compareDeckGroups(left, right, groupBy))
}

function compareDeckGroups(left: DeckGroup, right: DeckGroup, groupBy: DeckGroupBy) {
  if (groupBy === "type") {
    if (left.key === "commander" && right.key !== "commander") return -1
    if (right.key === "commander" && left.key !== "commander") return 1

    return left.label.localeCompare(right.label)
  }

  return left.order - right.order || left.label.localeCompare(right.label)
}

function deckCardGroupDescriptor(deckCard: DeckCardEntry, groupBy: DeckGroupBy): Omit<DeckGroup, "cards" | "quantity"> {
  const card = deckCard.card
  const printing = deckCard.preferredPrinting || card?.printings?.[0]

  if (groupBy === "none") return { icon: "none", key: "all", label: "Deck", order: 0 }

  if (groupBy === "color") {
    const colors = (card?.colors || []).filter(present)
    const key = colors.length === 0 ? "C" : colors.length > 1 ? "M" : colors[0] || "C"
    return { icon: "color", key, label: colorLabel(key), order: colorOrder(key) }
  }

  if (groupBy === "colorIdentity") {
    const identity = (card?.colorIdentity || []).filter(present).sort((left, right) => colorOrder(left) - colorOrder(right))
    const key = identity.length ? identity.join("") : "C"
    return { icon: "color", key, label: key === "C" ? "Colorless" : `${key} Identity`, order: identity.length ? identity.reduce((sum, color) => sum + colorOrder(color), 0) : 99 }
  }

  if (groupBy === "manaValue") {
    const cmc = Math.floor(card?.cmc || 0)
    const key = cmc >= 6 ? "6+" : String(cmc)
    return { icon: "mana", key, label: `Mana ${key}`, order: cmc >= 6 ? 6 : cmc }
  }

  if (groupBy === "rarity") {
    const rarity = printing?.rarity || "unknown"
    return { icon: "rarity", key: rarity, label: titleize(rarity), order: rarityOrder(rarity) }
  }

  if (groupBy === "set") {
    const key = printing?.setCode || "unknown"
    return { icon: "set", key, label: printing?.setName || key.toUpperCase(), order: 0 }
  }

  return typeDescriptor(deckCard)
}

function typeDescriptor(deckCard: DeckCardEntry): Omit<DeckGroup, "cards" | "quantity"> {
  const typeLine = deckCard.card?.typeLine || ""

  if (deckCard.zone === "commander") return typeGroup("commander", "Commander", "commander")
  if (/\bCreature\b/.test(typeLine)) return typeGroup("creature", "Creatures", "creature")
  if (/\bInstant\b/.test(typeLine)) return typeGroup("instant", "Instants", "instant")
  if (/\bSorcery\b/.test(typeLine)) return typeGroup("sorcery", "Sorceries", "sorcery")
  if (/\bArtifact\b/.test(typeLine)) return typeGroup("artifact", "Artifacts", "artifact")
  if (/\bEnchantment\b/.test(typeLine)) return typeGroup("enchantment", "Enchantments", "enchantment")
  if (/\bPlaneswalker\b/.test(typeLine)) return typeGroup("planeswalker", "Planeswalkers", "planeswalker")
  if (/\bLand\b/.test(typeLine)) return typeGroup("land", "Lands", "land")

  return typeGroup("other", "Other", "none")
}

function isLegendaryCreature(deckCard: DeckCardEntry) {
  const typeLine = deckCard.card?.typeLine || ""
  return typeLine.includes("Legendary") && typeLine.includes("Creature")
}

function typeGroup(key: string, label: string, icon: DeckGroupIcon) {
  return { icon, key, label, order: TYPE_ORDER.indexOf(key) === -1 ? 99 : TYPE_ORDER.indexOf(key) }
}

function compareDeckCards(left: DeckCardEntry, right: DeckCardEntry) {
  return (left.card?.name || "").localeCompare(right.card?.name || "") || left.id.localeCompare(right.id)
}

function cardImageUrl(deckCard: DeckCardEntry, key: "artCropUrl" | "imageUrl") {
  const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]
  return printing?.[key] || null
}

function colorOrder(color: string) {
  const index = COLOR_ORDER.indexOf(color)
  return index === -1 ? 99 : index
}

function colorLabel(color: string) {
  const labels: Record<string, string> = { B: "Black", C: "Colorless", G: "Green", M: "Multicolor", R: "Red", U: "Blue", W: "White" }
  return labels[color] || color
}

function rarityOrder(rarity: string) {
  const order = ["common", "uncommon", "rare", "mythic", "special", "bonus"]
  const index = order.indexOf(String(rarity).toLowerCase())
  return index === -1 ? 99 : index
}

function GroupIcon({ icon }: { icon: DeckGroupIcon }) {
  const className = "h-4 w-4 shrink-0 text-warning"

  if (icon === "commander") return <Crown className={className} />
  if (icon === "creature") return <PawPrint className={className} />
  if (icon === "instant") return <Zap className={className} />
  if (icon === "sorcery") return <WandSparkles className={className} />
  if (icon === "artifact") return <Gem className={className} />
  if (icon === "enchantment") return <SparkleIcon className={className} />
  if (icon === "planeswalker") return <Palette className={className} />
  if (icon === "land") return <Droplets className={className} />
  if (icon === "color") return <Palette className={className} />
  if (icon === "mana") return <Hash className={className} />
  if (icon === "rarity") return <Star className={className} />
  if (icon === "set") return <Box className={className} />

  return <Layers className={className} />
}

function ZoneIcon({ zone }: { zone: DeckZone }) {
  const className = "h-6 w-6 shrink-0 text-base-content/80"

  if (zone === "mainboard") return <Layers className={className} />
  if (zone === "sideboard") return <Box className={className} />
  if (zone === "maybeboard") return <Circle className={className} />

  return <Crown className={className} />
}

function SparkleIcon({ className }: { className?: string }) {
  return <Star className={className} />
}

function deckDetailCoverUrl(deckCards: DeckCardEntry[]) {
  const cover = deckCards.find(deckCard => cardImageUrl(deckCard, "artCropUrl") || cardImageUrl(deckCard, "imageUrl"))
  return cover ? cardImageUrl(cover, "artCropUrl") || cardImageUrl(cover, "imageUrl") : null
}

function DeckGroupMenu({ onChange, value }: { onChange: (value: DeckGroupBy) => void; value: DeckGroupBy }) {
  const active = DECK_GROUP_OPTIONS.find(option => option.value === value) || DECK_GROUP_OPTIONS[0]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open])

  return (
    <div ref={ref} className="dropdown dropdown-end">
      <button type="button" className="btn btn-outline min-w-44 justify-between gap-2" onClick={() => setOpen(current => !current)}>
        <span className="flex items-center gap-2">
          <Hash className="h-4 w-4" />
          Group
        </span>
        <span className="badge badge-ghost text-[0.65rem]">{active.label}</span>
      </button>
      {open ? (
        <div className="dropdown-content z-50 mt-2 w-64 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl">
          <div className="grid gap-1">
            {DECK_GROUP_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={[
                  "flex items-center gap-3 rounded-btn px-3 py-2 text-left text-sm transition-colors",
                  value === option.value ? "bg-primary/15 text-primary" : "text-base-content/75 hover:bg-base-200",
                ].join(" ")}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span className={value === option.value ? "h-4 w-4 rounded-full border-4 border-primary" : "h-4 w-4 rounded-full border-2 border-base-content/25"} />
                <span className="font-semibold">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DeckGroupGrid({
  canSetCommander,
  groups,
  isUpdating,
  onMove,
  onSetCommander,
}: {
  canSetCommander: boolean
  groups: DeckGroup[]
  isUpdating: boolean
  onMove: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(() => deckGroupColumnCount(typeof window === "undefined" ? 0 : window.innerWidth))
  const columns = useMemo(() => distributeDeckGroups(groups, columnCount), [columnCount, groups])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const updateColumnCount = () => {
      setColumnCount(deckGroupColumnCount(element.getBoundingClientRect().width))
    }

    updateColumnCount()

    const observer = new ResizeObserver(updateColumnCount)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="grid gap-x-6"
      style={{
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, ${DECK_STACK_COLUMN_WIDTH_REM}rem))`,
        justifyContent: columnCount === 1 ? "center" : "space-between",
      }}
    >
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="min-w-0 space-y-5">
          {column.map(group => (
            <DeckStackGroup
              key={group.key}
              canSetCommander={canSetCommander}
              group={group}
              isUpdating={isUpdating}
              onMove={onMove}
              onSetCommander={onSetCommander}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function deckGroupColumnCount(width: number) {
  if (width >= 1536) return 6
  if (width >= 1280) return 4
  if (width >= 1024) return 3
  if (width >= 640) return 2
  return 1
}

function deckStackIndexFromPointer(pointerY: number, activeIndex: number | null, cardCount: number) {
  if (cardCount <= 0) return null

  const lastIndex = cardCount - 1
  const stackHeight = DECK_STACK_CARD_HEIGHT + lastIndex * DECK_STACK_OFFSET
  const y = Math.max(0, Math.min(pointerY, stackHeight - 1))

  if (activeIndex != null) {
    const activeTop = activeIndex * DECK_STACK_OFFSET
    const activeBottom = activeTop + DECK_STACK_CARD_HEIGHT

    if (y >= activeTop && y < activeBottom) return activeIndex
    if (y >= activeBottom) {
      return Math.min(lastIndex, activeIndex + 1 + Math.floor((y - activeBottom) / DECK_STACK_OFFSET))
    }
  }

  return Math.min(lastIndex, Math.floor(y / DECK_STACK_OFFSET))
}

function distributeDeckGroups(groups: DeckGroup[], columnCount: number) {
  const columns = Array.from({ length: Math.max(columnCount, 1) }, () => [] as DeckGroup[])

  for (const [index, group] of groups.entries()) {
    columns[index % columns.length].push(group)
  }

  return columns
}

function DeckStackGroup({
  canSetCommander,
  group,
  isUpdating,
  onMove,
  onSetCommander,
}: {
  canSetCommander: boolean
  group: DeckGroup
  isUpdating: boolean
  onMove: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)
  const activeIndex = hoveredIndex ?? pinnedIndex
  const revealOffset = group.cards.length > 1 ? DECK_STACK_REVEAL_OFFSET : 0

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return

    const bounds = event.currentTarget.getBoundingClientRect()
    const nextIndex = deckStackIndexFromPointer(event.clientY - bounds.top, activeIndex, group.cards.length)
    setPinnedIndex(null)
    setHoveredIndex(nextIndex)
  }

  return (
    <section className="mb-5 inline-block w-full break-inside-avoid space-y-3">
      <div className="flex items-center gap-2 text-sm font-black tracking-normal">
        <GroupIcon icon={group.icon} />
        <h3 className="truncate">{group.label}</h3>
        <span className="text-base-content/55">({group.quantity})</span>
      </div>

      <div
        className="relative w-56 overflow-hidden"
        style={{ minHeight: `${DECK_STACK_CARD_HEIGHT + Math.max(group.cards.length - 1, 0) * DECK_STACK_OFFSET}px` }}
        onPointerLeave={event => {
          if (event.pointerType !== "touch") setHoveredIndex(null)
        }}
        onPointerMove={handlePointerMove}
      >
        {group.cards.map((deckCard, index) => (
          <DeckStackCard
            key={deckCard.id}
            canSetCommander={canSetCommander && deckCard.zone !== "commander" && isLegendaryCreature(deckCard)}
            deckCard={deckCard}
            index={index}
            isActive={activeIndex === index}
            isUpdating={isUpdating}
            onExpand={() => {
              setHoveredIndex(null)
              setPinnedIndex(index)
            }}
            onMove={() => onMove(deckCard)}
            onSetCommander={() => onSetCommander(deckCard)}
            slideOffset={activeIndex != null && index > activeIndex ? revealOffset : 0}
            top={index * DECK_STACK_OFFSET}
          />
        ))}
      </div>
    </section>
  )
}

function DeckStackCard({
  canSetCommander,
  deckCard,
  index,
  isActive,
  isUpdating,
  onExpand,
  onMove,
  onSetCommander,
  slideOffset,
  top,
}: {
  canSetCommander: boolean
  deckCard: DeckCardEntry
  index: number
  isActive: boolean
  isUpdating: boolean
  onExpand: () => void
  onMove: () => void
  onSetCommander: () => void
  slideOffset: number
  top: number
}) {
  const imageUrl = cardImageUrl(deckCard, "imageUrl")
  const name = deckCard.card?.name || "Unknown card"
  const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]

  return (
    <article
      className={cn(
        "group/deck-card absolute left-0 w-56 origin-top rounded-xl transition-transform duration-200 ease-out focus-within:z-[90]",
        isActive && "z-[90]",
      )}
      style={{
        top,
        transform: slideOffset ? `translateY(${slideOffset}px)` : undefined,
        zIndex: isActive ? 90 : index + 1,
      }}
    >
      <div
        className={cn(
          "dropdown absolute left-2 top-2 z-[120] transition-opacity group-focus-within/deck-card:opacity-100",
          isActive ? "opacity-100" : "opacity-0",
        )}
        onClick={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
          tabIndex={0}
          aria-label={`${name} actions`}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        <ul tabIndex={0} className="menu dropdown-content z-[120] mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl">
          <li>
            <Link to="/cards/$id" params={{ id: deckCard.card?.oracleId || "" }}>
              <Eye className="h-4 w-4" />
              View card
            </Link>
          </li>
          <li>
            <button type="button" disabled>
              <Palette className="h-4 w-4" />
              Change printing
            </button>
          </li>
          <li>
            <button type="button" disabled={isUpdating} onClick={onMove}>
              <MoveRight className="h-4 w-4" />
              Move
            </button>
          </li>
          {canSetCommander ? (
            <li>
              <button type="button" disabled={isUpdating} onClick={onSetCommander}>
                <Crown className="h-4 w-4" />
                Set as commander
              </button>
            </li>
          ) : null}
        </ul>
      </div>

      <button type="button" className="block w-full cursor-pointer text-left" onClick={onExpand}>
        <figure
          className={cn(
            "relative aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-xl ring-1 ring-white/10 transition duration-200",
            isActive && "shadow-2xl ring-primary/45",
          )}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-5 text-center text-sm text-base-content/50">No image</div>
          )}

          {deckCard.quantity > 1 ? (
            <span className="absolute right-0 top-0 z-20 rounded-bl-xl bg-primary px-2.5 py-1.5 text-sm font-black leading-none text-primary-content shadow-lg">
              {deckCard.quantity}
            </span>
          ) : null}

          <figcaption
            className={cn(
              "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-12 text-white transition duration-200 group-focus-within/deck-card:opacity-100",
              isActive ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="line-clamp-2 text-sm font-black leading-tight">{name}</div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-white/75">
              <span className="truncate">{printing?.setName || printing?.setCode?.toUpperCase() || titleize(deckCard.zone)}</span>
              <span>#{printing?.collectorNumber || "?"}</span>
            </div>
          </figcaption>
        </figure>
      </button>
    </article>
  )
}

function DeckZoneTable({
  cards,
  isUpdating,
  onMove,
  title,
}: {
  cards: DeckCardEntry[]
  isUpdating: boolean
  onMove: (deckCard: DeckCardEntry) => void
  title: string
}) {
  if (!cards.length) return null

  return (
    <details className="group rounded-box border border-base-300 bg-base-100 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-black tracking-normal marker:hidden">
        <span className="flex items-center gap-2">
          <Box className="h-4 w-4 text-warning" />
          {title}
          <span className="text-base-content/55">({cards.reduce((total, deckCard) => total + deckCard.quantity, 0)})</span>
        </span>
        <ChevronDown className="h-4 w-4 text-base-content/50 transition group-open:rotate-180" />
      </summary>

      <div className="overflow-x-auto border-t border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-14">Qty</th>
              <th>Name</th>
              <th>Type</th>
              <th>Printing</th>
              <th className="w-36 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cards.map(deckCard => {
              const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]

              return (
                <tr key={deckCard.id}>
                  <td className="font-mono">{deckCard.quantity}</td>
                  <td>
                    <Link to="/cards/$id" params={{ id: deckCard.card?.oracleId || "" }} className="font-semibold hover:text-primary">
                      {deckCard.card?.name}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate text-base-content/65">{deckCard.card?.typeLine}</td>
                  <td className="text-base-content/65">
                    {printing?.setName || printing?.setCode?.toUpperCase() || "Unknown"} #{printing?.collectorNumber || "?"}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="ghost" disabled>
                        <Palette className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={isUpdating} onClick={() => onMove(deckCard)}>
                        <MoveRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function MoveDeckCardDialog({
  deckCard,
  error,
  isPending,
  onClose,
  onMove,
  zoneCounts,
}: {
  deckCard: DeckCardEntry | null
  error: string | null
  isPending: boolean
  onClose: () => void
  onMove: (zone: DeckZone) => void
  zoneCounts: Record<DeckZone, number>
}) {
  const zoneOptions = deckCard ? MOVE_TARGET_ZONES.filter(zone => zone !== deckCard.zone) : []
  const [selectedZone, setSelectedZone] = useState<DeckZone>("sideboard")
  const activeZone = zoneOptions.includes(selectedZone) ? selectedZone : zoneOptions[0]

  return (
    <Dialog open={Boolean(deckCard)} onOpenChange={open => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg" labelledBy="move-deck-card-title">
        <DialogHeader>
          <div>
            <DialogTitle id="move-deck-card-title">Move to...</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deckCard?.card?.name}</p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="grid gap-2">
            {zoneOptions.map(zone => (
              <button
                key={zone}
                type="button"
                className={[
                  "flex items-center gap-4 rounded-box border p-4 text-left transition",
                  activeZone === zone ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/45 hover:bg-base-200",
                ].join(" ")}
                onClick={() => setSelectedZone(zone)}
              >
                <ZoneIcon zone={zone} />
                <span>
                  <span className="block text-lg font-semibold">{titleize(zone)}</span>
                  <span className="text-sm text-base-content/60">{zoneCounts[zone] || 0} cards</span>
                </span>
              </button>
            ))}
          </div>

          {error ? <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending || !activeZone} onClick={() => activeZone && onMove(activeZone)}>
              Move
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewDeckDialog({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [format, setFormat] = useState<(typeof DECK_FORMATS)[number]>("commander")
  const [status, setStatus] = useState<(typeof DECK_STATUSES)[number]>("brewing")
  const [error, setError] = useState<string | null>(null)

  const createDeck = useMutation({
    mutationFn: () => request(CreateDeckDocument, { input: { name: name.trim(), format, status } }),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setName("")
      setFormat("commander")
      setStatus("brewing")
      setError(null)
      onOpenChange(false)

      if (data.createDeck?.id) {
        navigate({ to: "/decks/$id", params: { id: data.createDeck.id } })
      }
    },
    onError: error => setError(error instanceof Error ? error.message : "Could not create deck"),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Deck name is required")
      return
    }

    createDeck.mutate()
  }

  function close() {
    if (createDeck.isPending) return
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl" labelledBy="new-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="new-deck-title">New deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">Start with a shell, then import or add cards from the catalog.</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input value={name} onChange={event => setName(event.target.value)} placeholder="Deck name" autoFocus />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Format</span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={format}
                onChange={event => setFormat(event.target.value as (typeof DECK_FORMATS)[number])}
              >
                {DECK_FORMATS.map(format => (
                  <option key={format} value={format}>
                    {titleize(format)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Status</span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={status}
                onChange={event => setStatus(event.target.value as (typeof DECK_STATUSES)[number])}
              >
                {DECK_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {titleize(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={close} disabled={createDeck.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDeck.isPending}>
              <Plus className="h-4 w-4" />
              {createDeck.isPending ? "Creating..." : "Create deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
