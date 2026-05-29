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
  │  tL: LOCK_UP        │  ← portrait-LEFT outer edge label
  │  tR: DOUBLE_LEG     │  ← portrait-RIGHT outer edge label
  ├─────────────────────┤
  │  RIGHT zone         │  ← physical bottom half
  │  Moveset: ESCAPE    │
  │  tL: REVERSAL       │
  │  tR: REVERSAL       │
  └─────────────────────┘
```

Each zone has:
- **m** — Moveset type: `PIN | ENGAGE | TAKEDOWN | ESCAPE`
- **tL** — Left outer edge tertiary label (portrait-left edge of that zone half)
- **tR** — Right outer edge tertiary label (portrait-right edge of that zone half)

---

## Flip Mechanic

When a card is **flipped** (rotated +90° instead of -90°):
- L zone ↔ R zone swap
- Within each zone: tL ↔ tR also swap (the physical card reverses direction)

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

A tertiary fires **only** when the touching outer edges of adjacent zones share the **same label**:

```
Left card's RIGHT zone's tR  ===  Right card's LEFT zone's tL
```

**PLACEMENT DIRECTION MATTERS:**
- Placing to the **RIGHT**: your card's left zone's `tL` must match the existing right-end card's right zone's `tR`
- Placing to the **LEFT**: your card's right zone's `tR` must match the existing left-end card's left zone's `tL`

Example — Card with ENGAGE (tL=SINGLE_LEG, tR=DOUBLE_LEG) placed to the RIGHT of a card whose right zone is ENGAGE (tR=DOUBLE_LEG):
→ Your tL=SINGLE_LEG vs their tR=DOUBLE_LEG → **NO MATCH** (SINGLE_LEG ≠ DOUBLE_LEG)

Same card placed to the LEFT of a card whose left zone is ENGAGE (tL=DOUBLE_LEG):
→ Your tR=DOUBLE_LEG vs their tL=DOUBLE_LEG → **MATCH → DOUBLE_LEG tertiary fires**

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
| `RUSSIAN_ARM_THROW` | Russian Arm Throw | Take an additional point. |

---

## Winning

- **PIN match** = instant win regardless of score
- **3 rounds**: player with most points after all 3 rounds wins
- **Tie**: tie

---

## Key Code Files

| File | Purpose |
|---|---|
| `src/data/deck.js` | All 18 cards with tL/tR, TERTIARY_LABEL/DESC maps, effectiveZones() |
| `src/hooks/useGame.js` | Full game state machine: detectPair, confirmPlacement, resolveAction |
| `src/App.jsx` | All React components: ZoneBadge, MatZoneStrip, PlacementPreview, etc. |
| `src/App.css` | All styles |
| `public/Cards/` | Card images 1.jpg–18.jpg + Back.jpg |

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

## detectPair() Tertiary Logic

```js
const isRight = placement === 'right' || placement === 'adjacent-right';
// isRight: placed = rightCard, adjacent = leftCard
//   fire if: adjZone.tR === placedZone.tL
// !isRight: placed = leftCard, adjacent = rightCard
//   fire if: placedZone.tR === adjZone.tL
```
