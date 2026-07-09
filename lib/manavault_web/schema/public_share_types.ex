defmodule ManavaultWeb.Schema.PublicShareTypes do
  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  import Absinthe.Resolution.Helpers, only: [dataloader: 1, dataloader: 2]

  alias Manavault.Catalog

  alias ManavaultWeb.Schema.CatalogResolvers

  object :scryfall_oracle_tag do
    field :id, non_null(:id) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :slug, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :label, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :weight, :string do
      resolve(fn tag, _, _ ->
        case Map.get(tag, :weight) || Map.get(tag, "weight") do
          nil -> {:ok, nil}
          weight -> {:ok, to_string(weight)}
        end
      end)
    end

    field :annotation, :string do
      resolve(&CatalogResolvers.map_value/3)
    end
  end

  object :card_ruling do
    field :source, :string
    field :published_at, :string
    field :comment, non_null(:string)
  end

  object :card_legality do
    field :format, non_null(:string)
    field :status, non_null(:string)
  end

  node object(:card, id_fetcher: &ManavaultWeb.Schema.PublicShareTypes.card_node_id/2) do
    field :oracle_id, non_null(:id)
    field :name, non_null(:string)
    field :type_line, :string
    field :mana_cost, :string
    field :oracle_text, :string
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

    field :game_changer, non_null(:boolean)

    field :oracle_tags, list_of(:scryfall_oracle_tag) do
      resolve(fn card, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(card, :oracle_tags, [])}
      end)
    end

    field :deck_category, :string

    field :deck_themes, list_of(:string) do
      resolve(fn card, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(card, :deck_themes, [])}
      end)
    end

    field :rulings, non_null(list_of(non_null(:card_ruling))) do
      resolve(&CatalogResolvers.card_rulings/3)
    end

    field :legalities, non_null(list_of(non_null(:card_legality))) do
      resolve(&CatalogResolvers.card_legalities/3)
    end

    connection field :printings, node_type: :printing do
      resolve(&CatalogResolvers.card_printings/3)
    end
  end

  node object(:printing, id_fetcher: &ManavaultWeb.Schema.PublicShareTypes.printing_node_id/2) do
    field :scryfall_id, non_null(:id)
    field :oracle_id, non_null(:id)
    field :set_code, :string
    field :set_name, :string
    field :collector_number, :string
    field :lang, :string
    field :rarity, :string

    field :owned_count, non_null(:integer) do
      resolve(fn _printing, _args, _resolution -> {:ok, 0} end)
    end

    field :finishes, list_of(:string) do
      resolve(fn printing, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(printing, :finishes, [])}
      end)
    end

    field :image_url, :string do
      resolve(&CatalogResolvers.printing_image_url/3)
    end

    field :back_image_url, :string do
      resolve(&CatalogResolvers.printing_back_image_url/3)
    end

    field :art_crop_url, :string do
      resolve(&CatalogResolvers.printing_art_crop_url/3)
    end

    field :prices, :json do
      resolve(fn printing, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(printing, :prices, %{})}
      end)
    end

    field :price_text, :string do
      resolve(&CatalogResolvers.printing_price_text/3)
    end

    field :released_at, :string

    field :card, :card, resolve: dataloader(Catalog)
  end

  node object(:collection_item) do
    field :quantity, non_null(:integer)
    field :condition, non_null(:string)
    field :language, non_null(:string)
    field :finish, non_null(:string)
    field :price_text, :string
    field :location, :location, resolve: dataloader(Catalog, :location_assoc)
    field :printing, :printing, resolve: dataloader(Catalog)
  end

  node object(:location) do
    field :name, non_null(:string)
    field :kind, non_null(:string)
  end

  object :deck_legality do
    field :status, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :issues, non_null(list_of(non_null(:deck_legality_issue))) do
      resolve(&CatalogResolvers.map_value/3)
    end
  end

  object :deck_legality_issue do
    field :code, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :message, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :severity, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :card_name, :string do
      resolve(&CatalogResolvers.map_value/3)
    end
  end

  object :deck_tag do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :color, non_null(:string)
    field :target_count, :integer
    field :position, non_null(:integer)
    field :card_count, non_null(:integer)
  end

  object :deck_buylist_entry do
    field :card_name, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :quantity, non_null(:integer) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :missing, non_null(:integer) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :unavailable, non_null(:integer) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :reason, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :finish, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :set_code, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :collector_number, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :language, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :unit_price_cents, :integer do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :total_price_cents, :integer do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :unit_price_text, :string do
      resolve(&CatalogResolvers.buylist_entry_unit_price_text/3)
    end

    field :total_price_text, :string do
      resolve(&CatalogResolvers.buylist_entry_total_price_text/3)
    end
  end

  node object(:deck) do
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

    field :legality, non_null(:deck_legality) do
      resolve(&CatalogResolvers.deck_legality/3)
    end

    field :tags, non_null(list_of(non_null(:deck_tag))) do
      resolve(&CatalogResolvers.deck_tags/3)
    end

    connection field :deck_cards, node_type: :deck_card do
      resolve(&CatalogResolvers.deck_cards/3)
    end
  end

  node object(:deck_card) do
    field :quantity, non_null(:integer)
    field :zone, :string
    field :finish, :string
    field :tag, :string

    field :price_cents, :integer do
      resolve(&CatalogResolvers.deck_card_price_cents/3)
    end

    field :preferred_printing, :printing, resolve: dataloader(Catalog)
    field :card, :card, resolve: dataloader(Catalog)
    field :fallback_printing, :printing

    field :tag_ids, non_null(list_of(non_null(:id))) do
      resolve(&CatalogResolvers.deck_card_tag_ids/3)
    end

    field :allocation_status, non_null(:deck_card_allocation_status) do
      resolve(fn deck_card, _, _ ->
        {:ok,
         %{
           state: "shared",
           required: deck_card.quantity,
           owned: 0,
           allocated: 0,
           proxy_allocated: 0,
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
    field :proxy_allocated, non_null(:integer)
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

  connection(node_type: :card)
  connection(node_type: :printing)
  connection(node_type: :collection_item)
  connection(node_type: :location)
  connection(node_type: :deck)
  connection(node_type: :deck_card)

  scalar :json do
    parse(fn
      %{value: value}, _ -> {:ok, value}
      _, _ -> :error
    end)

    serialize(& &1)
  end

  def card_node_id(%{oracle_id: id}, _resolution), do: id
  def printing_node_id(%{scryfall_id: id}, _resolution), do: id
end
