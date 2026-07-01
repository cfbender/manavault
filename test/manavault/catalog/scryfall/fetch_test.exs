defmodule Manavault.Catalog.Scryfall.FetchTest do
  use ExUnit.Case, async: false

  alias Manavault.Catalog.Scryfall.Fetch

  @stub __MODULE__.Stub

  setup do
    previous = Application.get_env(:manavault, :scryfall_req_options)
    # retry: false keeps the non-2xx test from waiting on Req's default backoff.
    Application.put_env(:manavault, :scryfall_req_options, plug: {Req.Test, @stub}, retry: false)

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :scryfall_req_options, previous)
      else
        Application.delete_env(:manavault, :scryfall_req_options)
      end
    end)

    :ok
  end

  test "returns the response body as an undecoded JSON binary" do
    json = ~s([{"name":"Sol Ring"}])

    Req.Test.stub(@stub, fn conn ->
      conn
      |> Plug.Conn.put_resp_header("content-type", "application/json")
      |> Plug.Conn.send_resp(200, json)
    end)

    assert {:ok, body} = Fetch.url("https://example.test/bulk")

    # decode_body: false means we get the raw string back, not a decoded term.
    assert is_binary(body)
    assert body == json
    assert {:ok, [%{"name" => "Sol Ring"}]} = Jason.decode(body)
  end

  test "maps non-2xx responses to an error" do
    Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 500, "boom") end)

    assert {:error, "Scryfall request failed with HTTP 500"} =
             Fetch.url("https://example.test/missing")
  end
end
