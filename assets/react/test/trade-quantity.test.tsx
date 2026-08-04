import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { CardTile } from "../src/components/card-tile"
import { nextForTradeQuantity } from "../src/pages/trade/binder-tab"

afterEach(cleanup)

test("trade quantity cycles from one through owned copies and back to zero", () => {
  expect(nextForTradeQuantity(0, 3)).toBe(1)
  expect(nextForTradeQuantity(1, 3)).toBe(2)
  expect(nextForTradeQuantity(2, 3)).toBe(3)
  expect(nextForTradeQuantity(3, 3)).toBe(0)
})

test("trade control shows offered copies separately from copies owned", async () => {
  const user = userEvent.setup()
  const onToggleForTrade = vi.fn()

  render(
    <CardTile
      count={3}
      forTradeActive
      forTradeCardName="Black Lotus"
      forTradeQuantity={1}
      forTradeTotalQuantity={3}
      name="Black Lotus"
      onToggleForTrade={onToggleForTrade}
    />,
  )

  const tradeButton = screen.getByRole("button", {
    name: "Offer 2 of 3 Black Lotus copies for trade",
  })
  expect(within(tradeButton).getByText("1")).toBeInstanceOf(HTMLElement)
  expect(screen.getByText("3")).toBeInstanceOf(HTMLElement)

  await user.click(tradeButton)
  expect(onToggleForTrade).toHaveBeenCalledTimes(1)
})
