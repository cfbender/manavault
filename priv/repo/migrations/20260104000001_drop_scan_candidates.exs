defmodule Manavault.Repo.Migrations.DropScanCandidates do
  use Ecto.Migration

  def change do
    drop_if_exists table(:scan_candidates)
  end
end
