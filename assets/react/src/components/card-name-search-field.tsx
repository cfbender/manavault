import { useQuery } from "@apollo/client/react"
import { History } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FocusEvent, InputHTMLAttributes, KeyboardEvent } from "react"
import { graphql } from "../gql"
import {
  deserializeRecentCardSearches,
  pushRecentCardSearch,
  RECENT_CARD_SEARCHES_STORAGE_KEY,
} from "../lib/recent-card-searches"
import { useLocalStorageState } from "../lib/use-local-storage"
import { SearchField } from "./search-field"

const NO_RECENT_SEARCHES: string[] = []

const CardNameSuggestionsDocument = graphql(`
  query CardNameSuggestions($q: String!, $limit: Int!) {
    cardNameSuggestions(q: $q, limit: $limit)
  }
`)

type CardNameSearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  onClear?: () => void
  onSuggestionSelect?: (name: string) => void
  onValueChange: (value: string) => void
  /** Record the field value as a recent search when the enclosing form submits. */
  recordSubmitAsSearch?: boolean
  selectFirstSuggestionOnEnter?: boolean
  suggestionLimit?: number
  value: string
}

export function CardNameSearchField({
  onBlur,
  onClear,
  onFocus,
  onKeyDown,
  onSuggestionSelect,
  onValueChange,
  recordSubmitAsSearch = true,
  selectFirstSuggestionOnEnter = false,
  suggestionLimit = 5,
  value,
  ...props
}: CardNameSearchFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerSelectedNameRef = useRef<string | null>(null)
  const suppressNextClickCleanupRef = useRef<(() => void) | null>(null)
  const [debouncedValue, setDebouncedValue] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [recentSearches, setRecentSearches] = useLocalStorageState<string[]>(
    RECENT_CARD_SEARCHES_STORAGE_KEY,
    NO_RECENT_SEARCHES,
    { deserialize: deserializeRecentCardSearches },
  )
  const suggestionTerm = debouncedValue.trim()
  const hasScryfallSyntax = looksLikeScryfallSyntax(suggestionTerm)
  const shouldFetchSuggestions = suggestionTerm.length > 1 && !hasScryfallSyntax
  const { data } = useQuery(CardNameSuggestionsDocument, {
    variables: { q: suggestionTerm, limit: suggestionLimit },
    skip: !shouldFetchSuggestions,
    fetchPolicy: "cache-first",
  })
  const suggestions = shouldFetchSuggestions ? (data?.cardNameSuggestions ?? []) : []
  const hasInput = value.trim().length > 0
  const items = hasInput ? suggestions : recentSearches
  const showItems = isOpen && items.length > 0
  const showingRecentSearches = showItems && !hasInput

  function recordSearch(name: string) {
    setRecentSearches((current) => pushRecentCardSearch(current, name))
  }

  const valueRef = useRef(value)
  const recordSearchRef = useRef(recordSearch)
  useEffect(() => {
    valueRef.current = value
    recordSearchRef.current = recordSearch
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), 200)
    return () => window.clearTimeout(timeout)
  }, [value])

  useEffect(() => {
    setActiveIndex(-1)
  }, [value, items.length])

  useEffect(() => {
    if (hasScryfallSyntax) setIsOpen(false)
  }, [hasScryfallSyntax])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      suppressNextClickCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (!recordSubmitAsSearch) return
    const form = rootRef.current?.closest("form")
    if (!form) return

    function handleSubmit() {
      recordSearchRef.current(valueRef.current)
    }

    form.addEventListener("submit", handleSubmit)
    return () => form.removeEventListener("submit", handleSubmit)
  }, [recordSubmitAsSearch])

  function closeAndClear() {
    setIsOpen(false)
    onValueChange("")
    onClear?.()
  }

  function selectSuggestion(name: string) {
    recordSearch(name)
    onValueChange(name)
    setIsOpen(false)
    onSuggestionSelect?.(name)
  }

  function handlePointerSelect(name: string) {
    pointerSelectedNameRef.current = name
    suppressNextDocumentClick()
    selectSuggestion(name)
  }

  function suppressNextDocumentClick() {
    suppressNextClickCleanupRef.current?.()

    function stopNextClick(event: MouseEvent) {
      event.preventDefault()
      event.stopImmediatePropagation()
      event.stopPropagation()
      cleanup()
    }

    function cleanup() {
      document.removeEventListener("click", stopNextClick, true)
      window.clearTimeout(timeout)
      if (suppressNextClickCleanupRef.current === cleanup)
        suppressNextClickCleanupRef.current = null
    }

    const timeout = window.setTimeout(cleanup, 500)
    suppressNextClickCleanupRef.current = cleanup
    document.addEventListener("click", stopNextClick, true)
  }

  function handleValueChange(nextValue: string) {
    onValueChange(nextValue)
    setIsOpen(shouldOpenFor(nextValue))
  }

  function shouldOpenFor(nextValue: string) {
    const nextTerm = nextValue.trim()
    if (nextTerm.length === 0) return recentSearches.length > 0
    return nextTerm.length > 1 && !looksLikeScryfallSyntax(nextTerm)
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setIsOpen(shouldOpenFor(value))
    onFocus?.(event)
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setIsOpen(false)
    onBlur?.(event)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || items.length === 0) {
      if (event.key === "Escape") setIsOpen(false)
      onKeyDown?.(event)
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % items.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? items.length - 1 : index - 1))
    } else if (event.key === "Enter" && (activeIndex >= 0 || selectFirstSuggestionOnEnter)) {
      event.preventDefault()
      selectSuggestion(items[Math.max(activeIndex, 0)])
    } else if (event.key === "Enter") {
      setIsOpen(false)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setIsOpen(false)
    }

    if (!event.defaultPrevented) onKeyDown?.(event)
  }

  return (
    <div ref={rootRef} className="relative">
      <SearchField
        {...props}
        value={value}
        onValueChange={handleValueChange}
        onClear={closeAndClear}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showItems}
      />
      {showItems ? (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
          role="listbox"
          aria-label={showingRecentSearches ? "Recent searches" : "Card name suggestions"}
        >
          {showingRecentSearches ? (
            <p className="px-3 pb-1 pt-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-base-content/45">
              Recent searches
            </p>
          ) : null}
          {items.map((name, index) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                index === activeIndex ? "bg-primary text-primary-content" : "hover:bg-base-200",
              ].join(" ")}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onPointerUp={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handlePointerSelect(name)
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()

                if (pointerSelectedNameRef.current === name) {
                  pointerSelectedNameRef.current = null
                  return
                }

                selectSuggestion(name)
              }}
            >
              {showingRecentSearches ? (
                <History className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
              ) : null}
              <span className="min-w-0 truncate">{name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function looksLikeScryfallSyntax(value: string) {
  if (value === "") return false

  return value
    .split(/\s+/)
    .some(
      (token) =>
        /^-?\(/.test(token) ||
        /^-?!/.test(token) ||
        /^-?not:/i.test(token) ||
        /^or$/i.test(token) ||
        /^-?[a-z][a-z_-]*(?::|!?=|[<>]=?)/i.test(token),
    )
}
