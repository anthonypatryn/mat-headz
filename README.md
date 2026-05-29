# Mat Headz

A 2-player wrestling card game built with React + Vite.

## What It Is

Players take turns placing cards on a shared mat. Cards have two zones (LEFT / RIGHT), each with a moveset type and edge labels. When adjacent cards' facing zones match, a **secondary action** fires. When the touching outer edges also share the same label, a **tertiary action** fires on top of that.

First player to land a **PIN match** wins instantly. Otherwise, most points after 3 rounds wins.

## Running Locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Rules & Code Reference

See **[CLAUDE.md](./CLAUDE.md)** for:
- Full game rules (placement types, secondaries, tertiaries)
- All 18 card definitions
- Key code file map
- Game state phase diagram
- detectPair / effectiveZones logic

## Stack

- React 18
- Vite
- No external UI libraries — all custom CSS
