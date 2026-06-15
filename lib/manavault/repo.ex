defmodule Manavault.Repo do
  use Ecto.Repo,
    otp_app: :manavault,
    adapter: Ecto.Adapters.SQLite3
end
