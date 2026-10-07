// Minimal ManaVault GraphQL client: a cookie session + CSRF token for the
// owner endpoint (`/api/graphql`) and unauthenticated calls to the public
// share endpoint (`/share/graphql`).

export class Backend {
  constructor(name, baseUrl) {
    this.name = name
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.cookies = new Map()
    this.csrf = null
  }

  cookieHeader() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ")
  }

  storeCookies(response) {
    const setCookies = response.headers.getSetCookie?.() ?? []
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";")
      const index = pair.indexOf("=")
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
  }

  async login() {
    const response = await fetch(`${this.baseUrl}/settings`, {
      headers: { cookie: this.cookieHeader() },
      redirect: "manual",
    })
    this.storeCookies(response)
    const html = await response.text()
    const match = html.match(/<meta name="csrf-token" content="([^"]+)"/)
    if (!match)
      throw new Error(`${this.name}: no csrf-token meta tag in GET /settings (${response.status})`)
    this.csrf = match[1]
    if (!this.cookies.has("_manavault_key") && !this.cookies.has("manavault_session"))
      throw new Error(`${this.name}: no session cookie`)
  }

  async graphql(endpoint, query, variables, operationName) {
    const share = endpoint === "share"
    const headers = { "content-type": "application/json", accept: "application/json" }
    if (!share) {
      headers.cookie = this.cookieHeader()
      headers["x-csrf-token"] = this.csrf
    }
    const started = performance.now()
    let response
    // Bandit closes the connection after a 500; a request undici sends on
    // that pooled socket fails with ECONNRESET/UND_ERR_SOCKET before the
    // server reads it, so it is safe to send once more.
    for (let attempt = 0; ; attempt += 1) {
      try {
        response = await fetch(`${this.baseUrl}${share ? "/share/graphql" : "/api/graphql"}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, variables, operationName }),
        })
        break
      } catch (error) {
        const cause = error.cause?.code ?? error.cause?.message ?? error.message
        if (attempt === 0 && (cause === "ECONNRESET" || cause === "UND_ERR_SOCKET")) continue
        return {
          status: 0,
          body: { transportError: String(cause) },
          ms: performance.now() - started,
        }
      }
    }
    if (!share) this.storeCookies(response)
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = { nonJsonBody: text.slice(0, 500) }
    }
    return { status: response.status, body, ms: performance.now() - started }
  }
}
