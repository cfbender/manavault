import { useQuery } from "@apollo/client/react"
import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { graphql } from "../../gql"
import { uniqueSetValues } from "../../lib/collection-filters"
import { cn } from "../../lib/utils"

const SET_SUGGESTION_LIMIT = 8

export const SetSuggestionsDocument = graphql(`
  query SetSuggestions($q: String!, $limit: Int!) {
    setSuggestions(q: $q, limit: $limit) {
      setCode
      setName
      iconUrl
    }
  }
`)

// Multi-select set picker: each chosen set becomes a removable chip and the
// filter matches cards from any of them.
export function SetCombobox({
  onValuesChange,
  values,
}: {
  onValuesChange: (values: string[]) => void
  values: string[]
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")
  const [debouncedText, setDebouncedText] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const query = debouncedText.trim()
  const { data } = useQuery(SetSuggestionsDocument, {
    variables: { q: query, limit: SET_SUGGESTION_LIMIT },
    skip: query.length <= 1,
  })
  const selectedKeys = new Set(values.map((value) => value.toLowerCase()))
  const suggestions = (data?.setSuggestions ?? []).filter(
    (set) => !selectedKeys.has(set.setCode.toLowerCase()),
  )
  const showSuggestions = open && text.trim().length > 1 && suggestions.length > 0

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedText(text), 200)
    return () => window.clearTimeout(timeout)
  }, [text])

  useEffect(() => {
    setActiveIndex(-1)
  }, [text, suggestions.length])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  function addSet(value: string) {
    const next = uniqueSetValues([...values, value])
    if (next.length !== values.length) onValuesChange(next)
    setText("")
    setOpen(false)
    inputRef.current?.focus()
  }

  function removeSet(value: string) {
    onValuesChange(values.filter((set) => set !== value))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !text && values.length) {
      event.preventDefault()
      removeSet(values[values.length - 1])
      return
    }

    if (event.key === "Escape") {
      if (showSuggestions) event.preventDefault()
      setOpen(false)
      return
    }

    if (showSuggestions && event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (showSuggestions && event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
    } else if (event.key === "Enter" || event.key === ",") {
      // Enter picks the highlighted suggestion, otherwise commits the typed
      // text as-is so exact set codes work without waiting for suggestions.
      const typed = text.trim()
      if (showSuggestions && activeIndex >= 0) {
        event.preventDefault()
        addSet(suggestions[activeIndex].setCode)
      } else if (typed) {
        event.preventDefault()
        addSet(typed)
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className="input input-bordered flex h-auto min-h-12 w-full flex-wrap items-center gap-1.5 bg-base-100 px-2 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((set) => (
          <span
            key={set}
            className="inline-flex items-center gap-1 rounded-btn border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-1 font-mono text-xs font-bold uppercase text-primary"
          >
            {set}
            <button
              type="button"
              className="grid h-5 w-5 place-items-center rounded-full hover:bg-primary/20"
              aria-label={`Remove set ${set.toUpperCase()}`}
              onClick={(event) => {
                event.stopPropagation()
                removeSet(set)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="min-w-[8rem] flex-1 bg-transparent px-1 text-base outline-none placeholder:text-base-content/50"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(event.target.value.trim().length > 1)
          }}
          onFocus={() => setOpen(text.trim().length > 1)}
          onKeyDown={handleKeyDown}
          placeholder={values.length ? "Add another set" : "Set code or name"}
          role="combobox"
          aria-label="Sets"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          autoComplete="off"
        />
      </div>
      {showSuggestions ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-2xl"
          role="listbox"
        >
          {suggestions.map((set, index) => (
            <button
              key={set.setCode}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "block w-full rounded-btn px-3 py-2 text-left text-sm transition-colors",
                index === activeIndex ? "bg-primary text-primary-content" : "hover:bg-base-200",
              )}
              onPointerDown={(event) => {
                event.preventDefault()
                addSet(set.setCode)
              }}
              onClick={() => addSet(set.setCode)}
            >
              <span className="font-mono font-bold uppercase">{set.setCode}</span>
              {set.setName ? (
                <span className="ml-2 text-base-content/70">{set.setName}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
