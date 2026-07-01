defmodule Manavault.Catalog.Scryfall.Fetch do
  @moduledoc false

  def url(url) do
    case Req.get(url, request_options()) do
      {:ok, %{status: status, body: body}} when status in 200..299 -> {:ok, body}
      {:ok, %{status: status}} -> {:error, "Scryfall request failed with HTTP #{status}"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp request_options do
    [
      # Keep the (~2GB) bulk payload as a raw binary. Letting Req JSON-decode it
      # and then re-encoding a binary for downstream tripled peak memory; the
      # sync/rulings callers Jason.decode the binary themselves exactly once.
      decode_body: false,
      headers: [
        {"accept", "application/json"},
        {"user-agent", "ManaVault/0.1 (+https://github.com/cfbender/manavault)"}
      ]
    ] ++ Application.get_env(:manavault, :scryfall_req_options, [])
  end
end
