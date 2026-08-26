import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockSubscriptionLink } from "@apollo/client/testing"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { addServerLog, ServerLogsSection } from "../src/pages/settings/server-logs-section"

afterEach(cleanup)

test("shows streamed log events and clears them", async () => {
  const link = new MockSubscriptionLink()
  const client = new ApolloClient({ cache: new InMemoryCache(), link })

  render(
    <ApolloProvider client={client}>
      <ServerLogsSection />
    </ApolloProvider>,
  )

  expect(screen.getByText("Waiting for server activity")).toBeTruthy()

  await act(async () => {
    link.simulateResult({
      result: {
        data: {
          serverLog: {
            __typename: "ServerLogEvent",
            id: "204",
            timestamp: "2026-08-26T12:34:56.000Z",
            level: "warning",
            message: "Event 204",
          },
        },
      },
    })
  })

  expect(await screen.findByText("Event 204")).toBeTruthy()
  expect(screen.getByText("warning")).toBeTruthy()

  await userEvent.click(screen.getByRole("button", { name: "Clear" }))

  expect(screen.getByText("Waiting for server activity")).toBeTruthy()
  expect(screen.queryByText("Event 204")).toBeNull()
})

test("caps the in-memory log buffer at 200 newest events", () => {
  const logs = Array.from({ length: 205 }, (_, index) => index).reduce(
    (current, index) =>
      addServerLog(current, {
        __typename: "ServerLogEvent",
        id: String(index),
        timestamp: "2026-08-26T12:34:56.000Z",
        level: "info",
        message: `Event ${index}`,
      }),
    [] as Parameters<typeof addServerLog>[0],
  )

  expect(logs).toHaveLength(200)
  expect(logs[0]?.message).toBe("Event 204")
  expect(logs.at(-1)?.message).toBe("Event 5")
})
