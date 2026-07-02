import test from "node:test"
import assert from "node:assert/strict"

import { extractArtPalette } from "../src/lib/art-colors.ts"

function pixels(colors) {
  const data = new Uint8ClampedArray(colors.length * 4)
  colors.forEach(([r, g, b, a = 255], index) => {
    data[index * 4] = r
    data[index * 4 + 1] = g
    data[index * 4 + 2] = b
    data[index * 4 + 3] = a
  })
  return data
}

function repeat(color, count) {
  return Array.from({ length: count }, () => color)
}

test("solid image returns that color for both palette slots", () => {
  const palette = extractArtPalette(pixels(repeat([200, 40, 40], 16)))

  assert.deepEqual(palette, { primary: "200 40 40", secondary: "200 40 40" })
})

test("vibrant color beats a larger share of dull gray", () => {
  const palette = extractArtPalette(
    pixels([...repeat([128, 128, 128], 60), ...repeat([200, 30, 30], 40)]),
  )

  assert.equal(palette.primary, "200 30 30")
})

test("secondary picks a visually distinct color", () => {
  const palette = extractArtPalette(
    pixels([...repeat([200, 30, 30], 50), ...repeat([30, 60, 200], 40)]),
  )

  assert.equal(palette.primary, "200 30 30")
  assert.equal(palette.secondary, "30 60 200")
})

test("near-black and near-white pixels do not dominate", () => {
  const palette = extractArtPalette(
    pixels([
      ...repeat([8, 8, 8], 45),
      ...repeat([250, 250, 250], 45),
      ...repeat([40, 160, 90], 10),
    ]),
  )

  assert.equal(palette.primary, "40 160 90")
})

test("transparent pixels are ignored", () => {
  const palette = extractArtPalette(
    pixels([...repeat([200, 30, 30, 0], 90), ...repeat([30, 60, 200], 10)]),
  )

  assert.equal(palette.primary, "30 60 200")
})

test("fully transparent image yields no palette", () => {
  assert.equal(extractArtPalette(pixels(repeat([200, 30, 30, 0], 10))), null)
})
