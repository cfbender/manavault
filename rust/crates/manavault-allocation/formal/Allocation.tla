---------------------------- MODULE Allocation ----------------------------
(***************************************************************************)
(* A model of `manavault-allocation` and the deck/collection code that     *)
(* writes the same rows (`manavault-collection::decks::cards::update_in`,  *)
(* `collection::changes`).                                                 *)
(*                                                                         *)
(* One card (oracle id) with two printings; a few collection items that    *)
(* split when part of a stack is reserved (`items::move_copies`); deck     *)
(* cards with a quantity, proxies, a zone, a preferred printing, and an    *)
(* archived flag (one deck card per deck, so the flag stands for the deck  *)
(* status); and the `deck_allocations` rows.                               *)
(*                                                                         *)
(* Operations that the Rust code runs as several writes in one             *)
(* transaction (clearing, trimming, switching printings, disassembly)      *)
(* are modelled as a `tx` state machine: one row changes per step, and     *)
(* the invariants are checked only between transactions (`tx = Idle`),    *)
(* which is what a SQLite reader can observe.                              *)
(*                                                                         *)
(* Run with TLC: `java -cp tla2tools.jar tlc2.TLC -deadlock -config        *)
(* Allocation.cfg Allocation.tla` (see README.md next to this file).      *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
    Cards,      \* deck card ids
    Basic,      \* the subset of Cards that are basic lands
    MaxItems,   \* collection item ids are 1..MaxItems (splits create new ones)
    MaxQty,     \* largest item or deck card quantity
    MaxProxy,   \* largest proxy count
    Printings,  \* printings of the one card in the model
    CollectionEdits, \* whether the owner edits items' quantity and location
    Bugs        \* subset of {"switch_skips_trim", "reserve_basics",
                \* "unguarded_edits"}: model the code before the fixes TLC
                \* led to (see the README)

ASSUME Basic \subseteq Cards
ASSUME CollectionEdits \in BOOLEAN
ASSUME Bugs \subseteq {"switch_skips_trim", "reserve_basics", "unguarded_edits"}
ASSUME MaxQty >= 1 /\ MaxItems >= 1

NULL == "null"      \* `location_id IS NULL`: reserved for a deck, or unfiled
BOX  == "box"       \* a real storage location
Locs == {BOX, NULL}
ItemIds == 1..MaxItems
Zones == {"main", "cons"}   \* mainboard/commander, considering

VARIABLES
    item,       \* [ItemIds -> [alive, qty, loc, printing]]
    nextItem,   \* next unused item id
    card,       \* [Cards -> [alive, qty, proxy, zone, archived, pref]]
    allocs,     \* set of [card, item, qty, src]: deck_allocations rows
    ledger,     \* copies the owner has told the app about (collection edits)
    tx          \* the compound operation in progress, or Idle

vars == <<item, nextItem, card, allocs, ledger, tx>>

Idle == [kind |-> "idle"]

Min(a, b) == IF a <= b THEN a ELSE b
Sat(a, b) == IF a >= b THEN a - b ELSE 0    \* saturating_sub

RECURSIVE SumQty(_)
SumQty(S) == IF S = {} THEN 0
             ELSE LET a == CHOOSE x \in S : TRUE IN a.qty + SumQty(S \ {a})

RECURSIVE SumItems(_)
SumItems(S) == IF S = {} THEN 0
               ELSE LET i == CHOOSE x \in S : TRUE
                    IN item[i].qty + SumItems(S \ {i})

LiveItems == {i \in ItemIds : item[i].alive}
TotalCopies == SumItems(LiveItems)

-----------------------------------------------------------------------------
(* status.rs: what a deck card holds, needs, and could still take *)

AllocsOf(c) == {a \in allocs : a.card = c}
AllocsOn(i) == {a \in allocs : a.item = i}
Physical(c) == SumQty(AllocsOf(c))
AllocFor(c, i) == SumQty({a \in allocs : a.card = c /\ a.item = i})
Elsewhere(c, i) == SumQty({a \in allocs : a.card # c /\ a.item = i})
Available(c, i) == Sat(Sat(item[i].qty, AllocFor(c, i)), Elsewhere(c, i))
Required(c) == card[c].qty
\* Basic lands always count as fully allocated.
Allocated(c) == IF c \in Basic THEN Required(c) ELSE Physical(c) + card[c].proxy

\* model.rs: `ensure_editable` and `allocatable`
Editable(c) == card[c].alive /\ ~card[c].archived
Allocatable(c) == Editable(c) /\ card[c].zone = "main"

-----------------------------------------------------------------------------
(* items.rs: moving copies between a location and a deck *)

NewItem(q, loc, printing) ==
    [alive |-> TRUE, qty |-> q, loc |-> loc, printing |-> printing]

(* `move_copies`: `q` copies of `i` go to `loc`. The whole item moves when
   the quantities are equal; otherwise the item is split and the new id
   holds the moved copies. Fewer copies than `q` is the Rust error path
   (NotEnoughAvailable / QuantityMismatch): the step is not enabled. *)
MoveCopies(i, q, loc) ==
    \/ /\ item[i].qty = q
       /\ item' = [item EXCEPT ![i].loc = loc]
       /\ nextItem' = nextItem
    \/ /\ item[i].qty > q
       /\ nextItem <= MaxItems
       /\ item' = [item EXCEPT ![i].qty = @ - q,
                               ![nextItem] = NewItem(q, loc, item[i].printing)]
       /\ nextItem' = nextItem + 1

\* The id that holds the moved copies after `MoveCopies(i, q, _)`.
HeldBy(i, q) == IF item[i].qty = q THEN i ELSE nextItem

-----------------------------------------------------------------------------
(* allocate.rs *)

\* `reserve`: grow the (card, item) allocation or insert one.
Reserve(c, h, q, src) ==
    IF \E a \in allocs : a.card = c /\ a.item = h
    THEN LET a == CHOOSE a \in allocs : a.card = c /\ a.item = h
         IN (allocs \ {a}) \cup {[a EXCEPT !.qty = @ + q]}
    ELSE allocs \cup {[card |-> c, item |-> h, qty |-> q, src |-> src]}

\* `ensure_room`
Room(c, i, q) == Available(c, i) >= q /\ Allocated(c) + q <= Required(c)

\* `allocate_in`
Allocate(c, i, q) ==
    /\ tx = Idle
    /\ Allocatable(c)
    /\ item[i].alive
    /\ Room(c, i, q)
    /\ MoveCopies(i, q, NULL)
    /\ allocs' = Reserve(c, HeldBy(i, q), q, item[i].loc)
    \* `use_item_printing`: the deck card shows the copy it holds.
    /\ card' = [card EXCEPT ![c].pref = item[i].printing]
    /\ UNCHANGED <<ledger, tx>>

\* `restore_from_deck`
Restore(i, q, src) == MoveCopies(i, q, src)

\* `deallocate`: up to `q` copies go back; more than held releases all.
Deallocate(c, i, q) ==
    /\ tx = Idle
    /\ Editable(c)
    /\ item[i].alive
    /\ \E a \in allocs :
        /\ a.card = c /\ a.item = i
        /\ LET r == IF q >= a.qty THEN a.qty ELSE q
           IN /\ Restore(i, r, a.src)
              /\ allocs' = IF r = a.qty THEN allocs \ {a}
                           ELSE (allocs \ {a}) \cup {[a EXCEPT !.qty = @ - r]}
    /\ UNCHANGED <<card, ledger, tx>>

-----------------------------------------------------------------------------
(* release.rs: proxies *)

AllocateProxy(c, q) ==
    /\ tx = Idle
    /\ Allocatable(c)
    /\ Allocated(c) + q <= Required(c)
    /\ card[c].proxy + q <= MaxProxy
    /\ card' = [card EXCEPT ![c].proxy = @ + q]
    /\ UNCHANGED <<item, nextItem, allocs, ledger, tx>>

DeallocateProxy(c, q) ==
    /\ tx = Idle
    /\ Editable(c)
    /\ card[c].proxy > 0 /\ card[c].proxy >= q
    /\ card' = [card EXCEPT ![c].proxy = @ - q]
    /\ UNCHANGED <<item, nextItem, allocs, ledger, tx>>

-----------------------------------------------------------------------------
(* Compound operations: one allocation row per step inside `tx`. *)

\* `release(allocation, allocation.quantity)` for one row of card `c`.
ReleaseOne(c) ==
    \E a \in AllocsOf(c) :
        /\ Restore(a.item, a.qty, a.src)
        /\ allocs' = allocs \ {a}

\* `release(allocation, min(excess, allocation.quantity))`.
ReleasePart(c, excess) ==
    \E a \in AllocsOf(c) :
        LET r == Min(excess, a.qty)
        IN /\ Restore(a.item, r, a.src)
           /\ allocs' = IF r = a.qty THEN allocs \ {a}
                        ELSE (allocs \ {a}) \cup {[a EXCEPT !.qty = @ - r]}
           /\ tx' = [tx EXCEPT !.excess = @ - r]

(* `clear_deck_card_allocations`, then whatever the caller does after it:
   "none" (moving to considering), "delete" (deleting the deck card),
   "archive" (`disassemble_deck`). *)
ClearStep ==
    /\ tx.kind = "clear"
    /\ LET c == tx.card IN
       IF AllocsOf(c) # {}
       THEN /\ ReleaseOne(c)
            /\ UNCHANGED <<card, ledger, tx>>
       ELSE /\ card' = CASE tx.then = "delete" -> [card EXCEPT ![c].alive = FALSE]
                         [] tx.then = "archive" -> [card EXCEPT ![c].archived = TRUE]
                         [] OTHER -> card
            /\ tx' = Idle
            /\ UNCHANGED <<item, nextItem, allocs, ledger>>

(* `trim_deck_card_allocations` after the proxy clamp: physical copies that
   no longer fit go back, oldest allocation first (any order here). *)
TrimStep ==
    /\ tx.kind = "trim"
    /\ IF tx.excess = 0 \/ AllocsOf(tx.card) = {}
       THEN /\ tx' = Idle
            /\ UNCHANGED <<item, nextItem, allocs>>
       ELSE ReleasePart(tx.card, tx.excess)
    /\ UNCHANGED <<card, ledger>>

(* `switch_allocation_to_preferred_printing`: remember the physical count,
   clear, then `allocate_available_preferred_printing` reserves up to that
   many copies of the new printing, bounded by what the card still needs.
   The "trim" phase is `update_in`'s trim that runs first when the same
   edit also lowered the quantity. *)
SwitchStep ==
    /\ tx.kind = "switch"
    /\ LET c == tx.card IN
       CASE tx.phase = "trim" /\ (tx.excess = 0 \/ AllocsOf(c) = {}) ->
                /\ tx' = [tx EXCEPT !.phase = "clear", !.needed = Physical(c)]
                /\ UNCHANGED <<item, nextItem, card, allocs, ledger>>
         [] tx.phase = "trim" ->
                /\ ReleasePart(c, tx.excess)
                /\ UNCHANGED <<card, ledger>>
         [] tx.phase = "clear" /\ AllocsOf(c) # {} ->
                /\ ReleaseOne(c)
                /\ UNCHANGED <<card, ledger, tx>>
         [] tx.phase = "clear" /\ AllocsOf(c) = {} ->
                /\ tx' = [tx EXCEPT !.phase = "realloc",
                                    !.needed = Min(tx.needed, Sat(Required(c), Allocated(c)))]
                /\ UNCHANGED <<item, nextItem, card, allocs, ledger>>
         [] tx.phase = "realloc" ->
                LET candidates == {i \in LiveItems :
                                      item[i].printing = card[c].pref /\ Available(c, i) >= 1}
                IN IF tx.needed = 0 \/ candidates = {}
                   THEN /\ tx' = Idle
                        /\ UNCHANGED <<item, nextItem, card, allocs, ledger>>
                   ELSE \E i \in candidates :
                        LET take == Min(tx.needed, Available(c, i))
                        IN /\ MoveCopies(i, take, NULL)
                           /\ allocs' = Reserve(c, HeldBy(i, take), take, item[i].loc)
                           /\ tx' = [tx EXCEPT !.needed = @ - take]
                           /\ UNCHANGED <<card, ledger>>

-----------------------------------------------------------------------------
(* manavault-collection::decks::cards *)

(* `update_in` with a new quantity and/or preferred printing (finish changes
   take the same path). A lower quantity trims (proxies are clamped in the
   same write), and a printing change then switches the copies.
   Before the fix the switch replaced the trim (`else if`), which TLC caught
   as a NotOverAllocated violation: proxies 2 on a card lowered to 1. *)
UpdateCard(c, newQty, newPref) ==
    /\ tx = Idle
    /\ Editable(c)
    /\ LET switching == newPref # card[c].pref
           lowering == newQty < card[c].qty
                       /\ ~(switching /\ "switch_skips_trim" \in Bugs)
           physical == Physical(c)
           proxy == IF lowering THEN Min(card[c].proxy, Sat(newQty, physical))
                    ELSE card[c].proxy
           excess == IF lowering THEN Sat(physical, newQty) ELSE 0
       IN /\ card' = [card EXCEPT ![c].qty = newQty, ![c].pref = newPref,
                                  ![c].proxy = proxy]
          /\ tx' = IF switching
                   THEN [kind |-> "switch", card |-> c, phase |-> "trim",
                         excess |-> excess, needed |-> 0]
                   ELSE IF lowering
                   THEN [kind |-> "trim", card |-> c, excess |-> excess]
                   ELSE Idle
    /\ UNCHANGED <<item, nextItem, allocs, ledger>>

\* `update_in` moving the card to considering: proxies and copies go.
MoveToConsidering(c) ==
    /\ tx = Idle
    /\ Editable(c)
    /\ card[c].zone = "main"
    /\ card' = [card EXCEPT ![c].zone = "cons", ![c].proxy = 0]
    /\ tx' = [kind |-> "clear", card |-> c, then |-> "none"]
    /\ UNCHANGED <<item, nextItem, allocs, ledger>>

MoveToMain(c) ==
    /\ tx = Idle
    /\ Editable(c)
    /\ card[c].zone = "cons"
    /\ card' = [card EXCEPT ![c].zone = "main"]
    /\ UNCHANGED <<item, nextItem, allocs, ledger, tx>>

\* `delete_checked_in`: clear, then delete the row.
DeleteCard(c) ==
    /\ tx = Idle
    /\ Editable(c)
    /\ tx' = [kind |-> "clear", card |-> c, then |-> "delete"]
    /\ UNCHANGED <<item, nextItem, card, allocs, ledger>>

(* `add_collection_item_to_deck` on an existing deck card: one copy joins the
   deck card (which takes the item's printing) and is reserved in the same
   transaction; a failed reservation rolls the whole call back. Basic lands
   join without a reservation, like the bulk add. Before the fix the basic
   land was reserved too, and `ensure_room` rejected it every time because
   a basic land already counts as fully allocated (BasicLandsJoinDecks). *)
AddAccepted(c, i) ==
    /\ Allocatable(c)
    /\ item[i].alive
    /\ LET reserving == c \notin Basic \/ "reserve_basics" \in Bugs
           allocated == IF c \in Basic THEN card[c].qty + 1
                        ELSE Physical(c) + card[c].proxy
       IN reserving => Available(c, i) >= 1 /\ allocated + 1 <= card[c].qty + 1

AddItemToDeck(c, i) ==
    /\ tx = Idle
    /\ card[c].qty < MaxQty
    /\ AddAccepted(c, i)
    /\ IF c \in Basic /\ "reserve_basics" \notin Bugs
       THEN UNCHANGED <<item, nextItem, allocs>>
       ELSE /\ MoveCopies(i, 1, NULL)
            /\ allocs' = Reserve(c, HeldBy(i, 1), 1, item[i].loc)
    /\ card' = [card EXCEPT ![c].qty = @ + 1, ![c].pref = item[i].printing]
    /\ UNCHANGED <<ledger, tx>>

\* Deck status changes. Archiving keeps the reservations.
Archive(c) ==
    /\ tx = Idle
    /\ Editable(c)
    /\ card' = [card EXCEPT ![c].archived = TRUE]
    /\ UNCHANGED <<item, nextItem, allocs, ledger, tx>>

Unarchive(c) ==
    /\ tx = Idle
    /\ card[c].alive /\ card[c].archived
    /\ card' = [card EXCEPT ![c].archived = FALSE]
    /\ UNCHANGED <<item, nextItem, allocs, ledger, tx>>

\* `disassemble_deck`: every copy goes home and the deck is archived.
Disassemble(c) ==
    /\ tx = Idle
    /\ card[c].alive
    /\ tx' = [kind |-> "clear", card |-> c, then |-> "archive"]
    /\ UNCHANGED <<item, nextItem, card, allocs, ledger>>

-----------------------------------------------------------------------------
(* manavault-collection::collection::changes: editing items.
   `ensure_allocations_kept` rejects shrinking an item below its reserved
   copies and filing reserved copies in a location. Before that guard, TLC
   found AllocationsBacked and AllocatedItemsUnfiled violations: a release
   after such an edit fails with QuantityMismatch, locking the deck card
   (`Bugs` member "unguarded_edits"). *)

EditItemQty(i, q) ==
    /\ tx = Idle
    /\ CollectionEdits
    /\ item[i].alive
    /\ q # item[i].qty
    /\ ("unguarded_edits" \in Bugs \/ q >= SumQty(AllocsOn(i)))
    /\ item' = [item EXCEPT ![i].qty = q]
    /\ ledger' = ledger - item[i].qty + q
    /\ UNCHANGED <<nextItem, card, allocs, tx>>

EditItemLoc(i, loc) ==
    /\ tx = Idle
    /\ CollectionEdits
    /\ item[i].alive
    /\ loc # item[i].loc
    /\ ("unguarded_edits" \in Bugs \/ AllocsOn(i) = {})
    /\ item' = [item EXCEPT ![i].loc = loc]
    /\ UNCHANGED <<nextItem, card, allocs, ledger, tx>>

\* `delete_item`: `deck_allocations.collection_item_id ON DELETE CASCADE`.
DeleteItem(i) ==
    /\ tx = Idle
    /\ item[i].alive
    /\ item' = [item EXCEPT ![i].alive = FALSE, ![i].qty = 0]
    /\ ledger' = ledger - item[i].qty
    /\ allocs' = allocs \ AllocsOn(i)
    /\ UNCHANGED <<nextItem, card, tx>>

-----------------------------------------------------------------------------

Init ==
    /\ item = [i \in ItemIds |-> [alive |-> FALSE, qty |-> 0, loc |-> BOX,
                                  printing |-> CHOOSE p \in Printings : TRUE]]
    /\ nextItem = 1
    /\ card \in [Cards -> [alive: {TRUE}, qty: 1..MaxQty, proxy: {0}, zone: {"main"},
                           archived: {FALSE}, pref: Printings]]
    /\ allocs = {}
    /\ ledger = 0
    /\ tx = Idle

\* `create_item`: a new stack in a box.
CreateItem(q, printing) ==
    /\ tx = Idle
    /\ nextItem <= MaxItems
    /\ item' = [item EXCEPT ![nextItem] = NewItem(q, BOX, printing)]
    /\ nextItem' = nextItem + 1
    /\ ledger' = ledger + q
    /\ UNCHANGED <<card, allocs, tx>>

Quantities == 1..MaxQty

Next ==
    \/ \E q \in Quantities, p \in Printings : CreateItem(q, p)
    \/ \E c \in Cards, i \in ItemIds, q \in Quantities : Allocate(c, i, q)
    \/ \E c \in Cards, i \in ItemIds, q \in Quantities : Deallocate(c, i, q)
    \/ \E c \in Cards, q \in Quantities : AllocateProxy(c, q)
    \/ \E c \in Cards, q \in Quantities : DeallocateProxy(c, q)
    \/ \E c \in Cards, q \in Quantities, p \in Printings : UpdateCard(c, q, p)
    \/ \E c \in Cards : MoveToConsidering(c) \/ MoveToMain(c) \/ DeleteCard(c)
    \/ \E c \in Cards, i \in ItemIds : AddItemToDeck(c, i)
    \/ \E c \in Cards : Archive(c) \/ Unarchive(c) \/ Disassemble(c)
    \/ \E i \in ItemIds, q \in Quantities : EditItemQty(i, q)
    \/ \E i \in ItemIds, l \in Locs : EditItemLoc(i, l)
    \/ \E i \in ItemIds : DeleteItem(i)
    \/ ClearStep \/ TrimStep \/ SwitchStep

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Invariants. Each is what the Rust code's documentation claims; they are
   checked between transactions only. *)

Committed == tx = Idle

TypeOK ==
    /\ item \in [ItemIds -> [alive: BOOLEAN, qty: 0..MaxQty, loc: Locs, printing: Printings]]
    /\ nextItem \in 1..(MaxItems + 1)
    /\ card \in [Cards -> [alive: BOOLEAN, qty: 1..MaxQty, proxy: 0..MaxProxy,
                           zone: Zones, archived: BOOLEAN, pref: Printings]]
    /\ \A a \in allocs : a.card \in Cards /\ a.item \in ItemIds /\ a.qty >= 1 /\ a.src \in Locs

\* "proxies plus allocations never exceed the quantity" (trim's doc comment).
NotOverAllocated ==
    Committed => \A c \in Cards :
        card[c].alive /\ c \notin Basic => Physical(c) + card[c].proxy <= Required(c)

\* Every reservation can be released: the item still holds the copies.
AllocationsBacked ==
    Committed => \A a \in allocs :
        item[a.item].alive /\ SumQty(AllocsOn(a.item)) <= item[a.item].qty

\* "Allocated copies leave their location (`location_id` becomes `NULL`)".
AllocatedItemsUnfiled ==
    Committed => \A a \in allocs : item[a.item].loc = NULL

\* "In the considering zone the card is only an idea, so nothing is reserved."
NoConsideringAllocations ==
    Committed => \A a \in allocs : card[a.card].alive /\ card[a.card].zone = "main"

\* Reserving and releasing never create or lose copies.
Conservation == Committed => TotalCopies = ledger

(* `bulk_add_collection_items_to_deck` adds basic lands to the deck without
   reserving them. The single-item add should accept the same request. *)
BasicLandsJoinDecks ==
    Committed => \A c \in Basic, i \in ItemIds :
        (Allocatable(c) /\ item[i].alive /\ Available(c, i) >= 1 /\ card[c].qty < MaxQty)
            => AddAccepted(c, i)

\* Keep TLC's state space bounded.
StateConstraint == nextItem <= MaxItems + 1 /\ ledger <= 2 * MaxQty

=============================================================================
