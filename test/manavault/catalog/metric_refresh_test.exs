defmodule Manavault.Catalog.MetricRefreshTest do
  use ExUnit.Case, async: false

  import Ecto.Query

  alias Exqlite.Sqlite3
  alias Manavault.Catalog.{Card, Printing}
  alias Manavault.Catalog.EDHRec.CommanderRanks
  alias Manavault.Catalog.Mtgjson.Saltiness
  alias Manavault.Repo

  setup do
    directory =
      Path.join(System.tmp_dir!(), "metric-refresh-#{System.unique_integer([:positive])}")

    File.mkdir_p!(directory)
    database = Path.join(directory, "catalog.db")

    # A real pool, not Sandbox: savepoints inside its outer transaction cannot
    # demonstrate that another SQLite connection can acquire the write lock.
    repo =
      start_supervised!(
        {Repo, name: nil, database: database, pool: DBConnection.ConnectionPool, pool_size: 1}
      )

    Repo.put_dynamic_repo(repo)

    Repo.query!("""
    CREATE TABLE scryfall_cards (
      oracle_id TEXT PRIMARY KEY,
      edhrec_saltiness REAL,
      edhrec_commander_rank INTEGER
    )
    """)

    Repo.query!("""
    CREATE TABLE scryfall_printings (
      scryfall_id TEXT PRIMARY KEY,
      oracle_id TEXT REFERENCES scryfall_cards(oracle_id)
    )
    """)

    Repo.query!("CREATE TABLE write_probe (writes INTEGER NOT NULL)")
    Repo.query!("INSERT INTO write_probe VALUES (0)")

    for batch <- Enum.chunk_every(1..410, 200) do
      Repo.insert_all(
        Card,
        Enum.map(batch, fn index ->
          %{oracle_id: "card-#{index}", edhrec_saltiness: 999.0, edhrec_commander_rank: 999}
        end)
      )

      Repo.insert_all(
        Printing,
        Enum.map(batch, fn index ->
          %{scryfall_id: "printing-#{411 - index}", oracle_id: "card-#{index}"}
        end)
      )
    end

    Repo.insert_all(Card, [%{oracle_id: "never-scored"}])

    {:ok, writer} = Sqlite3.open(database)
    :ok = Sqlite3.execute(writer, "PRAGMA busy_timeout = 0")

    on_exit(fn ->
      Sqlite3.close(writer)
      File.rm_rf!(directory)
    end)

    %{writer: writer}
  end

  for {module, metric} <- [
        {Saltiness, :edhrec_saltiness},
        {CommanderRanks, :edhrec_commander_rank}
      ] do
    @module module
    @metric metric

    test "#{metric} allows another writer between update and cleanup batches", %{writer: writer} do
      probe_writes(writer, @metric)
      values = feed(@module) |> Map.put("missing-from-catalog", 42)
      expected_count = if @module == Saltiness, do: 206, else: 205

      assert {:ok, ^expected_count} = @module.update_cards(values)
      assert_metrics(@metric)

      probes = drain_probes()

      for {result, rows} <- probes do
        assert result == :ok
        assert rows <= 200
      end

      assert length(probes) >= 4
      assert %{rows: [[writes]]} = Repo.query!("SELECT writes FROM write_probe")
      assert writes == length(probes)

      # Empty data clears remaining old values, including more than one batch.
      assert {:ok, 0} = @module.update_cards(%{})

      refute Repo.exists?(from card in Card, where: not is_nil(field(card, ^@metric)))

      empty_probes = drain_probes()
      assert length(empty_probes) >= 2
      assert Enum.all?(empty_probes, fn {result, rows} -> result == :ok and rows <= 200 end)
    end

    test "#{metric} preserves committed progress after failure and converges on retry" do
      Repo.query!("""
      CREATE TRIGGER fail_later_metric_batch
      BEFORE UPDATE OF #{@metric} ON scryfall_cards
      WHEN NEW.#{@metric} IS NOT NULL AND
        (SELECT COUNT(*) FROM scryfall_cards WHERE #{@metric} != 999) >= 200
      BEGIN
        SELECT RAISE(ABORT, 'injected metric refresh failure');
      END
      """)

      assert_raise Exqlite.Error, ~r/injected metric refresh failure/, fn ->
        @module.update_cards(feed(@module))
      end

      # Only the failed statement rolls back. Stale cleanup hasn't run, and
      # untouched incoming values must not have been globally cleared first.
      assert %{rows: [[200, 210]]} =
               Repo.query!("""
               SELECT SUM(#{@metric} != 999), SUM(#{@metric} = 999)
               FROM scryfall_cards
               """)

      Repo.query!("DROP TRIGGER fail_later_metric_batch")
      assert {:ok, 205} = @module.update_cards(feed(@module))
      assert_metrics(@metric)
    end

    test "#{metric} retries an interrupted stale-value cleanup" do
      Repo.query!("""
      CREATE TRIGGER fail_later_cleanup_batch
      BEFORE UPDATE OF #{@metric} ON scryfall_cards
      WHEN NEW.#{@metric} IS NULL AND
        (SELECT COUNT(*) FROM scryfall_cards
         WHERE #{@metric} IS NULL AND oracle_id != 'never-scored') >= 200
      BEGIN
        SELECT RAISE(ABORT, 'injected metric cleanup failure');
      END
      """)

      assert_raise Exqlite.Error, ~r/injected metric cleanup failure/, fn ->
        @module.update_cards(feed(@module))
      end

      assert %{rows: [[205, 5, 201]]} =
               Repo.query!("""
               SELECT SUM(#{@metric} != 999), SUM(#{@metric} = 999), SUM(#{@metric} IS NULL)
               FROM scryfall_cards
               """)

      Repo.query!("DROP TRIGGER fail_later_cleanup_batch")
      assert {:ok, 205} = @module.update_cards(feed(@module))
      assert_metrics(@metric)
    end
  end

  defp feed(Saltiness), do: Map.new(1..205, &{"card-#{&1}", &1 / 10})
  defp feed(CommanderRanks), do: Map.new(1..205, &{"printing-#{411 - &1}", &1 * 2})

  defp assert_metrics(metric) do
    rows =
      Repo.all(
        from card in Card,
          select: {card.oracle_id, card.edhrec_saltiness, card.edhrec_commander_rank}
      )

    assert length(rows) == 411

    for {id, saltiness, rank} <- rows do
      if id == "never-scored" do
        assert {saltiness, rank} == {nil, nil}
      else
        index = id |> String.replace_prefix("card-", "") |> String.to_integer()

        if metric == :edhrec_saltiness do
          assert saltiness == if(index <= 205, do: index / 10, else: nil)
          assert rank == 999
        else
          assert rank == if(index <= 205, do: index * 2, else: nil)
          assert saltiness == 999.0
        end
      end
    end
  end

  defp probe_writes(writer, metric) do
    handler = {__MODULE__, make_ref()}

    :ok =
      :telemetry.attach(
        handler,
        [:manavault, :repo, :query],
        &__MODULE__.write_between_batches/4,
        {self(), writer, Atom.to_string(metric)}
      )

    on_exit(fn -> :telemetry.detach(handler) end)
  end

  def write_between_batches(_event, _measurements, metadata, {pid, writer, metric}) do
    query = metadata.query |> to_string() |> String.downcase()

    if self() == pid and String.starts_with?(query, "update") and
         String.contains?(query, metric) do
      result = Sqlite3.execute(writer, "UPDATE write_probe SET writes = writes + 1")
      {:ok, %{num_rows: rows}} = metadata.result
      send(pid, {:write_probe, result, rows})
    end
  end

  defp drain_probes do
    receive do
      {:write_probe, result, rows} -> [{result, rows} | drain_probes()]
    after
      0 -> []
    end
  end
end
