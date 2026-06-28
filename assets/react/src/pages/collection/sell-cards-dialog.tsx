import { gql } from "@apollo/client"
import { useMutation, useQuery } from "@apollo/client/react"
import { Check, Clipboard, SearchCheck, Trash2 } from "lucide-react"
import type { UIEvent } from "react"
import { useMemo, useState } from "react"
import { CardImage, EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { useToast } from "../../components/ui/toast"
import { pluralize, present } from "../../lib/utils"
import { DeleteCollectionItemDocument } from "./documents"

const SELL_CARDS_PAGE_SIZE = 48
const SELL_CARDS_LOAD_MORE_THRESHOLD_PX = 600

const SellCardsDocument = gql`
  query CollectionSellCards($first: Int!, $after: String) {
    collectionItems(
      first: $first
      after: $after
      filters: { unallocatedOnly: true }
      sort: { field: "price", direction: "desc" }
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          quantity
          finish
          currentPriceCents
          priceText
          totalOwnedCopies
          location {
            name
          }
          printing {
            id
            scryfallId
            setCode
            setName
            collectorNumber
            imageUrl
            rarity
            card {
              id
              name
              typeLine
            }
          }
        }
      }
    }
  }
`

type SellCollectionItem = {
  currentPriceCents?: number | null
  finish: string
  id: string
  location?: { name?: string | null } | null
  priceText?: string | null
  quantity: number
  totalOwnedCopies: number
  printing?: {
    collectorNumber?: string | null
    id: string
    imageUrl?: string | null
    rarity?: string | null
    scryfallId: string
    setCode?: string | null
    setName?: string | null
    card?: {
      id: string
      name?: string | null
      typeLine?: string | null
    } | null
  } | null
}

type SellCardsQuery = {
  collectionItems: {
    pageInfo: {
      endCursor?: string | null
      hasNextPage: boolean
    }
    edges?: Array<{ node?: SellCollectionItem | null } | null> | null
  }
}

type SellCardsVariables = {
  after?: string | null
  first: number
}

export function SellCardsDialog({
  onDone,
  onOpenChange,
  open,
}: {
  onDone: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { showToast } = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [isMatchingSoldList, setIsMatchingSoldList] = useState(false)
  const [soldListText, setSoldListText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [deleteItemMutation, deleteItem] = useMutation(DeleteCollectionItemDocument)
  const query = useQuery<SellCardsQuery, SellCardsVariables>(SellCardsDocument, {
    variables: { first: SELL_CARDS_PAGE_SIZE, after: null },
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const pageInfo = query.data?.collectionItems.pageInfo
  const items = useMemo(
    () => (query.data?.collectionItems.edges || []).map((edge) => edge?.node).filter(present),
    [query.data],
  )
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  )
  const selectedTotalCents = useMemo(
    () =>
      selectedItems.reduce(
        (total, item) => total + (item.currentPriceCents || 0) * (item.quantity || 0),
        0,
      ),
    [selectedItems],
  )

  function close() {
    if (deleteItem.loading) return
    setSelectedIds(new Set())
    setSoldListText("")
    setError(null)
    onOpenChange(false)
  }

  function toggleSelected(item: SellCollectionItem) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  function fetchMoreSellCards(after = pageInfo?.endCursor) {
    if (isFetchingMore || !after) return Promise.resolve()

    setIsFetchingMore(true)
    return query
      .fetchMore({
        variables: { first: SELL_CARDS_PAGE_SIZE, after },
        updateQuery: (previousData, { fetchMoreResult }) => {
          if (!fetchMoreResult) return previousData

          return {
            ...previousData,
            collectionItems: {
              ...fetchMoreResult.collectionItems,
              edges: [
                ...(previousData.collectionItems.edges || []),
                ...(fetchMoreResult.collectionItems.edges || []),
              ],
            },
          }
        },
      })
      .finally(() => setIsFetchingMore(false))
  }

  async function loadAllSellCards() {
    let nextPageInfo = pageInfo
    let allItems = items

    while (nextPageInfo?.hasNextPage) {
      const result = await fetchMoreSellCards(nextPageInfo.endCursor)
      nextPageInfo = result?.data?.collectionItems.pageInfo
      allItems = uniqueItems([
        ...allItems,
        ...((result?.data?.collectionItems.edges || [])
          .map((edge) => edge?.node)
          .filter(present) || []),
      ])
    }

    return allItems
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget
    if (
      target.scrollTop + target.clientHeight >=
      target.scrollHeight - SELL_CARDS_LOAD_MORE_THRESHOLD_PX
    ) {
      void fetchMoreSellCards()
    }
  }

  async function copySellList() {
    const text = sellListTextForItems(selectedItems, selectedTotalCents)

    try {
      await navigator.clipboard.writeText(text)
      showToast("Sell list copied")
    } catch (_error) {
      setError("Could not copy to clipboard")
    }
  }

  async function selectPastedSoldCards() {
    setError(null)

    if (!soldListText.trim()) {
      setError("Paste a sold list first")
      return
    }

    setIsMatchingSoldList(true)
    const matchableItems = await loadAllSellCards().finally(() => setIsMatchingSoldList(false))

    const lines = soldListText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const matchingIds = new Set<string>()

    for (const item of matchableItems) {
      if (lines.some((line) => lineMatchesItem(line, item))) matchingIds.add(item.id)
    }

    if (!matchingIds.size) {
      setError("No loaded collection items matched that list")
      return
    }

    setSelectedIds(matchingIds)
    showToast(`${pluralize(matchingIds.size, "sold card")} selected`)
  }

  async function deleteSelectedSoldCards() {
    setError(null)

    if (!selectedItems.length) {
      setError("Choose at least one card to delete")
      return
    }

    try {
      for (const item of selectedItems) {
        await deleteItemMutation({ variables: { id: item.id } })
      }
      showToast(`${pluralize(selectedItems.length, "sold card")} deleted`)
      setSelectedIds(new Set())
      await query.refetch()
      onDone()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete sold cards")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-6xl" labelledBy="sell-cards-title">
        <DialogHeader>
          <div>
            <DialogTitle id="sell-cards-title">Sell cards</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Cards not allocated to decks, sorted by market price.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <div className="sticky top-0 z-10 border-b border-base-300 bg-base-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
                Selected market value
              </p>
              <p className="font-mono text-2xl font-black">{formatCents(selectedTotalCents)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!selectedItems.length}
                onClick={() => void copySellList()}
              >
                <Clipboard className="h-4 w-4" />
                Copy list
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!selectedItems.length || deleteItem.loading}
                onClick={() => void deleteSelectedSoldCards()}
              >
                <Trash2 className="h-4 w-4" />
                {deleteItem.loading ? "Deleting..." : "Delete sold"}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
            <textarea
              className="textarea textarea-bordered min-h-20 w-full text-sm"
              placeholder="Paste a sold list to select matching collection items for deletion."
              value={soldListText}
              onChange={(event) => setSoldListText(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={isMatchingSoldList}
              onClick={() => void selectPastedSoldCards()}
            >
              <SearchCheck className="h-4 w-4" />
              {isMatchingSoldList ? "Matching..." : "Select pasted"}
            </Button>
          </div>

          {error ? (
            <p className="mt-3 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5" onScroll={handleScroll}>
          {query.loading && !query.data ? (
            <EmptyState title="Loading sellable cards..." />
          ) : items.length ? (
            <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(12rem,12rem))]">
              {items.map((item) => (
                <SellCardTile
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggle={() => toggleSelected(item)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No sellable cards found" />
          )}

          {pageInfo?.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={isFetchingMore}
                onClick={() => void fetchMoreSellCards()}
              >
                {isFetchingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SellCardTile({
  item,
  onToggle,
  selected,
}: {
  item: SellCollectionItem
  onToggle: () => void
  selected: boolean
}) {
  const cardName = item.printing?.card?.name || "Unknown card"
  const priceCents = item.currentPriceCents || 0
  const lineTotal = priceCents * (item.quantity || 0)

  return (
    <button
      type="button"
      className={`group relative rounded-xl border bg-base-100 p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-base-300"
      }`}
      onClick={onToggle}
    >
      <CardImage printing={item.printing} className="w-full" />
      <div className="mt-2 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-bold">{cardName}</p>
          {selected ? (
            <span className="rounded-full bg-primary p-1 text-primary-content">
              <Check className="h-3 w-3" />
            </span>
          ) : null}
        </div>
        <p className="text-xs text-base-content/60">
          {item.printing?.setCode?.toUpperCase() || "?"} #{item.printing?.collectorNumber || "?"}
          {" · "}
          {item.finish}
        </p>
        <p className="text-xs text-base-content/60">
          x{item.quantity} in this printing · x{item.totalOwnedCopies} total owned
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="font-mono text-sm font-black">{item.priceText || "$0"}</span>
          <span className="font-mono text-xs text-base-content/70">{formatCents(lineTotal)}</span>
        </div>
      </div>
    </button>
  )
}

function sellListTextForItems(items: SellCollectionItem[], totalCents: number) {
  const lines = items.map((item) => {
    const cardName = item.printing?.card?.name || "Unknown card"
    const setCode = item.printing?.setCode?.toUpperCase() || "?"
    const collectorNumber = item.printing?.collectorNumber || "?"
    const unitPrice = item.priceText || "$0"
    const total = formatCents((item.currentPriceCents || 0) * (item.quantity || 0))

    return `${item.quantity} ${cardName} [${setCode} #${collectorNumber}] ${item.finish} - ${unitPrice} ea - ${total}`
  })

  return [...lines, "", `Total: ${formatCents(totalCents)}`].join("\n")
}

function uniqueItems(items: SellCollectionItem[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

function lineMatchesItem(line: string, item: SellCollectionItem) {
  const normalizedLine = normalizeMatchText(line)
  const name = normalizeMatchText(item.printing?.card?.name || "")
  const setCode = normalizeMatchText(item.printing?.setCode || "")
  const collectorNumber = normalizeMatchText(item.printing?.collectorNumber || "")

  if (!name || !normalizedLine.includes(name)) return false
  if (setCode && normalizedLine.includes(setCode) && collectorNumber) {
    return normalizedLine.includes(collectorNumber)
  }

  return true
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(cents / 100)
}
