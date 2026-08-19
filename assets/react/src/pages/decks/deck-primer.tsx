import { BookOpen, ChevronDown } from "lucide-react"
import Markdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkMath from "remark-math"
import "katex/dist/katex.min.css"

export function DeckMarkdown({ children }: { children: string }) {
  return (
    <article className="max-w-[72ch] text-base leading-7 text-base-content/80">
      <Markdown
        skipHtml
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ children, ...props }) => (
            <a
              className="font-bold text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
              rel="noreferrer"
              target="_blank"
              {...props}
            >
              {children}
            </a>
          ),
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
          img: ({ alt, ...props }) => (
            <img
              alt={alt || ""}
              className="my-5 max-h-[32rem] rounded-box border border-base-300 object-contain"
              loading="lazy"
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
          ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6">{children}</ul>,
        }}
      >
        {children}
      </Markdown>
    </article>
  )
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
