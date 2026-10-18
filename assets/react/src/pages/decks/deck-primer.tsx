import { useApolloClient } from "@apollo/client/react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"
import { BookOpen, ChevronDown } from "lucide-react"
import Markdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { useRef, useState } from "react"
import { ManaSymbol } from "../../components/ui/mana-symbols"
import { overlayLayers } from "../../components/ui/overlay-layers"
import { useToast } from "../../components/ui/toast"
import type { CardByNameQuery } from "../../gql/graphql"
import { graphqlEndpointContext } from "../../lib/apollo"
import { cn } from "../../lib/utils"
import { CardByNameDocument } from "./deck-analysis-documents"
import { CardDetailDialog, type CardDetailDialogTarget } from "./deck-card-detail-dialog"
import "katex/dist/katex.min.css"

type MarkdownNode = {
  alt?: string
  children?: MarkdownNode[]
  title?: string
  type: string
  url?: string
  value?: string
}

const richTextPattern = /\[\[([^\n]{1,160}?)\]\]|\{([0-9A-Z∞½]+(?:\/[0-9A-Z∞½]+)*)\}/giu
const skippedRichTextParents = new Set([
  "code",
  "image",
  "inlineCode",
  "inlineMath",
  "link",
  "math",
])

export function DeckMarkdown({
  cardReferences = false,
  children,
  className,
  shareMode = false,
}: {
  cardReferences?: boolean
  children: string
  className?: string
  shareMode?: boolean
}) {
  return (
    <article
      className={cn(
        "min-w-0 max-w-[72ch] break-words text-base leading-7 text-base-content/80",
        className,
      )}
    >
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath, [remarkManaVault, { cardReferences }]]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ children, href, title, ...props }) => {
            const cardName = title?.startsWith("manavault-card:")
              ? title.slice("manavault-card:".length)
              : null

            return cardName ? (
              <CardReference name={cardName} shareMode={shareMode} />
            ) : (
              <a
                className="font-bold text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
                href={href}
                rel="noreferrer"
                target="_blank"
                title={title}
                {...props}
              >
                {children}
              </a>
            )
          },
          blockquote: ({ children }) => (
            <blockquote className="my-5 border-l border-primary/50 bg-base-200/60 px-4 py-3 text-base-content/70">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded-field bg-base-200 px-1.5 py-0.5 font-mono text-[0.9em] text-base-content">
              {children}
            </code>
          ),
          h1: ({ children }) => (
            <h2 className="mb-3 mt-7 text-2xl font-black leading-tight first:mt-0">{children}</h2>
          ),
          h2: ({ children }) => (
            <h3 className="mb-2 mt-7 text-xl font-black leading-tight first:mt-0">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mb-2 mt-6 text-base font-black leading-tight first:mt-0">{children}</h4>
          ),
          hr: () => <hr className="my-6 border-base-300" />,
          img: ({ alt, title, ...props }) =>
            title === "manavault-mana-symbol" && alt ? (
              <ManaSymbol symbol={alt} />
            ) : (
              <img
                alt={alt || ""}
                className="my-5 max-h-[32rem] rounded-box border border-base-300 object-contain"
                loading="lazy"
                title={title}
                {...props}
              />
            ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6">{children}</ol>,
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          pre: ({ children }) => (
            <pre className="my-5 overflow-x-auto rounded-box bg-neutral p-4 font-mono text-sm leading-6 text-neutral-content [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-5 max-w-full overflow-x-auto rounded-box border border-base-300">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm leading-6">
                {children}
              </table>
            </div>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-base-300 bg-base-100">{children}</tbody>
          ),
          td: ({ children }) => <td className="min-w-36 px-3 py-2.5 align-top">{children}</td>,
          th: ({ children }) => (
            <th className="bg-base-200 px-3 py-2 text-xs font-black text-base-content">
              {children}
            </th>
          ),
          thead: ({ children }) => <thead className="border-b border-base-300">{children}</thead>,
          ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6">{children}</ul>,
        }}
      >
        {children}
      </Markdown>
    </article>
  )
}

type CardByNameMatch = NonNullable<CardByNameQuery["cardByName"]>

// Resolves a `[[Card Name]]` reference to a catalog card for its hover
// preview and opens it in the shared card detail dialog. Both share one
// lookup, so hovering and then clicking asks the server once. Names the
// catalog does not know (hallucinated or misspelled by the AI) surface as a
// toast instead of a dead link.
function useCardReferenceLookup(name: string, shareMode: boolean) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [card, setCard] = useState<CardDetailDialogTarget | null>(null)
  const [pending, setPending] = useState(false)
  // undefined while loading, null when there is no image to show.
  const [previewUrl, setPreviewUrl] = useState<string | null | undefined>(undefined)
  const lookup = useRef<Promise<CardByNameMatch | null> | null>(null)
  const requestId = useRef(0)

  function resolve() {
    if (!lookup.current) {
      const request = client
        .query({
          query: CardByNameDocument,
          variables: { name },
          context: graphqlEndpointContext(shareMode ? "/share/graphql" : undefined),
        })
        .then(({ data }) => data?.cardByName ?? null)
      // A failed lookup is retried by the next hover or click.
      request.catch(() => {
        if (lookup.current === request) lookup.current = null
      })
      lookup.current = request
    }
    return lookup.current
  }

  function preview() {
    resolve().then(
      (match) => setPreviewUrl(match?.printings?.edges?.[0]?.node?.imageUrl ?? null),
      () => setPreviewUrl(null),
    )
  }

  async function open() {
    const id = ++requestId.current
    setPending(true)

    try {
      const match = await resolve()
      if (id !== requestId.current) return

      if (match) {
        setCard({ id: match.id, name: match.name })
      } else {
        showToast(`“${name}” isn’t in the card catalog yet.`, { tone: "error" })
      }
    } catch {
      if (id !== requestId.current) return
      showToast(`Couldn’t look up “${name}”. Try again.`, { tone: "error" })
    } finally {
      if (id === requestId.current) setPending(false)
    }
  }

  function close() {
    requestId.current += 1
    setCard(null)
    setPending(false)
  }

  return { card, close, open, pending, preview, previewUrl }
}

function CardReference({ name, shareMode }: { name: string; shareMode: boolean }) {
  const lookup = useCardReferenceLookup(name, shareMode)
  const [open, setOpen] = useState(false)
  const [previewUnavailable, setPreviewUnavailable] = useState(false)

  function showPreview(nextOpen: boolean) {
    if (nextOpen) lookup.preview()
    setOpen(nextOpen)
  }

  return (
    <>
      <HoverCardPrimitive.Root
        closeDelay={80}
        open={open && !lookup.card}
        openDelay={180}
        onOpenChange={showPreview}
      >
        <HoverCardPrimitive.Trigger asChild>
          <button
            type="button"
            aria-busy={lookup.pending || undefined}
            className="cursor-pointer rounded-sm bg-transparent p-0 text-left font-bold text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 aria-busy:opacity-70"
            onBlur={() => setOpen(false)}
            onClick={() => {
              setOpen(false)
              void lookup.open()
            }}
            onFocus={() => showPreview(true)}
          >
            {name}
          </button>
        </HoverCardPrimitive.Trigger>
        <HoverCardPrimitive.Portal>
          <HoverCardPrimitive.Content
            align="center"
            className="w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-2xl outline-none"
            style={{ zIndex: overlayLayers.floating }}
            collisionPadding={12}
            sideOffset={8}
          >
            {lookup.previewUrl === undefined ? (
              <div className="skeleton aspect-[5/7] w-full rounded-field" />
            ) : lookup.previewUrl && !previewUnavailable ? (
              <img
                alt={`${name} card preview`}
                className="aspect-[5/7] w-full rounded-field object-cover"
                height="340"
                loading="lazy"
                src={lookup.previewUrl}
                width="244"
                onError={() => setPreviewUnavailable(true)}
              />
            ) : (
              <div className="flex aspect-[5/7] items-center justify-center rounded-field bg-base-200 p-4 text-center text-sm text-base-content/65">
                Card preview unavailable
              </div>
            )}
            <p className="px-1 pb-1 pt-2 text-sm font-bold leading-snug text-base-content">
              {name}
            </p>
            <p className="px-1 text-xs text-base-content/60">Click to view card details</p>
            <HoverCardPrimitive.Arrow className="fill-base-100" />
          </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Portal>
      </HoverCardPrimitive.Root>
      <CardDetailDialog
        card={lookup.card}
        graphqlEndpoint={shareMode ? "/share/graphql" : undefined}
        hidePrivateControls={shareMode}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) lookup.close()
        }}
      />
    </>
  )
}

function remarkManaVault(options?: { cardReferences?: boolean }) {
  return (tree: MarkdownNode) => decorateRichText(tree, Boolean(options?.cardReferences))
}

function decorateRichText(node: MarkdownNode, cardReferences: boolean) {
  if (!node.children || skippedRichTextParents.has(node.type)) return

  node.children = node.children.flatMap((child) => {
    if (child.type === "text" && child.value) {
      return richTextNodes(child.value, cardReferences)
    }

    decorateRichText(child, cardReferences)
    return [child]
  })
}

function richTextNodes(value: string, cardReferences: boolean): MarkdownNode[] {
  const nodes: MarkdownNode[] = []
  let cursor = 0

  for (const match of value.matchAll(richTextPattern)) {
    const index = match.index
    if (index > cursor) nodes.push({ type: "text", value: value.slice(cursor, index) })

    const cardName = match[1]?.trim()
    const manaSymbol = match[2]

    if (cardName && cardReferences) {
      nodes.push({
        type: "link",
        url: `https://scryfall.com/search?q=${encodeURIComponent(`!"${cardName}"`)}`,
        title: `manavault-card:${cardName}`,
        children: [{ type: "text", value: cardName }],
      })
    } else if (manaSymbol) {
      nodes.push({
        type: "image",
        url: `/scryfall-assets/symbols/${manaSymbol.replaceAll("/", "").toUpperCase()}.svg`,
        alt: `{${manaSymbol}}`,
        title: "manavault-mana-symbol",
      })
    } else {
      nodes.push({ type: "text", value: match[0] })
    }

    cursor = index + match[0].length
  }

  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) })
  return nodes.length ? nodes : [{ type: "text", value }]
}

export function DeckPrimer({ primer }: { primer?: string | null }) {
  const content = primer?.trim()
  if (!content) return null

  return (
    <details className="group rounded-box border border-base-300 bg-base-100 shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-box bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-black tracking-normal">Deck primer</span>
            <span className="hidden text-sm text-base-content/65 sm:block">
              Strategy, sequencing, and table notes
            </span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-base-content/55 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>

      <div className="border-t border-base-300 px-5 py-5 sm:px-6">
        <DeckMarkdown>{content}</DeckMarkdown>
      </div>
    </details>
  )
}
