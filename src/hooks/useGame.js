import { useState, useCallback } from 'react';
import { DECK, shuffle, effectiveZones, hasPinZone } from '../data/deck';
import { isZoneCovered, checkPairOneSide, detectPairs } from '../utils/pairDetection';

let uidSeed = 0;
const uid = () => ++uidSeed;

function blankPlayer(name) {
  return { name, score: 0, hand: [], scorePile: [] };
}

function fresh() {
  return {
    phase: 'start',         // start | pass | playing | placed | action | matPick | roundEnd | gameOver
    players: [blankPlayer('Player 1'), blankPlayer('Player 2')],
    currentPlayer: 0,
    round: 1,
    deck: [],
    discard: [],
    mat: [],                // [{ uid, card, flipped, adjacent }]  — leftmost = index 0
    matSpan: 0,             // current mat width in half-card units (each card = 2, each overlap saves 1)
    protectedUids: [],      // uids that cannot be covered (Double Leg Takedown)
    flags: {
      hasEngaged: false,    // Engage pair triggered this turn chain
      isBonus: false,       // currently on a bonus turn from Engage
      singleLeg: false,     // Single Leg Shoot: may play top discard instead of hand card (persists for round)
      skipNext: false,      // Fireman's Carry: opponent skips
      armDrag: false,       // Arm Drag: next placement goes to mat silently, then aftermath
      pinPlace: false,      // Pin Place: only PIN pair fires on next placement
      hasTakenDown: false,  // Takedown pair was fired this chain (unlocks PIN win)
    },
    selectedIdx: null,      // index in current player's hand
    flipped: false,         // flip state of card about to be placed
    pending: null,          // { type, ...data } — pending action awaiting resolution
    matPickMode: null,      // 'double_leg' — player must pick a mat card
    message: '',
    pendingPlacement: null,  // { prevMat, prevMatSpan, prevPlayers, newMat, newSpan, newPlayers, placement, placed }
    drawSignal: null,        // { card, source: 'deck'|'discard', id } — triggers draw animation
    returnSignal: null,      // { card, id } — triggers return-to-deck animation
    pendingBonusPlay: false, // after a mid-turn action (Double Leg from Engage, Lock Up), go to playing not end turn
  };
}

export function useGame() {
  const [G, setG] = useState(fresh());

  const update = useCallback((patch) => {
    setG(prev => ({ ...prev, ...patch }));
  }, []);

  // ─── SETUP ────────────────────────────────────────────────────────────────

  function initGame(name1, name2) {
    const deck = shuffle([...DECK]);
    const p1Hand = [deck.pop()];
    const p2Hand = [deck.pop()];
    const startCard = deck.pop();
    setG({
      ...fresh(),
      phase: 'pass',
      players: [
        { ...blankPlayer(name1 || 'Player 1'), hand: p1Hand },
        { ...blankPlayer(name2 || 'Player 2'), hand: p2Hand },
      ],
      currentPlayer: 0,
      round: 1,
      deck,
      mat: [{ uid: uid(), card: startCard, flipped: false, adjacent: false, zoneOffset: 3 }],
      matSpan: 2,
      message: '',
    });
  }

  // ─── TURN START ───────────────────────────────────────────────────────────

  function startTurn() {
    setG(prev => {
      const { players, currentPlayer, deck, flags } = prev;
      if (deck.length === 0) {
        return handleRoundEnd(prev);
      }
      const newDeck = [...deck];
      const drawn = newDeck.pop();
      const newPlayers = players.map((p, i) =>
        i === currentPlayer ? { ...p, hand: [...p.hand, drawn] } : p
      );
      return {
        ...prev,
        phase: 'playing',
        players: newPlayers,
        deck: newDeck,
        selectedIdx: null,
        flipped: false,
        drawSignal: { card: drawn, source: 'deck', id: uid() },
        message: `${players[currentPlayer].name} — draw done. Choose a card to play.`,
      };
    });
  }

  // ─── SELECTION ────────────────────────────────────────────────────────────

  function selectCard(idx) {
    setG(prev => ({ ...prev, selectedIdx: idx, flipped: false }));
  }

  function toggleFlip() {
    setG(prev => ({ ...prev, flipped: !prev.flipped }));
  }

  // ─── TAKE POINT ───────────────────────────────────────────────────────────

  function takePoint() {
    setG(prev => {
      const { players, currentPlayer, selectedIdx, deck, flags } = prev;
      if (selectedIdx === null) return prev;
      const p = players[currentPlayer];
      const card = p.hand[selectedIdx];
      const newHand = p.hand.filter((_, i) => i !== selectedIdx);

      // Draw from deck into score pile (face down)
      if (deck.length === 0) return handleRoundEnd(prev);
      const newDeck = [...deck];
      const scoreCard = newDeck.pop();
      const newScorePile = [...p.scorePile, scoreCard];

      const newPlayers = players.map((p2, i) =>
        i === currentPlayer
          ? { ...p2, hand: newHand, scorePile: newScorePile, score: p2.score + 1 }
          : p2
      );
      return {
        ...prev,
        players: newPlayers,
        deck: newDeck,
        discard: [...prev.discard, card],
        selectedIdx: null,
        phase: 'pass',
        currentPlayer: 1 - currentPlayer,
        flags: resetFlags(flags),
        message: '',
      };
    });
  }

  // ─── SELECT DISCARD CARD (Single Leg Shoot) ───────────────────────────────

  function selectDiscardCard() {
    setG(prev => {
      if (!prev.flags.singleLeg || prev.discard.length === 0) return prev;
      // Select the top discard card — use index -1 as the sentinel
      return { ...prev, selectedIdx: -1, flipped: false };
    });
  }

  // ─── PLAY TO MAT ──────────────────────────────────────────────────────────

  function playToMat(placement) {
    // placement: 'left'|'adjacent-left'|'right'|'adjacent-right' | index (on top)
    // 'left'/'right'       = 50% overlap with end card  → span +1
    // 'adjacent-left/right = placed directly next to end → span +2
    // number               = on top of existing card     → span unchanged
    setG(prev => {
      const { players, currentPlayer, selectedIdx, flipped, mat, flags, deck, discard, protectedUids, matSpan } = prev;
      if (selectedIdx === null) return prev;

      const p = players[currentPlayer];
      // selectedIdx === -1 means playing top card of discard (Single Leg Shoot)
      const isFromDiscard = selectedIdx === -1;
      const card = isFromDiscard ? discard[discard.length - 1] : p.hand[selectedIdx];
      const newHand = isFromDiscard ? p.hand : p.hand.filter((_, i) => i !== selectedIdx);
      const newDiscard = isFromDiscard ? discard.slice(0, -1) : discard;
      const newPlayers = players.map((p2, i) =>
        i === currentPlayer ? { ...p2, hand: newHand } : p2
      );

      let newMat = [...mat];
      let spanIncrease = 0;

      // Compute absolute zone offset (0-indexed in 8-zone grid)
      let placedZoneOffset = 3;
      if (mat.length > 0) {
        if (typeof placement === 'number') {
          placedZoneOffset = mat[placement]?.zoneOffset ?? 3;
        } else if (placement && typeof placement === 'object') {
          placedZoneOffset = placement.zoneOffset;
        } else if (placement === 'left') {
          placedZoneOffset = (mat[0]?.zoneOffset ?? 4) - 1;
        } else if (placement === 'adjacent-left') {
          placedZoneOffset = (mat[0]?.zoneOffset ?? 5) - 2;
        } else if (placement === 'right') {
          placedZoneOffset = (mat[mat.length - 1]?.zoneOffset ?? 2) + 1;
        } else if (placement === 'adjacent-right') {
          placedZoneOffset = (mat[mat.length - 1]?.zoneOffset ?? 1) + 2;
        }
      }
      const placed = { uid: uid(), card, flipped, adjacent: false, zoneOffset: placedZoneOffset };

      if (placement && typeof placement === 'object' && placement.type === 'straddle') {
        // Straddle: insert card within mat span, covering parts of two adjacent cards
        const { insertIdx } = placement;
        newMat = [...mat.slice(0, insertIdx), placed, ...mat.slice(insertIdx)];
        spanIncrease = 0;

      } else if (typeof placement === 'number') {
        // On top of existing card — span unchanged
        if (protectedUids.includes(mat[placement].uid)) {
          return { ...prev, message: 'That card is protected — it cannot be covered!' };
        }
        newMat = mat.map((pos, i) => i === placement ? { ...placed, adjacent: pos.adjacent } : pos);
        spanIncrease = 0;

      } else if (placement === 'left' || placement === 'adjacent-left') {
        const isAdj = placement === 'adjacent-left';
        if (mat.length === 0) {
          newMat = [placed];
          spanIncrease = 2;
        } else {
          // Update old first card's adjacent flag to reflect its new left neighbour
          const updatedFirst = { ...mat[0], adjacent: isAdj };
          newMat = [placed, updatedFirst, ...mat.slice(1)];
          spanIncrease = isAdj ? 2 : 1;
        }

      } else { // 'right' or 'adjacent-right'
        const isAdj = placement === 'adjacent-right';
        if (mat.length === 0) {
          newMat = [placed];
          spanIncrease = 2;
        } else {
          newMat = [...mat, { ...placed, adjacent: isAdj }];
          spanIncrease = isAdj ? 2 : 1;
        }
      }

      const newSpan = (matSpan || 0) + spanIncrease;

      // Ring out — card extends beyond the physical mat (positions 0-7).
      // A card at zoneOffset covers positions zoneOffset and zoneOffset+1.
      // Out of bounds: zoneOffset < 0 (left) or zoneOffset > 6 (right, would need position 8).
      if (placedZoneOffset < 0 || placedZoneOffset > 6) {
        return {
          ...prev,
          players: newPlayers,
          mat: newMat,
          matSpan: newSpan,
          selectedIdx: null,
          flipped: false,
          phase: 'placed',
          pendingPlacement: {
            prevMat: mat,
            prevMatSpan: matSpan || 0,
            prevPlayers: players,
            prevSelectedIdx: selectedIdx,
            newMat,
            newSpan,
            newPlayers,
            placement,
            placed,
            ringOut: true,
          },
          message: '',
        };
      }

      // Card placed on mat — wait for player to confirm before running pair detection
      return {
        ...prev,
        players: newPlayers,
        discard: newDiscard,
        mat: newMat,
        matSpan: newSpan,
        selectedIdx: null,
        flipped: false,
        flags: { ...flags, singleLeg: false },
        phase: 'placed',
        pendingPlacement: {
          prevMat: mat,
          prevMatSpan: matSpan || 0,
          prevPlayers: players,
          prevDiscard: discard,
          prevSelectedIdx: selectedIdx,
          newMat,
          newSpan,
          newPlayers,
          placement,
          placed,
        },
        message: '',
      };
    });
  }

  // ─── CONFIRM / CANCEL PLACEMENT ───────────────────────────────────────────

  function confirmPlacement() {
    setG(prev => {
      const { pendingPlacement, currentPlayer, flags, discard } = prev;
      if (!pendingPlacement) return prev;
      const { newMat, newSpan, newPlayers, placement, placed } = pendingPlacement;

      // Ring out confirmed — clear the mat
      if (pendingPlacement.ringOut) {
        return {
          ...prev,
          players: newPlayers,
          mat: [],
          matSpan: 0,
          discard: [...discard, ...newMat.map(e => e.card)],
          selectedIdx: null,
          flipped: false,
          phase: 'resolve',
          currentPlayer: 1 - currentPlayer,
          flags: resetFlags(flags),
          pendingPlacement: null,
          message: `RING OUT! ${newPlayers[currentPlayer].name} cleared the mat. ${newPlayers[1 - currentPlayer].name} goes next.`,
          pending: null,
        };
      }

      const baseState = {
        ...prev,
        players: newPlayers,
        mat: newMat,
        matSpan: newSpan,
        pendingPlacement: null,
        selectedIdx: null,
        flipped: false,
      };

      // Pair detection — on-top checks both sides, end placements check one
      const { left: leftPair, right: rightPair } = detectPairs(placed, newMat, placement);
      const hasBoth = leftPair && rightPair;
      const singlePair = leftPair || rightPair;

      if (!singlePair) {
        return endOrContinue(baseState);
      }

      // Both sides match — let the player choose which fires
      if (hasBoth) {
        return {
          ...baseState,
          phase: 'action',
          pending: { type: 'CHOOSE_SIDE', leftPair, rightPair, placedCard: placed.card },
          _actionQueue: [],
          message: '',
        };
      }

      // Single side match
      const { moveset, tertiaryKey, pairedZone } = singlePair;

      if (moveset === 'PIN') {
        return {
          ...baseState,
          phase: 'gameOver',
          pending: null,
          message: `${newPlayers[currentPlayer].name} made a PIN — INSTANT WIN!`,
          winner: currentPlayer,
        };
      }

      if (moveset === 'ENGAGE' && flags.hasEngaged) {
        return endOrContinue({
          ...baseState,
          message: 'Engage pair — but you already Engaged this turn. No bonus.',
        });
      }

      const actions = [];
      actions.push({ type: `${moveset}_SECONDARY`, moveset, card: placed.card, pairedZone });
      if (tertiaryKey) {
        actions.push({ type: 'TERTIARY', action: tertiaryKey, card: placed.card });
      }

      return {
        ...baseState,
        phase: 'action',
        pending: actions[0],
        _actionQueue: actions.slice(1),
        flags: moveset === 'ENGAGE' ? { ...flags, hasEngaged: true } : flags,
        message: '',
      };
    });
  }

  function cancelPlacement() {
    setG(prev => {
      const { pendingPlacement } = prev;
      if (!pendingPlacement) return prev;
      const { prevMat, prevMatSpan, prevPlayers, prevDiscard, prevSelectedIdx, placed } = pendingPlacement;
      return {
        ...prev,
        mat: prevMat,
        matSpan: prevMatSpan,
        players: prevPlayers,
        discard: prevDiscard ?? prev.discard,
        selectedIdx: prevSelectedIdx,
        flipped: placed.flipped,
        phase: 'playing',
        pendingPlacement: null,
        message: '',
      };
    });
  }

  // ─── CONFIRM WITH INLINE ACTION ──────────────────────────────────────────────
  // Confirms placement and immediately resolves the chosen action in one step.
  // choice examples: null/'end', 'engage', 'engage:LOCK_UP', 'takedown:point',
  //   'takedown:pin', 'takedown:FIREMANS_CARRY', 'takedown:ARM_DRAG',
  //   'takedown:HIP_TOSS', 'takedown:SEATBELT_THROW', 'escape', 'escape:REVERSAL'
  function confirmWithAction(choice) {
    setG(prev => {
      const { pendingPlacement, currentPlayer, flags, deck, discard, mat: prevMat, players } = prev;
      if (!pendingPlacement) return prev;
      const { newMat, newSpan, newPlayers, placement, placed } = pendingPlacement;
      const opponent = 1 - currentPlayer;
      const p = newPlayers[currentPlayer];

      // Ring out
      if (pendingPlacement.ringOut) {
        if (choice !== 'ring_out') {
          // Cancel — go back
          return {
            ...prev,
            mat: pendingPlacement.prevMat,
            matSpan: pendingPlacement.prevMatSpan,
            players: pendingPlacement.prevPlayers,
            discard: pendingPlacement.prevDiscard ?? discard,
            selectedIdx: pendingPlacement.prevSelectedIdx,
            flipped: placed.flipped,
            phase: 'playing',
            pendingPlacement: null,
          };
        }
        return {
          ...prev,
          players: newPlayers,
          mat: [],
          matSpan: 0,
          discard: [...discard, ...newMat.map(e => e.card)],
          selectedIdx: null,
          flipped: false,
          phase: 'resolve',
          currentPlayer: opponent,
          flags: resetFlags(flags),
          pendingPlacement: null,
          message: `RING OUT! ${newPlayers[currentPlayer].name} cleared the mat. ${newPlayers[opponent].name} goes next.`,
          pending: null,
        };
      }

      const baseState = {
        ...prev,
        players: newPlayers,
        mat: newMat,
        matSpan: newSpan,
        pendingPlacement: null,
        selectedIdx: null,
        flipped: false,
        pending: null,
        _actionQueue: [],
      };

      // PIN PLACE — only PIN pair fires, everything else is silent placement then end turn
      if (flags.pinPlace) {
        const cleanBase = { ...baseState, flags: { ...flags, pinPlace: false } };
        if (choice === 'pin_win') {
          return { ...cleanBase, phase: 'gameOver', message: `${newPlayers[currentPlayer].name} made a PIN — INSTANT WIN!`, winner: currentPlayer };
        }
        return endOrContinue(cleanBase);
      }

      // ARM DRAG placement done — no pair detection, run aftermath
      if (choice === 'arm_drag_done' || flags.armDrag) {
        const d1 = deck.length > 0 ? [...deck] : null;
        const drawn = d1 ? d1.pop() : null;
        const d2 = d1 && d1.length > 0 ? [...d1] : null;
        const scoreCard = d2 ? d2.pop() : null;
        const ps = newPlayers.map((pl, i) => {
          if (i !== currentPlayer) return pl;
          return {
            ...pl,
            hand: drawn ? [...pl.hand, drawn] : pl.hand,
            scorePile: scoreCard ? [...pl.scorePile, scoreCard] : pl.scorePile,
            score: scoreCard ? pl.score + 1 : pl.score,
          };
        });
        return passTo(opponent, {
          ...baseState,
          players: ps,
          deck: d2 ?? d1 ?? deck,
          flags: { ...flags, armDrag: false },
          drawSignal: drawn ? { card: drawn, source: 'deck', id: uid() } : null,
        });
      }

      // No pair / end turn
      if (!choice || choice === 'end') return endOrContinue(baseState);

      // PIN instant win — requires hasTakenDown in this chain
      if (choice === 'pin_win') {
        if (!flags.hasTakenDown) return endOrContinue(baseState); // chain broken
        return { ...baseState, phase: 'gameOver', message: `${newPlayers[currentPlayer].name} made a PIN — INSTANT WIN!`, winner: currentPlayer };
      }

      // ── ENGAGE ───────────────────────────────────────────────────────────────

      const drawOne = (state, deckIn) => {
        if (deckIn.length === 0) return null;
        const d = [...deckIn];
        const card = d.pop();
        return { card, deck: d };
      };

      if (choice === 'engage') {
        // Per rules: cannot activate ENGAGE during a bonus turn already granted by ENGAGE
        if (flags.isBonus && flags.hasEngaged) return endOrContinue(baseState);
        const drawn = drawOne(baseState, deck);
        if (!drawn) return handleRoundEnd(baseState);
        const ps = newPlayers.map((pl, i) => i === currentPlayer ? { ...pl, hand: [...pl.hand, drawn.card] } : pl);
        return { ...baseState, players: ps, deck: drawn.deck, phase: 'playing', flags: { ...flags, isBonus: true, hasEngaged: true }, drawSignal: { card: drawn.card, source: 'deck', id: uid() }, message: '' };
      }

      if (choice.startsWith('engage:')) {
        const tertiary = choice.split(':')[1];
        const drawn = drawOne(baseState, deck);
        if (!drawn) return handleRoundEnd(baseState);
        const psEngage = newPlayers.map((pl, i) => i === currentPlayer ? { ...pl, hand: [...pl.hand, drawn.card] } : pl);
        const engageBase = { ...baseState, players: psEngage, deck: drawn.deck, flags: { ...flags, hasEngaged: true }, drawSignal: { card: drawn.card, source: 'deck', id: uid() } };

        if (tertiary === 'LOCK_UP') {
          // Draw 1 extra, then show LOCK_UP_CHOOSE, then bonus play
          const extra = drawOne(engageBase, drawn.deck);
          if (!extra) {
            // No extra card available — just take bonus turn
            return { ...engageBase, phase: 'playing', flags: { ...flags, isBonus: true, hasEngaged: true }, message: '' };
          }
          const psLU = psEngage.map((pl, i) => i === currentPlayer ? { ...pl, hand: [...pl.hand, extra.card] } : pl);
          return { ...engageBase, players: psLU, deck: extra.deck, drawSignal: { card: extra.card, source: 'deck', id: uid() }, phase: 'action', pending: { type: 'LOCK_UP_CHOOSE' }, pendingBonusPlay: true };
        }

        if (tertiary === 'SINGLE_LEG') {
          return { ...engageBase, phase: 'playing', flags: { ...flags, isBonus: true, hasEngaged: true, singleLeg: true }, message: '' };
        }

        if (tertiary === 'DOUBLE_LEG') {
          return { ...engageBase, phase: 'action', pending: { type: 'DOUBLE_LEG_CHOOSE' }, matPickMode: 'double_leg', pendingBonusPlay: true };
        }

        // Unknown tertiary — just take bonus turn
        return { ...engageBase, phase: 'playing', flags: { ...flags, isBonus: true, hasEngaged: true }, message: '' };
      }

      // ── TAKEDOWN ─────────────────────────────────────────────────────────────

      if (choice === 'takedown:point') {
        if (!flags.hasEngaged) return endOrContinue(baseState); // requires prior ENGAGE
        const drawn = drawOne(baseState, deck);
        if (!drawn) return handleRoundEnd(baseState);
        const ps = newPlayers.map((pl, i) => i === currentPlayer ? { ...pl, scorePile: [...pl.scorePile, drawn.card], score: pl.score + 1 } : pl);
        return passTo(opponent, { ...baseState, players: ps, deck: drawn.deck, flags: { ...flags, hasTakenDown: true } });
      }

      const matHasPIN = (checkMat) => checkMat.some(e => {
        const z = effectiveZones(e.card, e.flipped);
        const lEx = !isZoneCovered(e.zoneOffset, e.uid, checkMat);
        const rEx = !isZoneCovered(e.zoneOffset + 1, e.uid, checkMat);
        return (lEx && z.left.m === 'PIN') || (rEx && z.right.m === 'PIN');
      });

      if (choice === 'takedown:pin') {
        if (!flags.hasEngaged) return endOrContinue(baseState); // requires prior ENGAGE
        const drawn = drawOne(baseState, deck);
        if (!drawn) return handleRoundEnd(baseState);
        if (!hasPinZone(drawn.card) || !matHasPIN(newMat)) {
          return passTo(opponent, { ...baseState, deck: drawn.deck, discard: [...discard, drawn.card], flags: { ...flags, hasTakenDown: true } });
        }
        return { ...baseState, deck: drawn.deck, flags: { ...flags, hasTakenDown: true }, phase: 'action', pending: { type: 'PIN_REVEAL', card: drawn.card, mode: 'attempt_pin' } };
      }

      if (choice.startsWith('takedown:')) {
        if (!flags.hasEngaged) return endOrContinue(baseState); // requires prior ENGAGE
        const technique = choice.split(':')[1];
        const tdBase = { ...baseState, flags: { ...flags, hasTakenDown: true } };

        if (technique === 'FIREMANS_CARRY') {
          const drawn = drawOne(tdBase, deck);
          if (!drawn) return handleRoundEnd(tdBase);
          const ps = newPlayers.map((pl, i) => i === currentPlayer ? { ...pl, hand: [...pl.hand, drawn.card] } : pl);
          return { ...tdBase, players: ps, deck: drawn.deck, phase: 'playing', flags: { ...flags, hasTakenDown: true, skipNext: true }, drawSignal: { card: drawn.card, source: 'deck', id: uid() }, message: `FIREMAN'S CARRY! ${newPlayers[opponent].name} skips their next turn.` };
        }

        if (technique === 'ARM_DRAG') {
          if (p.hand.length < 1) return passTo(opponent, tdBase);
          return { ...tdBase, phase: 'playing', pending: null, _actionQueue: [], flags: { ...flags, hasTakenDown: true, armDrag: true }, message: 'ARM DRAG — Place your remaining card on the mat.' };
        }

        if (technique === 'HIP_TOSS') {
          const drawn = drawOne(tdBase, deck);
          if (!drawn) return handleRoundEnd(tdBase);
          if (!hasPinZone(drawn.card) || !matHasPIN(newMat)) {
            const ps = newPlayers.map((pl, i) => i === currentPlayer ? { ...pl, scorePile: [...pl.scorePile, drawn.card], score: pl.score + 1 } : pl);
            return passTo(opponent, { ...tdBase, players: ps, deck: drawn.deck });
          }
          return { ...tdBase, deck: drawn.deck, phase: 'action', pending: { type: 'PIN_REVEAL', card: drawn.card, mode: 'hip_toss' } };
        }

        if (technique === 'SEATBELT_THROW') {
          const drawn = drawOne(tdBase, deck);
          if (!drawn) return handleRoundEnd(tdBase);
          if (hasPinZone(drawn.card)) {
            return { ...tdBase, deck: drawn.deck, phase: 'gameOver', message: `SEATBELT THROW drew a PIN — ${newPlayers[currentPlayer].name} WINS!`, winner: currentPlayer };
          }
          return passTo(opponent, { ...tdBase, deck: drawn.deck, discard: [...discard, drawn.card] });
        }
      }

      // ── ESCAPE ───────────────────────────────────────────────────────────────

      if (choice === 'escape') return endOrContinue(baseState);

      if (choice === 'escape:REVERSAL') {
        const drawn = drawOne(baseState, deck);
        if (!drawn) return handleRoundEnd(baseState);
        const ps = newPlayers.map((pl, i) => i === currentPlayer ? { ...pl, scorePile: [...pl.scorePile, drawn.card], score: pl.score + 1 } : pl);
        return passTo(opponent, { ...baseState, players: ps, deck: drawn.deck });
      }

      return endOrContinue(baseState);
    });
  }

  function flipPlacedCard() {
    setG(prev => {
      if (prev.phase !== 'placed' || !prev.pendingPlacement) return prev;
      const { pendingPlacement } = prev;
      const { placed } = pendingPlacement;
      const newPlaced = { ...placed, flipped: !placed.flipped };
      const updatedMat = prev.mat.map(e => e.uid === placed.uid ? newPlaced : e);
      return {
        ...prev,
        mat: updatedMat,
        pendingPlacement: {
          ...pendingPlacement,
          placed: newPlaced,
          newMat: updatedMat,
        },
      };
    });
  }

  // ─── PAIR DETECTION — imported from src/utils/pairDetection.js ──────────────
  // isZoneCovered, checkPairOneSide, detectPairs are shared with App.jsx preview.
  // Edit pairDetection.js — do NOT duplicate logic here.

  // ─── ACTION RESOLUTION ────────────────────────────────────────────────────

  function resolveAction(choice) {
    setG(prev => {
      const { pending, _actionQueue = [], players, currentPlayer, deck, mat, discard, flags, protectedUids } = prev;
      if (!pending) return prev;

      const p = players[currentPlayer];
      const opponent = 1 - currentPlayer;

      const nextAction = () => {
        if (_actionQueue.length > 0) {
          return {
            ...prev,
            pending: _actionQueue[0],
            _actionQueue: _actionQueue.slice(1),
            phase: 'action',
          };
        }
        return endOrContinue(prev);
      };

      switch (pending.type) {


        case 'LOCK_UP_CHOOSE': {
          // choice = index in hand to put on bottom
          const handCard = p.hand[choice];
          const newHand = p.hand.filter((_, i) => i !== choice);
          const newPlayers = players.map((p2, i) =>
            i === currentPlayer ? { ...p2, hand: newHand } : p2
          );
          const newDeck = [handCard, ...deck];
          return nextAction2({ ...prev, players: newPlayers, deck: newDeck, pending: null, returnSignal: { card: handCard, id: uid() } });
        }

        case 'DOUBLE_LEG_CHOOSE': {
          // choice = uid of mat card to remove
          const newMat = mat.filter(pos => pos.uid !== choice);
          const removed = mat.find(pos => pos.uid === choice);
          return nextAction2({
            ...prev,
            mat: newMat,
            discard: removed ? [...discard, removed.card] : discard,
            protectedUids: [...protectedUids, choice],
            matPickMode: null,
            pending: null,
            message: 'Card removed from mat and protected.',
          });
        }


        case 'PIN_REVEAL': {
          // choice: 'place' | 'skip'
          const { card: revealedCard, mode } = pending;
          if (choice === 'place') {
            // Add card to hand, go to playing with pinPlace flag active
            // Player drags it normally — only PIN pair fires, everything else is silent
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer ? { ...p2, hand: [...p2.hand, revealedCard] } : p2
            );
            return {
              ...prev,
              players: newPlayers,
              phase: 'playing',
              pending: null,
              _actionQueue: [],
              flags: { ...flags, pinPlace: true },
              message: 'Place the card — only a PIN pair can win. Anything else just sits on the mat.',
            };
          }
          // Skip / no pin possible
          if (mode === 'hip_toss') {
            // Card goes to score pile
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer
                ? { ...p2, scorePile: [...p2.scorePile, revealedCard], score: p2.score + 1 }
                : p2
            );
            return passTo(opponent, { ...prev, players: newPlayers, pending: null, _actionQueue: [] });
          }
          // attempt_pin: card goes to discard
          return passTo(opponent, { ...prev, discard: [...discard, revealedCard], pending: null, _actionQueue: [] });
        }

        case 'RINGOUT_MSG': {
          return { ...prev, pending: null, phase: 'pass', message: prev.message };
        }

        default:
          return nextAction();
      }

      function nextAction2(state) {
        if (_actionQueue.length > 0) {
          return { ...state, pending: _actionQueue[0], _actionQueue: _actionQueue.slice(1), phase: 'action' };
        }
        return endOrContinue(state);
      }
    });
  }

  // ─── MAT CARD PICK ────────────────────────────────────────────────────────

  function isCardUncovered(entry, mat) {
    const lp = entry.zoneOffset, rp = entry.zoneOffset + 1;
    return !mat.some(e =>
      e.uid > entry.uid &&
      (e.zoneOffset === lp || e.zoneOffset + 1 === lp ||
       e.zoneOffset === rp || e.zoneOffset + 1 === rp)
    );
  }

  function pickMatCard(matUid) {
    setG(prev => {
      if (prev.matPickMode === 'double_leg') {
        const entry = prev.mat.find(e => e.uid === matUid);
        if (!entry || !isCardUncovered(entry, prev.mat)) {
          return { ...prev, message: 'That card is covered — only uncovered cards can be removed.' };
        }
        return resolveActionDirect(prev, { type: 'DOUBLE_LEG_CHOOSE' }, matUid);
      }
      return prev;
    });
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  function resolveActionDirect(state, pending2, choice) {
    const { mat, discard, _actionQueue = [], players, currentPlayer, protectedUids } = state;
    if (pending2.type === 'DOUBLE_LEG_CHOOSE') {
      const newMat = mat.filter(pos => pos.uid !== choice);
      const removed = mat.find(pos => pos.uid === choice);
      const nextState = {
        ...state,
        mat: newMat,
        discard: removed ? [...discard, removed.card] : discard,
        protectedUids: [...protectedUids, choice],
        matPickMode: null,
        pending: null,
        message: 'Card removed from mat and protected.',
      };
      if (_actionQueue.length > 0) {
        return { ...nextState, pending: _actionQueue[0], _actionQueue: _actionQueue.slice(1), phase: 'action' };
      }
      return endOrContinue(nextState);
    }
    return state;
  }

  function passTo(nextPlayer, state) {
    const { flags, players } = state;
    const skip = flags.skipNext && nextPlayer !== state.currentPlayer;
    if (skip) {
      // Fireman's Carry effect: skip opponent's turn
      const newNextPlayer = 1 - nextPlayer;
      return {
        ...state,
        phase: 'resolve',
        currentPlayer: newNextPlayer,
        flags: resetFlags(flags),
        selectedIdx: null,
        flipped: false,
        message: `${players[nextPlayer].name} skips their turn (Fireman's Carry)! ${players[newNextPlayer].name} goes next.`,
      };
    }
    return {
      ...state,
      phase: 'resolve',
      currentPlayer: nextPlayer,
      flags: resetFlags(flags),
      selectedIdx: null,
      flipped: false,
      message: '',
    };
  }

  function confirmTurn() {
    setG(prev => ({ ...prev, phase: 'pass' }));
  }

  function endOrContinue(state) {
    const { currentPlayer, flags } = state;
    const opponent = 1 - currentPlayer;
    // After a mid-turn action that grants a bonus play (e.g. Double Leg from Engage),
    // go to playing phase instead of ending the turn
    if (state.pendingBonusPlay) {
      return {
        ...state,
        phase: 'playing',
        pending: null,
        _actionQueue: [],
        pendingBonusPlay: false,
        selectedIdx: null,
        flipped: false,
        flags: { ...flags, isBonus: true },
        message: '',
      };
    }
    return passTo(opponent, { ...state, pending: null, _actionQueue: [] });
  }

  function resetFlags(flags) {
    // singleLeg persists for the whole round — only cleared at round end
    return { hasEngaged: false, isBonus: false, singleLeg: flags.singleLeg ?? false, skipNext: false, armDrag: false, pinPlace: false, hasTakenDown: false };
  }

  function handleRoundEnd(state) {
    const { round, players } = state;
    if (round >= 3) {
      const p0 = players[0].score;
      const p1 = players[1].score;
      const winner = p0 > p1 ? 0 : p1 > p0 ? 1 : 'tie';
      return { ...state, phase: 'gameOver', winner, message: 'Game over!' };
    }
    return {
      ...state,
      phase: 'roundEnd',
      pending: null,
      _actionQueue: [],
      message: `Round ${round} over! Count your points.`,
    };
  }

  function nextRound() {
    setG(prev => {
      const deck = shuffle([...DECK]);
      const p1Card = deck.pop();
      const p2Card = deck.pop();
      const startCard = deck.pop();
      return {
        ...prev,
        phase: 'pass',
        round: prev.round + 1,
        deck,
        discard: [],
        mat: [{ uid: uid(), card: startCard, flipped: false, adjacent: false, zoneOffset: 3 }],
        matSpan: 2,
        protectedUids: [],
        currentPlayer: 0,
        players: prev.players.map((p, i) => ({
          ...p,
          hand: i === 0 ? [p1Card] : [p2Card],
          scorePile: [],
        })),
        flags: { ...resetFlags(prev.flags), singleLeg: false }, // clear singleLeg at round end
        selectedIdx: null,
        flipped: false,
        pending: null,
        _actionQueue: [],
        pendingBonusPlay: false,
        message: '',
      };
    });
  }

  return {
    G,
    initGame,
    startTurn,
    confirmTurn,
    confirmPlacement,
    cancelPlacement,
    flipPlacedCard,
    selectCard,
    selectDiscardCard,
    confirmWithAction,
    toggleFlip,
    playToMat,
    takePoint,
    resolveAction,
    pickMatCard,
    nextRound,
  };
}
