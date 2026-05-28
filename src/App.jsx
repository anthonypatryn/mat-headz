import { useState, useEffect, useRef } from 'react';
import { useGame } from './hooks/useGame';
import { MOVESET_COLOR, TERTIARY_LABEL, TERTIARY_DESC, effectiveZones } from './data/deck';
import './App.css';

// ── Card image ────────────────────────────────────────────────────────────────

function CardImg({ card, flipped, size = 'md' }) {
  const dims = { sm: [400, 286], md: [400, 286], lg: [400, 286] };
  const [w, h] = dims[size] ?? dims.md;
  return (
    <div className="card-img-wrap" style={{ width: w, height: h }}>
      <img
        src={`/Cards/${card.img}`}
        alt=""
        style={{
          position: 'absolute',
          width: h,
          height: w,
          top: '50%',
          left: '50%',
          transform: `translate(-50%,-50%) rotate(${flipped ? 90 : -90}deg)`,
          transition: 'transform 0.35s ease',
          objectFit: 'cover',
          userSelect: 'none',
        }}
      />
    </div>
  );
}

// ── Zone badge ────────────────────────────────────────────────────────────────

function ZoneBadge({ zone }) {
  return (
    <div className="zone-badge" style={{ background: MOVESET_COLOR[zone.m] }}>
      <span className="zone-m">{zone.m}</span>
      {zone.t && <span className="zone-t">{TERTIARY_LABEL[zone.t]}</span>}
    </div>
  );
}

// ── Mat zone strip — one badge per visible zone, absolutely positioned ────────

function MatZoneStrip({ mat }) {
  if (mat.length === 0) return null;
  const slots = [];
  mat.forEach((entry, i) => {
    const zones = effectiveZones(entry.card, entry.flipped);
    const zo = entry.zoneOffset ?? (i * 2 + 3);
    if (i === 0) {
      slots.push({ key: `${entry.uid}-L`, pos: zo, zone: zones.left });
    }
    if (i < mat.length - 1) {
      const next = mat[i + 1];
      const nextZones = effectiveZones(next.card, next.flipped);
      const nextZo = next.zoneOffset ?? (zo + (next.adjacent ? 2 : 1));
      const diff = nextZo - zo;
      if (diff >= 2) {
        // Adjacent — both exposed edge zones are visible
        slots.push({ key: `${entry.uid}-R`, pos: zo + 1, zone: zones.right });
        slots.push({ key: `${next.uid}-L`, pos: nextZo, zone: nextZones.left });
      } else {
        // Overlap — seam: show only the TOP card's zone (next card is on top)
        slots.push({ key: `${entry.uid}-seam`, pos: zo + 1, zone: nextZones.left });
      }
    } else {
      slots.push({ key: `${entry.uid}-R`, pos: zo + 1, zone: zones.right });
    }
  });
  return (
    <div className="mat-zone-strip">
      {slots.map(s => (
        <div key={s.key} className="zone-slot" style={{ left: s.pos * 200 }}>
          <ZoneBadge zone={s.zone} />
        </div>
      ))}
    </div>
  );
}

// ── Mat card image — absolutely positioned by zoneOffset in the 8-zone grid ──

function MatCardImg({ entry, index, isProtected, isPickable, isPlaced, onPick }) {
  const zo = entry.zoneOffset ?? 3;
  return (
    <div
      className={`mat-card-img${isPickable ? ' mat-card-img--pick' : ''}${isProtected ? ' mat-card-img--prot' : ''}${isPlaced ? ' mat-card-img--placed' : ''}`}
      style={{ left: zo * 200, zIndex: index + 1 }}
      onClick={isPickable ? () => onPick(entry.uid) : undefined}
    >
      <CardImg card={entry.card} flipped={entry.flipped} size="md" />
      <div className="mat-card-num">{index + 1}</div>
      {isProtected && <div className="mat-badge mat-badge--prot">PROT</div>}
      {isPickable && <div className="mat-badge mat-badge--pick">REMOVE</div>}
    </div>
  );
}

// ── Hand card ─────────────────────────────────────────────────────────────────

function HandCard({ card, flipped, isSelected, isDragging, onSelect, onMouseDown, onFlip }) {
  const zones = effectiveZones(card, flipped);
  return (
    <div
      className={`hand-card${isSelected ? ' hand-card--sel' : ''}${isDragging ? ' hand-card--dragging' : ''}`}
      onClick={onSelect}
      onMouseDown={onMouseDown}
    >
      <CardImg card={card} flipped={flipped} size="sm" />
      <div className="hand-card-zones">
        <ZoneBadge zone={zones.left} />
        <ZoneBadge zone={zones.right} />
      </div>
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
                <CardImg card={card} flipped={false} size="sm" />
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
                <CardImg card={card} flipped={false} size="sm" />
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
          <CardImg card={drawnCard} flipped={false} size="md" />
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
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>TAKEDOWN!</h3>
          <p>Matching TAKEDOWN zones. Choose:</p>
          <div className="modal-btns">
            <button className="btn btn--primary" onClick={() => resolveAction('point')}>Take a Point</button>
            <button className="btn btn--secondary" onClick={() => resolveAction('turn')}>Take Another Turn</button>
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

// ── Mat ───────────────────────────────────────────────────────────────────────

function Mat({ G, matRef, onPick, onConfirm, onCancel, onFlip }) {
  const { mat, protectedUids, matPickMode, matSpan, phase, pendingPlacement } = G;
  const span = matSpan ?? mat.length * 2;
  const placedUid = phase === 'placed' && pendingPlacement ? pendingPlacement.placed.uid : null;
  const placedEntry = mat.find(e => e.uid === placedUid);

  return (
    <div className="mat-area">
      <div className="mat-label">THE MAT — {span} / 8 zones</div>
      <div className="mat-scroll-wrap">
        <div className="mat-grid">
          <MatZoneStrip mat={mat} />
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
              />
            ))}
          </div>
          {/* Confirm/flip/cancel buttons — appear directly below the placed card */}
          {phase === 'placed' && placedEntry && (
            <div
              className="placed-actions"
              style={{ paddingLeft: (placedEntry.zoneOffset ?? 3) * 200 }}
            >
              <button className="btn btn--secondary" onClick={onCancel}>↩ Pick Up</button>
              <button className="btn btn--outline" onClick={onFlip}>↻ Flip</button>
              <button className="btn btn--primary" onClick={onConfirm}>✓ Confirm</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hand area ─────────────────────────────────────────────────────────────────

function HandArea({ G, selectCard, toggleFlip, takePoint, onCardMouseDown, dragCardIdx, disabled }) {
  const { players, currentPlayer, selectedIdx, flipped } = G;
  const p = players[currentPlayer];
  const hasSelected = selectedIdx !== null;

  return (
    <div className={`hand-area${disabled ? ' hand-area--disabled' : ''}`}>
      <div className="hand-label">
        {p.name}'s Hand
        {!disabled && p.hand.length > 0 && <span className="hand-hint-inline"> — tap to select, drag to place</span>}
      </div>
      <div className="hand-cards">
        {p.hand.length === 0 && <div className="hand-empty">No cards in hand</div>}
        {p.hand.map((card, i) => (
          <HandCard
            key={i}
            card={card}
            flipped={i === selectedIdx ? flipped : false}
            isSelected={i === selectedIdx}
            isDragging={dragCardIdx === i}
            onSelect={() => selectCard(i)}
            onMouseDown={disabled ? undefined : (e) => onCardMouseDown(i, e)}
            onFlip={toggleFlip}
          />
        ))}
      </div>

      {hasSelected && !disabled && (
        <button className="btn btn--point" onClick={takePoint}>
          Discard for Point
        </button>
      )}
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
  const { selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard } = actions;
  const { phase, matPickMode, message, currentPlayer, players, flags, mat } = G;
  const [dragState, setDragState] = useState(null);
  const matRef = useRef(null);

  const handleCardMouseDown = (cardIdx, e) => {
    if (phase !== 'playing') return;
    e.preventDefault();
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
        const targetZone = Math.max(0, Math.min(6, Math.round(localX / 200) - 1));

        let placement = null;
        if (mat.length === 0) {
          placement = 'right';
        } else {
          const leftZone = mat[0].zoneOffset ?? 3;
          const rightZone = mat[mat.length - 1].zoneOffset ?? 3;

          if (targetZone === leftZone - 1)       placement = 'left';
          else if (targetZone === leftZone - 2)  placement = 'adjacent-left';
          else if (targetZone === rightZone + 1) placement = 'right';
          else if (targetZone === rightZone + 2) placement = 'adjacent-right';
          else {
            const idx = mat.findIndex(e2 => e2.zoneOffset === targetZone);
            if (idx >= 0) placement = idx;
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
            onCardMouseDown={handleCardMouseDown}
            dragCardIdx={dragState?.cardIdx ?? null}
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
  const { G, initGame, startTurn, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard, selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, nextRound } = useGame();
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
      actions={{ selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement, flipPlacedCard }}
    />
  );
}
