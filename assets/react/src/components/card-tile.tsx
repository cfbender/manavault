import {
  CheckSquare,
  DollarSign,
  Edit3,
  Layers,
  ListPlus,
  MapPin,
  MoreVertical,
  MoveUpRight,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react"
import {
  Fragment,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"
import { cn } from "../lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { useMobileHoverReveal } from "../lib/mobile-hover"

export type CardTileAction = {
  content?: ReactNode
  destructive?: boolean
  disabled?: boolean
  icon?: ReactNode
  label: ReactNode
  onClick?: () => void
  separatorBefore?: boolean
}

export function CardTile({
  allocatedLabel,
  className,
  count,
  countMin = 2,
  defaultActions,
  finish,
  growOnHover = true,
  imageUrl,
  location,
  menuActions = [],
  name,
  onSelect,
  primaryActionLabel,
  primaryActionRole = "link",
  price,
  rarity,
  selectable = false,
  selected = false,
  selectionActive = false,
  selectionLabel,
  setCode,
  setLabel,
  setName,
  showDetails = false,
  showMenu = true,
  typeLine,
  onToggleSelected,
}: {
  allocatedLabel?: ReactNode
  className?: string
  count?: number | null
  countMin?: number
  defaultActions?: CardTileAction[]
  finish?: string | null
  growOnHover?: boolean
  imageUrl?: string | null
  location?: ReactNode
  menuActions?: CardTileAction[]
  name: ReactNode
  onSelect?: () => void
  onToggleSelected?: () => void
  primaryActionLabel?: string
  primaryActionRole?: "button" | "link"
  price?: ReactNode
  rarity?: string | null
  selectable?: boolean
  selected?: boolean
  selectionActive?: boolean
  selectionLabel?: string
  setCode?: string | null
  setLabel?: ReactNode
  setName?: ReactNode
  showDetails?: boolean
  showMenu?: boolean
  typeLine?: ReactNode
}) {
  const foil = finish === "foil" || finish === "etched"
  const canToggleSelection = selectable && Boolean(onToggleSelected)
  const selectionClickActive = selectionActive && canToggleSelection
  const hasPrimaryAction = Boolean(onSelect || selectionClickActive)
  const visibleSetLabel = setLabel || setCode?.toUpperCase()
  const visibleFinish =
    finish === "etched"
      ? "Etched"
      : finish === "foil"
        ? "Foil"
        : finish === "nonfoil"
          ? "Nonfoil"
          : finish
  const ownedLabel = count && count >= countMin ? `Owned ×${count}` : null
  const mobileHover = useMobileHoverReveal<HTMLDivElement>()
  const fallbackDefaultActions: CardTileAction[] = [
    { icon: <MoveUpRight className="h-4 w-4" />, label: "Move", disabled: true },
    { icon: <Edit3 className="h-4 w-4" />, label: "Edit", disabled: true },
    { destructive: true, icon: <Trash2 className="h-4 w-4" />, label: "Delete", disabled: true },
  ]
  const bottomActions = defaultActions ?? fallbackDefaultActions
  const allActions: CardTileAction[] = [
    ...menuActions,
    ...bottomActions.map((action, index) => ({
      ...action,
      separatorBefore: index === 0 && menuActions.length > 0 ? true : action.separatorBefore,
    })),
  ]

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    mobileHover.clearRevealOnBlur(event)
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (mobileHover.suppressClickIfRevealed(event)) {
      return
    }

    if (isInteractiveClickTarget(event.target)) return

    if (selectionClickActive) {
      onToggleSelected?.()
      return
    }

    onSelect?.()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return
    if (isInteractiveClickTarget(event.target)) return

    if (selectionClickActive) {
      event.preventDefault()
      onToggleSelected?.()
      return
    }

    if (!onSelect) return
    event.preventDefault()
    onSelect()
  }

  return (
    <div
      ref={mobileHover.ref}
      aria-label={
        primaryActionLabel || (onSelect && typeof name === "string" ? `View ${name}` : undefined)
      }
      aria-pressed={selectionClickActive ? selected : undefined}
      className={cn(
        "group/card relative w-full max-w-[14.25rem] overflow-visible rounded-xl bg-transparent transition duration-200 focus-within:z-50",
        growOnHover && "hover:z-50 hover:-translate-y-2 hover:scale-[1.035]",
        growOnHover && mobileHover.isRevealed && "z-50 -translate-y-2 scale-[1.035]",
        hasPrimaryAction && "cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50",
        className,
      )}
      onBlur={handleBlur}
      onClick={hasPrimaryAction ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      onPointerDown={mobileHover.onPointerDown}
      role={selectionClickActive ? "button" : onSelect ? primaryActionRole : undefined}
      tabIndex={hasPrimaryAction ? 0 : undefined}
    >
      {showMenu ? (
        <div
          className={cn(
            "absolute left-2 top-2 z-50 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100",
            mobileHover.isRevealed && "opacity-100",
          )}
          data-mobile-hover-skip=""
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="card-tile-touch-button btn btn-circle btn-sm min-h-11 w-11 border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
                aria-label="Card actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="card-tile-touch-menu">
              {allActions.map((action, index) => (
                <Fragment key={index}>
                  {action.separatorBefore ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    destructive={action.destructive}
                    disabled={action.disabled}
                    onSelect={action.onClick}
                  >
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {canToggleSelection ? (
        <button
          type="button"
          className={cn(
            "card-tile-touch-button btn btn-circle btn-xs absolute right-2 top-2 z-50 border-0 shadow backdrop-blur transition",
            selected
              ? "bg-primary text-primary-content hover:bg-primary"
              : "bg-neutral/85 text-neutral-content hover:bg-neutral",
            selected || selectionActive || mobileHover.isRevealed
              ? "opacity-100"
              : "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100",
          )}
          aria-label={selectionLabel || (selected ? "Deselect card" : "Select card")}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation()
            onToggleSelected?.()
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
      ) : null}

      <figure
        className={cn(
          "relative aspect-[5/7] w-full overflow-hidden rounded-xl bg-base-300 shadow-lg ring-1 ring-white/10 transition duration-200 group-focus-within/card:ring-primary/50",
          foil && "card-tile-foil",
          finish === "etched" && "card-tile-foil--etched",
          growOnHover && "group-hover/card:shadow-2xl group-hover/card:ring-primary/40",
          growOnHover && mobileHover.isRevealed && "shadow-2xl ring-primary/40",
          selected && "ring-2 ring-primary ring-offset-2 ring-offset-base-100",
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={typeof name === "string" ? name : ""}
            className={cn(
              "h-full w-full object-cover transition duration-300",
              allocatedLabel && "grayscale",
            )}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/50">
            No image
          </div>
        )}

        {foil ? (
          <div
            className={cn(
              "card-tile-foil-overlay",
              finish === "etched" && "card-tile-foil-overlay--etched",
            )}
          />
        ) : null}

        {allocatedLabel ? (
          <div className="absolute inset-0 z-10 bg-black/45" aria-hidden="true" />
        ) : null}

        {allocatedLabel ? (
          <div className="absolute left-0 right-0 top-0 z-30 flex justify-center">
            <span className="rounded-b-md bg-neutral px-3 py-1 text-[0.68rem] font-black uppercase tracking-normal text-neutral-content shadow-lg">
              {allocatedLabel}
            </span>
          </div>
        ) : null}

        {count && count >= countMin ? (
          <span
            className={cn(
              "absolute right-0 z-40 rounded-bl-xl bg-primary px-2.5 py-1.5 text-sm font-black leading-none text-primary-content shadow-lg",
              canToggleSelection ? "top-9" : "top-0",
            )}
          >
            {count}
          </span>
        ) : null}

        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-end bg-gradient-to-t from-black/90 via-black/35 to-black/0 p-3 text-white opacity-0 transition duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100",
            mobileHover.isRevealed && "pointer-events-auto opacity-100",
          )}
        >
          <div className="grid w-full gap-2">
            <div className="min-w-0">
              <div className="line-clamp-2 text-sm font-bold leading-tight drop-shadow">{name}</div>
              {typeLine ? (
                <div className="mt-0.5 line-clamp-1 text-xs text-white/70">{typeLine}</div>
              ) : null}
            </div>

            <div className="grid gap-1.5 text-xs text-white/85">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <SetIcon rarity={rarity} setCode={setCode} />
                  <span className="truncate">{setName ?? setLabel}</span>
                </span>
                {price ? (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-white/90">
                    <DollarSign className="h-3.5 w-3.5" />
                    {String(price).replace(/^\$/, "")}
                  </span>
                ) : null}
              </div>

              <div className="flex min-w-0 items-center justify-between gap-2">
                {location ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{location}</span>
                  </span>
                ) : null}
                {foil ? (
                  <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2 py-0.5 font-bold backdrop-blur-sm">
                    <Sparkles className="h-3.5 w-3.5" />
                    {finish === "etched" ? "Etched" : "Foil"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </figure>

      {showDetails ? (
        <div className="mt-3 min-w-0 space-y-2 text-sm">
          <div className="min-w-0 space-y-1">
            <div className="line-clamp-2 font-black leading-tight text-base-content">{name}</div>
            {typeLine ? (
              <div className="line-clamp-1 text-xs font-semibold text-base-content/70">
                {typeLine}
              </div>
            ) : null}
          </div>
          <div className="grid gap-1 text-xs text-base-content/65">
            <div className="flex min-w-0 items-center justify-between gap-2">
              {visibleSetLabel ? (
                <span className="min-w-0 truncate font-mono font-bold text-base-content/80">
                  {visibleSetLabel}
                </span>
              ) : null}
              {price ? (
                <span className="shrink-0 font-mono font-bold text-base-content">
                  {String(price).startsWith("$") ? price : `$${price}`}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {setName ? <span className="min-w-0 truncate">{setName}</span> : null}
              {ownedLabel ? (
                <span className="rounded-full border border-primary/30 px-2 py-0.5 font-bold text-primary">
                  {ownedLabel}
                </span>
              ) : null}
              {visibleFinish ? (
                <span className="rounded-full border border-base-300 px-2 py-0.5 font-bold">
                  {visibleFinish}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function isInteractiveClickTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest("a,button,input,select,textarea,label"))
}

export function addToDeckAction(
  options: Pick<CardTileAction, "disabled" | "onClick"> = {},
): CardTileAction {
  return { icon: <Layers className="h-4 w-4" />, label: "Add to deck", ...options }
}

export function addToListAction(
  options: Pick<CardTileAction, "disabled" | "onClick"> = {},
): CardTileAction {
  return { icon: <ListPlus className="h-4 w-4" />, label: "Add to list", ...options }
}

function SetIcon({ rarity, setCode }: { rarity?: string | null; setCode?: string | null }) {
  const color = rarityColor(rarity)
  const code = String(setCode || "")
    .trim()
    .toLowerCase()

  if (!code) {
    return (
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/30 text-[0.55rem] font-black leading-none text-black shadow"
        style={{ backgroundColor: color }}
        title={rarity || "Common"}
      >
        ?
      </span>
    )
  }

  return (
    <span
      className="h-4 w-4 shrink-0 drop-shadow"
      style={{
        backgroundColor: color,
        mask: `url(/scryfall-assets/sets/${code}.svg) center / contain no-repeat`,
        WebkitMask: `url(/scryfall-assets/sets/${code}.svg) center / contain no-repeat`,
      }}
      title={`${setCode?.toUpperCase()} ${rarity || "common"}`}
      aria-hidden="true"
    />
  )
}

function rarityColor(rarity?: string | null) {
  const key = String(rarity || "").toLowerCase()

  if (key === "mythic") return "#e46f25"
  if (key === "rare") return "#c89b3c"
  if (key === "uncommon") return "#a7b0b7"
  if (key === "special" || key === "bonus") return "#9b72d0"

  return "#f3f0e8"
}
