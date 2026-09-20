import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import { ApiKeysSection } from "../src/pages/settings/api-keys-section"
import {
  ApiKeysDocument,
  CreateApiKeyDocument,
  RevokeApiKeyDocument,
} from "../src/pages/settings/data"

afterEach(cleanup)

const createdAt = "2026-09-20T12:00:00Z"
const apiKey = {
  id: "7",
  name: "The Gathering",
  prefix: "mvk_example1",
  createdAt,
  lastUsedAt: null,
}

function renderSection(mocks: ConstructorParameters<typeof MockLink>[0]) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) })

  render(
    <ApolloProvider client={client}>
      <ToastProvider>
        <ApiKeysSection />
      </ToastProvider>
    </ApolloProvider>,
  )
}

test("creates a named key and shows its plaintext only in the one-time panel", async () => {
  const token = "mvk_full_secret_value"
  renderSection([
    { request: { query: ApiKeysDocument }, result: { data: { apiKeys: [] } } },
    {
      request: { query: CreateApiKeyDocument, variables: { name: "The Gathering" } },
      result: { data: { createApiKey: { token, apiKey } } },
    },
    { request: { query: ApiKeysDocument }, result: { data: { apiKeys: [apiKey] } } },
  ])

  await screen.findByText(/No API keys yet/)
  await userEvent.type(screen.getByRole("textbox", { name: "Key name" }), "The Gathering")
  await userEvent.click(screen.getByRole("button", { name: "Create key" }))

  expect(await screen.findByText(token)).toBeTruthy()
  expect(screen.getByText("Copy this key now")).toBeTruthy()
  expect(await screen.findByText("The Gathering")).toBeTruthy()
  expect(screen.getByText("Never used")).toBeTruthy()

  await userEvent.click(screen.getByRole("button", { name: "I saved it" }))
  await waitFor(() => expect(screen.queryByText(token)).toBeNull())
  expect(screen.getByText("mvk_example1…")).toBeTruthy()
})

test("requires confirmation before revoking a key", async () => {
  renderSection([
    { request: { query: ApiKeysDocument }, result: { data: { apiKeys: [apiKey] } } },
    {
      request: { query: RevokeApiKeyDocument, variables: { id: "7" } },
      result: { data: { revokeApiKey: { id: "7" } } },
    },
    { request: { query: ApiKeysDocument }, result: { data: { apiKeys: [] } } },
  ])

  const revoke = await screen.findByRole("button", { name: "Revoke" })
  await userEvent.click(revoke)
  expect(screen.getByRole("button", { name: "Confirm revoke" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()

  await userEvent.click(screen.getByRole("button", { name: "Confirm revoke" }))
  expect(await screen.findByText(/No API keys yet/)).toBeTruthy()
})
