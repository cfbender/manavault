defmodule ManavaultWeb.Schema.PricingResolvers do
  alias Manavault.Pricing

  def pricing_settings(_parent, _args, _resolution) do
    {:ok, serialize_settings()}
  end

  def update_pricing_settings(_parent, %{source: source}, _resolution) do
    case Pricing.set_source(source) do
      {:ok, _settings} -> {:ok, serialize_settings()}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def sync_vendor_prices(_parent, _args, _resolution) do
    case Pricing.sync_vendors_async() do
      {:ok, _job} -> {:ok, serialize_settings()}
      {:error, _changeset} -> {:error, "Vendor price sync could not be queued."}
    end
  end

  defp serialize_settings do
    %{
      source: Pricing.settings().source,
      sources: Pricing.sources(),
      vendors:
        Enum.map(Pricing.vendor_statuses(), fn status ->
          Map.update!(status, :last_synced_at, fn
            %DateTime{} = value -> DateTime.to_iso8601(value)
            nil -> nil
          end)
        end)
    }
  end

  defp changeset_error_message(changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
    |> Enum.map_join(", ", fn {field, messages} -> "#{field} #{Enum.join(messages, ", ")}" end)
  end
end
