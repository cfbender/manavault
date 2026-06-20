defmodule ManavaultWeb.Schema.PublicShareTypes do
  use Absinthe.Schema.Notation

  alias ManavaultWeb.Schema.CatalogResolvers

  object :card do
    field :oracle_id, non_null(:id)
    field :name, non_null(:string)
    field :type_line, :string
    field :mana_cost, :string
    field :cmc, :float

    field :colors, list_of(:string) do
      resolve(fn card, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(card, :colors, [])}
      end)
    end

    field :color_identity, list_of(:string) do
      resolve(fn card, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(card, :color_identity, [])}
      end)
    end

    field :printings, list_of(:printing)
  end

  object :printing do
    field :scryfall_id, non_null(:id)
    field :oracle_id, non_null(:id)
    field :set_code, :string
    field :set_name, :string
    field :collector_number, :string
    field :lang, :string
    field :rarity, :string

    field :finishes, list_of(:string) do
      resolve(fn printing, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(printing, :finishes, [])}
      end)
    end

    field :image_url, :string do
      resolve(&CatalogResolvers.printing_image_url/3)
    end

    field :art_crop_url, :string do
      resolve(&CatalogResolvers.printing_art_crop_url/3)
    end

    field :price_text, :string do
      resolve(&CatalogResolvers.printing_price_text/3)
    end

    field :card, :card
  end

  object :collection_item do
    field :id, non_null(:id)
    field :quantity, non_null(:integer)
    field :condition, non_null(:string)
    field :language, non_null(:string)
    field :finish, non_null(:string)
    field :price_text, :string
    field :location, :location
    field :printing, :printing
  end

  object :location do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :kind, non_null(:string)
  end

  object :deck do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :format, non_null(:string)
    field :status, non_null(:string)
    field :share_token, :string

    field :card_count, :integer do
      resolve(&CatalogResolvers.deck_card_count/3)
    end

    field :unique_card_count, :integer do
      resolve(&CatalogResolvers.deck_unique_card_count/3)
    end

    field :deck_cards, list_of(:deck_card)
  end

  object :deck_card do
    field :id, non_null(:id)
    field :quantity, non_null(:integer)
    field :zone, :string
    field :finish, :string
    field :preferred_printing, :printing
    field :card, :card

    field :allocation_status, non_null(:deck_card_allocation_status) do
      resolve(fn deck_card, _, _ ->
        {:ok,
         %{
           state: "shared",
           required: deck_card.quantity,
           owned: 0,
           allocated: 0,
           available: 0,
           allocated_elsewhere: 0,
           missing: 0,
           candidates: []
         }}
      end)
    end
  end

  object :deck_card_allocation_status do
    field :state, non_null(:string)
    field :required, non_null(:integer)
    field :owned, non_null(:integer)
    field :allocated, non_null(:integer)
    field :available, non_null(:integer)
    field :allocated_elsewhere, non_null(:integer)
    field :missing, non_null(:integer)
    field :candidates, non_null(list_of(non_null(:deck_card_allocation_candidate)))
  end

  object :deck_card_allocation_candidate do
    field :item, non_null(:collection_item)
    field :allocated, non_null(:integer)
    field :allocated_elsewhere, non_null(:integer)
    field :available, non_null(:integer)
  end
end
