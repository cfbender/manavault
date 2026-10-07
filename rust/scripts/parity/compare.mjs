// Response normalization and structural diffing.
//
// Both backends start from byte-identical databases and replay the same
// sequence of operations, so database ids and Relay global ids are expected
// to be equal and are compared verbatim. Only values that are legitimately
// different between two runs are masked: wall-clock timestamps, random share
// tokens and API key secrets.

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/
const MASKED_KEYS = new Set(["shareToken", "token", "prefix", "tradeWantsShareToken", "tradeBinderShareToken"])

export function normalize(value, secrets, key = null) {
  if (Array.isArray(value)) return value.map((item) => normalize(item, secrets))
  if (value && typeof value === "object") {
    const out = {}
    for (const [childKey, child] of Object.entries(value)) out[childKey] = normalize(child, secrets, childKey)
    return out
  }
  if (typeof value !== "string") return value
  if (key && MASKED_KEYS.has(key)) return "<secret>"
  if (key && /At$/.test(key) && TIMESTAMP.test(value)) return "<timestamp>"
  let text = value
  for (const secret of secrets) {
    if (secret && text.includes(secret)) text = text.split(secret).join("<secret>")
  }
  // Timestamps embedded in exports / messages (e.g. CSV "added" columns).
  text = text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<timestamp>")
  return text
}

/// Keeps what the UI can observe from a GraphQL response: data, error
/// messages and paths (not locations/extensions, which are engine-specific).
export function observable(result) {
  const body = result.body ?? {}
  const out = { status: result.status }
  if ("data" in body) out.data = body.data
  if (Array.isArray(body.errors)) {
    out.errors = body.errors.map((error) => {
      const entry = { message: error.message }
      if (error.path) entry.path = error.path
      return entry
    })
  }
  else if (body.errors) out.errors = body.errors
  if (body.transportError !== undefined) out.transportError = body.transportError
  if (body.nonJsonBody !== undefined) out.nonJsonBody = body.nonJsonBody
  return out
}

export function diff(left, right, path = "$", out = [], limit = 40) {
  if (out.length >= limit) return out
  if (Object.is(left, right)) return out
  const leftType = Array.isArray(left) ? "array" : left === null ? "null" : typeof left
  const rightType = Array.isArray(right) ? "array" : right === null ? "null" : typeof right
  if (leftType !== rightType) {
    out.push({ path, elixir: preview(left), rust: preview(right) })
    return out
  }
  if (leftType === "array") {
    if (left.length !== right.length) {
      out.push({ path: `${path}.length`, elixir: left.length, rust: right.length })
    }
    const length = Math.min(left.length, right.length)
    for (let index = 0; index < length; index += 1) diff(left[index], right[index], `${path}[${index}]`, out, limit)
    return out
  }
  if (leftType === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
      if (!(key in left)) out.push({ path: `${path}.${key}`, elixir: "<missing>", rust: preview(right[key]) })
      else if (!(key in right)) out.push({ path: `${path}.${key}`, elixir: preview(left[key]), rust: "<missing>" })
      else diff(left[key], right[key], `${path}.${key}`, out, limit)
    }
    return out
  }
  out.push({ path, elixir: preview(left), rust: preview(right) })
  return out
}

function preview(value) {
  const text = JSON.stringify(value)
  if (text === undefined) return value
  return text.length > 300 ? `${text.slice(0, 300)}…` : value
}
