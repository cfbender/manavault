defmodule ManavaultWeb.Schema do
  use Absinthe.Schema
  use Absinthe.Relay.Schema, :modern

  import_types(ManavaultWeb.Schema.CatalogTypes)
  import_types(ManavaultWeb.Schema.BackupTypes)

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, CollectionItem, Deck, DeckCard, Location, Printing}
  alias Manavault.Repo
  alias ManavaultWeb.Schema.{BackupResolvers, CatalogResolvers}

  node interface do
    resolve_type(fn
      %Card{}, _ -> :card
      %Printing{}, _ -> :printing
      %CollectionItem{}, _ -> :collection_item
      %Location{}, _ -> :location
      %Deck{}, _ -> :deck
      %DeckCard{}, _ -> :deck_card
      %{scryfall_id: _, set_code: _}, _ -> :printing
      %{oracle_id: _, name: _, type_line: _}, _ -> :card
      %{id: "unfiled"}, _ -> :location
      %{id: _, kind: _}, _ -> :location
      %{id: _, condition: _, finish: _}, _ -> :collection_item
      %{id: _, quantity: _, zone: _}, _ -> :deck_card
      %{id: _, format: _, status: _}, _ -> :deck
      _, _ -> nil
    end)
  end

  query do
    field :home_summary, non_null(:home_summary) do
      resolve(&CatalogResolvers.home_summary/3)
    end

    connection field :cards, node_type: :card, non_null: true do
      arg(:q, :string, default_value: "")
      resolve(&CatalogResolvers.cards/3)
    end

    field :card_name_suggestions, non_null(list_of(non_null(:string))) do
      arg(:q, :string, default_value: "")
      arg(:limit, :integer, default_value: 5)
      resolve(&CatalogResolvers.card_name_suggestions/3)
    end

    field :card, :card do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.card/3)
    end

    connection field :collection_items, node_type: :collection_item, non_null: true do
      arg(:filters, :collection_item_filters)
      arg(:sort, :collection_item_sort)
      resolve(&CatalogResolvers.collection_items/3)
    end

    field :collection_item_count, non_null(:integer) do
      arg(:filters, :collection_item_filters)
      resolve(&CatalogResolvers.collection_item_count/3)
    end

    field :collection_value_summary, non_null(:collection_value_summary) do
      resolve(&CatalogResolvers.collection_value_summary/3)
    end

    field :collection_export_csv, non_null(:string) do
      arg(:filters, :collection_item_filters)
      resolve(&CatalogResolvers.collection_export_csv/3)
    end

    field :collection_export_text, non_null(:string) do
      arg(:filters, :collection_item_filters)
      resolve(&CatalogResolvers.collection_export_text/3)
    end

    connection field :locations, node_type: :location, non_null: true do
      resolve(&CatalogResolvers.locations/3)
    end

    field :collection_auto_sort_rules, non_null(list_of(non_null(:collection_auto_sort_rule))) do
      resolve(&CatalogResolvers.collection_auto_sort_rules/3)
    end

    field :location, :location do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.location/3)
    end

    connection field :decks, node_type: :deck, non_null: true do
      resolve(&CatalogResolvers.decks/3)
    end

    field :deck, :deck do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.deck/3)
    end

    field :shared_deck, :deck do
      arg(:token, non_null(:string))
      resolve(&CatalogResolvers.shared_deck/3)
    end

    field :deck_export_text, non_null(:string) do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.deck_export_text/3)
    end

    field :deck_buylist, non_null(list_of(non_null(:deck_buylist_entry))) do
      arg(:id, non_null(:id))
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)
      arg(:assume_no_owned, :boolean, default_value: false)
      arg(:include_sideboard, :boolean, default_value: false)
      arg(:include_maybeboard, :boolean, default_value: false)
      resolve(&CatalogResolvers.deck_buylist/3)
    end

    field :deck_buylist_export, non_null(:string) do
      arg(:id, non_null(:id))
      arg(:format, :string, default_value: "text")
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)
      arg(:assume_no_owned, :boolean, default_value: false)
      arg(:include_sideboard, :boolean, default_value: false)
      arg(:include_maybeboard, :boolean, default_value: false)
      resolve(&CatalogResolvers.deck_buylist_export/3)
    end

    field :deck_edhrec, non_null(:deck_edhrec) do
      arg(:id, non_null(:id))
      arg(:exclude_lands, :boolean, default_value: false)
      arg(:offset, :integer, default_value: 0)
      resolve(&CatalogResolvers.deck_edhrec/3)
    end

    field :backup_settings, non_null(:backup_settings) do
      resolve(&BackupResolvers.backup_settings/3)
    end

    field :cloud_backups, non_null(list_of(non_null(:cloud_backup))) do
      resolve(&BackupResolvers.cloud_backups/3)
    end

    node field do
      resolve(fn
        %{type: :card, id: id}, resolution ->
          CatalogResolvers.card(nil, %{id: id}, resolution)

        %{type: :printing, id: id}, _resolution ->
          {:ok, Catalog.get_printing_by_scryfall_id(id)}

        %{type: :collection_item, id: id}, _resolution ->
          {:ok, Catalog.get_collection_item!(integer_id(id))}

        %{type: :location, id: id}, resolution ->
          CatalogResolvers.location(nil, %{id: id}, resolution)

        %{type: :deck, id: id}, resolution ->
          CatalogResolvers.deck(nil, %{id: id}, resolution)

        %{type: :deck_card, id: id}, _resolution ->
          {:ok, Repo.get!(DeckCard, integer_id(id))}

        _node, _resolution ->
          {:ok, nil}
      end)
    end
  end

  mutation do
    payload field :update_backup_settings do
      arg(:input, non_null(:backup_settings_input))

      output do
        field :backup_settings, :backup_settings
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &BackupResolvers.update_backup_settings/3,
          :backup_settings
        )
      end)
    end

    payload field :run_cloud_backup do
      output do
        field :cloud_backup, :cloud_backup_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &BackupResolvers.run_cloud_backup/3, :cloud_backup)
      end)
    end

    payload field :stage_cloud_restore do
      arg(:id, non_null(:id))

      output do
        field :restore_result, :cloud_restore_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &BackupResolvers.stage_cloud_restore/3, :restore_result)
      end)
    end

    payload field :reload_scryfall_catalog do
      output do
        field :reload_result, :scryfall_reload_result
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.reload_scryfall_catalog/3,
          :reload_result
        )
      end)
    end

    payload field :reload_scryfall_assets do
      output do
        field :reload_result, :scryfall_reload_result
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.reload_scryfall_assets/3,
          :reload_result
        )
      end)
    end

    payload field :create_collection_item do
      arg(:input, non_null(:collection_item_input))

      output do
        field :collection_item, :collection_item
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.create_collection_item/3,
          :collection_item
        )
      end)
    end

    payload field :update_collection_item do
      arg(:id, non_null(:id))
      arg(:input, non_null(:collection_item_update_input))

      output do
        field :collection_item, :collection_item
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.update_collection_item/3,
          :collection_item
        )
      end)
    end

    payload field :bulk_update_collection_items do
      arg(:ids, non_null(list_of(non_null(:id))))
      arg(:input, non_null(:collection_item_update_input))

      output do
        field :collection_items, non_null(list_of(non_null(:collection_item)))
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.bulk_update_collection_items/3,
          :collection_items
        )
      end)
    end

    payload field :delete_collection_item do
      arg(:id, non_null(:id))

      output do
        field :collection_item, :collection_item
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.delete_collection_item/3,
          :collection_item
        )
      end)
    end

    payload field :add_collection_item_to_deck do
      arg(:id, non_null(:id))
      arg(:deck_id, non_null(:id))
      arg(:zone, :string, default_value: "mainboard")

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.add_collection_item_to_deck/3,
          :deck_card
        )
      end)
    end

    payload field :bulk_add_collection_items_to_deck do
      arg(:ids, non_null(list_of(non_null(:id))))
      arg(:deck_id, non_null(:id))
      arg(:zone, :string, default_value: "mainboard")

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.bulk_add_collection_items_to_deck/3,
          :deck_cards
        )
      end)
    end

    payload field :create_deck do
      arg(:input, non_null(:deck_input))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.create_deck/3, :deck)
      end)
    end

    payload field :create_location do
      arg(:input, non_null(:location_input))

      output do
        field :location, :location
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.create_location/3, :location)
      end)
    end

    payload field :update_collection_auto_sort_rules do
      arg(:input, non_null(list_of(non_null(:collection_auto_sort_rule_input))))

      output do
        field :collection_auto_sort_rules, non_null(list_of(non_null(:collection_auto_sort_rule)))
        field :rules, non_null(list_of(non_null(:collection_auto_sort_rule)))
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.update_collection_auto_sort_rules/3,
          :collection_auto_sort_rules
        )
      end)
    end

    payload field :auto_sort_collection do
      arg(:input, :auto_sort_collection_input)

      output do
        field :auto_sort_result, non_null(:collection_auto_sort_result)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.auto_sort_collection/3,
          :auto_sort_result
        )
      end)
    end

    payload field :preview_collection_import do
      arg(:input, non_null(:collection_import_preview_input))

      output do
        field :import_preview, :collection_import_preview
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.preview_collection_import/3,
          :import_preview
        )
      end)
    end

    payload field :preview_collection_import_auto_sort do
      arg(:input, non_null(:collection_import_commit_input))

      output do
        field :auto_sort_result, non_null(:collection_auto_sort_result)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.preview_collection_import_auto_sort/3,
          :auto_sort_result
        )
      end)
    end

    payload field :commit_collection_import do
      arg(:input, non_null(:collection_import_commit_input))

      output do
        field :import_result, :collection_import_result
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.commit_collection_import/3,
          :import_result
        )
      end)
    end

    payload field :update_deck do
      arg(:id, non_null(:id))
      arg(:input, non_null(:deck_update_input))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.update_deck/3, :deck)
      end)
    end

    payload field :ensure_deck_share_token do
      arg(:id, non_null(:id))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.ensure_deck_share_token/3, :deck)
      end)
    end

    payload field :add_deck_card do
      arg(:deck_id, non_null(:id))
      arg(:input, non_null(:deck_card_input))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.add_deck_card/3, :deck_card)
      end)
    end

    payload field :import_decklist do
      arg(:id, non_null(:id))
      arg(:text, non_null(:string))
      arg(:replace_existing, :boolean, default_value: false)

      output do
        field :import_result, :deck_import_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.import_decklist/3, :import_result)
      end)
    end

    payload field :update_location do
      arg(:id, non_null(:id))
      arg(:input, non_null(:location_update_input))

      output do
        field :location, :location
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.update_location/3, :location)
      end)
    end

    payload field :delete_deck do
      arg(:id, non_null(:id))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.delete_deck/3, :deck)
      end)
    end

    payload field :preview_deck_disassembly do
      arg(:id, non_null(:id))

      output do
        field :disassembly_result, non_null(:deck_disassembly_result)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.preview_deck_disassembly/3,
          :disassembly_result
        )
      end)
    end

    payload field :disassemble_deck do
      arg(:id, non_null(:id))

      output do
        field :disassembly_result, non_null(:deck_disassembly_result)
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.disassemble_deck/3,
          :disassembly_result
        )
      end)
    end

    payload field :delete_location do
      arg(:id, non_null(:id))

      output do
        field :location, :location
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.delete_location/3, :location)
      end)
    end

    payload field :update_deck_card do
      arg(:id, non_null(:id))
      arg(:input, non_null(:deck_card_update_input))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.update_deck_card/3, :deck_card)
      end)
    end

    payload field :update_deck_cards_tag do
      arg(:deck_card_ids, non_null(list_of(non_null(:id))))
      arg(:tag, :string)

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.update_deck_cards_tag/3, :deck_cards)
      end)
    end

    payload field :delete_deck_card do
      arg(:id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.delete_deck_card/3, :deck_card)
      end)
    end

    payload field :set_deck_commander do
      arg(:id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.set_deck_commander/3, :deck_card)
      end)
    end

    payload field :allocate_deck_card_item do
      arg(:deck_card_id, non_null(:id))
      arg(:collection_item_id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &CatalogResolvers.allocate_deck_card_item/3, :deck_card)
      end)
    end

    payload field :deallocate_deck_card_item do
      arg(:deck_card_id, non_null(:id))
      arg(:collection_item_id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.deallocate_deck_card_item/3,
          :deck_card
        )
      end)
    end

    payload field :allocate_deck_card_proxy do
      arg(:deck_card_id, non_null(:id))
      arg(:quantity, :integer, default_value: 1)

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.allocate_deck_card_proxy/3,
          :deck_card
        )
      end)
    end

    payload field :deallocate_deck_card_proxy do
      arg(:deck_card_id, non_null(:id))
      arg(:quantity, :integer, default_value: 1)

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.deallocate_deck_card_proxy/3,
          :deck_card
        )
      end)
    end

    payload field :preview_bulk_allocate_deck do
      arg(:id, non_null(:id))
      arg(:mode, non_null(:string))

      output do
        field :allocation_preview, :deck_bulk_allocation_preview
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.preview_bulk_allocate_deck/3,
          :allocation_preview
        )
      end)
    end

    payload field :bulk_allocate_deck do
      arg(:id, non_null(:id))
      arg(:mode, non_null(:string))

      output do
        field :allocation_result, :deck_bulk_allocation_result
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &CatalogResolvers.bulk_allocate_deck/3,
          :allocation_result
        )
      end)
    end
  end

  defp payload(parent, args, resolution, resolver, field) do
    case resolver.(parent, args, resolution) do
      {:ok, value} when is_map(value) ->
        if Map.has_key?(value, field), do: {:ok, value}, else: {:ok, %{field => value}}

      {:ok, value} ->
        {:ok, %{field => value}}

      other ->
        other
    end
  end

  defp integer_id(id) when is_integer(id), do: id

  defp integer_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> parsed
      _other -> id
    end
  end

  def context(ctx) do
    loader =
      Dataloader.new()
      |> Dataloader.add_source(Catalog, Catalog.data())

    Map.put(ctx, :loader, loader)
  end

  def plugins do
    [Absinthe.Middleware.Dataloader | Absinthe.Plugin.defaults()]
  end
end
