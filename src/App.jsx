import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

// Hook: tracks which quadrant the cursor is over and renders a portal tooltip
function useCardQuadrant(card, flipped) {
  const [state, setState] = useState(null); // { tooltip, x, y }
  const zones = effectiveZones(card, flipped);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const quarter = Math.min(3, Math.floor(x / (rect.width / 4))); // 0=col1, 1=col2, 2=col3, 3=col4
    const zone = quarter < 2 ? zones.left : zones.right;
    const tKey = quarter % 2 === 0 ? zone.tL : zone.tR;
    setState({ tooltip: getQuadrantTooltip(zone.m, tKey), x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => setState(null);

  const tooltipPortal = state ? createPortal(
    <div className="card-tooltip" style={{
      position: 'fixed',
      left: state.x,
      top: state.y - 12,
      transform: 'translate(-50%, -100%)',
      pointerEvents: 'none',
      zIndex: 99999,
    }}>
      <strong>{state.tooltip.label}</strong>
      {state.tooltip.desc && <p>{state.tooltip.desc}</p>}
    </div>,
    document.body
  ) : null;

  return { tooltipPortal, handleMouseMove, handleMouseLeave };
}

// ── Draw animation ────────────────────────────────────────────────────────────

function DrawAnimation({ card, fromX, fromY, toX, toY, faceUp, onDone }) {
  const [flipping, setFlipping] = useState(false);
  const [showFront, setShowFront] = useState(faceUp);
  const dx = toX - fromX;
  const dy = toY - fromY;

  useEffect(() => {
    if (faceUp) return;
    // Start the 3D flip at 60% of 800ms = 480ms
    const startFlip = setTimeout(() => setFlipping(true), 480);
    // At halfway through flip (480 + 175ms), swap faces
    const swapFace = setTimeout(() => setShowFront(true), 655);
    return () => { clearTimeout(startFlip); clearTimeout(swapFace); };
  }, []);

  const cardBack = (
    <img src="/Cards/Back.png" alt="" style={{
      width: 286, height: 400, position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%,-50%) rotate(-90deg)',
      objectFit: 'cover', borderRadius: 4,
    }} />
  );

  return createPortal(
    <div
      style={{
        position: 'fixed', left: fromX, top: fromY,
        width: 400, height: 286,
        transform: 'translate(-50%, -50%)',
        zIndex: 99997, pointerEvents: 'none',
        '--dx': `${dx}px`, '--dy': `${dy}px`,
        animation: 'card-fly-to-hand 0.8s cubic-bezier(0.3, 0, 0.2, 1) forwards',
      }}
      onAnimationEnd={onDone}
    >
      {/* 3D flip container */}
      <div style={{
        position: 'absolute', inset: 0,
        perspective: 1000,
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          transformStyle: 'preserve-3d',
          transform: flipping ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: flipping ? 'transform 0.35s ease-in-out' : 'none',
          borderRadius: 6,
        }}>
          {/* Back face */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden', overflow: 'hidden', borderRadius: 6,
          }}>
            {!showFront && cardBack}
          </div>
          {/* Front face */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden', overflow: 'hidden', borderRadius: 6,
            transform: 'rotateY(180deg)',
          }}>
            {showFront && <CardImg card={card} flipped={false} />}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ReturnAnimation({ card, fromX, fromY, toX, toY, onDone }) {
  const [flipped, setFlipped] = useState(false);
  const dx = toX - fromX;
  const dy = toY - fromY;

  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 240); // flip at 30% of 800ms
    return () => clearTimeout(t);
  }, []);

  const cardBack = (
    <img src="/Cards/Back.png" alt="" style={{
      width: 286, height: 400, position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%,-50%) rotate(-90deg)',
      objectFit: 'cover', borderRadius: 4,
    }} />
  );

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: fromX,
        top: fromY,
        width: 400,
        height: 286,
        transform: 'translate(-50%, -50%)',
        zIndex: 99997,
        pointerEvents: 'none',
        borderRadius: 6,
        overflow: 'hidden',
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        animation: 'card-return-to-deck 0.8s cubic-bezier(0.3, 0, 0.2, 1) forwards',
      }}
      onAnimationEnd={onDone}
    >
      {flipped ? cardBack : <CardImg card={card} flipped={false} />}
    </div>,
    document.body
  );
}

// ── Mat card image — absolutely positioned by zoneOffset in the 8-zone grid ──

function MatCardImg({ entry, index, isProtected, isPickable, isPlaced, onPick, onPlacedMouseDown }) {
  const zo = entry.zoneOffset ?? 3;
  const { tooltipPortal, handleMouseMove, handleMouseLeave } = useCardQuadrant(entry.card, entry.flipped);
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
      {tooltipPortal}
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

// ── Placement action buttons ──────────────────────────────────────────────────

function PlacementActions({ preview, onAction, onFlip, armDrag }) {
  const renderButtons = (pair) => {
    const { moveset, tertiaryKey } = pair;
    if (moveset === 'PIN') return (
      <button className="btn btn--danger btn--lg" onClick={() => onAction('pin_win')}>⚡ INSTANT WIN — Confirm</button>
    );
    if (moveset === 'ENGAGE') return (<>
      <button className="btn btn--primary" onClick={() => onAction('engage')}>Take Another Turn</button>
      {tertiaryKey && <button className="btn btn--outline" onClick={() => onAction(`engage:${tertiaryKey}`)}>✦ Activate {TERTIARY_LABEL[tertiaryKey]}</button>}
    </>);
    if (moveset === 'TAKEDOWN') return (<>
      <button className="btn btn--primary" onClick={() => onAction('takedown:point')}>Gain 1 Point</button>
      <button className="btn btn--secondary" onClick={() => onAction('takedown:pin')}>Attempt a Pin</button>
      {tertiaryKey && <button className="btn btn--outline" onClick={() => onAction(`takedown:${tertiaryKey}`)}>✦ Activate {TERTIARY_LABEL[tertiaryKey]}</button>}
    </>);
    if (moveset === 'ESCAPE') return (<>
      <button className="btn btn--primary" onClick={() => onAction('escape')}>End Turn</button>
      {tertiaryKey === 'REVERSAL' && <button className="btn btn--outline" onClick={() => onAction('escape:REVERSAL')}>✦ Reversal (+1 Point)</button>}
    </>);
    return <button className="btn btn--primary" onClick={() => onAction('end')}>End Turn</button>;
  };

  // ARM DRAG mode: no actions, just confirm placement
  if (armDrag) return (
    <div className="placed-actions-match">
      <button className="btn btn--outline" onClick={onFlip}>↻ Flip</button>
      <button className="btn btn--primary" onClick={() => onAction('arm_drag_done')}>✓ Place Card (Arm Drag)</button>
    </div>
  );

  if (!preview || (!preview.left && !preview.right)) return (
    <div className="placed-actions">
      <button className="btn btn--outline" onClick={onFlip}>↻ Flip</button>
      <button className="btn btn--primary" onClick={() => onAction('end')}>End Turn</button>
    </div>
  );

  if (preview.left && preview.right) return (
    <div className="placed-actions-match">
      <button className="btn btn--outline placed-flip" onClick={onFlip}>↻ Flip</button>
      <div className="both-sides-actions">
        <div className="both-side"><div className="both-side-label">Left Side</div>{renderButtons(preview.left)}</div>
        <div className="both-side"><div className="both-side-label">Right Side</div>{renderButtons(preview.right)}</div>
      </div>
    </div>
  );

  const pair = preview.left || preview.right;
  return (
    <div className="placed-actions-match">
      <button className="btn btn--outline placed-flip" onClick={onFlip}>↻ Flip</button>
      <div className="match-actions">{renderButtons(pair)}</div>
    </div>
  );
}

// ── Mat ───────────────────────────────────────────────────────────────────────

function Mat({ G, matRef, onPick, onConfirm, onCancel, onFlip, onPlacedMouseDown, onConfirmWithAction }) {
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
                    <button className="btn btn--danger" onClick={() => onConfirmWithAction('ring_out')}>Proceed with Ring Out</button>
                  </div>
                </div>
              ) : (
                <PlacementActions
                  preview={preview}
                  onAction={onConfirmWithAction}
                  onFlip={onFlip}
                  armDrag={G.flags?.armDrag}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Deck pile ─────────────────────────────────────────────────────────────────

function CardPileImg({ src, alt }) {
  const w = 400, h = 286, pw = 286, ph = 400;
  return (
    <div style={{ width: w, height: h, position: 'relative', flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>
      <img src={src} alt={alt} style={{
        position: 'absolute', width: pw, height: ph,
        top: '50%', left: '50%',
        transform: 'translate(-50%,-50%) rotate(-90deg)',
        objectFit: 'cover', userSelect: 'none',
      }} />
    </div>
  );
}

function DeckPile({ count }) {
  const w = 400, h = 286;
  const shadows = count >= 14 ? 3 : count >= 9 ? 2 : count >= 4 ? 1 : 0;
  return (
    <div className="deck-pile">
      <div className="deck-pile__card" style={{ width: w, height: h }}>
        {shadows >= 3 && <div className="deck-pile__shadow deck-pile__shadow--deep" />}
        {shadows >= 2 && <div className="deck-pile__shadow deck-pile__shadow--mid" />}
        {shadows >= 1 && <div className="deck-pile__shadow deck-pile__shadow--top" />}
        {count > 0
          ? <div className="deck-pile__face"><CardPileImg src="/Cards/Back.png" alt="Deck" /></div>
          : <div className="deck-pile__face deck-pile__face--empty" />
        }
      </div>
      <div className="deck-pile__label">
        <span className="deck-pile__count">{count}</span> cards left
      </div>
    </div>
  );
}

// ── Discard pile ─────────────────────────────────────────────────────────────

function DiscardPile({ discard }) {
  const w = 400, h = 286;
  const count = discard.length;
  const shadows = count >= 14 ? 3 : count >= 9 ? 2 : count >= 4 ? 1 : 0;
  const topCard = count > 0 ? discard[count - 1] : null;
  return (
    <div className="deck-pile">
      <div className="deck-pile__card" style={{ width: w, height: h }}>
        {shadows >= 3 && <div className="deck-pile__shadow deck-pile__shadow--deep" />}
        {shadows >= 2 && <div className="deck-pile__shadow deck-pile__shadow--mid" />}
        {shadows >= 1 && <div className="deck-pile__shadow deck-pile__shadow--top" />}
        {topCard
          ? <div className="deck-pile__face"><CardPileImg src={`/Cards/${topCard.img}`} alt="Discard" /></div>
          : <div className="deck-pile__face deck-pile__face--empty" />
        }
      </div>
      <div className="deck-pile__label">
        Discard ({count})
      </div>
    </div>
  );
}

// ── Hand card ─────────────────────────────────────────────────────────────────

function HandCard({ card, flipped, isSelected, isDragging, isDrawn, isAnimating, onSelect, onMouseDown, onFlip }) {
  const { tooltipPortal, handleMouseMove, handleMouseLeave } = useCardQuadrant(card, flipped);
  return (
    <div
      className={`hand-card${isSelected ? ' hand-card--sel' : ''}${isDragging ? ' hand-card--dragging' : ''}${isDrawn ? ' hand-card--drawn' : ''}`}
      style={isAnimating ? { visibility: 'hidden' } : undefined}
      onClick={onSelect}
      onMouseDown={onMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <CardImg card={card} flipped={flipped} unclipped={true} />
      {tooltipPortal}
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

  if (type === 'PIN_REVEAL') {
    const { card, mode } = pending;
    const skipLabel = mode === 'hip_toss' ? 'To Score Pile' : 'Discard — End Turn';
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>{mode === 'hip_toss' ? 'HIP TOSS' : 'ATTEMPT A PIN'} — Revealed Card:</h3>
          <CardImg card={card} flipped={false} />
          <div className="modal-zones-row">
            <ZoneBadge zone={card.L} />
            <ZoneBadge zone={card.R} />
          </div>
          <div className="modal-btns">
            <button className="btn btn--primary" onClick={() => resolveAction('place')}>
              Place It! (PIN only fires)
            </button>
            <button className="btn btn--secondary" onClick={() => resolveAction('skip')}>
              {skipLabel}
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

function HandArea({ G, selectCard, toggleFlip, takePoint, selectDiscardCard, onCardMouseDown, dragCardIdx, drawnCardIdx, animatingHandIdx, disabled }) {
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
        <div className="piles-col">
          <DeckPile count={deck.length} />
          <DiscardPile discard={discard} />
        </div>
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
                isAnimating={i === animatingHandIdx}
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
  const { selectCard, selectDiscardCard, confirmWithAction, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard } = actions;
  const { phase, matPickMode, message, currentPlayer, players, flags, mat } = G;
  const [dragState, setDragState] = useState(null);
  const matRef = useRef(null);

  // ── Drawn card flash animation ────────────────────────────────────────────
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

  // ── Draw / return animations ──────────────────────────────────────────────
  const [drawAnim, setDrawAnim] = useState(null);
  const [returnAnim, setReturnAnim] = useState(null);
  const [animatingHandIdx, setAnimatingHandIdx] = useState(null); // hide this hand card while animating
  const prevDrawSignalId = useRef(null);
  const prevReturnSignalId = useRef(null);

  useEffect(() => {
    if (!G.drawSignal || G.drawSignal.id === prevDrawSignalId.current) return;
    prevDrawSignalId.current = G.drawSignal.id;

    const cardIdx = G.players[G.currentPlayer].hand.length - 1;
    setAnimatingHandIdx(cardIdx); // hide the card placeholder in hand

    // Play draw sound
    if (window.__playCardDraw) window.__playCardDraw();

    // Wait for DOM to render the invisible hand card, then read its position
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const src = G.drawSignal.source === 'discard'
        ? document.querySelector('.deck-pile + .deck-pile')
        : document.querySelector('.deck-pile');
      const handCards = document.querySelectorAll('.hand-card');
      const dest = handCards[cardIdx];
      if (!src || !dest) { setAnimatingHandIdx(null); return; }

      const srcRect = src.getBoundingClientRect();
      const destRect = dest.getBoundingClientRect();
      setDrawAnim({
        card: G.drawSignal.card,
        faceUp: G.drawSignal.source === 'discard',
        fromX: srcRect.left + srcRect.width / 2,
        fromY: srcRect.top + srcRect.height / 2,
        toX: destRect.left + destRect.width / 2,
        toY: destRect.top + destRect.height / 2,
      });
    }));
  }, [G.drawSignal]);

  useEffect(() => {
    if (!G.returnSignal || G.returnSignal.id === prevReturnSignalId.current) return;
    prevReturnSignalId.current = G.returnSignal.id;
    const deck = document.querySelector('.deck-pile');
    const handCards = document.querySelectorAll('.hand-card');
    if (!deck || !handCards.length) return;
    const deckRect = deck.getBoundingClientRect();
    // Animate from the last hand card position (the one being returned)
    const lastCard = handCards[handCards.length - 1];
    const srcRect = lastCard.getBoundingClientRect();
    setReturnAnim({
      card: G.returnSignal.card,
      fromX: srcRect.left + srcRect.width / 2,
      fromY: srcRect.top + srcRect.height / 2,
      toX: deckRect.left + deckRect.width / 2,
      toY: deckRect.top + deckRect.height / 2,
    });
  }, [G.returnSignal]);

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
        onConfirmWithAction={actions.confirmWithAction}
      />

      {(phase === 'playing' || phase === 'placed') && (
        <>
          <div className="turn-bar">
            {players[currentPlayer].name}'s Turn
            {flags.isBonus && <span className="turn-tag"> · BONUS TURN</span>}
            {flags.singleLeg && <span className="turn-tag"> · SINGLE LEG ACTIVE</span>}
            {flags.armDrag && <span className="turn-tag turn-tag--warn"> · ARM DRAG: Place your card</span>}
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
            animatingHandIdx={animatingHandIdx}
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

      {/* Draw animation */}
      {drawAnim && (
        <DrawAnimation
          key={G.drawSignal?.id}
          card={drawAnim.card}
          fromX={drawAnim.fromX}
          fromY={drawAnim.fromY}
          toX={drawAnim.toX}
          toY={drawAnim.toY}
          faceUp={drawAnim.faceUp}
          onDone={() => { setDrawAnim(null); setAnimatingHandIdx(null); }}
        />
      )}

      {/* Return-to-deck animation */}
      {returnAnim && (
        <ReturnAnimation
          key={G.returnSignal?.id}
          card={returnAnim.card}
          fromX={returnAnim.fromX}
          fromY={returnAnim.fromY}
          toX={returnAnim.toX}
          toY={returnAnim.toY}
          onDone={() => setReturnAnim(null)}
        />
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
  const { G, initGame, startTurn, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard, selectCard, selectDiscardCard, confirmWithAction, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, nextRound } = useGame();
  const { phase, players, currentPlayer } = G;

  // Set up Web Audio API — unlock on first gesture, then play reliably from anywhere
  useEffect(() => {
    let ctx = null;
    let buffer = null;

    const loadBuffer = async (audioCtx) => {
      try {
        const res = await fetch('/sounds/card-draw.mp3');
        const arrayBuf = await res.arrayBuffer();
        buffer = await audioCtx.decodeAudioData(arrayBuf);
        window.__playCardDraw = () => {
          if (!buffer) return;
          const src = audioCtx.createBufferSource();
          src.buffer = buffer;
          src.connect(audioCtx.destination);
          src.start(0);
        };
      } catch (e) {}
    };

    const unlock = () => {
      if (ctx) return;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      loadBuffer(ctx);
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Auto-init on mount — skip name entry screen
  useEffect(() => {
    const t = setTimeout(() => initGame('Player 1', 'Player 2'), 0);
    return () => clearTimeout(t);
  }, []);

  if (phase === 'start') return null;

  if (phase === 'pass') {
    return <PassScreen playerName={G.players[G.currentPlayer].name} message={G.message} onReady={startTurn} />;
  }

  if (phase === 'roundEnd') return <RoundEnd G={G} onNextRound={nextRound} />;
  if (phase === 'gameOver') return <GameOver G={G} onNewGame={() => initGame('Player 1', 'Player 2')} />;

  return (
    <GameBoard
      G={G}
      actions={{ selectCard, selectDiscardCard, confirmWithAction, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard }}
    />
  );
}
