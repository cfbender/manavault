import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function titleize(value: unknown) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function compactNumber(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value || 0)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function present<T>(value: T | null | undefined): value is T {
  return value != null
}

// Returns the URL only if it is an absolute http(s) URL, else null. Guards
// against javascript:/data: and other schemes when rendering hrefs or opening
// windows from backend/third-party-supplied URLs.
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}
