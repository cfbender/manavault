defmodule ManavaultWeb.AssetVersionTest do
  use ExUnit.Case, async: false

  alias ManavaultWeb.AssetVersion

  @env_vars ~w(MANAVAULT_ASSET_VERSION SOURCE_VERSION GITHUB_SHA RENDER_GIT_COMMIT)

  setup do
    previous = Map.new(@env_vars, &{&1, System.get_env(&1)})
    Enum.each(@env_vars, &System.delete_env/1)

    on_exit(fn ->
      Enum.each(previous, fn
        {name, nil} -> System.delete_env(name)
        {name, value} -> System.put_env(name, value)
      end)
    end)
  end

  test "uses explicit asset version before provider commit environment" do
    System.put_env("MANAVAULT_ASSET_VERSION", "release-1")
    System.put_env("GITHUB_SHA", "abcdef1234567890")

    assert AssetVersion.current() == "release-1"
  end

  test "uses provider commit sha when explicit version is absent" do
    System.put_env("GITHUB_SHA", "abcdef1234567890")

    assert AssetVersion.current() == "abcdef1234567890"
  end

  test "sanitizes values before injecting them into HTML and JavaScript" do
    System.put_env("MANAVAULT_ASSET_VERSION", " abc/def:123<script> ")

    assert AssetVersion.current() == "abc-def-123-script-"
  end
end
