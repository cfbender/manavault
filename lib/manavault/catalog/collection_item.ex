defmodule Manavault.Catalog.CollectionItem do
  use Ecto.Schema

  import Ecto.Changeset

  @foreign_key_type :string
  schema "collection_items" do
    field :quantity, :integer, default: 1
    field :condition, :string, default: "near_mint"
    field :language, :string, default: "en"
    field :finish, :string, default: "nonfoil"
    field :location, :string
    field :notes, :string
    field :purchase_price_cents, :integer
    field :for_trade, :boolean, default: false
    field :for_trade_quantity, :integer, default: 0
    field :location_changed_at, :utc_datetime

    belongs_to :printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :scryfall_id,
      define_field: true

    belongs_to :location_assoc, Manavault.Catalog.Location,
      foreign_key: :location_id,
      define_field: true,
      on_replace: :nilify,
      references: :id,
      type: :integer

    has_many :deck_allocations, Manavault.Catalog.DeckAllocation

    timestamps(type: :utc_datetime)
  end

  @conditions ~w(near_mint lightly_played moderately_played heavily_played damaged)
  @finishes ~w(nonfoil foil etched)

  def create_changeset(collection_item, attrs) do
    collection_item
    |> cast(attrs, [
      :scryfall_id,
      :quantity,
      :condition,
      :language,
      :finish,
      :location_id,
      :notes,
      :purchase_price_cents,
      :for_trade,
      :for_trade_quantity
    ])
    |> sync_for_trade_fields()
    |> put_location_changed_at()
    |> validate_common_fields()
    |> validate_required([:scryfall_id])
    |> foreign_key_constraint(:scryfall_id)
    |> foreign_key_constraint(:location_id)
  end

  def update_changeset(collection_item, attrs) do
    collection_item
    |> cast(attrs, [
      :scryfall_id,
      :quantity,
      :condition,
      :language,
      :finish,
      :location_id,
      :notes,
      :purchase_price_cents,
      :for_trade,
      :for_trade_quantity
    ])
    |> sync_for_trade_fields()
    |> put_location_changed_at()
    |> validate_common_fields()
    |> foreign_key_constraint(:scryfall_id)
    |> foreign_key_constraint(:location_id)
  end

  def switch_printing_changeset(collection_item, attrs) do
    collection_item
    |> cast(attrs, [:scryfall_id, :language, :finish])
    |> validate_required([:scryfall_id, :language, :finish])
    |> validate_inclusion(:finish, @finishes)
    |> foreign_key_constraint(:scryfall_id)
  end

  defp put_location_changed_at(changeset) do
    if get_change(changeset, :location_id) do
      put_change(changeset, :location_changed_at, current_timestamp())
    else
      changeset
    end
  end

  defp current_timestamp do
    DateTime.utc_now()
    |> DateTime.truncate(:second)
  end

  defp validate_common_fields(changeset) do
    changeset
    |> validate_required([:quantity, :condition, :language, :finish, :for_trade_quantity])
    |> validate_number(:quantity, greater_than: 0)
    |> validate_number(:purchase_price_cents, greater_than_or_equal_to: 0)
    |> validate_number(:for_trade_quantity, greater_than_or_equal_to: 0)
    |> validate_for_trade_quantity()
    |> validate_inclusion(:condition, @conditions)
    |> validate_inclusion(:finish, @finishes)
  end

  defp sync_for_trade_fields(changeset) do
    cond do
      param_present?(changeset, :for_trade_quantity) ->
        case get_field(changeset, :for_trade_quantity) do
          quantity when is_integer(quantity) -> put_change(changeset, :for_trade, quantity > 0)
          _invalid -> changeset
        end

      param_present?(changeset, :for_trade) ->
        quantity =
          if get_field(changeset, :for_trade), do: get_field(changeset, :quantity), else: 0

        put_change(changeset, :for_trade_quantity, quantity)

      param_present?(changeset, :quantity) ->
        quantity = get_field(changeset, :quantity)

        if is_integer(quantity) do
          for_trade_quantity = min(get_field(changeset, :for_trade_quantity) || 0, quantity)

          changeset
          |> put_change(:for_trade_quantity, for_trade_quantity)
          |> put_change(:for_trade, for_trade_quantity > 0)
        else
          changeset
        end

      true ->
        changeset
    end
  end

  defp param_present?(%Ecto.Changeset{params: params}, field) when is_map(params) do
    Map.has_key?(params, field) or Map.has_key?(params, Atom.to_string(field))
  end

  defp param_present?(_changeset, _field), do: false

  defp validate_for_trade_quantity(changeset) do
    max_quantity = get_field(changeset, :quantity)

    validate_change(changeset, :for_trade_quantity, fn :for_trade_quantity, quantity ->
      if is_integer(max_quantity) and quantity > max_quantity,
        do: [for_trade_quantity: "cannot exceed quantity owned"],
        else: []
    end)
  end
end
