defmodule ManavaultWeb.VendorControllerTest do
  use ManavaultWeb.ConnCase, async: false

  @stub __MODULE__.Stub

  setup do
    previous = Application.get_env(:manavault, :star_city_games_req_options)
    Application.put_env(:manavault, :star_city_games_req_options, plug: {Req.Test, @stub})

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :star_city_games_req_options, previous)
      else
        Application.delete_env(:manavault, :star_city_games_req_options)
      end
    end)

    :ok
  end

  test "POST /vendors/star-city-games/deck-builder creates and redirects to an SCG decklist", %{
    conn: conn
  } do
    id = "f60354c7-727e-4950-ad33-b458600be376"

    Req.Test.stub(@stub, fn conn ->
      {:ok, body, conn} = Plug.Conn.read_body(conn)

      assert conn.method == "POST"
      assert conn.request_path == "/affiliate"
      assert Jason.decode!(body) == %{"data" => "2 Sol Ring\n1 Lightning Bolt"}

      conn
      |> Plug.Conn.put_resp_header("content-type", "application/json")
      |> Plug.Conn.send_resp(200, Jason.encode!(%{affiliateDataID: id}))
    end)

    conn = get(conn, ~p"/")
    [_, csrf_token] = Regex.run(~r/name="csrf-token" content="([^"]+)"/, html_response(conn, 200))

    conn =
      conn
      |> recycle()
      |> post(~p"/vendors/star-city-games/deck-builder", %{
        "_csrf_token" => csrf_token,
        "data" => "2 Sol Ring\n1 Lightning Bolt"
      })

    assert redirected_to(conn) == "https://starcitygames.com/shop/deck-builder/?data=#{id}"
  end

  test "POST /vendors/star-city-games/deck-builder reports vendor failures", %{conn: conn} do
    Req.Test.stub(@stub, fn conn -> Plug.Conn.send_resp(conn, 503, "unavailable") end)

    conn = get(conn, ~p"/")
    [_, csrf_token] = Regex.run(~r/name="csrf-token" content="([^"]+)"/, html_response(conn, 200))

    conn =
      conn
      |> recycle()
      |> post(~p"/vendors/star-city-games/deck-builder", %{
        "_csrf_token" => csrf_token,
        "data" => "1 Sol Ring"
      })

    assert response(conn, 502) == "StarCityGames is unavailable. Please try again later."
  end
end
