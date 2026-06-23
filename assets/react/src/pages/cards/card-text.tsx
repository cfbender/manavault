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
