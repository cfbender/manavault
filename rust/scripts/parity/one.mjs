#!/usr/bin/env node
// Debug helper: runs one frontend operation against both backends and prints
// the raw responses.
//   node rust/scripts/parity/one.mjs OperationName '{"var":1}' [share]
import path from "node:path"
import { Backend } from "./client.mjs"
import { loadOperations } from "./operations.mjs"

const [name, vars = "{}", endpoint = "owner"] = process.argv.slice(2)
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..")
const operation = loadOperations(repoRoot).get(name)
if (!operation) throw new Error(`unknown operation ${name}`)
for (const backend of [
  new Backend("elixir", process.env.ELIXIR_URL ?? "http://localhost:4100"),
  new Backend("rust", process.env.RUST_URL ?? "http://localhost:4200"),
]) {
  await backend.login()
  const result = await backend.graphql(endpoint, operation.query, JSON.parse(vars), name)
  console.log(`--- ${backend.name} (${result.status})\n${JSON.stringify(result.body, null, 1)}`)
}
