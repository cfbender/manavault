defmodule Manavault.Cache do
  @moduledoc false

  use Nebulex.Cache,
    otp_app: :manavault,
    adapter: Nebulex.Adapters.Local
end
