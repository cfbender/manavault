import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { Edit3, FlipHorizontal2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { PageSection } from "../../../components/app-shell"
import { EmptyState } from "../../../components/card-image"
import { CardTile } from "../../../components/card-tile"
import { SearchField } from "../../../components/search-field"
import { Button } from "../../../components/ui/button"
import { ConfirmDialog } from "../../../components/ui/confirm-dialog"
import { useToast } from "../../../components/ui/toast"
import { refetchActiveQueries } from "../../../lib/apollo"
import { useCardSize } from "../../../lib/card-size"
import { pluralize } from "../../../lib/utils"
import { MODAL_SEARCH_DEBOUNCE_MS } from "../constants"
import type { TokenItem } from "../types"
import { AddTokenDialog } from "./add-token-dialog"
import { DeleteTokenItemDocument, TokenItemsDocument } from "./documents"
import { EditTokenDialog } from "./edit-token-dialog"
import { tokenItemName } from "./token-item-name"

type TokenOverlay =
  | { type: "add" }
  | { type: "edit"; item: TokenItem }
  | { type: "delete"; item: TokenItem }
  | null

/**
 * Owned tokens as a browsable grid. Tokens are never allocated to decks or valued,
 * so there is no selection mode, location, or price here: just what you have.
 */
export function CollectionTokensSection() {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [overlay, setOverlay] = useState<TokenOverlay>(null)
  const query = useQuery(TokenItemsDocument, {
    variables: { q: debouncedSearch },
    fetchPolicy: "cache-and-network",
  })
  const [deleteTokenItem] = useMutation(DeleteTokenItemDocument)
  const items = query.data?.tokenItems ?? []
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0)

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      MODAL_SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [search])

  function refresh() {
    void refetchActiveQueries(client)
  }

  function confirmDelete(item: TokenItem) {
    void deleteTokenItem({
      variables: { id: item.id },
      onCompleted: () => {
        showToast(`${tokenItemName(item)} removed`)
        refresh()
      },
      onError: (error) => showToast(error.message || "Could not remove token"),
    })
  }

  return (
    <div className="space-y-7">
      <div className="control-toolbar grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto]">
        <SearchField
          aria-label="Filter tokens"
          placeholder="Filter tokens by name"
          value={search}
          onValueChange={setSearch}
        />
        <Button type="button" onClick={() => setOverlay({ type: "add" })}>
          <Plus className="h-4 w-4" />
          Add token
        </Button>
      </div>

      <PageSection
        count={
          query.data
            ? `${pluralize(totalQuantity, "token")}${debouncedSearch ? " shown" : ""}`
            : undefined
        }
      >
        {query.loading && !query.data ? (
          <EmptyState title="Loading tokens..." />
        ) : query.error && !query.data ? (
          <EmptyState
            title="Could not load tokens"
            description="Your tokens are safe. Try opening the Tokens tab again."
          />
        ) : items.length === 0 ? (
          debouncedSearch ? (
            <EmptyState
              title="No tokens match"
              description={`Nothing you own is named like "${debouncedSearch}".`}
            />
          ) : (
            <EmptyState
              title="No tokens yet"
              description="Scan tokens with the card scanner or add them here. Decks will show how many of each token you own."
            />
          )
        ) : (
          <TokenGrid
            items={items}
            onDelete={(item) => setOverlay({ type: "delete", item })}
            onEdit={(item) => setOverlay({ type: "edit", item })}
          />
        )}
      </PageSection>

      <AddTokenDialog
        open={overlay?.type === "add"}
        onAdded={refresh}
        onOpenChange={(open) => !open && setOverlay(null)}
      />
      <EditTokenDialog
        item={overlay?.type === "edit" ? overlay.item : null}
        onSaved={refresh}
        onOpenChange={(open) => !open && setOverlay(null)}
      />
      <ConfirmDialog
        confirmLabel="Remove"
        destructive
        open={overlay?.type === "delete"}
        onConfirm={() => {
          if (overlay?.type === "delete") confirmDelete(overlay.item)
        }}
        onOpenChange={(open) => !open && setOverlay(null)}
        title={overlay?.type === "delete" ? `Remove ${tokenItemName(overlay.item)}?` : "Remove"}
      >
        {overlay?.type === "delete"
          ? `All ${pluralize(overlay.item.quantity, "copy", "copies")} of this printing leave your collection.`
          : null}
      </ConfirmDialog>
    </div>
  )
}

function TokenGrid({
  items,
  onDelete,
  onEdit,
}: {
  items: readonly TokenItem[]
  onDelete: (item: TokenItem) => void
  onEdit: (item: TokenItem) => void
}) {
  const size = useCardSize()

  return (
    <ul
      className="grid justify-center gap-x-6 gap-y-8"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${size.widthRem}rem, 100%), ${size.widthRem}rem))`,
      }}
    >
      {items.map((item) => (
        <li key={item.id} className="flex justify-center">
          <TokenTile item={item} onDelete={() => onDelete(item)} onEdit={() => onEdit(item)} />
        </li>
      ))}
    </ul>
  )
}

function TokenTile({
  item,
  onDelete,
  onEdit,
}: {
  item: TokenItem
  onDelete: () => void
  onEdit: () => void
}) {
  const [showBack, setShowBack] = useState(false)
  const face = showBack && item.backPrinting ? item.backPrinting : item.printing
  const name = tokenItemName(item)

  return (
    <CardTile
      count={item.quantity}
      countMin={1}
      defaultActions={[
        ...(item.backPrinting
          ? [
              {
                icon: <FlipHorizontal2 className="h-4 w-4" />,
                label: showBack ? "Show front" : "Show back",
                onClick: () => setShowBack((value) => !value),
              },
            ]
          : []),
        { icon: <Edit3 className="h-4 w-4" />, label: "Edit", onClick: onEdit },
        {
          destructive: true,
          icon: <Trash2 className="h-4 w-4" />,
          label: "Remove",
          onClick: onDelete,
        },
      ]}
      finish={item.finish}
      imageUrl={face.imageUrl}
      name={name}
      onSelect={item.backPrinting ? () => setShowBack((value) => !value) : undefined}
      primaryActionLabel={
        item.backPrinting ? `Flip ${name} to the ${showBack ? "front" : "back"}` : undefined
      }
      primaryActionRole="button"
      setCode={face.setCode}
      setLabel={`${face.setCode?.toUpperCase() || "?"} #${face.collectorNumber || "?"}`}
      setName={item.printing.setName}
      showDetails
      typeLine={face.card?.typeLine}
    />
  )
}
