defmodule ManavaultWeb.Schema.Catalog.DeckOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.Catalog.{
    AllocationResolvers,
    MutationResolvers,
    QueryResolvers
  }

  object :deck_queries do
    field :default_deck_tags, non_null(list_of(non_null(:default_deck_tag))) do
      resolve(&QueryResolvers.default_deck_tags/3)
    end

    connection field :decks, node_type: :deck, non_null: true do
      resolve(&QueryResolvers.decks/3)
    end

    field :deck, :deck do
      arg(:id, non_null(:id))
      resolve(&QueryResolvers.deck/3)
    end

    field :shared_deck, :deck do
      arg(:token, non_null(:string))
      resolve(&QueryResolvers.shared_deck/3)
    end

    field :deck_export_text, non_null(:string) do
      arg(:id, non_null(:id))
      resolve(&QueryResolvers.deck_export_text/3)
    end

    field :deck_buylist, non_null(list_of(non_null(:deck_buylist_entry))) do
      arg(:id, non_null(:id))
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)
      arg(:assume_no_owned, :boolean, default_value: false)
      arg(:include_sideboard, :boolean, default_value: false)
      arg(:include_maybeboard, :boolean, default_value: false)
      resolve(&QueryResolvers.deck_buylist/3)
    end

    field :deck_buylist_export, non_null(:string) do
      arg(:id, non_null(:id))
      arg(:format, :string, default_value: "text")
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)
      arg(:assume_no_owned, :boolean, default_value: false)
      arg(:include_sideboard, :boolean, default_value: false)
      arg(:include_maybeboard, :boolean, default_value: false)
      resolve(&QueryResolvers.deck_buylist_export/3)
    end

    field :deck_edhrec, non_null(:deck_edhrec) do
      arg(:id, non_null(:id))
      arg(:exclude_lands, :boolean, default_value: false)
      arg(:offset, :integer, default_value: 0)
      resolve(&QueryResolvers.deck_edhrec/3)
    end
  end

  object :deck_mutations do
    payload field :create_deck do
      arg(:input, non_null(:deck_input))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.create_deck/3, :deck)
      end)
    end

    payload field :update_deck do
      arg(:id, non_null(:id))
      arg(:input, non_null(:deck_update_input))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.update_deck/3, :deck)
      end)
    end

    payload field :ensure_deck_share_token do
      arg(:id, non_null(:id))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.ensure_deck_share_token/3, :deck)
      end)
    end

    payload field :add_deck_card do
      arg(:deck_id, non_null(:id))
      arg(:input, non_null(:deck_card_input))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.add_deck_card/3, :deck_card)
      end)
    end

    payload field :import_decklist do
      arg(:id, non_null(:id))
      arg(:text, non_null(:string))
      arg(:replace_existing, :boolean, default_value: false)
      arg(:zone, :string)

      output do
        field :import_result, :deck_import_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.import_decklist/3, :import_result)
      end)
    end

    payload field :delete_deck do
      arg(:id, non_null(:id))

      output do
        field :deck, :deck
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.delete_deck/3, :deck)
      end)
    end

    payload field :preview_deck_disassembly do
      arg(:id, non_null(:id))

      output do
        field :disassembly_result, non_null(:deck_disassembly_result)
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.preview_deck_disassembly/3, :disassembly_result)
      end)
    end

    payload field :disassemble_deck do
      arg(:id, non_null(:id))

      output do
        field :disassembly_result, non_null(:deck_disassembly_result)
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.disassemble_deck/3, :disassembly_result)
      end)
    end

    payload field :update_deck_card do
      arg(:id, non_null(:id))
      arg(:input, non_null(:deck_card_update_input))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.update_deck_card/3, :deck_card)
      end)
    end

    payload field :update_deck_cards_tag do
      arg(:deck_card_ids, non_null(list_of(non_null(:id))))
      arg(:tag, :string)

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.update_deck_cards_tag/3, :deck_cards)
      end)
    end

    payload field :create_deck_tag do
      arg(:deck_id, non_null(:id))
      arg(:input, non_null(:deck_tag_input))

      output do
        field :deck_tag, :deck_tag
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.create_deck_tag/3, :deck_tag)
      end)
    end

    payload field :update_deck_tag do
      arg(:id, non_null(:id))
      arg(:input, non_null(:deck_tag_input))

      output do
        field :deck_tag, :deck_tag
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.update_deck_tag/3, :deck_tag)
      end)
    end

    payload field :delete_deck_tag do
      arg(:id, non_null(:id))

      output do
        field :deck_tag_id, non_null(:id)
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.delete_deck_tag/3, :deck_tag_id)
      end)
    end

    payload field :reorder_deck_tags do
      arg(:deck_id, non_null(:id))
      arg(:tag_ids, non_null(list_of(non_null(:id))))

      output do
        field :tags, non_null(list_of(non_null(:deck_tag)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.reorder_deck_tags/3, :tags)
      end)
    end

    payload field :replace_default_deck_tags do
      arg(:tags, non_null(list_of(non_null(:default_deck_tag_input))))

      output do
        field :tags, non_null(list_of(non_null(:default_deck_tag)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.replace_default_deck_tags/3, :tags)
      end)
    end

    payload field :assign_deck_card_tag do
      arg(:deck_card_id, non_null(:id))
      arg(:tag_id, non_null(:id))

      output do
        field :deck_card, :deck_card
        field :deck_tags, non_null(list_of(non_null(:deck_tag)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.assign_deck_card_tag/3, :deck_card)
      end)
    end

    payload field :unassign_deck_card_tag do
      arg(:deck_card_id, non_null(:id))
      arg(:tag_id, non_null(:id))

      output do
        field :deck_card, :deck_card
        field :deck_tags, non_null(list_of(non_null(:deck_tag)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.unassign_deck_card_tag/3, :deck_card)
      end)
    end

    payload field :bulk_update_deck_cards do
      arg(:deck_card_ids, non_null(list_of(non_null(:id))))
      arg(:input, non_null(:deck_card_update_input))

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.bulk_update_deck_cards/3, :deck_cards)
      end)
    end

    payload field :bulk_delete_deck_cards do
      arg(:deck_card_ids, non_null(list_of(non_null(:id))))

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.bulk_delete_deck_cards/3, :deck_cards)
      end)
    end

    payload field :optimize_deck_card_printings do
      arg(:deck_card_ids, non_null(list_of(non_null(:id))))

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.optimize_deck_card_printings/3, :deck_cards)
      end)
    end

    payload field :delete_deck_card do
      arg(:id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.delete_deck_card/3, :deck_card)
      end)
    end

    payload field :set_deck_commander do
      arg(:id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.set_deck_commander/3, :deck_card)
      end)
    end

    payload field :allocate_deck_card_item do
      arg(:deck_card_id, non_null(:id))
      arg(:collection_item_id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.allocate_deck_card_item/3, :deck_card)
      end)
    end

    payload field :deallocate_deck_card_item do
      arg(:deck_card_id, non_null(:id))
      arg(:collection_item_id, non_null(:id))

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.deallocate_deck_card_item/3, :deck_card)
      end)
    end

    payload field :bulk_deallocate_deck_cards do
      arg(:deck_card_ids, non_null(list_of(non_null(:id))))

      output do
        field :deck_cards, non_null(list_of(non_null(:deck_card)))
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.bulk_deallocate_deck_cards/3, :deck_cards)
      end)
    end

    payload field :allocate_deck_card_proxy do
      arg(:deck_card_id, non_null(:id))
      arg(:quantity, :integer, default_value: 1)

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.allocate_deck_card_proxy/3, :deck_card)
      end)
    end

    payload field :deallocate_deck_card_proxy do
      arg(:deck_card_id, non_null(:id))
      arg(:quantity, :integer, default_value: 1)

      output do
        field :deck_card, :deck_card
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.deallocate_deck_card_proxy/3, :deck_card)
      end)
    end

    payload field :preview_bulk_allocate_deck do
      arg(:id, non_null(:id))
      arg(:mode, non_null(:string))

      output do
        field :allocation_preview, :deck_bulk_allocation_preview
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.preview_bulk_allocate_deck/3, :allocation_preview)
      end)
    end

    payload field :bulk_allocate_deck do
      arg(:id, non_null(:id))
      arg(:mode, non_null(:string))

      output do
        field :allocation_result, :deck_bulk_allocation_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.bulk_allocate_deck/3, :allocation_result)
      end)
    end

    payload field :allocate_deck_pull_list do
      arg(:deck_id, non_null(:id))
      arg(:entries, non_null(list_of(non_null(:deck_pull_list_entry_input))))

      output do
        field :allocation_result, :deck_bulk_allocation_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &AllocationResolvers.allocate_deck_pull_list/3, :allocation_result)
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
