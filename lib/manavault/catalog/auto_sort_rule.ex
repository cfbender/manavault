defmodule Manavault.Catalog.AutoSortRule do
  use Ecto.Schema

  import Ecto.Changeset

  alias Manavault.Catalog.Util

  @color_modes ~w(any include_any include_all exact colorless multicolor)
  @set_operators ~w(in not_in)
  @release_date_operators ~w(before after)
  @list_fields [:colors, :type_line_includes, :type_line_excludes, :rarities, :set_codes]

  schema "collection_auto_sort_rules" do
    field :name, :string
    field :enabled, :boolean, default: true
    field :priority, :integer
    field :color_mode, :string, default: "any"
    field :colors, :string, default: "[]"
    field :type_line_includes, :string, default: "[]"
    field :type_line_excludes, :string, default: "[]"
    field :rarities, :string, default: "[]"
    field :min_price_cents, :integer
    field :max_price_cents, :integer
    field :set_operator, :string, default: "in"
    field :set_codes, :string, default: "[]"
    field :release_date_operator, :string, default: "after"
    field :release_date, :date

    belongs_to :target_location, Manavault.Catalog.Location

    timestamps(type: :utc_datetime)
  end

  def changeset(rule, attrs) do
    rule
    |> cast(normalize_list_attrs(attrs), [
      :name,
      :enabled,
      :priority,
      :target_location_id,
      :color_mode,
      :colors,
      :type_line_includes,
      :type_line_excludes,
      :rarities,
      :min_price_cents,
      :max_price_cents,
      :set_operator,
      :set_codes,
      :release_date_operator,
      :release_date
    ])
    |> validate_required([
      :name,
      :enabled,
      :priority,
      :target_location_id,
      :color_mode,
      :set_operator,
      :release_date_operator
    ])
    |> validate_inclusion(:color_mode, @color_modes)
    |> validate_inclusion(:set_operator, @set_operators)
    |> validate_inclusion(:release_date_operator, @release_date_operators)
    |> validate_number(:priority, greater_than_or_equal_to: 0)
    |> validate_number(:min_price_cents, greater_than_or_equal_to: 0)
    |> validate_number(:max_price_cents, greater_than_or_equal_to: 0)
    |> validate_json_list_fields()
    |> validate_price_bounds()
    |> foreign_key_constraint(:target_location_id)
  end

  def list_field(%__MODULE__{} = rule, field) when field in @list_fields do
    rule
    |> Map.get(field)
    |> decode_list()
  end

  def decode_list(value) when is_list(value), do: normalized_strings(value)
  def decode_list(value), do: value |> Util.decode_json([]) |> normalized_strings()

  defp normalize_list_attrs(attrs) when is_map(attrs) do
    Enum.reduce(@list_fields, attrs, fn field, normalized_attrs ->
      normalize_list_attr(normalized_attrs, field)
    end)
  end

  defp normalize_list_attrs(attrs), do: attrs

  defp normalize_list_attr(attrs, field) do
    case fetch_attr(attrs, field) do
      {:ok, value} when is_list(value) ->
        put_attr(attrs, field, Util.encode_json(Enum.map(value, &to_string/1)))

      _other ->
        attrs
    end
  end

  defp validate_json_list_fields(changeset) do
    Enum.reduce(@list_fields, changeset, fn field, changeset ->
      validate_change(changeset, field, fn ^field, value ->
        if json_list?(value), do: [], else: [{field, "must be a JSON list"}]
      end)
    end)
  end

  defp json_list?(value) when is_binary(value), do: is_list(Util.decode_json(value, nil))
  defp json_list?(value) when is_list(value), do: true
  defp json_list?(_value), do: false

  defp validate_price_bounds(changeset) do
    min_price = get_field(changeset, :min_price_cents)
    max_price = get_field(changeset, :max_price_cents)

    if is_integer(min_price) and is_integer(max_price) and min_price > max_price do
      add_error(changeset, :max_price_cents, "must be greater than or equal to min price")
    else
      changeset
    end
  end

  defp normalized_strings(values) do
    values
    |> List.wrap()
    |> Enum.filter(&is_binary/1)
  end

  defp fetch_attr(attrs, field) do
    string_field = Atom.to_string(field)
    camel_field = snake_to_camel(string_field)

    cond do
      Map.has_key?(attrs, field) -> {:ok, Map.fetch!(attrs, field)}
      Map.has_key?(attrs, string_field) -> {:ok, Map.fetch!(attrs, string_field)}
      Map.has_key?(attrs, camel_field) -> {:ok, Map.fetch!(attrs, camel_field)}
      true -> :error
    end
  end

  defp put_attr(attrs, field, value) do
    string_field = Atom.to_string(field)
    camel_field = snake_to_camel(string_field)

    cond do
      Map.has_key?(attrs, field) -> Map.put(attrs, field, value)
      Map.has_key?(attrs, string_field) -> Map.put(attrs, string_field, value)
      Map.has_key?(attrs, camel_field) -> Map.put(attrs, camel_field, value)
      true -> attrs
    end
  end

  defp snake_to_camel(value) do
    value
    |> String.split("_")
    |> then(fn [head | tail] -> head <> Enum.map_join(tail, "", &String.capitalize/1) end)
  end
end
