/**
 * PathWalker.js — Chibi Waypoint Pathing & Appearance Generator for v2.0 (7 Tables / 28 Seats)
 * Logical Coordinate System: 360 x 640
 */

import { V2_SEAT_LAYOUTS, V2_WAYPOINTS } from '../ui/Layout.js';

export const CHIBI_OUTFITS = Object.freeze([
  { shirt: '#ef4444', collar: '#fee2e2', hair: '#1e1b4b', hairStyle: 'SPIKY', glasses: false },
  { shirt: '#22c55e', collar: '#dcfce7', hair: '#3f271d', hairStyle: 'PARTED', glasses: true },
  { shirt: '#3b82f6', collar: '#dbeafe', hair: '#0f172a', hairStyle: 'SHORT', glasses: false },
  { shirt: '#eab308', collar: '#fef9c3', hair: '#451a03', hairStyle: 'BUN', glasses: false },
  { shirt: '#a855f7', collar: '#f3e8ff', hair: '#27272a', hairStyle: 'BOB', glasses: true },
  { shirt: '#ec4899', collar: '#fce7f3', hair: '#3b0764', hairStyle: 'PONYTAIL', glasses: false },
  { shirt: '#06b6d4', collar: '#cffafe', hair: '#1e293b', hairStyle: 'CAP', glasses: false },
  { shirt: '#f97316', collar: '#ffedd5', hair: '#422006', hairStyle: 'CURLY', glasses: true }
]);

/**
 * Deterministic appearance config for a player based on appearanceSeed or userId/seatId
 */
export function resolveChibiAppearance(playerOrSeed = 0, seatId = 1) {
  let seed = 0;
  if (typeof playerOrSeed === 'number' && Number.isFinite(playerOrSeed)) {
    seed = Math.abs(Math.round(playerOrSeed));
  } else if (playerOrSeed && typeof playerOrSeed === 'object') {
    if (typeof playerOrSeed.appearanceSeed === 'number') {
      seed = Math.abs(Math.round(playerOrSeed.appearanceSeed));
    } else if (typeof playerOrSeed.userId === 'string') {
      for (let i = 0; i < playerOrSeed.userId.length; i++) {
        seed = (seed * 31 + playerOrSeed.userId.charCodeAt(i)) >>> 0;
      }
    } else {
      seed = Number(seatId) || 1;
    }
  } else {
    seed = Number(seatId) || 1;
  }

  const outfit = CHIBI_OUTFITS[seed % CHIBI_OUTFITS.length];
  const skinTones = ['#fde68a', '#fed7aa', '#ffedd5', '#fbcfe8'];
  const skin = skinTones[seed % skinTones.length];
  return {
    ...outfit,
    skin,
    seed
  };
}

/**
 * Look up logical coordinates for a v2.0 seatId (1..28)
 */
export function getV2SeatCoords(seatId) {
  const numId = Number(seatId);
  const found = V2_SEAT_LAYOUTS.find((s) => s.seatId === numId);
  if (found) {
    return {
      seatId: found.seatId,
      tableId: found.tableId,
      localSeatNo: found.localSeatNo,
      x: found.x,
      y: found.y
    };
  }
  return { seatId: numId || 1, tableId: 'BAN_1', localSeatNo: 1, x: 180, y: 366 };
}

/**
 * Compute a clean 2-segment or 3-segment waypoint path in 360x640 logical space:
 * - Entry walk (`WALK_IN`): Host Counter Spawn (236, 288) -> Corridor Waypoint -> Target Seat (x, y)
 * - Table switch (`WALK_SWITCH`): From Seat (x1, y1) -> Central Corridor -> Target Seat (x2, y2)
 * - Exit walk (`WALK_OUT`): From Seat (x, y) -> Nearest Left/Right Exit
 */
export function computeChibiWaypoints(mode, fromSeatId, toSeatId) {
  if (mode === 'WALK_IN') {
    const target = getV2SeatCoords(toSeatId);
    const start = { x: V2_WAYPOINTS.COUNTER_SPAWN.x, y: V2_WAYPOINTS.COUNTER_SPAWN.y };
    const midY = Math.min(target.y - 14, Math.max(308, Math.round((start.y + target.y) / 2)));
    const midX = Math.round((start.x + target.x * 2) / 3);
    return [start, { x: midX, y: midY }, { x: target.x, y: target.y }];
  }

  if (mode === 'WALK_SWITCH') {
    const start = getV2SeatCoords(fromSeatId);
    const target = getV2SeatCoords(toSeatId);
    if (start.seatId === target.seatId) {
      return [
        { x: start.x, y: start.y },
        { x: target.x, y: target.y }
      ];
    }
    const corridorX = Math.round((start.x + target.x) / 2);
    const corridorY = Math.round((start.y + target.y) / 2) - 10;
    return [
      { x: start.x, y: start.y },
      { x: corridorX, y: corridorY },
      { x: target.x, y: target.y }
    ];
  }

  if (mode === 'WALK_OUT') {
    const start = getV2SeatCoords(fromSeatId);
    const exitX = start.x < 180 ? V2_WAYPOINTS.EXIT_LEFT.x : V2_WAYPOINTS.EXIT_RIGHT.x;
    return [
      { x: start.x, y: start.y },
      { x: exitX, y: start.y + 8 }
    ];
  }

  const fallback = getV2SeatCoords(toSeatId || fromSeatId || 1);
  return [{ x: fallback.x, y: fallback.y }];
}

/**
 * Interpolate position (x, y) and facing direction along a waypoint array for progress t in [0..1]
 */
export function interpolateWaypoints(waypoints, progress) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return { x: 180, y: 360, dirX: 1, bobY: 0 };
  }
  if (waypoints.length === 1) {
    return { x: waypoints[0].x, y: waypoints[0].y, dirX: 1, bobY: 0 };
  }

  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  const segments = [];
  let totalDist = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    segments.push({ a, b, len });
    totalDist += len;
  }

  let targetDist = t * totalDist;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (targetDist <= seg.len || i === segments.length - 1) {
      const localT = seg.len > 0 ? Math.min(1, targetDist / seg.len) : 1;
      const x = seg.a.x + (seg.b.x - seg.a.x) * localT;
      const y = seg.a.y + (seg.b.y - seg.a.y) * localT;
      const dirX = seg.b.x >= seg.a.x ? 1 : -1;
      const bobY = Math.abs(Math.sin(t * Math.PI * 10)) * -1.6;
      return { x, y, dirX, bobY };
    }
    targetDist -= seg.len;
  }

  const last = waypoints[waypoints.length - 1];
  return { x: last.x, y: last.y, dirX: 1, bobY: 0 };
}
