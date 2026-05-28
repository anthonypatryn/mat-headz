import { useState, useCallback } from 'react';
import { DECK, shuffle, effectiveZones, hasPinZone } from '../data/deck';

let uidSeed = 0;
const uid = () => ++uidSeed;

function blankPlayer(name) {
  return { name, score: 0, hand: [], scorePile: [] };
}

function fresh() {
  return {
    phase: 'start',         // start | pass | playing | action | matPick | roundEnd | gameOver
    players: [blankPlayer('Player 1'), blankPlayer('Player 2')],
    currentPlayer: 0,
    round: 1,
    deck: [],
    discard: [],
    mat: [],                // [{ uid, card, flipped }]  — leftmost = index 0
    protectedUids: [],      // uids that cannot be covered (Double Leg Takedown)
    flags: {
      hasEngaged: false,    // Engage pair triggered this turn chain
      isBonus: false,       // currently on a bonus turn from Engage
      bonusHand: false,     // Single Leg Takedown: keep 2 cards in hand
      skipNext: false,      // Fireman's Carry: opponent skips
    },
    selectedIdx: null,      // index in current player's hand
    flipped: false,         // flip state of card about to be placed
    pending: null,          // { type, ...data } — pending action awaiting resolution
    matPickMode: null,      // 'double_leg' — player must pick a mat card
    hipTossDrawn: null,     // card drawn by Hip Toss awaiting decision
    message: '',
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
      mat: [{ uid: uid(), card: startCard, flipped: false }],
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

  // ─── PLAY TO MAT ──────────────────────────────────────────────────────────

  function playToMat(placement) {
    // placement: 'left' | 'right' | index (on top of existing)
    setG(prev => {
      const { players, currentPlayer, selectedIdx, flipped, mat, flags, deck, discard, protectedUids } = prev;
      if (selectedIdx === null) return prev;

      const p = players[currentPlayer];
      const card = p.hand[selectedIdx];
      const newHand = p.hand.filter((_, i) => i !== selectedIdx);
      const newPlayers = players.map((p2, i) =>
        i === currentPlayer ? { ...p2, hand: newHand } : p2
      );

      let newMat = [...mat];
      const placed = { uid: uid(), card, flipped };

      // Place on top of existing card
      if (typeof placement === 'number') {
        // Cannot place on a protected card
        if (protectedUids.includes(mat[placement].uid)) {
          return { ...prev, message: 'That card is protected — it cannot be covered!' };
        }
        // Replace: keep position, stack. We just replace the top card with the new one.
        newMat = mat.map((pos, i) => i === placement ? placed : pos);
      } else if (placement === 'left') {
        newMat = [placed, ...mat];
      } else {
        newMat = [...mat, placed];
      }

      // Zone count check — ring out
      const zoneCount = newMat.length * 2;
      if (zoneCount >= 8) {
        // Ring out — triggered by current player; other player goes next
        return {
          ...prev,
          players: newPlayers,
          mat: [],
          discard: [...discard, ...newMat.map(p2 => p2.card), card],
          selectedIdx: null,
          flipped: false,
          phase: 'resolve',
          currentPlayer: 1 - currentPlayer,
          flags: resetFlags(flags),
          message: `RING OUT! ${p.name} cleared the mat. ${players[1 - currentPlayer].name} goes next.`,
          pending: null,
        };
      }

      // Pair detection
      let pair = null;
      if (typeof placement !== 'number') {
        pair = detectPair(placed, newMat, placement);
      }

      if (!pair) {
        return endOrContinue({
          ...prev,
          players: newPlayers,
          mat: newMat,
          selectedIdx: null,
          flipped: false,
        });
      }

      // Pair found!
      const { moveset, sidesMatch, pairedZone } = pair;

      // PIN = instant win
      if (moveset === 'PIN') {
        return {
          ...prev,
          players: newPlayers,
          mat: newMat,
          phase: 'gameOver',
          pending: null,
          message: `${p.name} made a PIN — INSTANT WIN!`,
          winner: currentPlayer,
        };
      }

      // Engage special rule: can't chain Engage on a bonus turn
      if (moveset === 'ENGAGE' && flags.hasEngaged) {
        // Pair happened but no secondary triggered
        return endOrContinue({
          ...prev,
          players: newPlayers,
          mat: newMat,
          selectedIdx: null,
          flipped: false,
          message: 'Engage pair — but you already Engaged this turn. No bonus.',
        });
      }

      // Build action queue: secondary first, then tertiary if sides match
      const actions = [];
      actions.push({ type: `${moveset}_SECONDARY`, moveset, card, pairedZone });
      if (sidesMatch && pairedZone.t) {
        actions.push({ type: 'TERTIARY', action: pairedZone.t, card });
      }

      return {
        ...prev,
        players: newPlayers,
        mat: newMat,
        selectedIdx: null,
        flipped: false,
        phase: 'action',
        pending: actions[0],
        _actionQueue: actions.slice(1),
        flags: moveset === 'ENGAGE' ? { ...flags, hasEngaged: true } : flags,
        message: '',
      };
    });
  }

  // ─── PAIR DETECTION ───────────────────────────────────────────────────────

  function detectPair(placed, newMat, placement) {
    const placedZones = effectiveZones(placed.card, placed.flipped);
    let adjacentCard = null;
    let placedSide = null; // which zone of placed card is touching

    if (placement === 'left' && newMat.length >= 2) {
      // placed is at index 0, neighbour is index 1
      adjacentCard = newMat[1];
      placedSide = 'right'; // placed card's right zone touches neighbour's left zone
    } else if (placement === 'right' && newMat.length >= 2) {
      // placed is at last index, neighbour is second-to-last
      adjacentCard = newMat[newMat.length - 2];
      placedSide = 'left'; // placed card's left zone touches neighbour's right zone
    }

    if (!adjacentCard) return null;

    const adjZones = effectiveZones(adjacentCard.card, adjacentCard.flipped);
    const placedZone = placement === 'right' ? placedZones.left : placedZones.right;
    const adjZone = placement === 'right' ? adjZones.right : adjZones.left;

    if (placedZone.m !== adjZone.m) return null;

    // Sides match: the placed card is flipped XOR the adjacent card is flipped
    // This means same original-side zones are touching
    const sidesMatch = placed.flipped !== adjacentCard.flipped;

    return { moveset: placedZone.m, sidesMatch, pairedZone: placedZone };
  }

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
        // ── SECONDARIES ───────────────────────────────────────────────────

        case 'ENGAGE_SECONDARY': {
          // Take another turn
          if (deck.length === 0) return handleRoundEnd(prev);
          const newDeck = [...deck];
          const drawn = newDeck.pop();
          let newHand = [...p.hand, drawn];
          // Single leg: draw an extra card
          if (flags.bonusHand && deck.length > 0) {
            const extra = newDeck.pop();
            newHand = [...newHand, extra];
          }
          const newPlayers = players.map((p2, i) =>
            i === currentPlayer ? { ...p2, hand: newHand } : p2
          );
          return {
            ...prev,
            players: newPlayers,
            deck: newDeck,
            phase: 'playing',
            pending: null,
            _actionQueue: [],
            flags: { ...flags, isBonus: true },
            selectedIdx: null,
            flipped: false,
            message: `${p.name} — ENGAGE! Take another turn.`,
          };
        }

        case 'TAKEDOWN_SECONDARY': {
          if (flags.isBonus) {
            // Special Engage+Takedown rule
            if (choice === 'A') {
              // Draw face-down into score pile
              if (deck.length === 0) return handleRoundEnd(prev);
              const newDeck = [...deck];
              const scoreCard = newDeck.pop();
              const newPlayers = players.map((p2, i) =>
                i === currentPlayer
                  ? { ...p2, scorePile: [...p2.scorePile, scoreCard], score: p2.score + 1 }
                  : p2
              );
              return passTo(opponent, { ...prev, players: newPlayers, deck: newDeck, pending: null, _actionQueue: [] });
            } else {
              // Choice B: draw face up — if PIN, continue to win; else set beside draw pile
              if (deck.length === 0) return handleRoundEnd(prev);
              const newDeck = [...deck];
              const drawnCard = newDeck.pop();
              if (hasPinZone(drawnCard)) {
                // Win — but need to place it legally; for digital simplicity → instant win
                return {
                  ...prev,
                  deck: newDeck,
                  phase: 'gameOver',
                  pending: null,
                  message: `${p.name} drew a PIN on the Engage+Takedown play — WINNER!`,
                  winner: currentPlayer,
                };
              } else {
                return passTo(opponent, {
                  ...prev,
                  deck: newDeck,
                  discard: [...discard, drawnCard],
                  pending: null,
                  _actionQueue: [],
                  message: 'No PIN — card placed beside draw pile. Turn ends.',
                });
              }
            }
          }

          // Normal Takedown secondary
          if (choice === 'point') {
            // Can only take point if can play a Pin from hand next (rules say: if cannot play Pin, discard)
            // Simplified: always allow point taking; check hand for PIN
            const handHasPin = p.hand.some(c => hasPinZone(c));
            if (!handHasPin && p.hand.length > 0) {
              // Discard a card out of play
              const discardCard = p.hand[0];
              const newHand = p.hand.slice(1);
              const newPlayers = players.map((p2, i) =>
                i === currentPlayer ? { ...p2, hand: newHand } : p2
              );
              return passTo(opponent, {
                ...prev,
                players: newPlayers,
                discard: [...discard, discardCard],
                pending: null,
                _actionQueue: [],
                message: 'No PIN in hand — card discarded, no point taken.',
              });
            }
            // Take the point
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const scoreCard = newDeck.pop();
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer
                ? { ...p2, scorePile: [...p2.scorePile, scoreCard], score: p2.score + 1 }
                : p2
            );
            // Continue with tertiary if queued, then end turn
            if (_actionQueue.length > 0) {
              return { ...prev, players: newPlayers, deck: newDeck, pending: _actionQueue[0], _actionQueue: _actionQueue.slice(1), phase: 'action' };
            }
            return passTo(opponent, { ...prev, players: newPlayers, deck: newDeck, pending: null, _actionQueue: [] });
          } else {
            // Take another turn
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const drawn = newDeck.pop();
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer ? { ...p2, hand: [...p2.hand, drawn] } : p2
            );
            return {
              ...prev,
              players: newPlayers,
              deck: newDeck,
              phase: 'playing',
              pending: null,
              _actionQueue: [],
              selectedIdx: null,
              flipped: false,
              message: `${p.name} — TAKEDOWN! Taking another turn.`,
            };
          }
        }

        case 'ESCAPE_SECONDARY': {
          return nextAction();
        }

        // ── TERTIARIES ────────────────────────────────────────────────────

        case 'TERTIARY': {
          const { action } = pending;

          if (action === 'LOCK_UP') {
            // Draw a card, put 1 from hand on bottom of deck
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const drawn = newDeck.pop();
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer ? { ...p2, hand: [...p2.hand, drawn] } : p2
            );
            // If choice is provided, it's the index to put on bottom
            if (choice !== undefined && choice !== null) {
              const updPlayers = newPlayers.map((p2, i) => {
                if (i !== currentPlayer) return p2;
                const card = p2.hand[choice];
                const newHand = p2.hand.filter((_, j) => j !== choice);
                return { ...p2, hand: newHand };
              });
              const bottomCard = newPlayers[currentPlayer].hand[choice];
              return nextAction2({ ...prev, players: updPlayers, deck: [bottomCard, ...newDeck], pending: null });
            }
            // Need player to choose which card to put on bottom
            return {
              ...prev,
              players: newPlayers,
              deck: newDeck,
              pending: { type: 'LOCK_UP_CHOOSE', drawnCard: drawn },
              _actionQueue,
              phase: 'action',
            };
          }

          if (action === 'SINGLE_LEG') {
            return nextAction2({ ...prev, flags: { ...flags, bonusHand: true }, pending: null });
          }

          if (action === 'DOUBLE_LEG') {
            return { ...prev, pending: { type: 'DOUBLE_LEG_CHOOSE' }, _actionQueue, phase: 'action', matPickMode: 'double_leg' };
          }

          if (action === 'FIREMANS_CARRY') {
            // Opponent skips turn, current player takes new turn
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const drawn = newDeck.pop();
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer ? { ...p2, hand: [...p2.hand, drawn] } : p2
            );
            return {
              ...prev,
              players: newPlayers,
              deck: newDeck,
              phase: 'playing',
              pending: null,
              _actionQueue: [],
              flags: { ...flags, skipNext: true },
              selectedIdx: null,
              flipped: false,
              message: `FIREMAN'S CARRY! ${players[opponent].name} skips their next turn. ${p.name} goes again.`,
            };
          }

          if (action === 'ARM_DRAG') {
            // Play the other card from hand, then draw 1, then take a point
            if (p.hand.length === 0) return nextAction2({ ...prev, pending: null });
            return { ...prev, pending: { type: 'ARM_DRAG_PLAY' }, _actionQueue, phase: 'action' };
          }

          if (action === 'HIP_TOSS') {
            // Draw a card — if can play legal PIN, do so now; else use as point
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const drawnCard = newDeck.pop();
            return { ...prev, deck: newDeck, pending: { type: 'HIP_TOSS_DECIDE', drawnCard }, _actionQueue, phase: 'action' };
          }

          if (action === 'SEATBELT_THROW') {
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const drawnCard = newDeck.pop();
            if (hasPinZone(drawnCard)) {
              return {
                ...prev,
                deck: newDeck,
                phase: 'gameOver',
                pending: null,
                message: `SEATBELT THROW drew a PIN — ${p.name} WINS!`,
                winner: currentPlayer,
              };
            }
            return nextAction2({ ...prev, deck: newDeck, discard: [...discard, drawnCard], pending: null });
          }

          if (action === 'REVERSAL') {
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const scoreCard = newDeck.pop();
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer
                ? { ...p2, scorePile: [...p2.scorePile, scoreCard], score: p2.score + 1 }
                : p2
            );
            return nextAction2({ ...prev, players: newPlayers, deck: newDeck, pending: null });
          }

          return nextAction();
        }

        case 'LOCK_UP_CHOOSE': {
          // choice = index in hand to put on bottom
          const handCard = p.hand[choice];
          const newHand = p.hand.filter((_, i) => i !== choice);
          const newPlayers = players.map((p2, i) =>
            i === currentPlayer ? { ...p2, hand: newHand } : p2
          );
          const newDeck = [handCard, ...deck];
          return nextAction2({ ...prev, players: newPlayers, deck: newDeck, pending: null });
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

        case 'ARM_DRAG_PLAY': {
          // choice = index of card in hand to play to mat
          // For simplicity, just play it to the right end
          if (p.hand.length === 0) return nextAction2({ ...prev, pending: null });
          const idx = choice ?? 0;
          const playedCard = p.hand[idx];
          const newHand = p.hand.filter((_, i) => i !== idx);
          const newMat = [...mat, { uid: uid(), card: playedCard, flipped: false }];
          // Draw 1 then take a point
          if (deck.length === 0) return handleRoundEnd(prev);
          const newDeck = [...deck];
          const drawn = newDeck.pop();
          let postDeck = [...newDeck];
          let scoreCard = null;
          if (postDeck.length > 0) { scoreCard = postDeck.pop(); }
          const newPlayers = players.map((p2, i) => {
            if (i !== currentPlayer) return p2;
            return {
              ...p2,
              hand: [...newHand, drawn],
              scorePile: scoreCard ? [...p2.scorePile, scoreCard] : p2.scorePile,
              score: scoreCard ? p2.score + 1 : p2.score,
            };
          });
          return passTo(opponent, { ...prev, players: newPlayers, deck: postDeck, mat: newMat, pending: null, _actionQueue: [] });
        }

        case 'HIP_TOSS_DECIDE': {
          const { drawnCard } = pending;
          if (choice === 'pin') {
            // Play PIN to mat — for simplicity play to right end
            const newMat = [...mat, { uid: uid(), card: drawnCard, flipped: false }];
            // Check for pin pair
            const pair = detectPair({ uid: uid(), card: drawnCard, flipped: false }, newMat, 'right');
            if (pair && pair.moveset === 'PIN') {
              return { ...prev, mat: newMat, phase: 'gameOver', pending: null, message: `${p.name} played a PIN — INSTANT WIN!`, winner: currentPlayer };
            }
            return nextAction2({ ...prev, mat: newMat, pending: null });
          } else {
            // Use as point
            if (deck.length === 0) return handleRoundEnd(prev);
            const newDeck = [...deck];
            const scoreCard = drawnCard; // the drawn card IS the point
            const newPlayers = players.map((p2, i) =>
              i === currentPlayer
                ? { ...p2, scorePile: [...p2.scorePile, scoreCard], score: p2.score + 1 }
                : p2
            );
            return nextAction2({ ...prev, players: newPlayers, deck: newDeck, pending: null });
          }
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

  function pickMatCard(matUid) {
    setG(prev => {
      if (prev.matPickMode === 'double_leg') {
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
    const { currentPlayer, players, flags } = state;
    const opponent = 1 - currentPlayer;
    return passTo(opponent, { ...state, pending: null, _actionQueue: [] });
  }

  function resetFlags(flags) {
    return { hasEngaged: false, isBonus: false, bonusHand: flags.bonusHand, skipNext: false };
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
        mat: [{ uid: uid(), card: startCard, flipped: false }],
        protectedUids: [],
        currentPlayer: 0,
        players: prev.players.map((p, i) => ({
          ...p,
          hand: i === 0 ? [p1Card] : [p2Card],
          scorePile: [],
        })),
        flags: resetFlags(prev.flags),
        selectedIdx: null,
        flipped: false,
        pending: null,
        _actionQueue: [],
        message: '',
      };
    });
  }

  function newGame() {
    setG(fresh());
  }

  return {
    G,
    initGame,
    startTurn,
    confirmTurn,
    selectCard,
    toggleFlip,
    playToMat,
    takePoint,
    resolveAction,
    pickMatCard,
    nextRound,
    newGame,
  };
}
