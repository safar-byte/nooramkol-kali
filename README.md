# Nooramkol Kali (നൂറാംകോൽ കളി)

A browser prototype of **Nooramkol Kali**, also known as **Eerkkil Kali**, a traditional Kerala stick-picking game. Drop a bundle of sticks, then take them out of the pile one at a time without disturbing the others. Play solo, or online against a friend.

> The game rewards patience and precision, not speed.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest rule and state tests
npm run build      # static site in dist/
```

The build is fully static, with relative asset paths, so `dist/` runs on any static host. It is published to GitHub Pages from the `gh-pages` branch (`npm run deploy`).

## Play with a friend (online)

1. One player chooses **Play with a friend → Create a room** and shares the 6-character code, or the invite link (`?room=CODE`).
2. The other player enters the code and presses **Join**. The room creator then picks the difficulty and presses **Start match**.
3. Both players pick from the **same pile**. A clean pick scores for you and **you keep the turn**. A **foul passes the turn** to the other player, and the stick stays in the pile.
4. When the pile is empty, the higher score wins. The room creator can start a **Rematch**, and the starting player alternates each round.

While it is the other player's turn, you can watch their stick move live. Either player can pause. If a player's connection drops, the game pauses for both, and the player can rejoin the same room with the same code.

**How it works.** The two browsers connect directly using WebRTC through [PeerJS](https://peerjs.com/). The free public PeerJS server is only used to help the browsers find each other, so the game remains a static site with no backend.

- The room creator's browser is the referee. It runs the match rules (`src/game/matchReducer.js`) and sends the full game state to the other player after every change.
- The joining player's browser applies its own moves straight away, without waiting for the room creator, and then lines up with the state the room creator sends back.
- Each pick from the joining player arrives with its drag path. The room creator re-checks that path with the same rules (`src/game/resolvePick.js`), so a modified browser cannot claim a clean pick it didn't make.
- Every message from the other browser is validated before use (`src/net/protocol.js`).
- Both browsers send a heartbeat, so a closed tab or lost network is noticed within about 10 seconds.

**Limitations.** Some networks (offices, schools, some mobile carriers) block direct browser-to-browser connections. Players on those networks will see a "couldn't connect" message, because there is no relay (TURN) server. The board layout (landscape or portrait) is set by the room creator's screen. If the room creator closes their tab, the match ends.

## Rules in this version

| Event | Score |
|---|---:|
| Remove a small stick cleanly (×10) | +10 |
| Remove the large stick cleanly (×1) | +100 |
| Foul: another stick was disturbed | 0 |
| **Maximum** | **200** |

1. **Bundle and drop.** The large stick starts underneath the 10 small sticks. Press **Drop sticks** and the bundle scatters into a pile.
2. **Pile check.** At least one small stick has to land on top of the large stick. If none does, the drop is a foul and you get **one** retry. A second foul drop ends the setup: *"Invalid pile — start a new game to try again."*
3. **Pick.** Drag a stick into the tray. If it touches another stick on the way, the pick is a foul: you score nothing and the stick goes back. You can choose in Settings whether a foul ends the round instead.
4. **Covered sticks.** If another stick is lying on top of the one you pick, that stick gets disturbed as soon as you move. Take the top sticks off first.
5. Collect all 11 sticks to clear the pile.

**Rule interpretation (to confirm):** the setup rule is implemented as *at least one* small stick overlapping the large stick, not *every* small stick. Local traditions vary, so this is one interpretation and not a definitive rule set.

### Difficulty

Every difficulty uses the same 10 + 1 sticks and the same points.

| | Scatter | Contact margin | Assistance |
|---|---|---|---|
| Relaxed | wide | lenient (sticks may graze) | hover highlight, hints, sticks lying on top are outlined |
| Traditional | natural overlap | standard | hover highlight, hints |
| Expert | dense | strict | no hints |

## Controls

- **Mouse / touch / pen:** press a stick, drag it to the tray, release. Each pointer type goes through Pointer Events, and the board sets `touch-action: none` so a drag never scrolls the page.
- **Keyboard:** focus the board, use the arrow keys or `N`/`P` to cycle through sticks from the top of the pile, `Enter` to pick one up, the arrow keys to move it (`Shift` for bigger steps), `Enter` to drop it, `Escape` to put it back, and `H` for a hint. Choices and results are read out through an ARIA live region.
- **Debug overlay:** add `?debug` to the URL, or turn it on in Settings, to see the collision capsules, the crossing points between sticks, and the drag path.

## How disturbance detection works

Nothing in the pile moves physically. Instead, `src/game/validateMove.js` checks the dragged stick deterministically:

- Each stick is a line segment plus a radius. Two sticks are in contact when the distance between their segments is at most half their combined widths plus a contact margin that depends on difficulty.
- The drag path is resampled every 1.5 board units, so a fast flick cannot jump over a thin stick.
- A stick that already touched the dragged stick when the move began is ignored as long as the contact continues. Sticks that overlap from the start therefore never fail a move by themselves. Once the dragged stick separates from one, touching it again is a foul.
- A stick lying **on top of** the dragged stick (higher in the z-order and overlapping it) counts as disturbed once the dragged stick moves more than the lift tolerance.

Every move produces a structured result such as `{ valid, reason, disturbedStickIds, contactPoint }`. The UI uses it to explain the failure and to highlight the stick that was hit.

## Project structure

```text
src/
├── app/                 React shell: App, dialogs, screens, i18n
├── game/                Pure rule modules plus rendering/input glue
│   ├── constants.js     Points, counts, difficulties, layouts
│   ├── random.js        Seeded PRNG (reproducible piles)
│   ├── geometry.js      Segment maths
│   ├── createPile.js    Stick set, bundle, scatter, pile validity, tray slots
│   ├── validateMove.js  Disturbance detection
│   ├── hints.js         Finds a cleanly removable stick and its path
│   ├── hitTest.js       Pointer → board coordinates, topmost-stick picking
│   ├── gameReducer.js   Explicit phases and actions, derived summary
│   ├── matchReducer.js  2-player turns, per-player scores, prediction replay
│   ├── resolvePick.js   Authoritative verdict for a remote pick
│   ├── persistence.js   localStorage schema, sanitising, best scores
│   ├── boardController.js  Drag state, animations, per-frame rendering
│   ├── drawBoard.js     Canvas drawing (cached tabletop)
│   ├── inputController.js  Pointer Events wiring
│   └── sound.js         Synthesised Web Audio effects (no audio files)
├── net/                 PeerJS rooms (peerRoom.js) and the validated wire protocol
├── hooks/               useGameLoop (rAF), useLocalSettings, useMultiplayerMatch
├── styles/
└── test/                Vitest suites
```

Game phases run `bundling → dropping → validating-pile → playing → complete`. A foul drop goes `validating-pile → foul-retry → bundling`, and a second foul drop goes to `setup-failed`. The reducer guards every transition, so a duplicate or late event cannot resolve the same move twice. Randomness enters only through seeds carried on actions. That keeps the rules reproducible, which the online mode relies on: both browsers compute the same pile from the same seed.

## Persistence

Settings and the best result for each difficulty are stored under `localStorage["nooramkol-kali:v1"]`. A higher score wins, and on equal scores fewer fouls wins. If the stored data is corrupted, the game falls back to defaults instead of crashing.

## Known limitations and next steps

- The Malayalam UI strings are a **draft** and need review by a fluent speaker before publishing.
- Other sticks never move. A Matter.js physics mode could be added later behind the same `validateMove` contract.
- The disturbance tolerances need tuning through playtests with real players.
