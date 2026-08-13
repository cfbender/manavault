defmodule Manavault.Catalog.EDHRec.CommanderRanks do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing}
  alias Manavault.Repo

  @pages_base_url "https://json.edhrec.com/pages/"
  @update_batch_size 200

  def fetch(fetcher, url, opts \\ []) when is_function(fetcher, 1) and is_binary(url) do
    page_delay_ms = Keyword.get(opts, :page_delay_ms, 200)
    fetch_pages(fetcher, url, page_delay_ms, MapSet.new(), %{}, 0)
  end

  def update_cards(ranks) when is_map(ranks) do
    Repo.transact(
      fn ->
        Repo.update_all(Card, set: [edhrec_commander_rank: nil])

        updated_count =
          ranks
          |> Enum.chunk_every(@update_batch_size)
          |> Enum.reduce(0, fn batch, count -> count + update_card_batch(batch) end)

        {:ok, updated_count}
      end,
      timeout: :infinity
    )
  end

  defp fetch_pages(fetcher, url, page_delay_ms, visited, ranks, page_count) do
    if MapSet.member?(visited, url) do
      {:error, "EDHREC commander ranking pagination repeated #{url}"}
    else
      with {:ok, body} <- fetcher.(url),
           {:ok, page} <- decode_page(body),
           {:ok, page_ranks, next_path} <- page_data(page) do
        ranks = Map.merge(ranks, page_ranks)
        page_count = page_count + 1

        if next_path do
          if page_delay_ms > 0, do: Process.sleep(page_delay_ms)

          fetch_pages(
            fetcher,
            page_url(next_path),
            page_delay_ms,
            MapSet.put(visited, url),
            ranks,
            page_count
          )
        else
          complete_fetch(ranks, page_count)
        end
      end
    end
  end

  defp complete_fetch(ranks, page_count) when map_size(ranks) > 0,
    do: {:ok, ranks, page_count}

  defp complete_fetch(_ranks, _page_count),
    do: {:error, "EDHREC commander ranking payload had no ranked commanders"}

  defp decode_page(body) when is_map(body), do: {:ok, body}

  defp decode_page(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, page} when is_map(page) -> {:ok, page}
      _other -> {:error, "EDHREC commander ranking payload was not a JSON object"}
    end
  end

  defp decode_page(_body), do: {:error, "EDHREC commander ranking payload was not JSON"}

  defp page_data(page) do
    cardlists = get_in(page, ["container", "json_dict", "cardlists"])

    if is_list(cardlists) do
      ranks =
        cardlists
        |> Enum.flat_map(&cardviews/1)
        |> Enum.reduce(%{}, &put_rank/2)

      next_path = Enum.find_value(cardlists, &next_path/1)
      {:ok, ranks, next_path}
    else
      {:error, "EDHREC commander ranking payload had no card list"}
    end
  end

  defp cardviews(%{"cardviews" => cardviews}) when is_list(cardviews), do: cardviews
  defp cardviews(_cardlist), do: []

  defp put_rank(%{"id" => id, "rank" => rank} = entry, ranks)
       when is_binary(id) and is_integer(rank) and rank > 0 do
    if Map.get(entry, "is_partner") == true, do: ranks, else: Map.put(ranks, id, rank)
  end

  defp put_rank(_entry, ranks), do: ranks

  defp next_path(%{"more" => path}) when is_binary(path) and path != "", do: path
  defp next_path(_cardlist), do: nil

  defp page_url("https://json.edhrec.com/pages/" <> _rest = url), do: url
  defp page_url(path), do: @pages_base_url <> String.trim_leading(path, "/")

  defp update_card_batch(ranks) do
    rank_by_printing_id = Map.new(ranks)
    printing_ids = Map.keys(rank_by_printing_id)

    rank_by_oracle_id =
      Printing
      |> where([printing], printing.scryfall_id in ^printing_ids)
      |> select([printing], {printing.scryfall_id, printing.oracle_id})
      |> Repo.all()
      |> Map.new(fn {printing_id, oracle_id} ->
        {oracle_id, Map.fetch!(rank_by_printing_id, printing_id)}
      end)

    update_oracle_batch(Map.to_list(rank_by_oracle_id))
    map_size(rank_by_oracle_id)
  end

  defp update_oracle_batch([]), do: :ok

  defp update_oracle_batch(ranks) do
    oracle_ids = Enum.map(ranks, &elem(&1, 0))
    cases = Enum.map_join(ranks, " ", fn _ -> "WHEN ? THEN ?" end)
    placeholders = Enum.map_join(oracle_ids, ", ", fn _ -> "?" end)
    case_params = Enum.flat_map(ranks, fn {oracle_id, rank} -> [oracle_id, rank] end)

    Repo.query!(
      """
      UPDATE scryfall_cards
      SET edhrec_commander_rank = CASE oracle_id #{cases} END
      WHERE oracle_id IN (#{placeholders})
      """,
      case_params ++ oracle_ids
    )

    :ok
  end
end
