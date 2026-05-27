export const DECK = [
  { id: 1,  img: '1.jpg',  L: { m: 'PIN',      t: null              }, R: { m: 'ENGAGE',   t: 'LOCK_UP'        } },
  { id: 2,  img: '2.jpg',  L: { m: 'PIN',      t: null              }, R: { m: 'TAKEDOWN', t: 'ARM_DRAG'        } },
  { id: 3,  img: '3.jpg',  L: { m: 'TAKEDOWN', t: 'HIP_TOSS'        }, R: { m: 'TAKEDOWN', t: 'FIREMANS_CARRY'  } },
  { id: 4,  img: '4.jpg',  L: { m: 'ENGAGE',   t: 'SINGLE_LEG'      }, R: { m: 'ENGAGE',   t: 'LOCK_UP'         } },
  { id: 5,  img: '5.jpg',  L: { m: 'ENGAGE',   t: 'DOUBLE_LEG'      }, R: { m: 'ESCAPE',   t: 'REVERSAL'        } },
  { id: 6,  img: '6.jpg',  L: { m: 'ENGAGE',   t: 'DOUBLE_LEG'      }, R: { m: 'ESCAPE',   t: 'REVERSAL'        } },
  { id: 7,  img: '7.jpg',  L: { m: 'TAKEDOWN', t: 'FIREMANS_CARRY'  }, R: { m: 'ESCAPE',   t: 'REVERSAL'        } },
  { id: 8,  img: '8.jpg',  L: { m: 'TAKEDOWN', t: 'HIP_TOSS'        }, R: { m: 'ESCAPE',   t: 'REVERSAL'        } },
  { id: 9,  img: '9.jpg',  L: { m: 'TAKEDOWN', t: 'HIP_TOSS'        }, R: { m: 'TAKEDOWN', t: 'FIREMANS_CARRY'  } },
  { id: 10, img: '10.jpg', L: { m: 'ENGAGE',   t: 'SINGLE_LEG'      }, R: { m: 'ENGAGE',   t: 'LOCK_UP'         } },
  { id: 11, img: '11.jpg', L: { m: 'ENGAGE',   t: 'SINGLE_LEG'      }, R: { m: 'TAKEDOWN', t: 'SEATBELT_THROW'  } },
  { id: 12, img: '12.jpg', L: { m: 'ENGAGE',   t: 'DOUBLE_LEG'      }, R: { m: 'TAKEDOWN', t: 'HIP_TOSS'        } },
  { id: 13, img: '13.jpg', L: { m: 'TAKEDOWN', t: 'HIP_TOSS'        }, R: { m: 'ENGAGE',   t: 'LOCK_UP'         } },
  { id: 14, img: '14.jpg', L: { m: 'ENGAGE',   t: 'SINGLE_LEG'      }, R: { m: 'TAKEDOWN', t: 'SEATBELT_THROW'  } },
  { id: 15, img: '15.jpg', L: { m: 'TAKEDOWN', t: 'HIP_TOSS'        }, R: { m: 'ENGAGE',   t: 'LOCK_UP'         } },
  { id: 16, img: '16.jpg', L: { m: 'ENGAGE',   t: 'DOUBLE_LEG'      }, R: { m: 'TAKEDOWN', t: 'HIP_TOSS'        } },
  { id: 17, img: '17.jpg', L: { m: 'PIN',      t: null              }, R: { m: 'ESCAPE',   t: 'REVERSAL'        } },
  { id: 18, img: '18.jpg', L: { m: 'PIN',      t: null              }, R: { m: 'ESCAPE',   t: 'REVERSAL'        } },
];

export const TERTIARY_LABEL = {
  LOCK_UP:        'Lock Up',
  SINGLE_LEG:     'Single Leg Takedown',
  DOUBLE_LEG:     'Double Leg Takedown',
  FIREMANS_CARRY: "Fireman's Carry",
  ARM_DRAG:       'Arm Drag',
  HIP_TOSS:       'Hip Toss',
  SEATBELT_THROW: 'Seatbelt Throw',
  REVERSAL:       'Reversal',
};

export const TERTIARY_DESC = {
  LOCK_UP:        'Draw a card. Put 1 card from hand on the bottom of the deck.',
  SINGLE_LEG:     'Draw an extra card on your bonus turn. Keep 2 cards in hand for the rest of the round.',
  DOUBLE_LEG:     'Remove any card from the mat and place it face-up beside the draw pile. It cannot be covered.',
  FIREMANS_CARRY: 'Opponent skips their next turn. Start a new turn.',
  ARM_DRAG:       'Play your other card from hand onto the mat, then draw 1. Then take a point like normal.',
  HIP_TOSS:       'Draw a card. If you can play a legal PIN from your hand, do so now. Otherwise, use it as a point.',
  SEATBELT_THROW: 'Draw a card. If it has a PIN zone — you win!',
  REVERSAL:       'Take a point (draw a card face-down into your score pile).',
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

// Returns { left, right } zones accounting for flip
export function effectiveZones(card, flipped) {
  return flipped ? { left: card.R, right: card.L } : { left: card.L, right: card.R };
}

export function hasPinZone(card) {
  return card.L.m === 'PIN' || card.R.m === 'PIN';
}
