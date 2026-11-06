import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ query: apolloMocks.query }),
}))

import { CardDropOverlay } from "../src/components/card-drop-overlay"
import { cardDropReference, isCardDrag } from "../src/lib/card-drop"

afterEach(() => {
  cleanup()
  apolloMocks.query.mockReset()
})

function dropData(data: Record<string, string>) {
  return {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? "",
  }
}

const SOL_RING_ID = "fc817e07-c1f3-469f-9cf7-0945dea7400f"

test("a Scryfall card image names its printing, set and number, and card", () => {
  const link = "https://scryfall.com/card/trc/499/sol-ring"
  expect(
    cardDropReference(
      dropData({
        "text/uri-list": link,
        "text/plain": link,
        "text/html": `<a href="${link}"><img src="https://cards.scryfall.io/normal/front/f/c/${SOL_RING_ID}.jpg?1793021181" alt="Sol Ring (Star Trek Commander #499)"></a>`,
      }),
    ),
  ).toEqual({ scryfallId: SOL_RING_ID, setCode: "trc", collectorNumber: "499", name: "Sol Ring" })
})

test("an EDHREC card image names its Scryfall printing and the card in its link", () => {
  const image =
    "https://card-images.edhrec.com/grid/front/2/1/2185c08f-bb4d-49d5-8b6c-c629a48bb61c.webp?1789556729"
  expect(
    cardDropReference(
      dropData({
        "text/uri-list": "https://edhrec.com/cards/sanctum-lurker",
        "text/html": `<a href="/cards/sanctum-lurker"><img alt="" src="${image}"><span>Sanctum Lurker</span></a>`,
      }),
    ),
  ).toEqual({ scryfallId: "2185c08f-bb4d-49d5-8b6c-c629a48bb61c", name: "Sanctum Lurker" })
})

test("a Moxfield card image names only its card, in the alt text", () => {
  const image = "https://assets.moxfield.net/cards/card-E02VW-normal.webp"
  expect(
    cardDropReference(
      dropData({
        "text/uri-list": image,
        "text/html": `<img class="img-card" src="${image}" alt="Esper Sentinel">`,
      }),
    ),
  ).toEqual({ name: "Esper Sentinel" })
})

test("selected text names a card; a bare URL or file names nothing", () => {
  expect(cardDropReference(dropData({ "text/plain": "  Lightning   Bolt " }))).toEqual({
    name: "Lightning Bolt",
  })
  expect(
    cardDropReference(
      dropData({ "text/uri-list": "https://example.com/", "text/plain": "https://example.com/" }),
    ),
  ).toBeNull()
  expect(isCardDrag(["Files"])).toBe(false)
  expect(isCardDrag(["Files", "text/uri-list"])).toBe(true)
})

const ZONES = [
  { id: "mainboard", title: "Mainboard", hint: "Drop to add it to the deck." },
  { id: "considering", title: "Considering", hint: "Drop to set it aside." },
] as const

test("a card dragged in shows the zones, and the one it is dropped on receives the printing", async () => {
  const printing = { id: "printing-id", scryfallId: SOL_RING_ID, finishes: ["nonfoil"], card: null }
  apolloMocks.query.mockResolvedValue({ data: { printingByReference: printing } })
  const onDropCard = vi.fn(() => Promise.resolve())
  render(<CardDropOverlay enabled onDropCard={onDropCard} zones={ZONES} />)

  expect(screen.queryByTestId("card-drop-overlay")).toBeNull()
  act(() => {
    fireEvent.dragEnter(window, { dataTransfer: dropData({ "text/uri-list": "" }) })
  })
  const considering = screen.getByRole("region", { name: "Drop to add to Considering" })
  expect(screen.getByRole("region", { name: "Drop to add to Mainboard" })).toBeTruthy()

  fireEvent.drop(considering, {
    dataTransfer: dropData({
      "text/html": `<img src="https://cards.scryfall.io/large/back/f/c/${SOL_RING_ID}.jpg">`,
    }),
  })

  await waitFor(() => expect(onDropCard).toHaveBeenCalledWith("considering", printing))
  expect(apolloMocks.query.mock.calls[0]?.[0]).toMatchObject({
    variables: { scryfallId: SOL_RING_ID },
  })
})

test("a card dragged from the page itself shows no zones", () => {
  render(<CardDropOverlay enabled onDropCard={() => Promise.resolve()} zones={ZONES} />)
  const image = document.createElement("img")
  document.body.append(image)

  act(() => {
    fireEvent.dragStart(image)
    fireEvent.dragEnter(window, { dataTransfer: dropData({ "text/uri-list": "" }) })
  })

  expect(screen.queryByTestId("card-drop-overlay")).toBeNull()
  image.remove()
})
