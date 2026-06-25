import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { Input } from "../../components/ui/input"
import { graphql } from "../../gql"
import { request } from "../../lib/graphql"
import { cn } from "../../lib/utils"

const SET_SUGGESTION_LIMIT = 8

const SetSuggestionsDocument = graphql(`
  query SetSuggestions($q: String!, $limit: Int!) {
    setSuggestions(q: $q, limit: $limit) {
      setCode
      setName
    }
  }
`)

export function SetCombobox({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void
  value: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [debouncedValue, setDebouncedValue] = useState(value)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const query = debouncedValue.trim()
  const { data } = useQuery({
    queryKey: ["set-suggestions", query, SET_SUGGESTION_LIMIT],
    queryFn: () => request(SetSuggestionsDocument, { q: query, limit: SET_SUGGESTION_LIMIT }),
    enabled: query.length > 1,
    staleTime: 60_000,
  })
  const suggestions = data?.setSuggestions ?? []
  const showSuggestions = open && suggestions.length > 0

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), 200)
    return () => window.clearTimeout(timeout)
  }, [value])

  useEffect(() => {
    setActiveIndex(-1)
  }, [value, suggestions.length])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  function selectSet(set: (typeof suggestions)[number]) {
    onValueChange(set.setCode)
    setOpen(false)
  }

  function handleValueChange(nextValue: string) {
    onValueChange(nextValue)
    setOpen(nextValue.trim().length > 1)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) {
      if (event.key === "Escape") setOpen(false)
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      selectSet(suggestions[activeIndex])
    } else if (event.key === "Enter") {
      setOpen(false)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        onChange={(event) => handleValueChange(event.target.value)}
        onFocus={() => setOpen(value.trim().length > 1)}
        onKeyDown={handleKeyDown}
        placeholder="Set code or name"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        autoComplete="off"
      />
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
                selectSet(set)
              }}
              onClick={() => selectSet(set)}
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
