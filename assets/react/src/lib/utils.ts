import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function titleize(value: unknown) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

export function compactNumber(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value || 0)
}

export function present<T>(value: T | null | undefined): value is T {
  return value != null
}
