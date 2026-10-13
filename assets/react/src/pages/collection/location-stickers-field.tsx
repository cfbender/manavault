import { useQuery } from "@apollo/client/react"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { cn, titleize } from "../../lib/utils"
import { MODAL_SEARCH_DEBOUNCE_MS } from "./constants"
import { useDebouncedValue } from "./form-helpers"
import {
  LocationSticker,
  MAX_LOCATION_STICKERS,
  STICKER_RARITIES,
  stickerKey,
  stickerLabel,
  type LocationStickerValue,
} from "./location-sticker"
import { SetSuggestionsDocument } from "./set-combobox"

type StickerTab = "mana" | "set" | "rarity"

type CardSymbol = { code: string; english: string }

let cardSymbols: Promise<CardSymbol[]> | null = null

/** The card symbols Scryfall publishes, from the synced symbology manifest. */
function loadCardSymbols() {
  cardSymbols ??= fetch("/scryfall-assets/symbols/symbology.json")
    .then((response) => (response.ok ? response.json() : { data: [] }))
    .then((manifest: { data?: Array<{ english?: string; local_uri?: string }> }) =>
      (manifest.data ?? []).flatMap((symbol) => {
        const code = symbol.local_uri
          ?.split("/")
          .pop()
          ?.replace(/\.svg$/, "")
        return code ? [{ code, english: symbol.english ?? code }] : []
      }),
    )
    .catch(() => {
      cardSymbols = null
      return []
    })
  return cardSymbols
}

function useCardSymbols(enabled: boolean) {
  const [symbols, setSymbols] = useState<CardSymbol[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void loadCardSymbols().then((loaded) => {
      if (!cancelled) setSymbols(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return symbols
}

const PICK_BUTTON =
  "grid min-h-11 min-w-11 place-items-center rounded-box border border-transparent p-1 transition hover:border-base-300 hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary/60 aria-pressed:bg-primary/10 disabled:pointer-events-none disabled:opacity-40"

/** Picks the symbols stuck on a location: card symbols, set symbols, or rarities. */
export function LocationStickersField({
  onChange,
  stickers,
}: {
  onChange: (stickers: LocationStickerValue[]) => void
  stickers: LocationStickerValue[]
}) {
  const [tab, setTab] = useState<StickerTab>("mana")
  const [setSearch, setSetSearch] = useState("")
  const symbols = useCardSymbols(tab === "mana")
  const setTerm = useDebouncedValue(setSearch, MODAL_SEARCH_DEBOUNCE_MS).trim()
  const setSuggestions = useQuery(SetSuggestionsDocument, {
    variables: { q: setTerm, limit: 8 },
    skip: tab !== "set" || setTerm.length < 2,
  })
  const applied = new Set(stickers.map(stickerKey))
  const full = stickers.length >= MAX_LOCATION_STICKERS

  function toggle(sticker: LocationStickerValue) {
    if (applied.has(stickerKey(sticker))) {
      remove(sticker)
    } else if (!full) {
      onChange([...stickers, sticker])
    }
  }

  function remove(sticker: LocationStickerValue) {
    onChange(stickers.filter((current) => stickerKey(current) !== stickerKey(sticker)))
  }

  function pickButtonProps(sticker: LocationStickerValue) {
    const isApplied = applied.has(stickerKey(sticker))
    return {
      "aria-label": `${isApplied ? "Remove" : "Add"} ${stickerLabel(sticker)} sticker`,
      "aria-pressed": isApplied,
      disabled: full && !isApplied,
      onClick: () => toggle(sticker),
      type: "button" as const,
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Stickers</span>
        <p className="mt-1 text-xs text-base-content/55">
          Stick up to {MAX_LOCATION_STICKERS} card symbols, set symbols, or rarities on this
          location.
        </p>
      </div>

      <div className="flex min-h-16 flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-200/40 p-3">
        {stickers.length ? (
          stickers.map((sticker, index) => (
            <span key={stickerKey(sticker)} className="relative">
              <LocationSticker
                sticker={sticker}
                index={index}
                className="[--sticker-size:2.75rem]"
              />
              <button
                type="button"
                className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-base-300 bg-base-100 text-base-content/70 shadow transition hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Remove ${stickerLabel(sticker)} sticker`}
                onClick={() => remove(sticker)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-sm text-base-content/55">No stickers yet.</span>
        )}
        <span className="ml-auto font-mono text-xs font-bold text-base-content/55">
          {stickers.length}/{MAX_LOCATION_STICKERS}
        </span>
      </div>

      <ToggleGroup
        type="single"
        aria-label="Sticker type"
        value={tab}
        onValueChange={(value) => {
          if (value === "mana" || value === "set" || value === "rarity") setTab(value)
        }}
        className="grid grid-cols-3 gap-1 rounded-btn border border-base-300 bg-base-100 p-1"
      >
        {(["mana", "set", "rarity"] as const).map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className="min-h-11 rounded-btn px-3 text-sm font-bold transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=on]:bg-primary data-[state=on]:text-primary-content"
          >
            {value === "mana" ? "Card symbols" : titleize(value)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {tab === "mana" ? (
        <div className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1 overflow-y-auto rounded-box border border-base-300 p-2">
          {symbols.length ? (
            symbols.map((symbol) => (
              <button
                key={symbol.code}
                className={PICK_BUTTON}
                title={symbol.english}
                {...pickButtonProps({ kind: "mana", value: symbol.code })}
              >
                <img
                  src={`/scryfall-assets/symbols/${symbol.code}.svg`}
                  alt=""
                  className="h-7 w-7"
                  loading="lazy"
                />
              </button>
            ))
          ) : (
            <p className="col-span-full px-1 py-2 text-sm text-base-content/55">
              Loading card symbols...
            </p>
          )}
        </div>
      ) : tab === "set" ? (
        <div className="space-y-2">
          <Input
            value={setSearch}
            onChange={(event) => setSetSearch(event.target.value)}
            placeholder="Search sets by name or code"
            aria-label="Search sets"
          />
          {setTerm.length >= 2 ? (
            <div className="max-h-56 overflow-y-auto rounded-box border border-base-300 p-1">
              {(setSuggestions.data?.setSuggestions ?? []).map((set) => {
                const sticker = {
                  kind: "set",
                  value: set.setCode.toLowerCase(),
                  iconUrl: set.iconUrl,
                }
                return (
                  <button
                    key={set.setCode}
                    className={cn(PICK_BUTTON, "flex w-full justify-start gap-3 px-2 text-left")}
                    {...pickButtonProps(sticker)}
                  >
                    <LocationSticker sticker={sticker} className="[--sticker-size:2rem]" />
                    <span className="font-mono text-sm font-bold uppercase">{set.setCode}</span>
                    <span className="truncate text-sm text-base-content/70">{set.setName}</span>
                  </button>
                )
              })}
              {setSuggestions.data && !setSuggestions.data.setSuggestions.length ? (
                <p className="px-2 py-2 text-sm text-base-content/55">No sets found.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STICKER_RARITIES.map((rarity) => {
            const sticker = { kind: "rarity", value: rarity }
            return (
              <button
                key={rarity}
                className={cn(PICK_BUTTON, "flex justify-start gap-3 px-3")}
                {...pickButtonProps(sticker)}
              >
                <LocationSticker sticker={sticker} className="[--sticker-size:2rem]" />
                <span className="text-sm font-bold">{titleize(rarity)}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
