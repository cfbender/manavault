import { useRouterState } from "@tanstack/react-router"
import type { PropsWithChildren } from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    title?: string
  }
}

const APP_TITLE = "ManaVault"

type PageTitleState = {
  pathname: string
  title: string | null | undefined
}

const PageTitleContext = createContext<((title: string | null | undefined) => void) | null>(null)

export function formatPageTitle(title: string | null | undefined) {
  const trimmedTitle = title?.trim()
  return trimmedTitle ? `${APP_TITLE} - ${trimmedTitle}` : APP_TITLE
}

export function PageTitleProvider({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const routeTitle = useRouterState({
    select: (state) => {
      for (let index = state.matches.length - 1; index >= 0; index -= 1) {
        const title = state.matches[index]?.staticData.title
        if (typeof title === "string") return title
      }

      return undefined
    },
  })
  const [pageTitle, setPageTitle] = useState<PageTitleState | null>(null)
  const title = pageTitle?.pathname === pathname ? pageTitle.title : routeTitle
  const setCurrentPageTitle = useCallback(
    (nextTitle: string | null | undefined) => setPageTitle({ pathname, title: nextTitle }),
    [pathname],
  )
  const contextValue = useMemo(() => setCurrentPageTitle, [setCurrentPageTitle])

  useEffect(() => {
    if (typeof document === "undefined") return
    document.title = formatPageTitle(title)
  }, [title])

  return <PageTitleContext.Provider value={contextValue}>{children}</PageTitleContext.Provider>
}

export function usePageTitle(title: string | null | undefined) {
  const setPageTitle = useContext(PageTitleContext)

  useEffect(() => {
    setPageTitle?.(title)
    return () => setPageTitle?.(undefined)
  }, [setPageTitle, title])
}
