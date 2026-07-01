defmodule ManavaultWeb.SessionOptionsTest do
  use ExUnit.Case, async: false

  alias ManavaultWeb.SessionOptions

  setup do
    previous_secure = Application.get_env(:manavault, :secure_cookies)
    previous_days = Application.get_env(:manavault, :session_max_age_days)

    on_exit(fn ->
      restore(:secure_cookies, previous_secure)
      restore(:session_max_age_days, previous_days)
    end)

    :ok
  end

  defp restore(key, nil), do: Application.delete_env(:manavault, key)
  defp restore(key, value), do: Application.put_env(:manavault, key, value)

  test "defaults: not secure, 180-day lifetime, Lax same-site" do
    Application.delete_env(:manavault, :secure_cookies)
    Application.delete_env(:manavault, :session_max_age_days)

    opts = SessionOptions.build()

    refute Keyword.has_key?(opts, :secure)
    assert opts[:max_age] == 180 * 24 * 60 * 60
    assert opts[:same_site] == "Lax"
    assert opts[:store] == :cookie
    assert opts[:key] == "_manavault_key"
  end

  test "marks the cookie secure when secure_cookies is enabled" do
    Application.put_env(:manavault, :secure_cookies, true)

    assert SessionOptions.build()[:secure] == true
  end

  test "honors a configured session lifetime" do
    Application.put_env(:manavault, :session_max_age_days, 7)

    assert SessionOptions.build()[:max_age] == 7 * 24 * 60 * 60
  end
end
