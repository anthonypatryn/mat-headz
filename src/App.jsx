import { useState, useEffect, useRef } from 'react';
import { useGame } from './hooks/useGame';
import { MOVESET_COLOR, TERTIARY_LABEL, TERTIARY_DESC, effectiveZones } from './data/deck';
import './App.css';

// ── Placement preview (pure — mirrors detectPair from useGame.js) ─────────────

// Mirror of isZoneCovered in useGame.js — keep in sync.
function isZoneCoveredPreview(position, ownerUid, mat) {
  // A zone is covered only if a card placed AFTER it (higher uid = on top) has a zone there
  return mat.some(entry =>
    entry.uid > ownerUid &&
    (entry.zoneOffset === position || entry.zoneOffset + 1 === position)
  );
}

// Mirror of checkPairOneSide in useGame.js — keep in sync.
function checkPairPreview(placed, adjacentCard, placedIsRight, isOverlap = false) {
  const placedZones = effectiveZones(placed.card, placed.flipped);
  const adjZones    = effectiveZones(adjacentCard.card, adjacentCard.flipped);
  const placedZone  = placedIsRight ? placedZones.left  : placedZones.right;
  const adjZone     = isOverlap
    ? (placedIsRight ? adjZones.left  : adjZones.right)
    : (placedIsRight ? adjZones.right : adjZones.left);
  if (placedZone.m !== adjZone.m) return null;
  let tertiaryKey = null;
  if (placedIsRight) {
    if (adjZone.tR && placedZone.tL && adjZone.tR === placedZone.tL) tertiaryKey = adjZone.tR;
  } else {
    if (placedZone.tR && adjZone.tL && placedZone.tR === adjZone.tL) tertiaryKey = placedZone.tR;
  }
  return { moveset: placedZone.m, tertiaryKey, pairedZone: placedZone };
}

// Returns { left: pair|null, right: pair|null } or null (no matches).
// Mirrors detectPair in useGame.js — keep in sync.
function previewPlacement(placed, newMat, placement) {
  if (typeof placement === 'number' || (placement && typeof placement === 'object')) {
    const idx = typeof placement === 'number' ? placement : placement.insertIdx;
    const leftNeighbor  = idx > 0                 ? newMat[idx - 1] : null;
    const rightNeighbor = idx < newMat.length - 1 ? newMat[idx + 1] : null;
    const leftIsOverlap  = !!leftNeighbor  && isZoneCoveredPreview(leftNeighbor.zoneOffset + 1, leftNeighbor.uid,  newMat);
    const rightIsOverlap = !!rightNeighbor && isZoneCoveredPreview(rightNeighbor.zoneOffset,    rightNeighbor.uid, newMat);
    const left  = leftNeighbor  ? checkPairPreview(placed, leftNeighbor,  true,  leftIsOverlap)  : null;
    const right = rightNeighbor ? checkPairPreview(placed, rightNeighbor, false, rightIsOverlap) : null;
    return (left || right) ? { left, right } : null;
  }
  if ((placement === 'left' || placement === 'adjacent-left') && newMat.length >= 2) {
    const isOverlap = placement === 'left';
    const pair = checkPairPreview(placed, newMat[1], false, isOverlap);
    return pair ? { left: null, right: pair } : null;
  }
  if ((placement === 'right' || placement === 'adjacent-right') && newMat.length >= 2) {
    const isOverlap = placement === 'right';
    const pair = checkPairPreview(placed, newMat[newMat.length - 2], true, isOverlap);
    return pair ? { left: pair, right: null } : null;
  }
  return null;
}

const SECONDARY_PREVIEW = {
  PIN:      '⚡ INSTANT WIN on Confirm!',
  ENGAGE:   'Take another turn immediately',
  TAKEDOWN: 'Choose: gain a point, attempt a pin, or activate technique',
  ESCAPE:   'No effect',
};

// ── Card image ────────────────────────────────────────────────────────────────
// The card images are portrait photos. We display them landscape by putting
// them in a portrait inner div (286×400) that rotates -90° (normal) or +90°
// (flipped). The ENTIRE inner div — image and all — spins as one solid unit.
// `unclipped` lets the spinning card break out of its container (used for the
// placed-on-mat card so it doesn't appear to rotate inside a frame).

function CardImg({ card, flipped, unclipped = false }) {
  const lw = 400, lh = 286;  // landscape footprint shown to the rest of the layout
  const pw = lh,  ph = lw;   // portrait inner div: 286 wide × 400 tall

  return (
    // Outer div: landscape footprint. overflow:hidden clips during spin unless unclipped.
    <div style={{
      width: lw, height: lh,
      position: 'relative',
      flexShrink: 0,
      borderRadius: 6,
      overflow: unclipped ? 'visible' : 'hidden',
    }}>
      {/* Inner portrait div — THIS rotates as a whole unit */}
      <div style={{
        position: 'absolute',
        width: pw, height: ph,
        top: '50%', left: '50%',
        transform: `translate(-50%, -50%) rotate(${flipped ? 90 : -90}deg)`,
        transition: 'transform 0.4s ease',
        overflow: 'hidden',
        borderRadius: 4,
      }}>
        <img
          src={`/Cards/${card.img}`}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', display: 'block' }}
        />
      </div>
    </div>
  );
}

// ── Zone badge ────────────────────────────────────────────────────────────────
// Used only in placement preview banner and modals — no technique labels shown.

function ZoneBadge({ zone, side, compact = true }) {
  return (
    <div className={`zone-badge${compact ? '' : ' zone-badge--full'}`} style={{ background: MOVESET_COLOR[zone.m] }}>
      {!compact && side && <span className="zone-side-label">{side}</span>}
      <span className="zone-m">{zone.m}</span>
    </div>
  );
}

// ── Card hover overlay — 4 quadrant tooltips ──────────────────────────────────

// Returns tooltip info for a given zone + edge key
function getQuadrantTooltip(zoneM, tKey) {
  if (zoneM === 'PIN') return { label: 'PIN', desc: 'No technique. Match two PIN zones to win instantly.' };
  if (!tKey) return { label: 'No technique', desc: null };
  return { label: TERTIARY_LABEL[tKey], desc: TERTIARY_DESC[tKey] };
}

// Hook: tracks which quadrant the cursor is over, given a ref to the card element
function useCardQuadrant(card, flipped) {
  const [tooltip, setTooltip] = useState(null);
  const zones = effectiveZones(card, flipped);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isRight = x > rect.width / 2;
    const isBottom = y > rect.height / 2;
    const zone = isRight ? zones.right : zones.left;
    const tKey = isBottom ? zone.tR : zone.tL;
    setTooltip(getQuadrantTooltip(zone.m, tKey));
  };

  const handleMouseLeave = () => setTooltip(null);

  return { tooltip, handleMouseMove, handleMouseLeave };
}

// ── Mat card image — absolutely positioned by zoneOffset in the 8-zone grid ──

function MatCardImg({ entry, index, isProtected, isPickable, isPlaced, onPick, onPlacedMouseDown }) {
  const zo = entry.zoneOffset ?? 3;
  const { tooltip, handleMouseMove, handleMouseLeave } = useCardQuadrant(entry.card, entry.flipped);
  return (
    <div
      className={`mat-card-img${isPickable ? ' mat-card-img--pick' : ''}${isProtected ? ' mat-card-img--prot' : ''}${isPlaced ? ' mat-card-img--placed' : ''}`}
      style={{ left: zo * 200, zIndex: isPlaced ? 10000 : entry.uid }}
      onClick={isPickable ? () => onPick(entry.uid) : undefined}
      onMouseDown={isPlaced ? onPlacedMouseDown : undefined}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <CardImg card={entry.card} flipped={entry.flipped} unclipped={isPlaced} />
      {tooltip && (
        <div className="card-tooltip">
          <strong>{tooltip.label}</strong>
          {tooltip.desc && <p>{tooltip.desc}</p>}
        </div>
      )}
      <div className="mat-card-num">{index + 1}</div>
      {isProtected && <div className="mat-badge mat-badge--prot">PROT</div>}
      {isPickable && <div className="mat-badge mat-badge--pick">REMOVE</div>}
    </div>
  );
}

// ── Placement preview banner — shown below placed card before confirm ─────────

function PlacementPreview({ preview }) {
  const { left, right } = preview;

  // Both sides match — player will choose in the modal after confirm
  if (left && right) {
    return (
      <div className="placement-preview placement-preview--both">
        <div className="placement-preview__both-hdr">⚡ Both sides match — choose which fires after confirm!</div>
        <div className="placement-preview__both-sides">
          {[['LEFT', left], ['RIGHT', right]].map(([label, pair]) => (
            <div key={label} className={`placement-preview__side placement-preview--${pair.moveset.toLowerCase()}`}>
              <span className="placement-preview__side-label">{label}</span>
              <ZoneBadge zone={pair.pairedZone} />
              <span className="placement-preview__secondary">{SECONDARY_PREVIEW[pair.moveset]}</span>
              {pair.tertiaryKey && <span className="placement-preview__tert-name">✦ {TERTIARY_LABEL[pair.tertiaryKey]}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Single side
  const pair = left || right;
  const { moveset, tertiaryKey, pairedZone } = pair;
  return (
    <div className={`placement-preview placement-preview--${moveset.toLowerCase()}`}>
      <div className="placement-preview__row">
        <ZoneBadge zone={pairedZone} />
        <div className="placement-preview__text">
          <span className="placement-preview__match">MATCH!</span>
          <span className="placement-preview__secondary">{SECONDARY_PREVIEW[moveset]}</span>
        </div>
      </div>
      {tertiaryKey && (
        <div className="placement-preview__tertiary">
          <span className="placement-preview__tert-name">✦ {TERTIARY_LABEL[tertiaryKey]}</span>
          <span className="placement-preview__tert-desc">{TERTIARY_DESC[tertiaryKey]}</span>
        </div>
      )}
    </div>
  );
}

// ── Mat ───────────────────────────────────────────────────────────────────────

function Mat({ G, matRef, onPick, onConfirm, onCancel, onFlip, onPlacedMouseDown }) {
  const { mat, protectedUids, matPickMode, matSpan, phase, pendingPlacement } = G;
  const span = matSpan ?? mat.length * 2;
  const placedUid = phase === 'placed' && pendingPlacement ? pendingPlacement.placed.uid : null;
  const placedEntry = mat.find(e => e.uid === placedUid);

  // Live preview — suppressed during ring-out warning (no pair fires on ring out)
  const preview = (phase === 'placed' && pendingPlacement && !pendingPlacement.ringOut)
    ? previewPlacement(pendingPlacement.placed, pendingPlacement.newMat, pendingPlacement.placement)
    : null;

  return (
    <div className="mat-area">
      <div className="mat-label">THE MAT — {span} / 8 zones</div>
      <div className="mat-scroll-wrap">
        <div className="mat-grid">
          <div className="mat-cards-container" ref={matRef}>
            {/* Faint zone dividers */}
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="mat-slot-bg" style={{ left: i * 200 }} />
            ))}
            {mat.length === 0 && <div className="mat-empty">Mat is empty</div>}
            {mat.map((entry, i) => (
              <MatCardImg
                key={entry.uid}
                entry={entry}
                index={i}
                isProtected={protectedUids.includes(entry.uid)}
                isPickable={matPickMode === 'double_leg'}
                isPlaced={entry.uid === placedUid}
                onPick={onPick}
                onPlacedMouseDown={onPlacedMouseDown}
              />
            ))}
          </div>

          {/* Confirm/flip buttons + live pair preview — anchored below placed card */}
          {phase === 'placed' && placedEntry && (
            <div className="placed-zone" style={{ paddingLeft: (placedEntry.zoneOffset ?? 3) * 200 }}>
              {pendingPlacement?.ringOut ? (
                <div className="ringout-warning">
                  <span className="ringout-warning__msg">⚠️ RING OUT — this placement clears the entire mat!</span>
                  <div className="placed-actions">
                    <button className="btn btn--outline" onClick={onCancel}>← Go Back</button>
                    <button className="btn btn--danger" onClick={onConfirm}>Proceed with Ring Out</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="placed-actions">
                    <button className="btn btn--outline" onClick={onFlip}>↻ Flip</button>
                    <button className="btn btn--primary" onClick={onConfirm}>✓ Confirm</button>
                  </div>
                  {preview && <PlacementPreview preview={preview} />}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Deck pile ─────────────────────────────────────────────────────────────────

function DeckPile({ count }) {
  const w = 200, h = 143;
  return (
    <div className="deck-pile">
      <div className="deck-pile__card" style={{ width: w, height: h }}>
        {count > 2 && <div className="deck-pile__shadow deck-pile__shadow--deep" />}
        {count > 1 && <div className="deck-pile__shadow deck-pile__shadow--mid" />}
        <div className="deck-pile__face">
          <img
            src="/Cards/Back.png"
            alt="Deck"
            style={{
              position: 'absolute',
              width: h, height: w,
              top: '50%', left: '50%',
              transform: 'translate(-50%,-50%) rotate(-90deg)',
              objectFit: 'cover',
              userSelect: 'none',
            }}
          />
        </div>
      </div>
      <div className="deck-pile__label">
        <span className="deck-pile__count">{count}</span> cards left
      </div>
    </div>
  );
}

// ── Discard pile ─────────────────────────────────────────────────────────────

function DiscardPile({ discard }) {
  const w = 200, h = 143;
  const topCard = discard.length > 0 ? discard[discard.length - 1] : null;
  return (
    <div className="deck-pile">
      <div className="deck-pile__card" style={{ width: w, height: h }}>
        {topCard ? (
          <div className="deck-pile__face">
            <img
              src={`/Cards/${topCard.img}`}
              alt={topCard.img}
              style={{
                position: 'absolute',
                width: h, height: w,
                top: '50%', left: '50%',
                transform: 'translate(-50%,-50%) rotate(-90deg)',
                objectFit: 'cover',
                userSelect: 'none',
              }}
            />
          </div>
        ) : (
          <div className="deck-pile__face" style={{ border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 6 }} />
        )}
      </div>
      <div className="deck-pile__label">
        Discard ({discard.length})
      </div>
    </div>
  );
}

// ── Hand card ─────────────────────────────────────────────────────────────────

function HandCard({ card, flipped, isSelected, isDragging, isDrawn, onSelect, onMouseDown, onFlip }) {
  const { tooltip, handleMouseMove, handleMouseLeave } = useCardQuadrant(card, flipped);
  return (
    <div
      className={`hand-card${isSelected ? ' hand-card--sel' : ''}${isDragging ? ' hand-card--dragging' : ''}${isDrawn ? ' hand-card--drawn' : ''}`}
      onClick={onSelect}
      onMouseDown={onMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <CardImg card={card} flipped={flipped} unclipped={true} />
      {tooltip && (
        <div className="card-tooltip">
          <strong>{tooltip.label}</strong>
          {tooltip.desc && <p>{tooltip.desc}</p>}
        </div>
      )}
      {isSelected && (
        <button
          className="flip-btn"
          onClick={e => { e.stopPropagation(); onFlip(); }}
          onMouseDown={e => e.stopPropagation()}
          title="Rotate card"
        >↻</button>
      )}
    </div>
  );
}

// ── Start screen ──────────────────────────────────────────────────────────────

function StartScreen({ onStart }) {
  const [n1, setN1] = useState('Player 1');
  const [n2, setN2] = useState('Player 2');
  return (
    <div className="screen">
      <div className="start-logo">MAT HEADZ</div>
      <p className="start-sub">2-Player Wrestling Card Game</p>
      <div className="name-form">
        <label>
          Wrestler 1
          <input value={n1} onChange={e => setN1(e.target.value)} maxLength={20} />
        </label>
        <label>
          Wrestler 2
          <input value={n2} onChange={e => setN2(e.target.value)} maxLength={20} />
        </label>
      </div>
      <button className="btn btn--primary btn--lg" onClick={() => onStart(n1.trim() || 'Player 1', n2.trim() || 'Player 2')}>
        ENTER THE MAT
      </button>
    </div>
  );
}

// ── Pass screen ───────────────────────────────────────────────────────────────

function PassScreen({ playerName, message, onReady }) {
  return (
    <div className="screen pass-screen">
      {message && <div className="pass-msg">{message}</div>}
      <div className="pass-to-label">Pass to</div>
      <div className="pass-player">{playerName}</div>
      <p className="pass-look">Other player, look away!</p>
      <button className="btn btn--primary btn--lg" onClick={onReady}>READY</button>
    </div>
  );
}

// ── Action modal ──────────────────────────────────────────────────────────────

function ActionModal({ G, resolveAction }) {
  const { pending, players, currentPlayer, flags } = G;
  if (!pending) return null;

  const p = players[currentPlayer];
  const { type } = pending;

  if (type === 'LOCK_UP_CHOOSE') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>LOCK UP</h3>
          <p>Choose a card from your hand to place on the bottom of the deck.</p>
          <div className="modal-pick-row">
            {p.hand.map((card, i) => (
              <button key={i} className="modal-pick-card" onClick={() => resolveAction(i)}>
                <CardImg card={card} flipped={false} />
                <div className="modal-pick-zones">
                  <ZoneBadge zone={card.L} />
                  <ZoneBadge zone={card.R} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'ARM_DRAG_PLAY') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>ARM DRAG</h3>
          <p>Choose a card from your hand to play onto the mat. Then you'll draw 1 and take a point.</p>
          <div className="modal-pick-row">
            {p.hand.map((card, i) => (
              <button key={i} className="modal-pick-card" onClick={() => resolveAction(i)}>
                <CardImg card={card} flipped={false} />
                <div className="modal-pick-zones">
                  <ZoneBadge zone={card.L} />
                  <ZoneBadge zone={card.R} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'HIP_TOSS_DECIDE') {
    const { drawnCard } = pending;
    const hasPIN = drawnCard.L.m === 'PIN' || drawnCard.R.m === 'PIN';
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>HIP TOSS — You Drew:</h3>
          <CardImg card={drawnCard} flipped={false} />
          <div className="modal-zones-row">
            <ZoneBadge zone={drawnCard.L} />
            <ZoneBadge zone={drawnCard.R} />
          </div>
          <div className="modal-btns">
            {hasPIN && (
              <button className="btn btn--primary" onClick={() => resolveAction('pin')}>
                Play as PIN
              </button>
            )}
            <button className="btn btn--secondary" onClick={() => resolveAction('point')}>
              Use as Point
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'RINGOUT_MSG') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>RING OUT!</h3>
          <p>{G.message}</p>
          <button className="btn btn--primary" onClick={() => resolveAction()}>Continue</button>
        </div>
      </div>
    );
  }

  if (type === 'ENGAGE_SECONDARY') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>ENGAGE!</h3>
          <p>Matching ENGAGE zones — take another turn!</p>
          <button className="btn btn--primary" onClick={() => resolveAction()}>Take Another Turn</button>
        </div>
      </div>
    );
  }

  if (type === 'TAKEDOWN_SECONDARY') {
    if (flags.isBonus) {
      return (
        <div className="modal-overlay">
          <div className="modal">
            <h3>TAKEDOWN (Bonus Turn!)</h3>
            <p>You scored a Takedown on an Engage bonus turn. Choose:</p>
            <div className="modal-btns">
              <button className="btn btn--primary" onClick={() => resolveAction('A')}>
                A — Draw face-down (take a point)
              </button>
              <button className="btn btn--secondary" onClick={() => resolveAction('B')}>
                B — Draw face-up (win if it has a PIN zone!)
              </button>
            </div>
          </div>
        </div>
      );
    }
    const hasTertiary = G._actionQueue && G._actionQueue.length > 0;
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>TAKEDOWN!</h3>
          <p>Matching TAKEDOWN zones. Choose ONE:</p>
          <div className="modal-btns">
            <button className="btn btn--primary" onClick={() => resolveAction('point')}>
              Gain 1 Point
            </button>
            <button className="btn btn--secondary" onClick={() => resolveAction('pin')}>
              Attempt a Pin
            </button>
            {hasTertiary && (
              <button className="btn btn--outline" onClick={() => resolveAction('technique')}>
                Activate Technique
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'ESCAPE_SECONDARY') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>ESCAPE!</h3>
          <p>Matching ESCAPE zones — no effect. Turn ends.</p>
          <button className="btn btn--primary" onClick={() => resolveAction()}>Continue</button>
        </div>
      </div>
    );
  }

  // DOUBLE_LEG_CHOOSE is handled by matPickMode banner — no blocking modal needed
  if (type === 'DOUBLE_LEG_CHOOSE') return null;

  if (type === 'CHOOSE_SIDE') {
    const { leftPair, rightPair } = pending;
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>Both Sides Match!</h3>
          <p>Choose which side to fire. Secondary <em>and</em> tertiary for the chosen side still both fire — you just can't do both sides.</p>
          <div className="modal-btns">
            <button
              className={`btn btn--choose-side btn--choose-side--${leftPair.moveset.toLowerCase()}`}
              onClick={() => resolveAction('left')}
            >
              <strong>LEFT — {leftPair.moveset}</strong>
              {leftPair.tertiaryKey && <span className="choose-side-tert"> + {TERTIARY_LABEL[leftPair.tertiaryKey]}</span>}
            </button>
            <button
              className={`btn btn--choose-side btn--choose-side--${rightPair.moveset.toLowerCase()}`}
              onClick={() => resolveAction('right')}
            >
              <strong>RIGHT — {rightPair.moveset}</strong>
              {rightPair.tertiaryKey && <span className="choose-side-tert"> + {TERTIARY_LABEL[rightPair.tertiaryKey]}</span>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Generic TERTIARY — auto-resolves or transitions to a specific UI on click
  if (type === 'TERTIARY') {
    const { action } = pending;
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3 className="tertiary-title">{TERTIARY_LABEL[action]}</h3>
          <p className="tertiary-desc">{TERTIARY_DESC[action]}</p>
          <button className="btn btn--primary" onClick={() => resolveAction()}>Resolve</button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Hand area ─────────────────────────────────────────────────────────────────

function HandArea({ G, selectCard, toggleFlip, takePoint, selectDiscardCard, onCardMouseDown, dragCardIdx, drawnCardIdx, disabled }) {
  const { players, currentPlayer, selectedIdx, flipped, deck, discard, flags } = G;
  const p = players[currentPlayer];
  const hasSelected = selectedIdx !== null;
  const singleLegActive = flags?.singleLeg && discard.length > 0;

  return (
    <div className={`hand-area${disabled ? ' hand-area--disabled' : ''}`}>
      <div className="hand-label">
        {p.name}'s Hand
        {!disabled && p.hand.length > 0 && <span className="hand-hint-inline"> — tap to select, drag to place</span>}
      </div>
      <div className="hand-play-zone">
        <DeckPile count={deck.length} />
        <DiscardPile discard={discard} />
        <div className="hand-cards-col">
          <div className="hand-cards">
            {p.hand.length === 0 && <div className="hand-empty">No cards in hand</div>}
            {p.hand.map((card, i) => (
              <HandCard
                key={i}
                card={card}
                flipped={i === selectedIdx ? flipped : false}
                isSelected={i === selectedIdx}
                isDragging={dragCardIdx === i}
                isDrawn={i === drawnCardIdx}
                onSelect={() => selectCard(i)}
                onMouseDown={disabled ? undefined : (e) => onCardMouseDown(i, e)}
                onFlip={toggleFlip}
              />
            ))}
          </div>
          {singleLegActive && !disabled && (
            <div className="single-leg-notice">
              <strong>Single Leg Shoot:</strong> You may play the top discard card instead.
              <HandCard
                card={discard[discard.length - 1]}
                flipped={false}
                isSelected={selectedIdx === -1}
                isDragging={false}
                isDrawn={false}
                onSelect={selectDiscardCard}
                onMouseDown={disabled ? undefined : (e) => onCardMouseDown(-1, e)}
                onFlip={() => {}}
              />
            </div>
          )}
          {hasSelected && !disabled && (
            <button className="btn btn--point" onClick={takePoint}>
              Discard for Point
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Score header ──────────────────────────────────────────────────────────────

function ScoreHeader({ G }) {
  const { players, round, deck, currentPlayer } = G;
  return (
    <div className="score-header">
      <div className={`pscore${currentPlayer === 0 ? ' pscore--active' : ''}`}>
        <div className="pscore-name">{players[0].name}</div>
        <div className="pscore-pts">{players[0].score} pts</div>
      </div>
      <div className="hdr-center">
        <div className="hdr-round">Round {round} of 3</div>
        <div className="hdr-deck">{deck.length} cards left</div>
      </div>
      <div className={`pscore${currentPlayer === 1 ? ' pscore--active' : ''}`}>
        <div className="pscore-name">{players[1].name}</div>
        <div className="pscore-pts">{players[1].score} pts</div>
      </div>
    </div>
  );
}

// ── Game board ────────────────────────────────────────────────────────────────

function GameBoard({ G, actions }) {
  const { selectCard, selectDiscardCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard } = actions;
  const { phase, matPickMode, message, currentPlayer, players, flags, mat } = G;
  const [dragState, setDragState] = useState(null);
  const matRef = useRef(null);

  // ── Draw animation: fire when phase transitions to 'playing' ─────────────
  const prevPhaseRef = useRef(G.phase);
  const [drawnCardIdx, setDrawnCardIdx] = useState(null);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = G.phase;
    if (G.phase === 'playing' && prev !== 'playing') {
      const hand = G.players[G.currentPlayer].hand;
      setDrawnCardIdx(hand.length - 1);
      const t = setTimeout(() => setDrawnCardIdx(null), 700);
      return () => clearTimeout(t);
    }
  }, [G.phase, G.currentPlayer]);

  const handlePlacedCardMouseDown = (e) => {
    if (phase !== 'placed' || !G.pendingPlacement) return;
    e.preventDefault();
    e.stopPropagation();
    const { placed, prevSelectedIdx } = G.pendingPlacement;
    // Start drag with the placed card, then cancel placement (restores card to hand)
    setDragState({
      cardIdx: prevSelectedIdx,
      card: placed.card,
      flipped: placed.flipped,
      x: e.clientX,
      y: e.clientY,
    });
    cancelPlacement();
  };

  const handleCardMouseDown = (cardIdx, e) => {
    if (phase !== 'playing') return;
    e.preventDefault();
    // cardIdx === -1 means the discard card (Single Leg Shoot)
    if (cardIdx === -1) {
      selectDiscardCard();
      const topDiscard = G.discard[G.discard.length - 1];
      if (!topDiscard) return;
      setDragState({ cardIdx: -1, card: topDiscard, flipped: false, x: e.clientX, y: e.clientY });
      return;
    }
    selectCard(cardIdx);
    const card = G.players[G.currentPlayer].hand[cardIdx];
    const isAlreadySelected = cardIdx === G.selectedIdx;
    setDragState({
      cardIdx,
      card,
      flipped: isAlreadySelected ? G.flipped : false,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleMouseMove = (e) => {
    if (!dragState) return;
    setDragState(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
  };

  const handleMouseUp = (e) => {
    if (!dragState) return;
    const matEl = matRef.current;
    if (matEl) {
      const rect = matEl.getBoundingClientRect();
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      ) {
        const localX = e.clientX - rect.left;
        // Card is 400px (2 zones) wide, centered on cursor
        const targetZone = Math.max(0, Math.min(7, Math.round(localX / 200) - 1));

        let placement = null;
        if (mat.length === 0) {
          placement = 'right';
        } else {
          const leftZone  = mat[0].zoneOffset ?? 3;
          const rightZone = mat[mat.length - 1].zoneOffset ?? 3;

          if (targetZone === leftZone - 1)       placement = 'left';
          else if (targetZone === leftZone - 2)  placement = 'adjacent-left';
          else if (targetZone === rightZone + 1) placement = 'right';
          else if (targetZone === rightZone + 2) placement = 'adjacent-right';
          else {
            // Exact on-top match
            const idx = mat.findIndex(e2 => e2.zoneOffset === targetZone);
            if (idx >= 0) {
              placement = idx;
            } else if (targetZone >= leftZone && targetZone <= rightZone + 1) {
              // Straddle: within mat span but between two cards
              const insertIdx = mat.findIndex(e2 => e2.zoneOffset > targetZone);
              placement = {
                type: 'straddle',
                insertIdx: insertIdx >= 0 ? insertIdx : mat.length,
                zoneOffset: targetZone,
              };
            }
          }
        }

        if (placement !== null) playToMat(placement);
      }
    }
    setDragState(null);
  };

  return (
    <div
      className={`game-board${dragState ? ' game-board--dragging' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <ScoreHeader G={G} />

      {message && <div className="game-msg">{message}</div>}

      {matPickMode === 'double_leg' && (
        <div className="pick-banner">
          DOUBLE LEG TAKEDOWN — Tap a mat card to remove it permanently
        </div>
      )}

      <Mat
        G={G}
        matRef={matRef}
        onPick={pickMatCard}
        onConfirm={confirmPlacement}
        onCancel={cancelPlacement}
        onFlip={flipPlacedCard}
        onPlacedMouseDown={handlePlacedCardMouseDown}
      />

      {(phase === 'playing' || phase === 'placed') && (
        <>
          <div className="turn-bar">
            {players[currentPlayer].name}'s Turn
            {flags.isBonus && <span className="turn-tag"> · BONUS TURN</span>}
            {flags.bonusHand && <span className="turn-tag"> · SINGLE LEG ACTIVE</span>}
          </div>
          <HandArea
            G={G}
            selectCard={phase === 'playing' ? selectCard : () => {}}
            toggleFlip={phase === 'playing' ? toggleFlip : () => {}}
            takePoint={phase === 'playing' ? takePoint : () => {}}
            selectDiscardCard={phase === 'playing' ? selectDiscardCard : () => {}}
            onCardMouseDown={handleCardMouseDown}
            dragCardIdx={dragState?.cardIdx ?? null}
            drawnCardIdx={drawnCardIdx}
            disabled={phase === 'placed'}
          />
        </>
      )}

      {phase === 'action' && <ActionModal G={G} resolveAction={resolveAction} />}

      {phase === 'resolve' && (
        <div className="confirm-bar">
          {G.message && <div className="confirm-msg">{G.message}</div>}
          <div className="confirm-btns">
            <button className="btn btn--primary btn--lg" onClick={confirmTurn}>
              End Turn
            </button>
          </div>
        </div>
      )}

      {/* Floating card that follows the cursor during drag */}
      {dragState && (
        <div
          className="drag-float"
          style={{ left: dragState.x - 200, top: dragState.y - 143 }}
        >
          <CardImg card={dragState.card} flipped={dragState.flipped} />
        </div>
      )}
    </div>
  );
}

// ── Round end ─────────────────────────────────────────────────────────────────

function RoundEnd({ G, onNextRound }) {
  const { players, round } = G;
  return (
    <div className="screen">
      <h2 className="round-title">Round {round} Complete!</h2>
      <div className="scores-list">
        {players.map((p, i) => (
          <div key={i} className="score-row">
            <span>{p.name}</span>
            <span className="score-pts">{p.score} pts</span>
          </div>
        ))}
      </div>
      <button className="btn btn--primary btn--lg" onClick={onNextRound}>
        Start Round {round + 1}
      </button>
    </div>
  );
}

// ── Game over ─────────────────────────────────────────────────────────────────

function GameOver({ G, onNewGame }) {
  const { players, winner } = G;
  const winnerName = winner === 'tie' ? null : players[winner]?.name;
  return (
    <div className="screen">
      <div className="start-logo">GAME OVER</div>
      <div className="winner-display">
        {winnerName
          ? <><div className="winner-name">{winnerName}</div><div className="winner-label">WINS!</div></>
          : <div className="winner-name">IT'S A TIE!</div>
        }
      </div>
      <div className="scores-list">
        {players.map((p, i) => (
          <div key={i} className="score-row">
            <span>{p.name}</span>
            <span className="score-pts">{p.score} pts</span>
          </div>
        ))}
      </div>
      <button className="btn btn--primary btn--lg" onClick={onNewGame}>Play Again</button>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { G, initGame, startTurn, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard, selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, nextRound, selectDiscardCard } = useGame();
  const { phase, players, currentPlayer } = G;

  // Auto-init on mount — skip name entry screen
  useEffect(() => {
    const t = setTimeout(() => initGame('Player 1', 'Player 2'), 0);
    return () => clearTimeout(t);
  }, []);

  // Auto-skip pass screen — skip card-hiding handoff for now
  useEffect(() => {
    if (phase === 'pass') {
      const t = setTimeout(startTurn, 0);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Show nothing while auto-transitions fire
  if (phase === 'start' || phase === 'pass') return null;

  if (phase === 'roundEnd') return <RoundEnd G={G} onNextRound={nextRound} />;
  if (phase === 'gameOver') return <GameOver G={G} onNewGame={() => initGame('Player 1', 'Player 2')} />;

  return (
    <GameBoard
      G={G}
      actions={{ selectCard, selectDiscardCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard }}
    />
  );
}
