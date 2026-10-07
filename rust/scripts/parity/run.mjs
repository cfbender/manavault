#!/usr/bin/env node
// Differential parity harness: replays a deterministic scenario that calls
// every GraphQL operation the React frontend sends against the Elixir and the
// Rust backend (both started from copies of the same database) and diffs the
// normalized responses.
//
//   node rust/scripts/parity/run.mjs --elixir http://localhost:4100 \
//     --rust http://localhost:4200 [--report /tmp/parity-report.json] [--live]
//
// Usually invoked through `rust/scripts/parity/parity.sh`, which prepares the
// databases, starts both servers inside a network namespace without external
// network access, and runs this script.
import fs from "node:fs"
import path from "node:path"
import { Backend } from "./client.mjs"
import { diff, normalize, observable } from "./compare.mjs"
import { KNOWN_DIFFERENCES, NONDETERMINISTIC, NOT_EXERCISED } from "./known.mjs"
import { loadOperations } from "./operations.mjs"
import { scenario } from "./scenario.mjs"

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..")
const operations = loadOperations(repoRoot)
const backends = [
  new Backend("elixir", option("elixir", "http://localhost:4100")),
  new Backend("rust", option("rust", "http://localhost:4200")),
]
const reportPath = option("report", "/tmp/parity-report.json")
const databases = { elixir: option("elixir-db", null), rust: option("rust-db", null) }
const live = flag("live")
const verbose = flag("verbose")

const contexts = Object.fromEntries(
  backends.map((backend) => [backend.name, { secrets: new Set() }]),
)
const steps = []
const counters = new Map()

async function run(operationName, variables = {}, options = {}) {
  const operation = operations.get(operationName)
  if (!operation) throw new Error(`unknown operation ${operationName}`)
  if (options.alignSecond) await alignToSecond()
  const index = (counters.get(operationName) ?? 0) + 1
  counters.set(operationName, index)
  const label = options.label
    ? `${operationName}#${index} ${options.label}`
    : `${operationName}#${index}`
  const endpoint = options.endpoint ?? "owner"

  const results = await Promise.all(
    backends.map(async (backend) => {
      const context = contexts[backend.name]
      const vars = typeof variables === "function" ? variables(context) : variables
      const missing = undefinedPaths(vars)
      if (missing.length)
        console.log(
          `  ! ${backend.name}: ${operationName} variables ${missing.join(", ")} are undefined (capture failed?)`,
        )
      const result = await backend.graphql(endpoint, operation.query, vars, operationName)
      return { backend: backend.name, vars, result }
    }),
  )

  for (const { backend, result } of results) {
    const data = result.body?.data
    if (options.capture && data) {
      try {
        options.capture(contexts[backend], data, result.body)
      } catch (error) {
        console.error(`capture failed for ${label} on ${backend}: ${error.message}`)
      }
    }
  }

  const [elixir, rust] = results.map(({ backend, result }) =>
    normalize(observable(result), contexts[backend].secrets),
  )
  const differences = diff(elixir, rust)
  const known =
    differences.length &&
    KNOWN_DIFFERENCES.find((entry) => entry.match(label, differences, elixir, rust))
  const nondeterministic =
    differences.length &&
    !known &&
    NONDETERMINISTIC.find((entry) => entry.match(label, differences, elixir, rust))
  const status =
    differences.length === 0
      ? "identical"
      : known
        ? "known"
        : nondeterministic
          ? "nondeterministic"
          : "different"
  steps.push({
    label,
    operation: operationName,
    endpoint,
    status,
    reason:
      status === "known"
        ? known.reason
        : status === "nondeterministic"
          ? nondeterministic.reason
          : undefined,
    variables: { elixir: results[0].vars, rust: results[1].vars },
    differences,
    elixir: status === "identical" && !verbose ? undefined : elixir,
    rust: status === "identical" && !verbose ? undefined : rust,
    ms: { elixir: Math.round(results[0].result.ms), rust: Math.round(results[1].result.ms) },
  })
  const marker = { identical: "✓", known: "≈", nondeterministic: "~", different: "✗" }[status]
  const errorNote = Array.isArray(elixir.errors)
    ? ` (errors: ${elixir.errors.map((error) => error.message).join(" | ")})`
    : elixir.errors
      ? ` (errors: ${JSON.stringify(elixir.errors)})`
      : ""
  console.log(`${marker} ${label}${status === "identical" ? errorNote : ""}`)
  if (status === "different") {
    for (const difference of differences.slice(0, 8)) {
      console.log(
        `    ${difference.path}\n      elixir: ${JSON.stringify(difference.elixir)}\n      rust:   ${JSON.stringify(difference.rust)}`,
      )
    }
  }
  return {
    elixir: results[0].result.body,
    rust: results[1].result.body,
  }
}

function undefinedPaths(value, path = "$") {
  if (value === undefined) return [path]
  if (Array.isArray(value))
    return value.flatMap((item, index) => undefinedPaths(item, `${path}[${index}]`))
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) => undefinedPaths(child, `${path}.${key}`))
  return []
}

// Rows written with second precision (`inserted_at`) only tie the same way
// on both backends when both writes land in the same wall-clock second.
async function alignToSecond() {
  const ms = Date.now() % 1000
  if (ms > 50) await new Promise((resolve) => setTimeout(resolve, 1000 - ms + 20))
}

// Runs a statement on both databases (the harness's way to set state no
// operation can reach offline, e.g. AI settings that are validated online).
async function sql(statement) {
  const { DatabaseSync } = await import("node:sqlite")
  for (const [name, file] of Object.entries(databases)) {
    if (!file) throw new Error(`--${name}-db is required for sql()`)
    const db = new DatabaseSync(file)
    db.exec("PRAGMA busy_timeout = 10000")
    db.exec(statement)
    db.close()
  }
  console.log(`  sql: ${statement}`)
}

for (const backend of backends) await backend.login()
await scenario({ run, sql, live })

// ---- report -------------------------------------------------------------
const byOperation = new Map()
for (const name of operations.keys())
  byOperation.set(name, { calls: 0, identical: 0, known: 0, nondeterministic: 0, different: 0 })
for (const step of steps) {
  const entry = byOperation.get(step.operation)
  entry.calls += 1
  entry[step.status] += 1
}
const notCalled = [...byOperation].filter(([, entry]) => entry.calls === 0).map(([name]) => name)
const totals = {
  operations: operations.size,
  exercised: 0,
  allIdentical: 0,
  withKnown: 0,
  withNondeterministic: 0,
  withDifferences: 0,
  steps: steps.length,
}
for (const entry of byOperation.values()) {
  if (entry.calls === 0) continue
  totals.exercised += 1
  if (entry.different > 0) totals.withDifferences += 1
  else if (entry.known > 0) totals.withKnown += 1
  else if (entry.nondeterministic > 0) totals.withNondeterministic += 1
  else totals.allIdentical += 1
}
const stepTotals = steps.reduce(
  (acc, step) => ({ ...acc, [step.status]: (acc[step.status] ?? 0) + 1 }),
  {},
)

fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      totals,
      stepTotals,
      notCalled,
      notExercisedReasons: NOT_EXERCISED,
      byOperation: Object.fromEntries(byOperation),
      steps,
    },
    null,
    2,
  ),
)

console.log("\n=== parity summary ===")
console.log(
  `operations in gql.ts: ${totals.operations}; exercised: ${totals.exercised}; steps: ${totals.steps}`,
)
console.log(`operations identical in every call: ${totals.allIdentical}`)
console.log(`operations with documented differences only: ${totals.withKnown}`)
console.log(
  `operations with nondeterministic (masked-as-documented) differences only: ${totals.withNondeterministic}`,
)
console.log(`operations with UNEXPLAINED differences: ${totals.withDifferences}`)
console.log(`steps: ${JSON.stringify(stepTotals)}`)
if (notCalled.length) {
  console.log("not called:")
  for (const name of notCalled)
    console.log(`  ${name}: ${NOT_EXERCISED[name] ?? "(no reason recorded)"}`)
}
for (const step of steps.filter(
  (entry) => entry.status === "known" || entry.status === "nondeterministic",
)) {
  console.log(`  ${step.status}: ${step.label}: ${step.reason}`)
}
console.log(`report: ${reportPath}`)
process.exitCode = totals.withDifferences > 0 ? 1 : 0
