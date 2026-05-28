import { useState, useEffect } from 'react';
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

// ── Mat zone strip (one slot per half-card, seams show both touching zones) ───

function MatZoneStrip({ mat }) {
  if (mat.length === 0) return null;
  const slots = [];
  mat.forEach((entry, i) => {
    const zones = effectiveZones(entry.card, entry.flipped);
    // Always show the left zone of the first card
    if (i === 0) {
      slots.push({ key: `${entry.uid}-L`, seam: false, zone: zones.left });
    }
    if (i < mat.length - 1) {
      const nextEntry = mat[i + 1];
      const nextZones = effectiveZones(nextEntry.card, nextEntry.flipped);
      if (nextEntry.adjacent) {
        // Adjacent (no overlap): two separate zone slots, one per card
        slots.push({ key: `${entry.uid}-R`, seam: false, zone: zones.right });
        slots.push({ key: `${nextEntry.uid}-L`, seam: false, zone: nextZones.left });
      } else {
        // 50% overlap: combined seam slot showing both touching zones
        slots.push({ key: `${entry.uid}-seam`, seam: true, zoneA: zones.right, zoneB: nextZones.left });
      }
    } else {
      slots.push({ key: `${entry.uid}-R`, seam: false, zone: zones.right });
    }
  });
  return (
    <div className="mat-zone-strip">
      {slots.map(s => (
        <div key={s.key} className={`zone-slot${s.seam ? ' zone-slot--seam' : ''}`}>
          {s.seam
            ? <><ZoneBadge zone={s.zoneA} /><ZoneBadge zone={s.zoneB} /></>
            : <ZoneBadge zone={s.zone} />
          }
        </div>
      ))}
    </div>
  );
}

// ── Mat edge drop zone (one per side, full card height, hover detects overlap vs adjacent) ───

function MatEdgeZone({ side, isDragging, onDrop }) {
  const [hoverMode, setHoverMode] = useState(null); // 'overlap' | 'adjacent' | null

  return (
    <div
      className={`mat-edge-zone${isDragging ? ' mat-edge-zone--active' : ''}${hoverMode ? ' mat-edge-zone--over' : ''}`}
      onDragOver={e => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        // Inner half (closer to mat) = overlap; outer half = adjacent
        const isInner = side === 'left'
          ? (e.clientX - rect.left) > rect.width / 2
          : (e.clientX - rect.left) < rect.width / 2;
        setHoverMode(isInner ? 'overlap' : 'adjacent');
      }}
      onDragLeave={() => setHoverMode(null)}
      onDrop={e => {
        e.preventDefault();
        const mode = hoverMode ?? 'overlap';
        const placement = mode === 'adjacent'
          ? (side === 'left' ? 'adjacent-left' : 'adjacent-right')
          : (side === 'left' ? 'left' : 'right');
        onDrop(placement);
        setHoverMode(null);
      }}
    >
      <div className="mat-edge-arrow">
        {side === 'left'
          ? (hoverMode === 'adjacent' ? '←←' : '←')
          : (hoverMode === 'adjacent' ? '→→' : '→')}
      </div>
      {hoverMode && (
        <div className="mat-edge-label">
          {hoverMode === 'adjacent' ? 'next to' : '½ overlap'}
        </div>
      )}
    </div>
  );
}

// ── Mat card image (overlaps neighbours by 50%) ───────────────────────────────

function MatCardImg({ entry, index, isProtected, isPickable, onPick, isDragging, onDrop }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`mat-card-img${entry.adjacent ? ' mat-card-img--adjacent' : ''}${isPickable ? ' mat-card-img--pick' : ''}${isProtected ? ' mat-card-img--prot' : ''}${over && isDragging ? ' mat-card-img--over' : ''}`}
      style={{ zIndex: index + 1 }}
      onClick={isPickable ? () => onPick(entry.uid) : undefined}
      onDragOver={isDragging ? e => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={isDragging ? () => setOver(false) : undefined}
      onDrop={isDragging ? e => { e.preventDefault(); setOver(false); onDrop(index); } : undefined}
    >
      <CardImg card={entry.card} flipped={entry.flipped} size="md" />
      <div className="mat-card-num">{index + 1}</div>
      {isProtected && <div className="mat-badge mat-badge--prot">PROT</div>}
      {isPickable && <div className="mat-badge mat-badge--pick">REMOVE</div>}
      {over && isDragging && <div className="mat-drop-label">Place on top</div>}
    </div>
  );
}

// ── Hand card ─────────────────────────────────────────────────────────────────

function HandCard({ card, flipped, isSelected, onSelect, onDragStart, onFlip }) {
  const zones = effectiveZones(card, flipped);
  return (
    <div
      className={`hand-card${isSelected ? ' hand-card--sel' : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={e => { onSelect(); onDragStart(); }}
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

function Mat({ G, onPick, isDragging, onDrop }) {
  const { mat, protectedUids, matPickMode, matSpan } = G;
  const span = matSpan ?? mat.length * 2;
  return (
    <div className="mat-area">
      <div className="mat-label">THE MAT — {span} / 8 zones</div>
      {/* Scroll wrap is ALWAYS in DOM — drop zones must exist before drag starts */}
      <div className="mat-scroll-wrap">
        <div className="mat-inner">
          {mat.length > 0 && <MatZoneStrip mat={mat} />}
          <div className="mat-drop-row">
            {/* Always in DOM — edge zones must exist before drag starts */}
            <MatEdgeZone side="left" isDragging={isDragging} onDrop={onDrop} />

            <div className="mat-cards-row">
              {mat.length === 0 && (
                <div className="mat-empty">Mat is empty — drag a card here</div>
              )}
              {mat.map((entry, i) => (
                <MatCardImg
                  key={entry.uid}
                  entry={entry}
                  index={i}
                  isProtected={protectedUids.includes(entry.uid)}
                  isPickable={matPickMode === 'double_leg'}
                  onPick={onPick}
                  isDragging={isDragging}
                  onDrop={onDrop}
                />
              ))}
            </div>

            <MatEdgeZone side="right" isDragging={isDragging} onDrop={onDrop} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hand area ─────────────────────────────────────────────────────────────────

function HandArea({ G, selectCard, toggleFlip, takePoint, onDragStart, onDragEnd, disabled }) {
  const { players, currentPlayer, selectedIdx, flipped } = G;
  const p = players[currentPlayer];
  const hasSelected = selectedIdx !== null;

  return (
    <div className={`hand-area${disabled ? ' hand-area--disabled' : ''}`} onDragEnd={onDragEnd}>
      <div className="hand-label">
        {p.name}'s Hand
        {!disabled && p.hand.length > 0 && <span className="hand-hint-inline"> — tap to select, drag to place</span>}
        {disabled && <span className="hand-hint-inline"> — confirm or cancel your placement above</span>}
      </div>
      <div className="hand-cards">
        {p.hand.length === 0 && <div className="hand-empty">No cards in hand</div>}
        {p.hand.map((card, i) => (
          <HandCard
            key={i}
            card={card}
            flipped={i === selectedIdx ? flipped : false}
            isSelected={i === selectedIdx}
            onSelect={() => selectCard(i)}
            onDragStart={() => { selectCard(i); onDragStart(); }}
            onFlip={toggleFlip}
          />
        ))}
      </div>

      {hasSelected && (
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
  const { selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement } = actions;
  const { phase, matPickMode, message, currentPlayer, players, flags } = G;
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = () => {
    if (phase !== 'playing') return;
    setIsDragging(true);
  };
  const handleDragEnd = () => setIsDragging(false);
  const handleDrop = (placement) => {
    setIsDragging(false);
    playToMat(placement);
  };

  return (
    <div className="game-board">
      <ScoreHeader G={G} />

      {message && <div className="game-msg">{message}</div>}

      {matPickMode === 'double_leg' && (
        <div className="pick-banner">
          DOUBLE LEG TAKEDOWN — Tap a mat card to remove it permanently
        </div>
      )}

      <Mat G={G} onPick={pickMatCard} isDragging={isDragging} onDrop={handleDrop} />

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
            onDragStart={phase === 'playing' ? handleDragStart : () => {}}
            onDragEnd={handleDragEnd}
            disabled={phase === 'placed'}
          />
        </>
      )}

      {phase === 'placed' && (
        <div className="confirm-bar">
          <div className="confirm-msg">Card placed on the mat — confirm or cancel?</div>
          <div className="confirm-btns">
            <button className="btn btn--secondary" onClick={cancelPlacement}>↩ Cancel</button>
            <button className="btn btn--primary btn--lg" onClick={confirmPlacement}>Confirm ✓</button>
          </div>
        </div>
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
  const { G, initGame, startTurn, confirmTurn, confirmPlacement, cancelPlacement, selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, nextRound } = useGame();
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
      actions={{ selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, confirmTurn, confirmPlacement, cancelPlacement }}
    />
  );
}
