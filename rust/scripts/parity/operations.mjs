// Extracts every GraphQL operation the React frontend sends from the
// graphql-codegen client preset (`assets/react/src/gql/gql.ts`) and resolves
// fragment spreads across documents, so each operation can be posted on its
// own exactly as Apollo would send it.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

export function loadGraphql(repoRoot) {
  const candidates = [repoRoot, "/home/user/workspace/repo"]
  for (const root of candidates) {
    const modules = path.join(root, "node_modules", "graphql", "package.json")
    if (fs.existsSync(modules)) return createRequire(modules)("graphql")
  }
  throw new Error("graphql package not found; run `mise exec -- aube install` in the repo root")
}

export function loadOperations(repoRoot) {
  const { parse, print, visit } = loadGraphql(repoRoot)
  const file = path.join(repoRoot, "assets/react/src/gql/gql.ts")
  const source = fs.readFileSync(file, "utf8")
  const start = source.indexOf("type Documents = {")
  const end = source.indexOf("\n};", start)
  if (start < 0 || end < 0) throw new Error(`no Documents map in ${file}`)
  const body = source.slice(start, end)
  const keyPattern = /^ {4}("(?:[^"\\]|\\.)*"): typeof/gm

  const fragments = new Map()
  const operations = new Map()
  let match
  while ((match = keyPattern.exec(body))) {
    const document = parse(JSON.parse(match[1]))
    for (const definition of document.definitions) {
      if (definition.kind === "FragmentDefinition") {
        fragments.set(definition.name.value, definition)
      } else if (definition.kind === "OperationDefinition") {
        if (operations.has(definition.name.value)) {
          throw new Error(`duplicate operation ${definition.name.value}`)
        }
        operations.set(definition.name.value, definition)
      }
    }
  }

  const spreadsOf = (node) => {
    const names = new Set()
    visit(node, {
      FragmentSpread(spread) {
        names.add(spread.name.value)
      },
    })
    return names
  }

  const result = new Map()
  for (const [name, operation] of operations) {
    const needed = new Set()
    const queue = [...spreadsOf(operation)]
    while (queue.length) {
      const fragmentName = queue.shift()
      if (needed.has(fragmentName)) continue
      const fragment = fragments.get(fragmentName)
      if (!fragment) throw new Error(`operation ${name} spreads unknown fragment ${fragmentName}`)
      needed.add(fragmentName)
      queue.push(...spreadsOf(fragment))
    }
    const text = [
      operation,
      ...[...needed].sort().map((fragmentName) => fragments.get(fragmentName)),
    ]
      .map((definition) => print(addTypename(definition, visit)))
      .join("\n\n")
    result.set(name, { name, kind: operation.operation, query: text })
  }
  return result
}

// Apollo's InMemoryCache adds `__typename` to every selection set except the
// operation root before sending a request; do the same so the documents match
// what the browser actually posts.
function addTypename(definition, visit) {
  const typename = { kind: "Field", name: { kind: "Name", value: "__typename" } }
  return visit(definition, {
    SelectionSet(node, _key, parent) {
      if (parent && parent.kind === "OperationDefinition") return undefined
      const hasTypename = node.selections.some(
        (selection) =>
          selection.kind === "Field" && selection.name.value === "__typename" && !selection.alias,
      )
      if (hasTypename) return undefined
      return { ...node, selections: [...node.selections, typename] }
    },
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(
    process.argv[2] ?? path.join(path.dirname(process.argv[1]), "../../.."),
  )
  const operations = loadOperations(repoRoot)
  for (const operation of operations.values()) {
    console.log(`# ${operation.kind} ${operation.name}\n${operation.query}\n`)
  }
  console.error(`${operations.size} operations`)
}
