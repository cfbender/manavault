defmodule ManavaultWeb.Schema.Catalog.CollectionOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.Catalog.{
    AllocationResolvers,
    ImportResolvers,
    MutationResolvers,
    QueryResolvers
  }

  object :collection_queries do
    connection field :collection_items, node_type: :collection_item, non_null: true do
      arg(:filters, :collection_item_filters)
      arg(:sort, :collection_item_sort)
      resolve(&QueryResolvers.collection_items/3)
    end

    field :collection_item_count, non_null(:integer) do
      arg(:filters, :collection_item_filters)
      resolve(&QueryResolvers.collection_item_count/3)
    end

    field :collection_item_entry_count, non_null(:integer) do
      arg(:filters, :collection_item_filters)
      resolve(&QueryResolvers.collection_item_entry_count/3)
    end

    field :collection_value_summary, non_null(:collection_value_summary) do
      arg(:filters, :collection_item_filters)
      resolve(&QueryResolvers.collection_value_summary/3)
    end

    field :collection_export_csv, non_null(:string) do
      arg(:filters, :collection_item_filters)
      resolve(&QueryResolvers.collection_export_csv/3)
    end

    field :collection_export_text, non_null(:string) do
      arg(:filters, :collection_item_filters)
      resolve(&QueryResolvers.collection_export_text/3)
    end

    field :collection_auto_sort_rules, non_null(list_of(non_null(:collection_auto_sort_rule))) do
      resolve(&QueryResolvers.collection_auto_sort_rules/3)
    end
  end

  object :collection_mutations do
    payload field :create_collection_item do
      arg(:input, non_null(:collection_item_input))

      output do
        field :collection_item, :collection_item
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.create_collection_item/3, :collection_item)
      end)
    end

    payload field :update_collection_item do
      arg(:id, non_null(:id))
      arg(:input, non_null(:collection_item_update_input))

      output do
        field :collection_item, :collection_item
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.update_collection_item/3, :collection_item)
      end)
    end

    payload field :bulk_update_collection_items do
      arg(:selector, non_null(:collection_item_selector))
      arg(:input, non_null(:collection_item_update_input))

      output do
        field :updated_count, non_null(:integer)
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.bulk_update_collection_items/3, :updated_count)
      end)
    end

    payload field :bulk_delete_collection_items do
      arg(:selector, non_null(:collection_item_selector))

      output do
        field :deleted_count, non_null(:integer)
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.bulk_delete_collection_items/3, :deleted_count)
      end)
    end

    payload field :delete_collection_item do
      arg(:id, non_null(:id))

      output do
        field :collection_item, :collection_item
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.delete_collection_item/3, :collection_item)
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
        payload(parent, args, resolution, &AllocationResolvers.add_collection_item_to_deck/3, :deck_card)
      end)
    end

    payload field :bulk_add_collection_items_to_deck do
      arg(:selector, non_null(:collection_item_selector))
      arg(:deck_id, non_null(:id))
      arg(:zone, :string, default_value: "mainboard")

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.bulk_add_collection_items_to_deck/3, :deck_cards)
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
          &MutationResolvers.update_collection_auto_sort_rules/3,
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
        payload(parent, args, resolution, &MutationResolvers.auto_sort_collection/3, :auto_sort_result)
      end)
    end

    payload field :preview_collection_import do
      arg(:input, non_null(:collection_import_preview_input))

      output do
        field :import_preview, :collection_import_preview
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &ImportResolvers.preview_collection_import/3, :import_preview)
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
          &ImportResolvers.preview_collection_import_auto_sort/3,
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
        payload(parent, args, resolution, &ImportResolvers.commit_collection_import/3, :import_result)
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
end
