defmodule Manavault.Repo.Migrations.AddPreferredPrintingIdToTradeWants do
  use Ecto.Migration

  def change do
    alter table(:trade_wants) do
      add :preferred_printing_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :nilify_all
          )
    end

    create index(:trade_wants, [:preferred_printing_id])

    drop unique_index(:trade_wants, [:oracle_id])

    # One generic (no specific printing requested) want per card...
    create unique_index(:trade_wants, [:oracle_id],
             where: "preferred_printing_id IS NULL",
             name: :trade_wants_oracle_id_generic_index
           )

    # ...and one want per specific printing of that card. A generic and a
    # specific want may coexist for the same oracle id.
    create unique_index(:trade_wants, [:oracle_id, :preferred_printing_id],
             where: "preferred_printing_id IS NOT NULL",
             name: :trade_wants_oracle_id_preferred_printing_id_index
           )
  end
end
