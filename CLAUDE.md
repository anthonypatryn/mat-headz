# Mat Headz — Game Rules & Project Reference

## Overview
2-player wrestling card game. Place cards on the mat to trigger wrestling moves and score points. First to PIN wins instantly; otherwise most points after 3 rounds wins.

---

## Card Anatomy

Cards are **portrait** images displayed **landscape** (rotated -90° normal, +90° flipped).

Each card has **2 zones** — LEFT (physical top half) and RIGHT (physical bottom half):

```
Physical portrait card (displayed landscape):
  ┌─────────────────────┐
  │  LEFT zone          │  ← physical top half
  │  Moveset: ENGAGE    │
  │  tL: LOCK_UP        │  ← portrait-LEFT outer edge label  (fires when this card is the rightCard)
  │  tR: DOUBLE_LEG     │  ← portrait-RIGHT outer edge label (fires when this card is the leftCard)
  ├─────────────────────┤
  │  RIGHT zone         │  ← physical bottom half
  │  Moveset: ESCAPE    │
  │  tL: REVERSAL       │
  │  tR: REVERSAL       │
  └─────────────────────┘
```

Each zone has:
- **m** — Moveset type: `PIN | ENGAGE | TAKEDOWN | ESCAPE`
- **tL** — Left outer edge tertiary label
- **tR** — Right outer edge tertiary label

**Inner edges (L.tR and R.tL) are the center strip — visual only, NEVER fire.**  
Only outer edges fire: **L.tL** (when this card is the rightCard) and **R.tR** (when this card is the leftCard).

---

## Flip Mechanic

When a card is **flipped** (rotated +90° instead of -90°):
- L zone ↔ R zone swap
- Within each zone: tL ↔ tR also swap (the physical card reverses direction)

Handled by `effectiveZones(card, flipped)` in `deck.js`.

---

## Mat

- 8-zone grid (1600px wide, each zone = 200px = half a card)
- Each card occupies 2 zones
- Maximum 4 cards side by side (no overlap), or more with overlapping placement
- **Ring Out**: if placing a card would push the mat beyond 8 zones → all cards clear, opponent goes next

---

## Turn Structure

1. **Draw** a card from the deck
2. **Play** one card from your hand:
   - Place it on the mat (end placements or on-top)
   - OR discard it to take a point

---

## Card Placement Types

| Placement | Mat Span Change | Notes |
|---|---|---|
| Adjacent-left | +2 | No overlap, beside left end |
| Overlap-left | +1 | Half-overlap with left end card |
| On-top | 0 | Cover an existing card (no pair fires) |
| Overlap-right | +1 | Half-overlap with right end card |
| Adjacent-right | +2 | No overlap, beside right end |

**On-top placement** triggers NOTHING — no secondary, no tertiary.

---

## Secondary Actions (Zone Match)

When two adjacent cards are placed side by side, if the **facing zones** are the same moveset type, the secondary fires:

| Moveset | Secondary Effect |
|---|---|
| **PIN** | Instant win! |
| **ENGAGE** | Draw a card, take another turn |
| **TAKEDOWN** | Choose: take a point OR take another turn |
| **ESCAPE** | No effect — turn ends |

---

## Tertiary Actions (Edge Match)

A tertiary fires **only** when the touching outer edges of adjacent zones share the **same label**.

**Placement direction matters:**
- Placing to the **RIGHT**: `existingCard.R.tR === newCard.L.tL`
- Placing to the **LEFT**: `newCard.R.tR === existingCard.L.tL`

Example — new card has ENGAGE (L.tL=SINGLE_LEG, L.tR=DOUBLE_LEG) placed RIGHT of existing card whose R zone is ENGAGE (R.tR=DOUBLE_LEG):
→ existingCard.R.tR=DOUBLE_LEG vs newCard.L.tL=SINGLE_LEG → **NO MATCH**

Same new card placed LEFT of existing card whose L zone is ENGAGE (L.tL=DOUBLE_LEG):
→ newCard.R.tR=DOUBLE_LEG vs existingCard.L.tL=DOUBLE_LEG → **MATCH → DOUBLE_LEG fires**

### Tertiary Effects

| Key | Name | Effect |
|---|---|---|
| `LOCK_UP` | Lock Up | Draw a card. Put 1 card from hand on bottom of deck. |
| `SINGLE_LEG` | Single Leg | Draw an extra card on bonus turn. Keep 2 cards in hand for the rest of the round. |
| `DOUBLE_LEG` | Double Leg | Remove any mat card and place it face-up beside the draw pile. It cannot be covered. |
| `FIREMANS_CARRY` | Fireman's Carry | Opponent skips their next turn. You start a new turn. |
| `ARM_DRAG` | Arm Drag | Play your other hand card onto the mat, then draw 1. Then take a point normally. |
| `HIP_TOSS` | Hip Toss | Draw a card. If you can play a legal PIN from hand, do so now. Otherwise use it as a point. |
| `SEATBELT_THROW` | Seatbelt Throw | Draw a card. If it has a PIN zone — you win! |
| `REVERSAL` | Reversal | Take a point (draw a card face-down into your score pile). |

---

## Winning

- **PIN match** = instant win regardless of score
- **3 rounds**: player with most points after all 3 rounds wins
- **Tie**: tie

---

## All 18 Cards

| # | L.m | L.tL | L.tR | R.m | R.tL | R.tR |
|---|---|---|---|---|---|---|
| 1 | PIN | — | — | ENGAGE | DOUBLE_LEG | DOUBLE_LEG |
| 2 | PIN | — | — | TAKEDOWN | SEATBELT_THROW | ARM_DRAG |
| 3 | TAKEDOWN | SEATBELT_THROW | HIP_TOSS | TAKEDOWN | FIREMANS_CARRY | ARM_DRAG |
| 4 | ENGAGE | DOUBLE_LEG | SINGLE_LEG | ENGAGE | SINGLE_LEG | LOCK_UP |
| 5 | ENGAGE | LOCK_UP | DOUBLE_LEG | ESCAPE | REVERSAL | REVERSAL |
| 6 | ENGAGE | LOCK_UP | DOUBLE_LEG | ESCAPE | REVERSAL | REVERSAL |
| 7 | TAKEDOWN | HIP_TOSS | FIREMANS_CARRY | ESCAPE | REVERSAL | REVERSAL |
| 8 | TAKEDOWN | ARM_DRAG | HIP_TOSS | ESCAPE | REVERSAL | REVERSAL |
| 9 | TAKEDOWN | ARM_DRAG | HIP_TOSS | TAKEDOWN | FIREMANS_CARRY | FIREMANS_CARRY |
| 10 | ENGAGE | DOUBLE_LEG | SINGLE_LEG | ENGAGE | SINGLE_LEG | LOCK_UP |
| 11 | ENGAGE | LOCK_UP | SINGLE_LEG | TAKEDOWN | HIP_TOSS | SEATBELT_THROW |
| 12 | ENGAGE | SINGLE_LEG | DOUBLE_LEG | TAKEDOWN | ARM_DRAG | HIP_TOSS |
| 13 | TAKEDOWN | HIP_TOSS | HIP_TOSS | ENGAGE | SINGLE_LEG | SINGLE_LEG |
| 14 | ENGAGE | SINGLE_LEG | DOUBLE_LEG | TAKEDOWN | FIREMANS_CARRY | HIP_TOSS |
| 15 | TAKEDOWN | FIREMANS_CARRY | HIP_TOSS | ENGAGE | SINGLE_LEG | SINGLE_LEG |
| 16 | ENGAGE | SINGLE_LEG | DOUBLE_LEG | TAKEDOWN | ARM_DRAG | HIP_TOSS |
| 17 | PIN | — | — | ESCAPE | REVERSAL | REVERSAL |
| 18 | PIN | — | — | ESCAPE | REVERSAL | REVERSAL |

---

## Key Code Files

| File | Purpose |
|---|---|
| `src/data/deck.js` | All 18 cards with tL/tR, TERTIARY_LABEL/DESC maps, effectiveZones() |
| `src/hooks/useGame.js` | Full game state machine: detectPair, confirmPlacement, resolveAction |
| `src/App.jsx` | All React components: ZoneBadge, MatZoneStrip, PlacementPreview, etc. |
| `src/App.css` | All styles |
| `public/Cards/` | Card images 1.png–18.png + Back.png |

---

## Game State Phases

```
start → pass → playing → placed → action → pass → ...
                                          ↘ matPick (DOUBLE_LEG)
                              ↘ roundEnd → pass → playing → ...
                              ↘ gameOver
```

| Phase | What's happening |
|---|---|
| `start` | App booting, auto-inits |
| `pass` | Handoff screen — other player looks away. Auto-skipped currently. |
| `playing` | Active player selects & drags a card |
| `placed` | Card is on mat, awaiting Confirm / Flip / drag-back |
| `action` | Secondary or tertiary modal is open |
| `resolve` | Turn-end banner shown before next player's pass |
| `matPick` | Player is tapping a mat card (Double Leg) |
| `roundEnd` | Between rounds |
| `gameOver` | Game finished |

---

## effectiveZones() Logic

```js
// When flipped: L↔R swap AND tL↔tR swap within each zone
export function effectiveZones(card, flipped) {
  if (!flipped) return { left: card.L, right: card.R };
  return {
    left:  { ...card.R, tL: card.R.tR, tR: card.R.tL },
    right: { ...card.L, tL: card.L.tR, tR: card.L.tL },
  };
}
```

---

## detectPair() / previewPlacement() Logic

Both functions are identical in structure (one in `useGame.js`, one in `App.jsx`). Always keep them in sync.

```js
function detectPair(placed, newMat, placement) {
  const placedZones = effectiveZones(placed.card, placed.flipped);
  let adjacentCard = null;

  // placed is always index 0 (left) or last (right) in newMat after insert
  if ((placement === 'left' || placement === 'adjacent-left') && newMat.length >= 2) {
    adjacentCard = newMat[1];                    // card that is now to our right
  } else if ((placement === 'right' || placement === 'adjacent-right') && newMat.length >= 2) {
    adjacentCard = newMat[newMat.length - 2];    // card that is now to our left
  }

  if (!adjacentCard) return null;

  const adjZones = effectiveZones(adjacentCard.card, adjacentCard.flipped);
  const isRight = placement === 'right' || placement === 'adjacent-right';

  // Facing zones
  const placedZone = isRight ? placedZones.left  : placedZones.right;
  const adjZone    = isRight ? adjZones.right     : adjZones.left;

  if (placedZone.m !== adjZone.m) return null;

  // Tertiary: touching outer edges must match
  // isRight:  placed=rightCard → adjZone.tR (its outer right) vs placedZone.tL (our outer left)
  // !isRight: placed=leftCard  → placedZone.tR (our outer right) vs adjZone.tL (their outer left)
  let tertiaryKey = null;
  if (isRight) {
    if (adjZone.tR && placedZone.tL && adjZone.tR === placedZone.tL) tertiaryKey = adjZone.tR;
  } else {
    if (placedZone.tR && adjZone.tL && placedZone.tR === adjZone.tL) tertiaryKey = placedZone.tR;
  }

  return { moveset: placedZone.m, tertiaryKey, pairedZone: placedZone };
}
```

---

## Mat Array Layout

```
mat = [ card0, card1, card2, ... ]   // index 0 = leftmost on mat
```

After placing to the **right**: `newMat = [...oldMat, placed]`  
After placing to the **left**: `newMat = [placed, ...oldMat]`

Each entry: `{ uid, card, flipped, adjacent, zoneOffset }`  
- `zoneOffset` = absolute 0-indexed half-card position in the 8-zone grid
- `adjacent` = true if placed without overlap (full card width gap between this and neighbour)

---

## Known Issues / Active Work

- **Overlap pair detection**: When cards visually overlap, the `newMat[newMat.length - 2]` lookup finds the correct structural neighbour, but if the visual "top" card is a flipped version of the same card placed on-top, the comparison may use the wrong flipped state. Investigation pending.

---

## Dev Setup

```bash
cd mat-headz
npm install
npm run dev      # Vite dev server at http://localhost:5173
```

Always commit + push after changes:
```bash
git add -A && git commit -m "description" && git push
```
