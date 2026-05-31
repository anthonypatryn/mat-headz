export const DECK = [
  { id: 1,  img: '1.png',  L: { m: 'PIN',      tL: null,              tR: null              }, R: { m: 'ENGAGE',   tL: 'DOUBLE_LEG',      tR: 'DOUBLE_LEG'       } },
  { id: 2,  img: '2.png',  L: { m: 'PIN',      tL: null,              tR: null              }, R: { m: 'TAKEDOWN', tL: 'SEATBELT_THROW',   tR: 'ARM_DRAG'         } },
  { id: 3,  img: '3.png',  L: { m: 'TAKEDOWN', tL: 'SEATBELT_THROW',  tR: 'HIP_TOSS'        }, R: { m: 'TAKEDOWN', tL: 'FIREMANS_CARRY',   tR: 'ARM_DRAG'         } },
  { id: 4,  img: '4.png',  L: { m: 'ENGAGE',   tL: 'DOUBLE_LEG',      tR: 'SINGLE_LEG'      }, R: { m: 'ENGAGE',   tL: 'SINGLE_LEG',       tR: 'LOCK_UP'          } },
  { id: 5,  img: '5.png',  L: { m: 'ENGAGE',   tL: 'LOCK_UP',         tR: 'DOUBLE_LEG'      }, R: { m: 'ESCAPE',   tL: null,               tR: 'REVERSAL'         } },
  { id: 6,  img: '6.png',  L: { m: 'ENGAGE',   tL: 'LOCK_UP',         tR: 'DOUBLE_LEG'      }, R: { m: 'ESCAPE',   tL: null,               tR: 'REVERSAL'         } },
  { id: 7,  img: '7.png',  L: { m: 'TAKEDOWN', tL: 'HIP_TOSS',        tR: 'FIREMANS_CARRY'  }, R: { m: 'ESCAPE',   tL: 'REVERSAL',         tR: null               } },
  { id: 8,  img: '8.png',  L: { m: 'TAKEDOWN', tL: 'ARM_DRAG',        tR: 'HIP_TOSS'        }, R: { m: 'ESCAPE',   tL: null,               tR: 'REVERSAL'         } },
  { id: 9,  img: '9.png',  L: { m: 'TAKEDOWN', tL: 'ARM_DRAG',        tR: 'HIP_TOSS'        }, R: { m: 'TAKEDOWN', tL: 'FIREMANS_CARRY',   tR: 'FIREMANS_CARRY'   } },
  { id: 10, img: '10.png', L: { m: 'ENGAGE',   tL: 'DOUBLE_LEG',      tR: 'SINGLE_LEG'      }, R: { m: 'ENGAGE',   tL: 'SINGLE_LEG',       tR: 'LOCK_UP'          } },
  { id: 11, img: '11.png', L: { m: 'ENGAGE',   tL: 'LOCK_UP',         tR: 'SINGLE_LEG'      }, R: { m: 'TAKEDOWN', tL: 'HIP_TOSS',         tR: 'SEATBELT_THROW'   } },
  { id: 12, img: '12.png', L: { m: 'ENGAGE',   tL: 'SINGLE_LEG',      tR: 'DOUBLE_LEG'      }, R: { m: 'TAKEDOWN', tL: 'ARM_DRAG',         tR: 'HIP_TOSS'         } },
  { id: 13, img: '13.png', L: { m: 'TAKEDOWN', tL: 'HIP_TOSS',        tR: 'HIP_TOSS'        }, R: { m: 'ENGAGE',   tL: 'SINGLE_LEG',       tR: 'SINGLE_LEG'       } },
  { id: 14, img: '14.png', L: { m: 'ENGAGE',   tL: 'SINGLE_LEG',      tR: 'DOUBLE_LEG'      }, R: { m: 'TAKEDOWN', tL: 'FIREMANS_CARRY',   tR: 'HIP_TOSS'         } },
  { id: 15, img: '15.png', L: { m: 'TAKEDOWN', tL: 'FIREMANS_CARRY',  tR: 'HIP_TOSS'        }, R: { m: 'ENGAGE',   tL: 'SINGLE_LEG',       tR: 'SINGLE_LEG'       } },
  { id: 16, img: '16.png', L: { m: 'ENGAGE',   tL: 'SINGLE_LEG',      tR: 'DOUBLE_LEG'      }, R: { m: 'TAKEDOWN', tL: 'ARM_DRAG',         tR: 'HIP_TOSS'         } },
  { id: 17, img: '17.png', L: { m: 'PIN',      tL: null,              tR: null              }, R: { m: 'ESCAPE',   tL: null,               tR: 'REVERSAL'         } },
  { id: 18, img: '18.png', L: { m: 'PIN',      tL: null,              tR: null              }, R: { m: 'ESCAPE',   tL: 'REVERSAL',         tR: null               } },
];

export const TERTIARY_LABEL = {
  LOCK_UP:          'Lock Up',
  SINGLE_LEG:       'Single Leg Shoot',
  DOUBLE_LEG:       'Double Leg Shoot',
  FIREMANS_CARRY:   "Fireman's Carry",
  ARM_DRAG:         'Arm Drag',
  HIP_TOSS:         'Hip Toss',
  SEATBELT_THROW:   'Seatbelt Throw',
  REVERSAL:         'Reversal',
};

export const TERTIARY_DESC = {
  LOCK_UP:          'Draw 1 additional card, then place 1 card from your hand on the bottom of the deck.',
  SINGLE_LEG:       'Instead of playing a card from your hand, you may play the top card of the discard pile, if able.',
  DOUBLE_LEG:       'Remove 1 uncovered card from the mat and place it face up into the discard pile.',
  FIREMANS_CARRY:   'Your opponent skips their next turn. You immediately begin a new turn.',
  ARM_DRAG:         'Play your second card from hand immediately, then draw 1 card. Afterward, gain 1 point normally by placing the top card of the draw pile face down into your score pile.',
  HIP_TOSS:         'Draw 1 card. If it can legally create a Pin Pair, play it immediately. Otherwise, place it face down into your score pile.',
  SEATBELT_THROW:   'Reveal the top card of the deck. If it contains a Pin Zone, you immediately win the game.',
  REVERSAL:         'Gain 1 point by drawing the top card of the deck and placing it face down into your score pile.',
};

export const MOVESET_COLOR = {
  PIN:      '#c0392b',
  ENGAGE:   '#27ae60',
  TAKEDOWN: '#1a5276',
  ESCAPE:   '#2c3e50',
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns { left, right } zones accounting for flip.
// When flipped: L↔R zones swap, AND tL↔tR within each zone swap
// (flipping the card reverses which outer edge faces which direction).
export function effectiveZones(card, flipped) {
  if (!flipped) return { left: card.L, right: card.R };
  return {
    left:  { ...card.R, tL: card.R.tR, tR: card.R.tL },
    right: { ...card.L, tL: card.L.tR, tR: card.L.tL },
  };
}

export function hasPinZone(card) {
  return card.L.m === 'PIN' || card.R.m === 'PIN';
}
