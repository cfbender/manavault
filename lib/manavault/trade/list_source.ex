defmodule Manavault.Trade.ListSource do
  @moduledoc """
  Resolves pasted decklist text or a supported deck URL into a source name
  and normalized entries (`%{name, quantity, zone, set_code, collector_number}`).

  URL fetching is restricted to two hardcoded external API origins
  (`api2.moxfield.com`, `archidekt.com`), reached only with an id validated
  by regex from the URL's own path — the URL's host is never itself used to
  build the fetched address. ManaVault's own `/share/decks/<token>`,
  `/share/wants/<token>`, and `/share/binder/<token>` links are handled
  specially: a *relative* link (no host) resolves locally with no
  outbound request at all, while an
  *absolute* `http`/`https` link always fetches from that URL's own origin
  via `POST {origin}/share/graphql` — even when the origin happens to be
  this very instance, so a foreign instance's token is never mistaken for a
  local one. Anything else is a friendly "unsupported" error.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Decklists, Printing, Util}
  alias Manavault.Repo
  alias Manavault.Trade.ListSource.{Archidekt, ManaVault, ManaVaultRemote, Moxfield}

  @unsupported_error "Unsupported link. Paste the list text instead."

  @doc """
  Resolves `%{url: url_or_nil, text: text_or_nil}` — text wins when both are
  present. Returns `{:ok, %{source_name: String.t() | nil, entries: [map()]}}`
  or `{:error, message}`.
  """
  def resolve(%{url: url, text: text}) do
    cond do
      present?(text) -> {:ok, from_text(text)}
      present?(url) -> from_url(String.trim(url))
      true -> {:error, "Paste a decklist or a supported link to match."}
    end
  end

  defp from_text(text) do
    entries = Decklists.parse(text)
    printings = printings_by_id(entries)

    normalized =
      Enum.map(entries, fn entry ->
        printing = Map.get(printings, entry["preferred_printing_id"])

        %{
          name: entry["name"],
          quantity: Util.parse_quantity(entry["quantity"]),
          zone: Map.get(entry, "zone", "mainboard"),
          set_code: printing && printing.set_code,
          collector_number: printing && printing.collector_number
        }
      end)

    %{source_name: nil, entries: normalized}
  end

  defp from_url(url) do
    case URI.new(url) do
      {:ok, uri} -> dispatch(uri)
      {:error, _reason} -> {:error, @unsupported_error}
    end
  end

  defp dispatch(%URI{path: path}) when not is_binary(path), do: {:error, @unsupported_error}

  defp dispatch(%URI{path: path} = uri) do
    case ManaVault.share_path(path) do
      {:ok, kind, token} -> dispatch_share(uri, kind, token)
      :error -> dispatch_external(uri, path)
    end
  end

  # A relative `/share/decks/<token>`, `/share/wants/<token>`, or
  # `/share/binder/<token>` link (no
  # host) resolves locally: it was copied from this browser's own address
  # bar, so the token itself is proof enough, and no outbound request is
  # made. An absolute link always fetches over HTTP from its own origin
  # instead — never resolved locally, even when the host matches this very
  # instance — so a foreign instance's token is never mistaken for a local
  # one; pasting your own instance's link simply loops back over HTTP to
  # this same server's public endpoint.
  defp dispatch_share(%URI{host: nil}, kind, token), do: ManaVault.fetch(kind, token)

  defp dispatch_share(%URI{host: host} = uri, kind, token) when is_binary(host) do
    ManaVaultRemote.fetch(kind, uri, token)
  end

  defp dispatch_share(_uri, _kind, _token), do: {:error, @unsupported_error}

  defp dispatch_external(%URI{host: host}, path) do
    cond do
      Moxfield.host?(host) -> with_valid_id(Moxfield.deck_id(path), &Moxfield.fetch/1)
      Archidekt.host?(host) -> with_valid_id(Archidekt.deck_id(path), &Archidekt.fetch/1)
      true -> {:error, @unsupported_error}
    end
  end

  defp with_valid_id({:ok, id}, fetch), do: fetch.(id)
  defp with_valid_id(:error, _fetch), do: {:error, @unsupported_error}

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(_value), do: false

  defp printings_by_id(entries) do
    ids =
      entries
      |> Enum.map(& &1["preferred_printing_id"])
      |> Enum.filter(&is_binary/1)
      |> Enum.uniq()

    Printing
    |> where([printing], printing.scryfall_id in ^ids)
    |> Repo.all()
    |> Map.new(&{&1.scryfall_id, &1})
  end
end
