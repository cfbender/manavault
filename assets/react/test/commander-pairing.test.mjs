import test from "node:test"
import assert from "node:assert/strict"

import { isValidCommanderPair } from "../src/pages/decks/commander-pairing.ts"

const doctor = {
  name: "The Tenth Doctor",
  typeLine: "Legendary Creature — Time Lord Doctor",
  oracleText: "Allons-y! — Whenever you attack, time travel.",
}

const companion = {
  name: "Clara Oswald",
  typeLine: "Legendary Creature — Human",
  oracleText:
    "If Clara Oswald is your commander, choose a color before the game begins.\nDoctor's companion (You can have two commanders if the other is the Doctor.)",
}

function partnerCard(name, label = null) {
  return {
    name,
    typeLine: "Legendary Creature — Human",
    oracleText: label
      ? `Partner—${label} (You can have two commanders if both have this ability and the same restriction.)`
      : "Partner (You can have two commanders if both have partner.)",
  }
}

test("Doctor's companion pairs with a Time Lord Doctor in either order", () => {
  assert.equal(isValidCommanderPair(companion, doctor), true)
  assert.equal(isValidCommanderPair(doctor, companion), true)
})

test("plain Partner cards pair; Partner does not pair with non-partner", () => {
  assert.equal(isValidCommanderPair(partnerCard("A"), partnerCard("B")), true)
  assert.equal(isValidCommanderPair(partnerCard("A"), doctor), false)
})

test("restricted Partner labels must match", () => {
  assert.equal(
    isValidCommanderPair(partnerCard("A", "Survivors"), partnerCard("B", "Survivors")),
    true,
  )
  assert.equal(
    isValidCommanderPair(partnerCard("A", "Survivors"), partnerCard("B", "Father & Son")),
    false,
  )
  assert.equal(isValidCommanderPair(partnerCard("A", "Survivors"), partnerCard("B")), false)
})

test("Partner with requires both cards to name each other", () => {
  const pia = {
    name: "Pia Nalaar, Consul of Revival",
    typeLine: "Legendary Creature — Human Artificer",
    oracleText: "Partner with Chandra, Flame's Fury\nOther text.",
  }
  const chandra = {
    name: "Chandra, Flame's Fury",
    typeLine: "Legendary Planeswalker — Chandra",
    oracleText: "Partner with Pia Nalaar, Consul of Revival\nOther text.",
  }
  assert.equal(isValidCommanderPair(pia, chandra), true)
  assert.equal(isValidCommanderPair(pia, partnerCard("A")), false)
})

test("Friends forever cards pair with each other", () => {
  const friend = (name) => ({
    name,
    typeLine: "Legendary Creature — Human",
    oracleText: "Friends forever (You can have two commanders if both have friends forever.)",
  })
  assert.equal(isValidCommanderPair(friend("A"), friend("B")), true)
  assert.equal(isValidCommanderPair(friend("A"), doctor), false)
})

test("Choose a Background pairs with a Background", () => {
  const chooser = {
    name: "Wilson, Refined Grizzly",
    typeLine: "Legendary Creature — Bear Warrior",
    oracleText: "Choose a Background (You can have a Background as a second commander.)",
  }
  const background = {
    name: "Raised by Giants",
    typeLine: "Legendary Enchantment — Background",
    oracleText: "Commander creatures you own have base power and toughness 10/10.",
  }
  assert.equal(isValidCommanderPair(chooser, background), true)
  assert.equal(isValidCommanderPair(background, chooser), true)
  assert.equal(isValidCommanderPair(chooser, doctor), false)
})

test("cards with no pairing text never pair", () => {
  const legend = { name: "Solo Legend", typeLine: "Legendary Creature — Cat", oracleText: "" }
  assert.equal(isValidCommanderPair(legend, legend), false)
})
