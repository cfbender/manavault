import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { BulkCleanDialog } from "../src/pages/collection/bulk-clean-dialog"
import { CollectionBulkCleanDocument } from "../src/pages/collection/bulk-clean/documents"
import {
  colorBucket,
  DEFAULT_ORDER,
  deserializeOrder,
  typeBucket,
} from "../src/pages/collection/bulk-clean/grouping"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

test("buckets cards by color and by the first matching type in the chosen order", () => {
  expect(colorBucket([])).toBe("C")
  expect(colorBucket(["U"])).toBe("U")
  expect(colorBucket(["W", "B"])).toBe("M")

  expect(typeBucket("Legendary Creature — Elf", DEFAULT_ORDER.types)).toBe("legendary")
  expect(typeBucket("Artifact Creature — Golem", DEFAULT_ORDER.types)).toBe("creature")
  expect(typeBucket("Instant // Sorcery", DEFAULT_ORDER.types)).toBe("instant")
  expect(typeBucket("Kindred Instant — Elf", ["artifact"])).toBeNull()
  expect(typeBucket("Legendary Creature — Elf", ["creature", "legendary"])).toBe("creature")
})

test("restores a saved order and fills in values it is missing", () => {
  const order = deserializeOrder(
    JSON.stringify({
      levels: [{ key: "type", enabled: true }],
      colors: ["G", "nope"],
      types: ["land"],
    }),
  )

  expect(order.levels).toEqual([
    { key: "type", enabled: true },
    { key: "color", enabled: false },
  ])
  expect(order.colors).toEqual(["G", "W", "U", "B", "R", "M", "C"])
  expect(order.types[0]).toBe("land")
  expect(order.types).toHaveLength(DEFAULT_ORDER.types.length)
})

const box = { id: "7", name: "Commons box" }

function card(id: string, cardName: string, typeLine: string, colors: string[]) {
  return {
    cardId: `oracle-${id}`,
    cardName,
    typeLine,
    colors,
    totalCopies: 12,
    pullQuantity: 8,
    swappableCopies: 0,
    pulls: [
      {
        collectionItemId: id,
        cardId: `oracle-${id}`,
        cardName,
        setCode: "tst",
        collectorNumber: id,
        imageUrl: null,
        finish: "nonfoil",
        priceCents: 5,
        ownedQuantity: 12,
        quantity: 8,
        fromLocationId: box.id,
        fromLocationName: box.name,
      },
    ],
  }
}

test("groups each location by color and type in a reorderable order", async () => {
  const user = userEvent.setup()
  const cards = [
    card("1", "Zombie Horde", "Creature — Zombie", ["B"]),
    card("2", "Abzan Charm", "Instant", ["W", "B", "G"]),
    card("3", "Thalia", "Legendary Creature — Human Soldier", ["W"]),
    card("4", "Swords to Plowshares", "Instant", ["W"]),
    card("5", "Mind Stone", "Artifact", []),
  ]
  const link = new MockLink([
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: {
          maxPriceCents: 20,
          minCopies: 10,
          keepCopies: 4,
          preferKeepFoils: true,
          kept: [],
        },
      },
      result: {
        data: {
          collectionBulkClean: { cardCount: 5, pullQuantity: 40, pullValueCents: 200, cards },
        },
      },
    },
  ])

  render(
    <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link })}>
      <BulkCleanDialog open onDone={() => {}} onOpenChange={() => {}} />
    </ApolloProvider>,
  )

  await screen.findByRole("heading", { level: 3, name: "Commons box" })
  const cardNames = () => screen.getAllByRole("link").map((entry) => entry.textContent)
  const sections = () =>
    screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)

  expect(cardNames()).toEqual([
    "Abzan Charm",
    "Mind Stone",
    "Swords to Plowshares",
    "Thalia",
    "Zombie Horde",
  ])
  expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0)

  await user.click(screen.getByText("Order within each location"))
  await user.click(screen.getByRole("checkbox", { name: "Color" }))
  expect(sections()).toEqual(["White", "Black", "Multicolor", "Colorless"])
  expect(cardNames().slice(0, 2)).toEqual(["Swords to Plowshares", "Thalia"])

  await user.click(screen.getByRole("checkbox", { name: "Type" }))
  expect(sections()).toEqual([
    "White · Legendary",
    "White · Instant",
    "Black · Creature",
    "Multicolor · Instant",
    "Colorless · Artifact",
  ])

  await user.click(screen.getByRole("button", { name: "Move Type up" }))
  expect(screen.getByText("Type, then color, then name")).toBeTruthy()
  expect(sections()).toEqual([
    "Legendary · White",
    "Creature · Black",
    "Instant · White",
    "Instant · Multicolor",
    "Artifact · Colorless",
  ])

  await user.click(screen.getByRole("button", { name: "Move Legendary down" }))
  expect(sections()).toEqual([
    "Creature · White",
    "Creature · Black",
    "Instant · White",
    "Instant · Multicolor",
    "Artifact · Colorless",
  ])
  expect(
    JSON.parse(window.localStorage.getItem("manavault.collection.bulkCleanOrder") ?? "{}"),
  ).toMatchObject({
    levels: [
      { key: "type", enabled: true },
      { key: "color", enabled: true },
    ],
    types: ["creature", "legendary"].concat(DEFAULT_ORDER.types.slice(2)),
  })
})
