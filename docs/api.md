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
