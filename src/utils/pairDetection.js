/**
 * Shared pair detection logic — used by both useGame.js (game engine)
 * and App.jsx (placement preview). Single source of truth.
 *
 * NOTE: 4 zones with 2 cards = ADJACENT. 3 zones with 2 cards = OVERLAP.
 */

import { effectiveZones } from '../data/deck';

/**
 * Returns true if a card placed AFTER ownerUid (higher uid = on top)
 * has a zone at the given mat position. Covered zones are dead.
 */
export function isZoneCovered(position, ownerUid, mat) {
  return mat.some(entry =>
    entry.uid > ownerUid &&
    (entry.zoneOffset === position || entry.zoneOffset + 1 === position)
  );
}

/**
 * Check one directional pair between the placed card and an adjacent card.
 * placedIsRight=true  → placed is RIGHT card: placedZone=left,  adjZone=right (or left if overlap)
 * placedIsRight=false → placed is LEFT card:  placedZone=right, adjZone=left  (or right if overlap)
 * isOverlap: neighbor's facing zone is covered — compare their exposed zone instead.
 */
export function checkPairOneSide(placed, adjacentCard, placedIsRight, isOverlap = false) {
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

/**
 * Returns { left: pair|null, right: pair|null } for the given placement.
 * Both left and right can be null — callers should check before using.
 */
export function detectPairs(placed, newMat, placement) {
  // On-top or straddle: check both neighbors
  if (typeof placement === 'number' || (placement && typeof placement === 'object')) {
    const idx           = typeof placement === 'number' ? placement : placement.insertIdx;
    const leftNeighbor  = idx > 0                 ? newMat[idx - 1] : null;
    const rightNeighbor = idx < newMat.length - 1 ? newMat[idx + 1] : null;
    const leftIsOverlap  = !!leftNeighbor  && isZoneCovered(leftNeighbor.zoneOffset + 1, leftNeighbor.uid,  newMat);
    const rightIsOverlap = !!rightNeighbor && isZoneCovered(rightNeighbor.zoneOffset,    rightNeighbor.uid, newMat);
    return {
      left:  leftNeighbor  ? checkPairOneSide(placed, leftNeighbor,  true,  leftIsOverlap)  : null,
      right: rightNeighbor ? checkPairOneSide(placed, rightNeighbor, false, rightIsOverlap) : null,
    };
  }
  // End placements
  if ((placement === 'left' || placement === 'adjacent-left') && newMat.length >= 2) {
    const isOverlap = placement === 'left';
    return { left: null, right: checkPairOneSide(placed, newMat[1], false, isOverlap) };
  }
  if ((placement === 'right' || placement === 'adjacent-right') && newMat.length >= 2) {
    const isOverlap = placement === 'right';
    return { left: checkPairOneSide(placed, newMat[newMat.length - 2], true, isOverlap), right: null };
  }
  return { left: null, right: null };
}
