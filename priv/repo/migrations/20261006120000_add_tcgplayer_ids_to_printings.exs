defmodule Manavault.Repo.Migrations.AddTcgplayerIdsToPrintings do
  @moduledoc """
  TCGplayer prices come from tcgcsv.com, keyed by TCGplayer product ID. Scryfall
  links each printing to its regular and etched TCGplayer products; storing
  those IDs lets the price sync join tcgcsv rows to printings. The next catalog
  import fills them in.
  """

  use Ecto.Migration

  def change do
    alter table(:scryfall_printings) do
      add :tcgplayer_id, :integer
      add :tcgplayer_etched_id, :integer
    end
  end
end
