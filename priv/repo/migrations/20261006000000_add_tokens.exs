defmodule Manavault.Repo.Migrations.AddTokens do
  @moduledoc """
  Tokens join the catalog: cards record their Scryfall layout so token cards
  (`token` / `double_faced_token`) can be told apart from playable cards, each
  producer printing links to the token printings it creates, and owned tokens
  live in their own table so they never count as collection copies.
  """

  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :layout, :string
    end

    create index(:scryfall_cards, [:layout])

    create table(:scryfall_card_tokens, primary_key: false) do
      add :scryfall_id, :string, null: false
      add :token_scryfall_id, :string, null: false
    end

    create unique_index(:scryfall_card_tokens, [:scryfall_id, :token_scryfall_id])
    create index(:scryfall_card_tokens, [:token_scryfall_id])

    create table(:token_items) do
      add :scryfall_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :delete_all
          ),
          null: false

      add :back_scryfall_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :nilify_all
          )

      add :quantity, :integer, null: false, default: 1
      add :finish, :string, null: false, default: "nonfoil"

      timestamps(type: :utc_datetime)
    end

    create index(:token_items, [:scryfall_id])
    create index(:token_items, [:back_scryfall_id])
  end
end
