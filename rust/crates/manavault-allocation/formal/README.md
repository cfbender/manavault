# Formal model of deck allocations

`Allocation.tla` is a TLA+ model of `manavault-allocation` together with the
deck-card and collection-item writes in `manavault-collection` that touch the
same rows (`decks::cards::update_in`, `collection::changes`). TLC checks every
interleaving of a small configuration against the invariants the Rust
documentation claims.

## Running TLC

TLC needs a JVM and the TLA+ tools jar (not part of the pinned toolchain):

```sh
curl -fsSL -o /tmp/tla2tools.jar https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar
cd rust/crates/manavault-allocation/formal
java -XX:+UseParallelGC -Xmx3g -cp /tmp/tla2tools.jar tlc2.TLC \
  -deadlock -workers auto -config Allocation.cfg Allocation.tla
```

`Allocation.cfg` (two deck cards, one a basic land, three collection items,
quantities up to 2, collection edits enabled, `Bugs = {}`) explores about
15.5 million distinct states in roughly 3.5 minutes on 8 cores and ends with
`Model checking completed. No error has been found.` With `Basic = {}` the
same configuration explores about 42 million states in 11 minutes. Deadlocks
are expected (every operation can be refused) and are disabled with
`-deadlock`.

## What is modelled

- Collection items that split when part of a stack is reserved
  (`items::move_copies`), with a location of `box` or `null`.
- `allocate_in`, `deallocate`, proxy counts, and `add_collection_item_to_deck`.
- Multi-row transactions (`clear_deck_card_allocations`,
  `trim_deck_card_allocations`, `switch_allocation_to_preferred_printing`,
  `disassemble_deck`) as a `tx` state machine; invariants are checked only
  between transactions, which is what a SQLite reader observes.
- Deck-card edits (`update_in`: quantity, printing, zone), deletion,
  archiving, and un-archiving.
- Collection-item edits (`changes::update_record`: quantity and location),
  creation, and deletion (allocations cascade).

Invariants: `NotOverAllocated` (proxies plus copies never exceed the
quantity), `AllocationsBacked` (every reservation can be released),
`AllocatedItemsUnfiled` (reserved copies have no location),
`NoConsideringAllocations`, `Conservation` (copies are neither created nor
lost), and `BasicLandsJoinDecks` (the single-item add accepts what the bulk
add accepts).

Not modelled: finishes (they take the printing path), multiple decks per
card, the pull-list and bulk-allocation previews, and external deck sync.

## Findings

The `Bugs` constant re-enables the behaviour of the code before each fix so
the traces stay reproducible. Set, for example,
`Bugs = {"switch_skips_trim"}` in the config and run TLC again.

| `Bugs` member       | Violated invariant                           | What TLC found                                                                                                                                                                                                                                            | Fix and regression test                                                                                                                                                         |
| ------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `switch_skips_trim` | `NotOverAllocated`                           | `update_in` ran the printing switch _instead of_ the trim (`else if`), so one `updateDeckCard` that lowered the quantity and changed the printing left `proxy_quantity > quantity`.                                                                       | `decks/cards.rs::update_in` trims first, then switches. Test: `lowering_the_quantity_while_switching_the_printing_trims_proxies` in `manavault-collection`.                     |
| `reserve_basics`    | `BasicLandsJoinDecks`                        | `add_collection_item_to_deck` reserved basic lands, and `ensure_room` always refused because a basic land already counts as fully allocated, so adding any basic land from the collection failed with `AlreadyAllocated`.                                 | The single-item add skips the reservation for basic lands like the bulk add. Test: `adding_a_single_basic_land_copy_joins_the_deck_without_reserving` in `tests/deck_flows.rs`. |
| `unguarded_edits`   | `AllocationsBacked`, `AllocatedItemsUnfiled` | `collection::changes::update_record` let an owner shrink a reserved item below its allocation or file it in a location; every later release then failed with `QuantityMismatch`, so the deck card and the deck could no longer be deleted or deallocated. | `ensure_allocations_kept` rejects both edits with a validation error. Test: `edits_keep_copies_allocated_to_decks` in `manavault-collection`.                                   |
