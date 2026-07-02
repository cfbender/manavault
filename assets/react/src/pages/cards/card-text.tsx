import { useArtPalette } from "../../lib/art-colors"

export function ManaText({ className, text }: { className?: string; text: string }) {
  return (
    <span
      className={["inline-flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")}
    >
      {renderRichCardText(text)}
    </span>
  )
}

export function OracleText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <p
          key={index}
          className={
            line.startsWith("(") && line.endsWith(")") ? "italic text-base-content/60" : undefined
          }
        >
          {renderRichCardText(line)}
        </p>
      ))}
    </>
  )
}

export function OracleTextPanel({
  artCropUrl,
  text,
}: {
  artCropUrl?: string | null
  text: string
}) {
  const palette = useArtPalette(artCropUrl)

  return (
    <div
      className="max-w-4xl space-y-3 rounded-box border border-base-300/70 bg-base-100/75 p-4 text-base leading-7 text-base-content/85 shadow-sm backdrop-blur transition-colors duration-700 sm:p-5"
      style={
        palette
          ? {
              borderColor: `rgb(${palette.primary} / 0.35)`,
              backgroundImage: `linear-gradient(135deg, rgb(${palette.primary} / 0.18), rgb(${palette.secondary} / 0.08) 55%, rgb(${palette.primary} / 0.14))`,
            }
          : undefined
      }
    >
      <OracleText text={text} />
    </div>
  )
}

function renderRichCardText(text: string) {
  return text
    .split(/(\{[^}]+\}|\([^)]*\))/g)
    .filter(Boolean)
    .map((part, index) => {
      if (/^\{[^}]+\}$/.test(part)) return <ManaSymbol key={index} symbol={part} />
      if (/^\([^)]*\)$/.test(part)) {
        return (
          <em key={index} className="text-base-content/65">
            {renderManaSymbols(part)}
          </em>
        )
      }
      return <span key={index}>{part}</span>
    })
}

function renderManaSymbols(text: string) {
  return text
    .split(/(\{[^}]+\})/g)
    .filter(Boolean)
    .map((part, index) => {
      if (/^\{[^}]+\}$/.test(part)) return <ManaSymbol key={index} symbol={part} />
      return <span key={index}>{part}</span>
    })
}

function ManaSymbol({ symbol }: { symbol: string }) {
  const filename = symbol.replace(/[{}]/g, "").replace("/", "").toUpperCase()

  return (
    <img
      src={`/scryfall-assets/symbols/${filename}.svg`}
      alt={symbol}
      title={symbol}
      className="mx-0.5 inline-block h-[1.15em] w-[1.15em] translate-y-[-0.08em] align-middle"
    />
  )
}
