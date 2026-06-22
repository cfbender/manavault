import { cn } from "../../lib/utils"

const COLOR_LABELS: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
}

type ManaSymbolProps = {
  className?: string
  symbol: string
}

export function ManaSymbol({ className, symbol }: ManaSymbolProps) {
  const normalized = symbol.replace(/[{}]/g, "").replace("/", "").toUpperCase()
  const label = COLOR_LABELS[normalized] || symbol

  return (
    <img
      src={`/scryfall-assets/symbols/${normalized}.svg`}
      alt={label}
      title={label}
      className={cn(
        "mx-0.5 inline-block h-[1.15em] w-[1.15em] translate-y-[-0.08em] align-middle",
        className,
      )}
    />
  )
}

export function ColorIdentitySymbols({
  className,
  colors,
}: {
  className?: string
  colors: string[]
}) {
  if (!colors.length) return null

  return (
    <span
      aria-label={`Commander color identity: ${colors.map((color) => COLOR_LABELS[color] || color).join(" ")}`}
      className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
    >
      {colors.map((color) => (
        <ManaSymbol key={color} symbol={color} />
      ))}
    </span>
  )
}
