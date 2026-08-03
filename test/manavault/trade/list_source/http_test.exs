defmodule Manavault.Trade.ListSource.HttpTest do
  use ExUnit.Case, async: true

  alias Manavault.Trade.ListSource.Http

  @stub __MODULE__.Stub

  test "decodes a 2xx JSON object body" do
    Req.Test.stub(@stub, fn conn ->
      conn
      |> Plug.Conn.put_resp_header("content-type", "application/json")
      |> Plug.Conn.send_resp(200, ~s({"name":"Sol Ring"}))
    end)

    assert {:ok, %{"name" => "Sol Ring"}} =
             Http.get_json("https://example.test/deck", req_options: [plug: {Req.Test, @stub}])
  end

  test "maps a 403 response to :forbidden" do
    Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 403, "nope") end)

    assert {:error, :forbidden} =
             Http.get_json("https://example.test/deck",
               req_options: [plug: {Req.Test, @stub}, retry: false]
             )
  end

  test "maps other non-2xx statuses to {:http_error, status}" do
    Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 500, "boom") end)

    assert {:error, {:http_error, 500}} =
             Http.get_json("https://example.test/deck",
               req_options: [plug: {Req.Test, @stub}, retry: false]
             )
  end

  test "maps a transport timeout to :timeout" do
    Req.Test.stub(@stub, fn conn -> Req.Test.transport_error(conn, :timeout) end)

    assert {:error, :timeout} =
             Http.get_json("https://example.test/deck",
               req_options: [plug: {Req.Test, @stub}, retry: false]
             )
  end

  test "returns :invalid_json for a non-JSON 2xx body" do
    Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 200, "not json") end)

    assert {:error, :invalid_json} =
             Http.get_json("https://example.test/deck", req_options: [plug: {Req.Test, @stub}])
  end

  test "halts and rejects a response body over max_bytes" do
    Req.Test.stub(@stub, fn conn ->
      conn
      |> Plug.Conn.put_resp_header("content-type", "application/json")
      |> Plug.Conn.send_resp(200, String.duplicate("a", 100))
    end)

    assert {:error, :body_too_large} =
             Http.get_json("https://example.test/deck",
               max_bytes: 10,
               req_options: [plug: {Req.Test, @stub}]
             )
  end

  test "post_json encodes the body as JSON and decodes a 2xx JSON response" do
    Req.Test.stub(@stub, fn conn ->
      assert conn.method == "POST"
      {:ok, raw_body, conn} = Plug.Conn.read_body(conn)
      assert Jason.decode!(raw_body) == %{"query" => "{ ping }"}

      conn
      |> Plug.Conn.put_resp_header("content-type", "application/json")
      |> Plug.Conn.send_resp(200, ~s({"data":{"ping":"pong"}}))
    end)

    assert {:ok, %{"data" => %{"ping" => "pong"}}} =
             Http.post_json("https://example.test/graphql", %{"query" => "{ ping }"},
               req_options: [plug: {Req.Test, @stub}]
             )
  end

  test "post_json_with_size returns the downloaded response size" do
    body = ~s({"data":{"ping":"pong"}})

    Req.Test.stub(@stub, fn conn ->
      conn
      |> Plug.Conn.put_resp_header("content-type", "application/json")
      |> Plug.Conn.send_resp(200, body)
    end)

    assert {:ok, %{"data" => %{"ping" => "pong"}}, response_bytes} =
             Http.post_json_with_size("https://example.test/graphql", %{"query" => "{ ping }"},
               req_options: [plug: {Req.Test, @stub}]
             )

    assert response_bytes == byte_size(body)
  end

  test "post_json maps a transport timeout to :timeout" do
    Req.Test.stub(@stub, fn conn -> Req.Test.transport_error(conn, :timeout) end)

    assert {:error, :timeout} =
             Http.post_json("https://example.test/graphql", %{"query" => "{ ping }"},
               req_options: [plug: {Req.Test, @stub}, retry: false]
             )
  end

  test "post_json halts and rejects a response body over max_bytes" do
    Req.Test.stub(@stub, fn conn ->
      conn
      |> Plug.Conn.put_resp_header("content-type", "application/json")
      |> Plug.Conn.send_resp(200, String.duplicate("a", 100))
    end)

    assert {:error, :body_too_large} =
             Http.post_json("https://example.test/graphql", %{"query" => "{ ping }"},
               max_bytes: 10,
               req_options: [plug: {Req.Test, @stub}]
             )
  end
end
