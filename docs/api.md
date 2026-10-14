# Personal API

ManaVault exposes a read-only HTTP API for trusted applications that need the
instance owner's deck list. [The Gathering](https://github.com/cfbender/the-gathering)
is the first consumer.

ManaVault is a single-owner application. A personal API key therefore grants
read access to decks owned by that ManaVault instance; it cannot access another
instance and does not grant mutation access. Keys do not currently have scopes.

## Create and Revoke a Key

Sign in to ManaVault, open **Settings**, and find **Personal API keys**. Give the
key a recognizable name such as `The Gathering`, then select **Create key**.

Copy the full `mvk_…` value immediately. ManaVault shows it once and stores only
its SHA-256 hash. The settings page continues to show the key's name, prefix,
creation time, and last-used time. Revoking a key makes it invalid immediately.

## Interactive Documentation

ManaVault derives the OpenAPI 3.1 description from the handlers themselves, so
the document follows the code instead of drifting from it:

- `GET /api-docs/openapi.json` serves the document.
- `GET /docs/rest` serves Swagger UI over that document.

Both routes exist in every environment, production included, because they hold
only the contract and fictional examples: running an operation still needs a
real key. Select **Authorize**, paste the full `mvk_…` value, and use **Try it
out**. The requests go to the instance that served the page, and the key is
held by the page alone — it is not written to browser storage — so a reload
starts locked again.

The Swagger UI assets are embedded in the binary and served from the same
origin: nothing is fetched from a CDN or downloaded during the build. Spec
validation is switched off too, because Swagger UI's validator badge would
otherwise ask `validator.swagger.io` to fetch this instance's document, in a
URL that names this instance's host.

The documentation routes use the app's browser security headers, including
its Content Security Policy and `X-Content-Type-Options: nosniff`. The policy
allows framing only by the same origin.

## List Decks

Send the key as an HTTP Bearer credential. Cookies and CSRF headers are not
needed.

```http
GET /api/v1/decks?page=1&per_page=50 HTTP/1.1
Host: manavault.example.com
Authorization: Bearer mvk_your_full_personal_api_key
Accept: application/json
```

Decks are ordered by name, then ID. `page` defaults to `1`; `per_page` defaults
to `50` and is capped at `100`. Commander names follow the deterministic order
used by ManaVault's deck summary. `commanderColorIdentity` uses WUBRG letters,
or `C` for a colorless commander. It is `null` when a deck has no commander.

```json
{
  "data": [
    {
      "id": 42,
      "name": "Muldrotha Reanimator",
      "format": "commander",
      "commanders": ["Muldrotha, the Gravetide"],
      "commanderColorIdentity": ["U", "B", "G"],
      "cardCount": 100,
      "updated_at": "2026-09-20T14:32:10Z",
      "publicly_shared": true,
      "public_share_url": "https://manavault.example.com/share/decks/AbCdEf123456"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 1,
    "total_pages": 1
  }
}
```

An unshared deck has `"publicly_shared": false` and
`"public_share_url": null`.

## Errors and Limits

Missing, malformed, unknown, or revoked keys return `401 Unauthorized`:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "A valid Bearer API key is required"
  }
}
```

The endpoint uses the same abuse-protection budget as public share GraphQL:
120 requests per client IP and 1,200 requests globally per one-minute window by
default. A limited request returns `429 Too Many Requests`, a `Retry-After`
header, and:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many API requests"
  }
}
```

A request ManaVault cannot complete returns `500 Internal Server Error` with
`"code": "internal_error"`: the server could not look the key up, or it could not
read the deck list. A lookup that fails is deliberately not a `401`, because
`401` means the key itself is unusable. `code` is the part to match on; `message`
is human-readable and not stable.

## Documenting a New Endpoint

The OpenAPI document is generated from the code, never written by hand:

1. Derive `utoipa::ToSchema` on the types the handler serializes, keeping the
   `#[serde(rename…)]` names, the `Option<...>` fields, and the timestamp
   formats, so the schema describes the JSON a client receives. Give the query
   parameters an `utoipa::IntoParams` type as well, with their `default`,
   `minimum`, and `maximum`, so the bounds live next to the parsing rather than
   in prose.
2. Annotate the handler with `#[utoipa::path(...)]`: method and path, `tag`,
   `operation_id`, `summary`, `description`, `params(...)`,
   `security(("bearer_auth" = []))`, and one `responses(...)` entry per status
   the handler can return, each with its `body`, `content_type`, and an
   `example` or `examples(...)`. Document response headers such as
   `Retry-After` with `headers(...)`. Reuse `ApiError` for failures, and the
   message constants beside it so the example cannot drift from the response.
3. List the handler in `paths(...)` and its types in
   `components(schemas(...))` in
   `rust/crates/manavault-server/src/web/api_docs.rs`, adding a `tags(...)`
   entry for a new area.
4. Extend the tests: those next to `ApiDoc` assert the parts of the document
   that matter, and
   `rust/crates/manavault-server/tests/http/api_docs.rs` checks the served
   document against what the endpoint really returns — including validating it
   against the official OpenAPI 3.1 meta-schema (`tests/fixtures/`), so a change
   that produces an invalid contract fails the suite.
