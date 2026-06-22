defmodule Manavault.Backup.Cron do
  @moduledoc false

  @ranges [minute: 0..59, hour: 0..23, day: 1..31, month: 1..12, weekday: 0..7]

  def parse(expression) when is_binary(expression) do
    fields = expression |> String.trim() |> String.split(~r/\s+/, trim: true)

    if length(fields) == 5 do
      fields
      |> Enum.zip(@ranges)
      |> Enum.reduce_while({:ok, %{}}, fn {field, {name, range}}, {:ok, acc} ->
        case parse_field(field, range) do
          {:ok, values} -> {:cont, {:ok, Map.put(acc, name, values)}}
          {:error, reason} -> {:halt, {:error, "invalid #{name}: #{reason}"}}
        end
      end)
    else
      {:error, "must contain five fields"}
    end
  end

  def parse(_expression), do: {:error, "must be a string"}

  def matches?(expression, %DateTime{} = datetime) do
    with {:ok, parsed} <- parse(expression) do
      matches_parsed?(parsed, datetime)
    else
      _ -> false
    end
  end

  def matches_parsed?(parsed, %DateTime{} = datetime) do
    weekday = Date.day_of_week(DateTime.to_date(datetime))
    cron_weekday = if weekday == 7, do: 0, else: weekday

    member?(parsed.minute, datetime.minute) and
      member?(parsed.hour, datetime.hour) and
      member?(parsed.day, datetime.day) and
      member?(parsed.month, datetime.month) and
      (member?(parsed.weekday, cron_weekday) or (cron_weekday == 0 and member?(parsed.weekday, 7)))
  end

  defp parse_field("*", range), do: {:ok, MapSet.new(range)}

  defp parse_field(field, range) do
    field
    |> String.split(",", trim: true)
    |> Enum.reduce_while({:ok, MapSet.new()}, fn part, {:ok, acc} ->
      case parse_part(part, range) do
        {:ok, values} -> {:cont, {:ok, MapSet.union(acc, values)}}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp parse_part(part, range) do
    case String.split(part, "/", parts: 2) do
      [base] ->
        parse_base(base, range, 1)

      [base, step] ->
        with {step, ""} <- Integer.parse(step), true <- step > 0 do
          parse_base(base, range, step)
        else
          _ -> {:error, "bad step #{inspect(step)}"}
        end
    end
  end

  defp parse_base("*", range, step), do: range_values(range, step)

  defp parse_base(base, range, step) do
    case String.split(base, "-", parts: 2) do
      [value] ->
        case parse_int(value) do
          {:ok, int} ->
            if int in range,
              do: {:ok, MapSet.new([int])},
              else: {:error, "#{int} is outside #{range.first}-#{range.last}"}

          :error ->
            {:error, "bad value #{value}"}
        end

      [first, last] ->
        with {:ok, first} <- parse_int(first),
             {:ok, last} <- parse_int(last),
             true <- first <= last,
             true <- first in range and last in range do
          range_values(first..last, step)
        else
          _ -> {:error, "bad range #{base}"}
        end
    end
  end

  defp range_values(range, step) do
    values = range |> Enum.take_every(step) |> MapSet.new()
    {:ok, values}
  end

  defp parse_int(value) do
    case Integer.parse(value) do
      {int, ""} -> {:ok, int}
      _ -> :error
    end
  end

  defp member?(values, value), do: MapSet.member?(values, value)
end
