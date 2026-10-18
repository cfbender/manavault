# @cfbender/playtest

A Magic: The Gathering deck playtester for React, plus a read-only spectator board for other
players. Shared by ManaVault and The Gathering. It ships TypeScript source; the consuming app's
bundler (Vite) compiles it.

- `DeckPlaytester`: the full-screen table for one player: hand, library, battlefield, graveyard,
  exile, and command zone, with pointer-event dragging that works with a mouse, pen, or finger.
- `PlaytestSpectatorBoard`: a read-only rendering of another player's board that scales to fit
  its container, phones included.
- `projectPublicSnapshot`: strips a game down to what other players may see.
- The pure game functions (`createPlaytestState`, `drawCards`, `movePlaytestCard`,
  `nextTurnSnapshot`, ...).

## Requirements

React 19, Tailwind CSS 4, and daisyUI 5. The components use Tailwind utilities and daisyUI
classes and tokens (`btn`, `bg-base-100`, `rounded-box`, ...), so they follow the app's theme.

## Install

As a git dependency, pinned to a tag or commit:

```json
{ "dependencies": { "@cfbender/playtest": "github:cfbender/playtest#v0.1.0" } }
```

Then import the stylesheet from the app's Tailwind entry CSS, after Tailwind and daisyUI:

```css
@import "tailwindcss";
@plugin "daisyui";
@import "@cfbender/playtest/styles.css";
```

`styles.css` defines the playtester's keyframes and contains the `@source` line that makes
Tailwind generate the package's classes:

```css
@source "./"; /* resolves to node_modules/@cfbender/playtest/src */
```

If you would rather not import it, add the same line to your own stylesheet
(`@source "../node_modules/@cfbender/playtest/src";`, relative to that stylesheet) and copy the
`@keyframes` rules from `src/styles.css`.

Popovers and menus portal to `document.body` at `z-index: var(--playtest-floating-z, 1200)`;
set `--playtest-floating-z` if the playtester sits in a higher layer.

## Playing: `DeckPlaytester`

```tsx
import { createPlaytestState, DeckPlaytester } from "@cfbender/playtest"

const initialState = useMemo(() => createPlaytestState(libraryCards, commanders), [deck])

<DeckPlaytester
  title={deck.name}
  initialState={initialState}
  closeSlot={<BackButton />}
  sleeveImageUrl="/logo.png"
  manaSymbolUrl={(symbol) => `https://svgs.scryfall.io/card-symbols/${symbol}.svg`}
  saveKey={`my-app:playtest:${deck.id}`}
  settingsKey="my-app:playtest-settings"
/>
```

Fill the playtester's container (`h-full`): it lays out its own top bar, battlefield, and zones.

| Prop                             | Purpose                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `title`, `initialState`          | Required. `initialState` is the deal a new game starts from; restarting reshuffles it.                    |
| `closeSlot`                      | Rendered at the start of the top bar (a back link or close button).                                       |
| `tokenOptions`                   | Tokens this deck makes, offered first in the token dialog.                                                |
| `sleeveImageUrl`                 | Logo on card backs. Omit for a plain sleeve.                                                              |
| `manaSymbolUrl(symbol)`          | Image URL for a mana symbol, named like Scryfall's files (`{2/W}` is `2W`). Omit to hide hand mana costs. |
| `saveKey`                        | localStorage key for autosaving an uncontrolled game. Omit to disable autosave.                           |
| `settingsKey`                    | localStorage key for the player's settings. Omit to keep them in memory.                                  |
| `snapshot`, `onSnapshotChange`   | Controlled state (see below).                                                                             |
| `life`, `playerCounters`, `turn` | Host-owned values (see below).                                                                            |

### Controlled state

Without `snapshot`, the playtester keeps its own game (autosaved under `saveKey`). Pass
`snapshot` and `onSnapshotChange` to own the game in the host instead, for example to broadcast it:

```tsx
const [snapshot, setSnapshot] = useState(() => initialSnapshot(initialState))

<DeckPlaytester
  title={deck.name}
  initialState={initialState}
  snapshot={snapshot}
  onSnapshotChange={(next) => {
    setSnapshot(next)
    socket.emit("board", projectPublicSnapshot(next))
  }}
/>
```

`onSnapshotChange` fires once per change, including undo and restart. A battlefield drag reports
once, when the card is dropped. Undo history, selection, menus, and the action log stay inside
the component. A `PlaytestSnapshot` is plain JSON.

### Host-owned life, counters, and turn

Each of `life`, `playerCounters`, and `turn` takes one of:

- omitted: the playtester tracks the value in its snapshot (ManaVault's behaviour);
- `{ value, onChange }`: the host owns it; the playtester shows `value` and calls `onChange`
  with the new value (its buttons and keyboard shortcuts both go through the host);
- `null`: the control is hidden.

With a host-owned `turn`, "Next turn" still untaps and draws in the snapshot, then calls
`turn.onChange(value + 1)`. With `turn={null}` there is no next-turn button; apply
`nextTurnSnapshot(snapshot, { draw: true })` to the controlled snapshot when the table reaches
this player's turn.

## Watching: `projectPublicSnapshot` and `PlaytestSpectatorBoard`

Never send a `PlaytestSnapshot` to other players: it holds the hand and the library order.
Send `projectPublicSnapshot(snapshot)` instead:

- the hand and library become `handCount` and `libraryCount`;
- face-down cards become `{ hidden: true, id }` with an anonymous id (stable while the card stays
  face down), and their statuses, positions, and tap state move to that id;
- statuses, positions, and tapped ids of cards in hidden zones are dropped.

Render it with the spectator board:

```tsx
<PlaytestSpectatorBoard
  snapshot={publicSnapshot}
  title={player.name}
  showPlayerStats={false} // the table already shows life, turn, and counters
  sleeveImageUrl="/logo.png"
  onCardPreview={(card, zone) => openCardPreview(card)}
/>
```

Viewers tap a face-up card (or a graveyard, exile, or command card from the zone list) to call
`onCardPreview`. The battlefield scales to fit the board's container.

## Development

From the workspace that contains the package:

```sh
aube --filter @cfbender/playtest run test       # Vitest: game functions, projection, controlled mode
aube --filter @cfbender/playtest run typecheck
```

The package must not import from its host apps.
