type AppLinkHost = "manavault.cfb.dev" | "www.manavault.cfb.dev"

const APP_LINK_HOSTS: Record<AppLinkHost, true> = {
  "manavault.cfb.dev": true,
  "www.manavault.cfb.dev": true,
}
const ROUTE_BASE_URL = "https://native.manavault.local"

export type NativeRoute =
  | { to: "/" }
  | { to: "/collection"; search: { importFile: boolean } }
  | { to: "/cards"; search: { q?: string } }
  | { to: "/cards/$id"; params: { id: string }; search: { q?: string } }
  | { to: "/decks" }
  | { to: "/decks/$id"; params: { id: string } }
  | { to: "/decks/$id/playtest"; params: { id: string } }
  | { to: "/settings" }
  | { to: "/share/decks/$token"; params: { token: string } }

export function nativeAppPath(rawUrl: string, currentOrigin?: string | null) {
  try {
    const url = new URL(rawUrl)

    if (url.protocol === "manavault:") {
      const pathname = url.host ? `/${url.host}${url.pathname}` : url.pathname
      return appPath(pathname, url.search, url.hash)
    }

    const isCurrentOrigin = isCurrentHttpOrigin(url, currentOrigin)
    if (isCurrentOrigin) return appPath(url.pathname, url.search, url.hash)
    if (url.protocol === "https:" && Object.hasOwn(APP_LINK_HOSTS, url.host)) {
      return appPath(url.pathname, url.search, url.hash)
    }

    return null
  } catch {
    return null
  }
}

export function parseNativeRoute(path: string): NativeRoute {
  const url = parsePathUrl(path)
  if (!url) return { to: "/" }

  const pathname =
    url.pathname.length <= 1
      ? "/"
      : url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname
  const segments = pathname.split("/").filter(Boolean)

  if (pathname === "/") return { to: "/" }

  if (pathname === "/collection") {
    const importFile = url.searchParams.get("importFile")
    return {
      to: "/collection",
      search: { importFile: importFile === "true" || importFile === "1" },
    }
  }

  if (pathname === "/cards") {
    const q = url.searchParams.get("q")
    return { to: "/cards", search: { q: q?.trim() ? q : undefined } }
  }

  if (segments.length === 2 && segments[0] === "cards") {
    const q = url.searchParams.get("q")
    return {
      to: "/cards/$id",
      params: { id: decodePathSegment(segments[1]) },
      search: { q: q?.trim() ? q : undefined },
    }
  }

  if (pathname === "/decks") return { to: "/decks" }

  if (segments.length === 2 && segments[0] === "decks") {
    return { to: "/decks/$id", params: { id: decodePathSegment(segments[1]) } }
  }

  if (segments.length === 3 && segments[0] === "decks" && segments[2] === "playtest") {
    return { to: "/decks/$id/playtest", params: { id: decodePathSegment(segments[1]) } }
  }

  if (pathname === "/settings") return { to: "/settings" }

  if (segments.length === 3 && segments[0] === "share" && segments[1] === "decks") {
    return {
      to: "/share/decks/$token",
      params: { token: decodePathSegment(segments[2]) },
    }
  }

  return { to: "/" }
}

function appPath(pathname: string, search: string, hash: string) {
  const path = pathname ? (pathname.startsWith("/") ? pathname : `/${pathname}`) : "/"
  return `${path}${search}${hash}`
}

function isCurrentHttpOrigin(url: URL, currentOrigin?: string | null) {
  if (!currentOrigin) return false

  try {
    const origin = new URL(currentOrigin)
    return (
      (origin.protocol === "http:" || origin.protocol === "https:") && url.origin === origin.origin
    )
  } catch {
    return false
  }
}

function parsePathUrl(path: string) {
  const trimmed = path.trim()
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null

  try {
    return new URL(trimmed, ROUTE_BASE_URL)
  } catch {
    return null
  }
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
