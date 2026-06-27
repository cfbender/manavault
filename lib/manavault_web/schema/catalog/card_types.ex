defmodule ManavaultWeb.Schema.Catalog.CardTypes do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.CatalogResolvers

  object :scryfall_reload_result do
    field :status, non_null(:string)
    field :message, non_null(:string)
  end

  object :set_suggestion do
    field :set_code, non_null(:string)
    field :set_name, :string
  end

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

  node object(:card, id_fetcher: &ManavaultWeb.Schema.Catalog.CardTypes.card_node_id/2) do
    field :oracle_id, non_null(:id)
    field :name, non_null(:string)
    field :type_line, :string
    field :oracle_text, :string
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

  node object(:printing, id_fetcher: &ManavaultWeb.Schema.Catalog.CardTypes.printing_node_id/2) do
    field :scryfall_id, non_null(:id)
    field :oracle_id, non_null(:id)
    field :set_code, :string
    field :set_name, :string
    field :collector_number, :string
    field :lang, :string
    field :rarity, :string

    field :owned_count, non_null(:integer)

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

    field :image_uris, :json do
      resolve(fn printing, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(printing, :image_uris, %{})}
      end)
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
    field :card, :card, resolve: &CatalogResolvers.printing_card/3
  end

  connection(node_type: :card)
  connection(node_type: :printing)

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
