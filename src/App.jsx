import { useState } from 'react';
import { useGame } from './hooks/useGame';
import { MOVESET_COLOR, TERTIARY_LABEL, TERTIARY_DESC, effectiveZones } from './data/deck';
import './App.css';

// ── Card image ────────────────────────────────────────────────────────────────

function CardImg({ card, flipped, size = 'md' }) {
  const dims = { sm: [400, 286], md: [800, 571], lg: [800, 571] };
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
          transform: `translate(-50%,-50%) rotate(${flipped ? -90 : 90}deg)`,
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
    if (i === 0) {
      slots.push({ key: `${entry.uid}-L`, seam: false, zone: zones.left });
    }
    if (i < mat.length - 1) {
      const nextZones = effectiveZones(mat[i + 1].card, mat[i + 1].flipped);
      slots.push({ key: `${entry.uid}-seam`, seam: true, zoneA: zones.right, zoneB: nextZones.left });
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

// ── Drop zone (appears on mat during drag) ────────────────────────────────────

function DropZone({ placement, onDrop, children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop-zone${over ? ' drop-zone--over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(placement); }}
    >
      {children}
    </div>
  );
}

// ── Mat card image (overlaps neighbours by 50%) ───────────────────────────────

function MatCardImg({ entry, index, isProtected, isPickable, onPick, isDragging, onDrop }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`mat-card-img${isPickable ? ' mat-card-img--pick' : ''}${isProtected ? ' mat-card-img--prot' : ''}${over && isDragging ? ' mat-card-img--over' : ''}`}
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
  const { mat, protectedUids, matPickMode } = G;
  return (
    <div className="mat-area">
      <div className="mat-label">THE MAT — {mat.length * 2} / 8 zones (ring out at 8+)</div>
      <div className="mat-row-wrap">
        {isDragging && (
          <DropZone placement="left" onDrop={onDrop}>
            <span className="drop-zone-label">← Left</span>
          </DropZone>
        )}
        {mat.length === 0 && !isDragging
          ? <div className="mat-empty">Mat is empty</div>
          : mat.length > 0 && (
            <div className="mat-scroll-wrap">
              <div className="mat-inner">
                <MatZoneStrip mat={mat} />
                <div className="mat-cards-row">
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
              </div>
            </div>
          )
        }
        {isDragging && (
          <DropZone placement="right" onDrop={onDrop}>
            <span className="drop-zone-label">Right →</span>
          </DropZone>
        )}
      </div>
    </div>
  );
}

// ── Hand area ─────────────────────────────────────────────────────────────────

function HandArea({ G, selectCard, toggleFlip, takePoint, onDragStart, onDragEnd }) {
  const { players, currentPlayer, selectedIdx, flipped } = G;
  const p = players[currentPlayer];
  const hasSelected = selectedIdx !== null;

  return (
    <div className="hand-area" onDragEnd={onDragEnd}>
      <div className="hand-label">
        {p.name}'s Hand
        {p.hand.length > 0 && <span className="hand-hint-inline"> — tap to select, drag to place</span>}
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
  const { selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard } = actions;
  const { phase, matPickMode, message, currentPlayer, players, flags } = G;
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = () => setIsDragging(true);
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

      {phase === 'playing' && (
        <>
          <div className="turn-bar">
            {players[currentPlayer].name}'s Turn
            {flags.isBonus && <span className="turn-tag"> · BONUS TURN</span>}
            {flags.bonusHand && <span className="turn-tag"> · SINGLE LEG ACTIVE</span>}
          </div>
          <HandArea
            G={G}
            selectCard={selectCard}
            toggleFlip={toggleFlip}
            takePoint={takePoint}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        </>
      )}

      {phase === 'action' && <ActionModal G={G} resolveAction={resolveAction} />}
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
  const { G, initGame, startTurn, selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard, nextRound, newGame } = useGame();
  const { phase, players, currentPlayer } = G;

  if (phase === 'start') return <StartScreen onStart={initGame} />;

  if (phase === 'pass') {
    return (
      <PassScreen
        playerName={players[currentPlayer].name}
        message={G.message}
        onReady={startTurn}
      />
    );
  }

  if (phase === 'roundEnd') return <RoundEnd G={G} onNextRound={nextRound} />;
  if (phase === 'gameOver') return <GameOver G={G} onNewGame={newGame} />;

  return (
    <GameBoard
      G={G}
      actions={{ selectCard, toggleFlip, playToMat, takePoint, resolveAction, pickMatCard }}
    />
  );
}
