import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { print } from "graphql"

const csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content")

export async function request<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables?: TVariables
): Promise<TResult> {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({ query: print(document), variables }),
  })

  const payload = (await response.json()) as { data?: TResult; errors?: Array<{ message: string }> }

  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message || `GraphQL request failed with HTTP ${response.status}`)
  }

  return payload.data
}
