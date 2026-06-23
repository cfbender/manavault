import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react"

type UseLocalStorageStateOptions<T> = {
  deserialize?: (value: string) => T
  serialize?: (value: T) => string
  shouldRemove?: (value: T) => boolean
}

function canUseLocalStorage() {
  if (typeof window === "undefined") return false

  try {
    return Boolean(window.localStorage)
  } catch {
    return false
  }
}

export function useLocalStorageState<T>(
  key: string,
  initialValue: T | (() => T),
  {
    deserialize = JSON.parse,
    serialize = JSON.stringify,
    shouldRemove,
  }: UseLocalStorageStateOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const readStoredValue = useCallback(() => {
    const fallback =
      typeof initialValue === "function" ? (initialValue as () => T)() : initialValue

    if (!canUseLocalStorage()) return fallback

    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? fallback : deserialize(stored)
    } catch {
      return fallback
    }
  }, [deserialize, initialValue, key])

  const [stored, setStored] = useState(() => ({
    hydrated: canUseLocalStorage(),
    key,
    value: readStoredValue(),
  }))
  let value = stored.value

  if (stored.key !== key) {
    value = readStoredValue()
    setStored({ hydrated: canUseLocalStorage(), key, value })
  }

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (nextValue) => {
      setStored((current) => {
        const previousValue = current.key === key ? current.value : readStoredValue()
        const value =
          typeof nextValue === "function"
            ? (nextValue as (previousValue: T) => T)(previousValue)
            : nextValue

        return { hydrated: canUseLocalStorage(), key, value }
      })
    },
    [key, readStoredValue],
  )

  useEffect(() => {
    if (stored.hydrated && stored.key === key) return
    if (!canUseLocalStorage()) return

    setStored({
      hydrated: true,
      key,
      value: readStoredValue(),
    })
  }, [key, readStoredValue, stored.hydrated, stored.key])

  useEffect(() => {
    if (!stored.hydrated || stored.key !== key) return

    if (!canUseLocalStorage()) return

    try {
      if (shouldRemove?.(stored.value)) {
        window.localStorage.removeItem(stored.key)
      } else {
        window.localStorage.setItem(stored.key, serialize(stored.value))
      }
    } catch {
      // Storage can be unavailable, disabled, or full. Keep in-memory state working.
    }
  }, [key, serialize, shouldRemove, stored])

  return [value, setValue]
}
