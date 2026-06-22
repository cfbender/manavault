defmodule Manavault.Backup.CronTest do
  use ExUnit.Case, async: true

  alias Manavault.Backup.Cron

  test "matches wildcard, step, and exact fields" do
    monday = DateTime.new!(~D[2026-06-22], ~T[03:15:00], "Etc/UTC")

    assert Cron.matches?("*/15 3 * * 1", monday)
    refute Cron.matches?("*/20 3 * * 1", monday)
    refute Cron.matches?("*/15 4 * * 1", monday)
  end

  test "validates five-field expressions" do
    assert {:ok, _parsed} = Cron.parse("0 3 * * *")
    assert {:error, "must contain five fields"} = Cron.parse("0 3 * *")
    assert {:error, "invalid minute: 99 is outside 0-59"} = Cron.parse("99 3 * * *")
  end
end
