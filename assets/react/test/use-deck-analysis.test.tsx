import { ApolloClient, ApolloLink, InMemoryCache, Observable } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, expect, test, vi } from "vitest"

import { DeckAnalysisJobDocument } from "../src/pages/decks/deck-analysis-documents"
import { useDeckAnalysis } from "../src/pages/decks/use-deck-analysis"

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }))
vi.mock("../src/components/ui/toast", () => ({ useToast: () => ({ showToast }) }))

const clients: ApolloClient[] = []

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.stop())
  showToast.mockReset()
})

function job(status: string, analysis = "Previous analysis") {
  return {
    __typename: "DeckAnalysisJob" as const,
    id: "job-1",
    status,
    deck: {
      __typename: "Deck" as const,
      id: "deck-1",
      aiAnalysis: analysis,
      aiAnalysisModel: "test-model",
      aiAnalyzedAt: "2026-09-30T05:48:01Z",
      hasAiCardCategories: false,
      commanderBracket: 3,
      commanderBracketEstimate: 3,
      commanderBracketRating: "3+",
    },
  }
}

function setup(initialJob: ReturnType<typeof job> | null = null) {
  const server = {
    job: initialJob,
    failQuery: false,
    loseEnqueueResponse: false,
    queries: 0,
    mutations: 0,
  }
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          if (operation.operationName === "AnalyzeDeck") {
            server.mutations++
            server.job = job("pending")
            if (server.loseEnqueueResponse) observer.error(new Error("Connection closed"))
            else observer.next({ data: { analyzeDeck: { job: server.job } } })
          } else {
            server.queries++
            if (server.failQuery) observer.error(new Error("Connection closed"))
            else observer.next({ data: { deckAnalysisJob: server.job } })
          }
          observer.complete()
        }),
    ),
  })
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApolloProvider client={client}>{children}</ApolloProvider>
  )
  const hook = renderHook(() => useDeckAnalysis({ id: "deck-1", name: "Test Deck" }, true), {
    wrapper,
  })
  return { ...hook, server, client }
}

test("queue acknowledgement stays pending until polling saves the new analysis into Apollo", async () => {
  const { result, server, client } = setup()
  await waitFor(() => expect(result.current.checking).toBe(false))
  act(() => result.current.analyze())
  await waitFor(() => expect(result.current.pending).toBe(true))
  expect(showToast).toHaveBeenCalledExactlyOnceWith(
    "Analysis queued for Test Deck. You can leave this page.",
    { id: "deck-analysis-deck-1", tone: "info" },
  )

  act(() => result.current.analyze())
  expect(server.mutations).toBe(1)
  expect(
    client.readQuery({ query: DeckAnalysisJobDocument, variables: { deckId: "deck-1" } })
      ?.deckAnalysisJob?.deck.aiAnalysis,
  ).toBe("Previous analysis")

  server.job = job("completed", "New analysis")
  await waitFor(() => expect(result.current.pending).toBe(false), { timeout: 4_000 })
  expect(
    client.readQuery({ query: DeckAnalysisJobDocument, variables: { deckId: "deck-1" } })
      ?.deckAnalysisJob?.deck.aiAnalysis,
  ).toBe("New analysis")
  expect(showToast).toHaveBeenLastCalledWith("Deck analysis complete.", {
    id: "deck-analysis-deck-1",
    tone: "success",
  })
  const polls = server.queries
  await new Promise((resolve) => setTimeout(resolve, 2_100))
  expect(server.queries).toBe(polls)
})

test("reloaded pending work survives a failed status poll and reports terminal failure once", async () => {
  const { result, server, client } = setup(job("pending"))
  await waitFor(() => expect(result.current.pending).toBe(true))
  expect(showToast).not.toHaveBeenCalled()

  server.failQuery = true
  act(() => result.current.checkStatus())
  await waitFor(() => expect(result.current.connectionError).toBe(true))
  expect(result.current.pending).toBe(true)
  expect(result.current.failed).toBe(false)
  expect(showToast).not.toHaveBeenCalled()

  server.failQuery = false
  server.job = job("failed")
  await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 4_000 })
  expect(result.current.connectionError).toBe(false)
  expect(result.current.pending).toBe(false)
  expect(showToast).toHaveBeenCalledExactlyOnceWith(
    "Deck analysis could not be completed. Try again.",
    { id: "deck-analysis-deck-1", tone: "error" },
  )
  await act(() => client.refetchQueries({ include: [DeckAnalysisJobDocument] }))
  expect(showToast).toHaveBeenCalledTimes(1)
  expect(server.mutations).toBe(0)
})

test("a lost enqueue response checks the server instead of submitting a second analysis", async () => {
  const { result, server } = setup()
  await waitFor(() => expect(result.current.checking).toBe(false))
  server.loseEnqueueResponse = true
  act(() => result.current.analyze())
  await waitFor(() => expect(result.current.pending).toBe(true))
  expect(server.mutations).toBe(1)
  expect(showToast).toHaveBeenCalledExactlyOnceWith(
    "Could not confirm the analysis request. Checking its status…",
    { id: "deck-analysis-deck-1", tone: "error" },
  )
})
