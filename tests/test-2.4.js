/**
 * Test Suite — Phase 2.4: Animation Gameplay & Event FX
 *
 * Verifies:
 * 1. CHEERS animation triggers accurately (center callout + raised mug on seated players + table mug shift).
 * 2. AnimationManager never self-increments drunkLevel.
 * 3. KO animation triggers at most once per player KO transition.
 * 4. AnimationManager never self-releases seats after KO.
 * 5. LEAVING (WIFE_DRAG) only changes visual presentation and never mutates Game State.
 * 6. Gift FX & LIKE_MILESTONE FX display accurately by actionType (including invalid gift target).
 * 7. Duplicate FX (by eventId or stale stateVersion) are never replayed.
 * 8. Seat occupant replacement safety: old FX for a replaced userId never plays on the new occupant;
 *    works regardless of state_patch vs action_fx arrival order, and handles CHEERS simultaneous with KO.
 * 9. Zero leaked timers or tweens after shutdown().
 * 10. Bounded animation queue (maxQueueSize = 20) prevents unbounded growth.
 * 11. Reconnect clears active FX cleanly without sticking UI or replaying old FX.
 * 12. Snapshot recovery/reconnect with existing KO or LEAVING state renders current posture without replaying transition FX.
 * 13. SocketClient integration with real Backend Socket.io server remains intact.
 */

const assert = require('assert');
const http = require('http');
const { pathToFileURL } = require('url');
const path = require('path');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

/**
 *Controllable mock Phaser Scene with manual timer stepping.
 */
function createControllableScene() {
  const createdObjects = [];
  let nextTimerId = 1;
  const scheduledEvents = new Map();

  const makeGameObject = (type, extra = {}) => {
    const obj = {
      type,
      depth: 0,
      visible: true,
      alpha: 1,
      x: extra.x || 0,
      y: extra.y || 0,
      text: extra.text || '',
      style: extra.style || {},
      commands: [],
      setDepth(d) {
        this.depth = d;
        return this;
      },
      setOrigin() {
        return this;
      },
      setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
      },
      setVisible(v) {
        this.visible = Boolean(v);
        return this;
      },
      setAlpha(a) {
        this.alpha = a;
        return this;
      },
      setText(t) {
        this.text = String(t);
        return this;
      },
      setColor(c) {
        this.style.color = c;
        return this;
      },
      clear() {
        this.commands = [];
        return this;
      },
      fillStyle(color, alpha = 1) {
        this.commands.push({ op: 'fillStyle', color, alpha });
        return this;
      },
      lineStyle(width, color, alpha = 1) {
        this.commands.push({ op: 'lineStyle', width, color, alpha });
        return this;
      },
      fillRect(x, y, w, h) {
        this.commands.push({ op: 'fillRect', x, y, w, h });
        return this;
      },
      strokeRect(x, y, w, h) {
        this.commands.push({ op: 'strokeRect', x, y, w, h });
        return this;
      },
      fillRoundedRect(x, y, w, h, r) {
        this.commands.push({ op: 'fillRoundedRect', x, y, w, h, r });
        return this;
      },
      strokeRoundedRect(x, y, w, h, r) {
        this.commands.push({ op: 'strokeRoundedRect', x, y, w, h, r });
        return this;
      },
      fillCircle(x, y, r) {
        this.commands.push({ op: 'fillCircle', x, y, r });
        return this;
      },
      strokeCircle(x, y, r) {
        this.commands.push({ op: 'strokeCircle', x, y, r });
        return this;
      },
      fillEllipse(x, y, w, h) {
        this.commands.push({ op: 'fillEllipse', x, y, w, h });
        return this;
      },
      strokeEllipse(x, y, w, h) {
        this.commands.push({ op: 'strokeEllipse', x, y, w, h });
        return this;
      },
      fillTriangle(x1, y1, x2, y2, x3, y3) {
        this.commands.push({ op: 'fillTriangle', x1, y1, x2, y2, x3, y3 });
        return this;
      },
      lineBetween(x1, y1, x2, y2) {
        this.commands.push({ op: 'lineBetween', x1, y1, x2, y2 });
        return this;
      },
      destroy() {
        this.destroyed = true;
      },
      ...extra,
    };
    createdObjects.push(obj);
    return obj;
  };

  const scene = {
    createdObjects,
    scheduledEvents,
    add: {
      graphics: () => makeGameObject('graphics'),
      text: (x, y, text, style) => makeGameObject('text', { x, y, text, style: { ...style } }),
    },
    time: {
      delayedCall(delay, callback) {
        const id = nextTimerId++;
        const timer = {
          id,
          delay,
          callback,
          loop: false,
          removed: false,
          remove() {
            this.removed = true;
            scheduledEvents.delete(id);
          },
          destroy() {
            this.removed = true;
            scheduledEvents.delete(id);
          },
        };
        scheduledEvents.set(id, timer);
        return timer;
      },
      addEvent({ delay, loop, callback }) {
        const id = nextTimerId++;
        const timer = {
          id,
          delay,
          loop: Boolean(loop),
          callback,
          removed: false,
          remove() {
            this.removed = true;
            scheduledEvents.delete(id);
          },
          destroy() {
            this.removed = true;
            scheduledEvents.delete(id);
          },
        };
        scheduledEvents.set(id, timer);
        return timer;
      },
    },
    // Helper to trigger all non-looping delayedCalls currently pending
    flushDelayedCalls() {
      const snapshot = Array.from(scheduledEvents.values()).filter((t) => !t.loop && !t.removed);
      for (const timer of snapshot) {
        if (!timer.removed) {
          scheduledEvents.delete(timer.id);
          timer.callback();
        }
      }
    },
  };

  return scene;
}

function postJson(port, endpoint, body, token = 'dev_secret_123') {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-mock-token': token,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function waitForCondition(predicate, timeoutMs = 3000, intervalMs = 20) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      try {
        if (predicate()) {
          clearInterval(timer);
          resolve(true);
          return;
        }
      } catch (err) {
        clearInterval(timer);
        reject(err);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timeout after ${timeoutMs}ms waiting for condition`));
      }
    }, intervalMs);
  });
}

(async () => {
  console.log('=== TEST SUITE 2.4: ANIMATION GAMEPLAY & EVENT FX ===\n');

  const layoutUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/ui/Layout.js')).href;
  const seatViewUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/SeatView.js')).href;
  const tableViewUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/TableView.js')).href;
  const animMgrUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/fx/AnimationManager.js')).href;
  const socketClientUrl = pathToFileURL(path.resolve(__dirname, '../client/src/network/SocketClient.js')).href;

  const Layout = await import(layoutUrl);
  const { SeatView } = await import(seatViewUrl);
  const { TableView } = await import(tableViewUrl);
  const { AnimationManager, FX_DURATIONS } = await import(animMgrUrl);
  const { SocketClient } = await import(socketClientUrl);

  const mockScene = createControllableScene();
  const seatViews = Layout.SEAT_LAYOUTS.map((layout) => new SeatView(mockScene, layout));
  const tableView = new TableView(mockScene);
  const animManager = new AnimationManager(mockScene, {
    seatViews,
    tableView,
    maxQueueSize: 20,
  });

  // Helper to apply viewData to both SeatViews/TableView and AnimationManager
  function applyView(viewData, syncSource = 'PATCH') {
    for (const sv of seatViews) {
      const seatData = viewData.seats.find((s) => s.seatId === sv.seatId);
      sv.updateSeat(seatData || { status: 'EMPTY' });
    }
    tableView.updateMugStates(viewData.seats);
    animManager.syncWithViewData(viewData, syncSource);
  }

  // Initial table snapshot with 3 seated players
  applyView(
    {
      stateVersion: 1,
      seats: [
        { seatId: 1, userId: 'u1', nickname: 'Anh_Ba', status: 'SEATED', drunkLevel: 20, isVip: true },
        { seatId: 2, userId: 'u2', nickname: 'Tu_Beo', status: 'SEATED', drunkLevel: 50, isVip: false },
        { seatId: 3, userId: 'u3', nickname: 'Ut_Xi', status: 'SEATED', drunkLevel: 85, isVip: false },
        { seatId: 4, status: 'EMPTY' },
        { seatId: 5, status: 'EMPTY' },
        { seatId: 6, status: 'EMPTY' },
      ],
    },
    'SNAPSHOT'
  );

  // 1. Verify CHEERS animation & Single Source of Truth (no self-incrementing drunkLevel)
  check('1. CHEERS animation triggers center callout, raises seated mugs, shifts table mugs, and resets cleanly', () => {
    const enqueued = animManager.enqueueActionFx({
      actionType: 'CHEERS',
      eventId: 'evt_cheers_1',
      drunkDelta: 5,
      stateVersion: 2,
      affectedSeats: [
        { seatId: 1, userId: 'u1', drunkLevel: 25, status: 'SEATED' },
        { seatId: 2, userId: 'u2', drunkLevel: 55, status: 'SEATED' },
      ],
    });
    assert.strictEqual(enqueued, true);
    assert.strictEqual(animManager.centerFxText.visible, true);
    assert.ok(animManager.centerFxText.text.includes('1, 2, 3 DÔ!'));

    // Seat 1 & 2 raise mugs and table shifts cheering mugs
    assert.strictEqual(seatViews[0].playerPlaceholder.getPoseOffset().raiseMug, true);
    assert.strictEqual(seatViews[1].playerPlaceholder.getPoseOffset().raiseMug, true);
    assert.strictEqual(seatViews[2].playerPlaceholder.getPoseOffset().raiseMug, false);
    assert.strictEqual(tableView.mugStates.get(1).isCheering, true);
    assert.strictEqual(tableView.mugStates.get(2).isCheering, true);

    // Flush timer -> poses and table mugs reset
    animManager.flushTimers();
    assert.strictEqual(animManager.centerFxText.visible, false);
    assert.strictEqual(seatViews[0].playerPlaceholder.getPoseOffset().raiseMug, false);
    assert.strictEqual(tableView.mugStates.get(1).isCheering, false);
  });

  check('2. AnimationManager NEVER self-mutates drunkLevel (Single Source of Truth)', () => {
    // Even though CHEERS FX above had drunkLevel: 25 and 55 in affectedSeats,
    // SeatView drunkLevel must remain 20 and 50 until Backend state_patch arrives!
    assert.strictEqual(seatViews[0].getDisplayState().drunkLevel, 20);
    assert.strictEqual(seatViews[1].getDisplayState().drunkLevel, 50);
  });

  // 3. Drunk-tier gentle sway loop
  check('3. Drunk-tier sway applies distinct visual sway for SOBER, TIPSY, and DRUNK without touching EMPTY', () => {
    // Advance swayPhase to an active horizontal sway tick (phase 0 or 2)
    while (animManager.swayPhase % 2 !== 0) {
      animManager.stepDrunkSway();
    }
    const poseSober = seatViews[0].playerPlaceholder.getPoseOffset(); // drunk 20 -> SOBER
    const poseTipsy = seatViews[1].playerPlaceholder.getPoseOffset(); // drunk 50 -> TIPSY
    const poseDrunk = seatViews[2].playerPlaceholder.getPoseOffset(); // drunk 85 -> DRUNK
    const poseEmpty = seatViews[3].playerPlaceholder.getPoseOffset(); // EMPTY
    assert.strictEqual(poseSober.x, 0, 'SOBER does not sway horizontally');
    assert.ok(Math.abs(poseDrunk.x) > Math.abs(poseTipsy.x), 'DRUNK sways wider than TIPSY');
    assert.strictEqual(poseEmpty.x, 0);
    assert.strictEqual(poseEmpty.y, 0);
  });

  // 4. KO animation triggers at most once per player KO transition & never self-releases seat
  check('4. KO animation triggers at most once per player KO transition and never self-releases seat', () => {
    // Backend state_patch transitions Seat 3 (u3) to KO
    applyView(
      {
        stateVersion: 3,
        seats: [
          { seatId: 1, userId: 'u1', nickname: 'Anh_Ba', status: 'SEATED', drunkLevel: 25, isVip: true },
          { seatId: 2, userId: 'u2', nickname: 'Tu_Beo', status: 'SEATED', drunkLevel: 55, isVip: false },
          { seatId: 3, userId: 'u3', nickname: 'Ut_Xi', status: 'KO', drunkLevel: 100, isVip: false },
          { seatId: 4, status: 'EMPTY' },
          { seatId: 5, status: 'EMPTY' },
          { seatId: 6, status: 'EMPTY' },
        ],
      },
      'PATCH'
    );

    const firstKo = animManager.enqueueActionFx({
      actionType: 'KO',
      eventId: 'evt_ko_u3_first',
      seatId: 3,
      userId: 'u3',
      drunkLevel: 100,
      status: 'KO',
      stateVersion: 3,
    });
    assert.strictEqual(firstKo, true);
    const seat3Fx = animManager.seatFxPool.get(3);
    assert.strictEqual(seat3Fx.calloutText.visible, true);
    assert.ok(seat3Fx.calloutText.text.includes('GỤC RỒI!'));

    // Flush KO FX callout timer
    animManager.flushTimers();
    assert.strictEqual(seat3Fx.calloutText.visible, false);

    // Seat 3 MUST still be KO (AnimationManager never self-releases seat after 3000ms)
    assert.strictEqual(seatViews[2].getDisplayState().status, 'KO');
    assert.strictEqual(seatViews[2].getDisplayState().userId, 'u3');

    // Attempt a duplicate KO FX for the same player u3 on seat 3 (with a new eventId)
    animManager.enqueueActionFx({
      actionType: 'KO',
      eventId: 'evt_ko_u3_duplicate',
      seatId: 3,
      userId: 'u3',
      drunkLevel: 100,
      status: 'KO',
      stateVersion: 3,
    });
    assert.strictEqual(
      seat3Fx.calloutText.visible,
      false,
      'Duplicate KO FX for same (seatId, userId) must not replay'
    );
  });

  // 5. LEAVING (WIFE_DRAG) only changes visual presentation and never mutates Game State
  check('5. WIFE_DRAG (LEAVING) displays wife prop + callout once and never mutates Game State', () => {
    // Suppose FX arrives BEFORE state_patch for Seat 2 (u2)
    const beforeState = { ...seatViews[1].getDisplayState() };
    assert.strictEqual(beforeState.status, 'SEATED');

    animManager.enqueueActionFx({
      actionType: 'WIFE_DRAG',
      eventId: 'evt_wife_u2_1',
      seatId: 2,
      userId: 'u2',
      status: 'LEAVING',
      stateVersion: 4,
    });

    const seat2Fx = animManager.seatFxPool.get(2);
    assert.strictEqual(seat2Fx.calloutText.visible, true);
    assert.ok(seat2Fx.calloutText.text.includes('VỢ BẮT VỀ!'));
    assert.strictEqual(seat2Fx.propGfx.visible, true);

    // SeatView status was NOT mutated by AnimationManager
    assert.strictEqual(seatViews[1].getDisplayState().status, 'SEATED');

    // Now state_patch arrives for version 4 with u2 in LEAVING -> active callout must remain visible!
    applyView(
      {
        stateVersion: 4,
        seats: [
          { seatId: 1, userId: 'u1', nickname: 'Anh_Ba', status: 'SEATED', drunkLevel: 25, isVip: true },
          { seatId: 2, userId: 'u2', nickname: 'Tu_Beo', status: 'LEAVING', drunkLevel: 55, isVip: false },
          { seatId: 3, userId: 'u3', nickname: 'Ut_Xi', status: 'KO', drunkLevel: 100, isVip: false },
          { seatId: 4, status: 'EMPTY' },
          { seatId: 5, status: 'EMPTY' },
          { seatId: 6, status: 'EMPTY' },
        ],
      },
      'PATCH'
    );
    assert.strictEqual(
      seat2Fx.calloutText.visible,
      true,
      'State patch arriving after FX for same userId must not cancel active FX callout'
    );

    animManager.flushTimers();
    assert.strictEqual(seat2Fx.calloutText.visible, false);

    // Duplicate WIFE_DRAG for same (seat 2, u2) must be ignored
    animManager.enqueueActionFx({
      actionType: 'WIFE_DRAG',
      eventId: 'evt_wife_u2_dup',
      seatId: 2,
      userId: 'u2',
      status: 'LEAVING',
      stateVersion: 4,
    });
    assert.strictEqual(seat2Fx.calloutText.visible, false);
  });

  // 6. Gift FX & LIKE_MILESTONE FX by actionType
  check('6. Gift FX (DRINK_SMALL, DRINK_MEDIUM, DRINK_ALL, SOBER_UP, VIP_PASS, invalid target) & LIKE_MILESTONE render accurately', () => {
    const seat1Fx = animManager.seatFxPool.get(1);

    // DRINK_SMALL on seat 1 (u1)
    animManager.enqueueActionFx({
      actionType: 'DRINK_SMALL',
      eventId: 'evt_gift_small',
      targetValid: true,
      drunkDeltaApplied: 10,
      affectedSeats: [{ seatId: 1, userId: 'u1', status: 'SEATED' }],
      stateVersion: 5,
    });
    assert.strictEqual(seat1Fx.calloutText.visible, true);
    assert.ok(seat1Fx.calloutText.text.includes('+10 SAY'));
    animManager.flushTimers();

    // SOBER_UP on seat 1 (u1)
    animManager.enqueueActionFx({
      actionType: 'SOBER_UP',
      eventId: 'evt_gift_sober',
      targetValid: true,
      drunkDeltaApplied: -20,
      affectedSeats: [{ seatId: 1, userId: 'u1', status: 'SEATED' }],
      stateVersion: 5,
    });
    assert.strictEqual(seat1Fx.calloutText.visible, true);
    assert.ok(seat1Fx.calloutText.text.includes('-20 GIẢI SAY'));
    animManager.flushTimers();

    // VIP_PASS
    animManager.enqueueActionFx({
      actionType: 'VIP_PASS',
      eventId: 'evt_gift_vip',
      targetValid: true,
      affectedSeats: [{ seatId: 1, userId: 'u1', isVip: true }],
      stateVersion: 5,
    });
    assert.strictEqual(seat1Fx.calloutText.visible, true);
    assert.ok(seat1Fx.calloutText.text.includes('THẺ VIP'));
    animManager.flushTimers();

    // Invalid gift target (targetValid: false) -> subtle center notice, no seat FX
    animManager.enqueueActionFx({
      actionType: 'DRINK_MEDIUM',
      eventId: 'evt_gift_invalid',
      targetValid: false,
      invalidReason: 'TARGET_NOT_SEATED',
      affectedSeats: [],
      stateVersion: 5,
    });
    assert.strictEqual(animManager.centerFxText.visible, true);
    assert.ok(animManager.centerFxText.text.includes('KHÔNG HỢP LỆ'));
    assert.strictEqual(seat1Fx.calloutText.visible, false);
    animManager.flushTimers();

    // LIKE_MILESTONE FX
    animManager.enqueueActionFx({
      actionType: 'LIKE_MILESTONE',
      eventId: 'evt_like_100',
      drunkDelta: 1,
      affectedSeats: [{ seatId: 1, userId: 'u1', status: 'SEATED' }],
      stateVersion: 5,
    });
    assert.strictEqual(animManager.centerFxText.visible, true);
    assert.ok(animManager.centerFxText.text.includes('ĐẠT MỐC LIKE'));
    assert.strictEqual(seat1Fx.calloutText.visible, true);
    animManager.flushTimers();
  });

  // 7. Deduplication by eventId and stale stateVersion guard
  check('7. Duplicate eventId or stale stateVersion (< minAcceptableStateVersion) are rejected', () => {
    const dupAccepted = animManager.enqueueActionFx({
      actionType: 'DRINK_SMALL',
      eventId: 'evt_gift_small', // already processed in test 6
      targetValid: true,
      drunkDeltaApplied: 10,
      affectedSeats: [{ seatId: 1, userId: 'u1', status: 'SEATED' }],
      stateVersion: 5,
    });
    assert.strictEqual(dupAccepted, false, 'Duplicate eventId must be rejected');

    // Advance snapshot to stateVersion 20 -> sets minAcceptableStateVersion = 20
    applyView(
      {
        stateVersion: 20,
        seats: [
          { seatId: 1, userId: 'u1', nickname: 'Anh_Ba', status: 'SEATED', drunkLevel: 30, isVip: true },
          { seatId: 2, status: 'EMPTY' },
          { seatId: 3, status: 'EMPTY' },
          { seatId: 4, status: 'EMPTY' },
          { seatId: 5, status: 'EMPTY' },
          { seatId: 6, status: 'EMPTY' },
        ],
      },
      'SNAPSHOT'
    );

    const staleAccepted = animManager.enqueueActionFx({
      actionType: 'CHEERS',
      eventId: 'evt_old_v12',
      stateVersion: 12,
      affectedSeats: [{ seatId: 1, userId: 'u1', status: 'SEATED' }],
    });
    assert.strictEqual(staleAccepted, false, 'FX older than snapshot stateVersion must be rejected');
  });

  // 8. Seat occupant replacement safety + CHEERS simultaneous with KO
  check('8. Seat reuse protection: FX for old userId never plays on new occupant, and CHEERS simultaneous with KO skips KO seat', () => {
    // Seat 1 is replaced by a brand-new player 'u_new'
    applyView(
      {
        stateVersion: 21,
        seats: [
          { seatId: 1, userId: 'u_new', nickname: 'Nguoi_Moi', status: 'SEATED', drunkLevel: 0, isVip: false },
          { seatId: 2, userId: 'u2_back', nickname: 'Tu_Beo', status: 'KO', drunkLevel: 100, isVip: false },
          { seatId: 3, status: 'EMPTY' },
          { seatId: 4, status: 'EMPTY' },
          { seatId: 5, status: 'EMPTY' },
          { seatId: 6, status: 'EMPTY' },
        ],
      },
      'PATCH'
    );

    // Late FX arrives targeting seatId: 1 but for old userId: 'u1'
    animManager.enqueueActionFx({
      actionType: 'DRINK_MEDIUM',
      eventId: 'evt_late_for_u1',
      targetValid: true,
      drunkDeltaApplied: 25,
      affectedSeats: [{ seatId: 1, userId: 'u1', status: 'SEATED' }],
      stateVersion: 21,
    });

    const seat1Fx = animManager.seatFxPool.get(1);
    assert.strictEqual(
      seat1Fx.calloutText.visible,
      false,
      'FX targeting old userId u1 must NOT display on new occupant u_new'
    );

    // CHEERS simultaneous with KO: Seat 1 is SEATED (u_new), Seat 2 hit KO (u2_back) in same CHEERS tick
    animManager.enqueueActionFx({
      actionType: 'CHEERS',
      eventId: 'evt_cheers_with_ko',
      drunkDelta: 5,
      stateVersion: 21,
      affectedSeats: [
        { seatId: 1, userId: 'u_new', status: 'SEATED', drunkLevel: 5 },
        { seatId: 2, userId: 'u2_back', status: 'KO', drunkLevel: 100 },
      ],
    });
    assert.strictEqual(
      seatViews[0].playerPlaceholder.getPoseOffset().raiseMug,
      true,
      'Seated player u_new raises mug on CHEERS'
    );
    assert.strictEqual(
      seatViews[1].playerPlaceholder.getPoseOffset().raiseMug,
      false,
      'Player who hit KO during CHEERS must NOT raise cheering mug'
    );
    animManager.flushTimers();
  });

  // 9. Snapshot recovery / reconnect with existing KO or LEAVING player does NOT replay transition FX
  check('9. Snapshot recovery/reconnect with existing KO or LEAVING renders posture without replaying KO/LEAVING impact FX', () => {
    applyView(
      {
        stateVersion: 30,
        seats: [
          { seatId: 1, userId: 'u_ko_snap', nickname: 'Say_San', status: 'KO', drunkLevel: 100, isVip: false },
          { seatId: 2, userId: 'u_wife_snap', nickname: 'Ve_San', status: 'LEAVING', drunkLevel: 40, isVip: false },
          { seatId: 3, status: 'EMPTY' },
          { seatId: 4, status: 'EMPTY' },
          { seatId: 5, status: 'EMPTY' },
          { seatId: 6, status: 'EMPTY' },
        ],
      },
      'SNAPSHOT'
    );

    // Posture on SeatView is KO and LEAVING
    assert.strictEqual(seatViews[0].getDisplayState().status, 'KO');
    assert.strictEqual(seatViews[1].getDisplayState().status, 'LEAVING');

    // Neither seat shows an active impact callout from the snapshot
    assert.strictEqual(animManager.seatFxPool.get(1).calloutText.visible, false);
    assert.strictEqual(animManager.seatFxPool.get(2).calloutText.visible, false);

    // Even if a replayed KO/WIFE_DRAG FX arrives for those already-KO/LEAVING snapshot occupants, it is suppressed
    animManager.enqueueActionFx({
      actionType: 'KO',
      eventId: 'evt_replay_ko_snap',
      seatId: 1,
      userId: 'u_ko_snap',
      stateVersion: 30,
    });
    animManager.enqueueActionFx({
      actionType: 'WIFE_DRAG',
      eventId: 'evt_replay_wife_snap',
      seatId: 2,
      userId: 'u_wife_snap',
      stateVersion: 30,
    });
    assert.strictEqual(animManager.seatFxPool.get(1).calloutText.visible, false);
    assert.strictEqual(animManager.seatFxPool.get(2).calloutText.visible, false);
  });

  // 10. Bounded animation queue (maxQueueSize = 20)
  check('10. Bounded animation queue caps length at maxQueueSize (20) under burst load', () => {
    // Pause auto-drain by setting isDraining = true temporarily to test queue bounding
    animManager.isDraining = true;
    for (let i = 1; i <= 35; i++) {
      animManager.enqueueActionFx({
        actionType: 'CHEERS',
        eventId: `evt_burst_${i}`,
        stateVersion: 30 + i,
        affectedSeats: [],
      });
    }
    const diag = animManager.getDiagnostics();
    assert.strictEqual(diag.queueLength, 20, 'Queue length must never exceed maxQueueSize (20)');
    assert.strictEqual(diag.stats.droppedOverflow, 15, '15 overflow events must be dropped cleanly');
    animManager.isDraining = false;
    animManager.clearActiveVisuals();
  });

  // 11. Zero orphan timers or tweens after shutdown()
  check('11. shutdown() clears all active timers, tweens, and sway loop with zero leaks', () => {
    animManager.enqueueActionFx({
      actionType: 'CHEERS',
      eventId: 'evt_before_shutdown',
      stateVersion: 99,
      affectedSeats: [],
    });
    assert.ok(animManager.getDiagnostics().activeTimersCount > 0);
    animManager.shutdown();
    const diagAfter = animManager.getDiagnostics();
    assert.strictEqual(diagAfter.activeTimersCount, 0);
    assert.strictEqual(diagAfter.activeTweensCount, 0);
    assert.strictEqual(diagAfter.hasSwayTimer, false);
    assert.strictEqual(diagAfter.queueLength, 0);
  });

  // 12. End-to-End Integration with real Backend Socket.io server + SocketClient + AnimationManager
  await checkAsync('12. Live Backend Socket.io -> SocketClient -> AnimationManager integration (Join, Gift, Cheers, Wife Drag, Reconnect)', async () => {
    const defaultConfig = require('../server/config');
    const { startServer } = require('../server/index');
    const testConfig = defaultConfig.buildConfig({
      port: 0,
      gameplayV1: {
        koHoldDurationMs: 500,
        leavingHoldDurationMs: 500,
        cheersIntervalMs: 600000,
        randomWifeCheckIntervalMs: 600000,
      },
    });
    const serverInstance = await startServer(testConfig);
    const { port, gameStateManager, mockService, shutdown } = serverInstance;
    gameStateManager.stopCheersScheduler();
    gameStateManager.stopWifeScheduler();

    const liveScene = createControllableScene();
    const liveSeats = Layout.SEAT_LAYOUTS.map((l) => new SeatView(liveScene, l));
    const liveTable = new TableView(liveScene);
    const liveAnim = new AnimationManager(liveScene, {
      seatViews: liveSeats,
      tableView: liveTable,
    });

    const fxLog = [];
    const socketClient = new SocketClient({
      backendUrl: `http://127.0.0.1:${port}`,
      socketOptions: {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100,
      },
    });

    socketClient.subscribe(
      {
        onStateSync: (viewData, syncSource) => {
          for (const sv of liveSeats) {
            const seatData = viewData.seats.find((s) => s.seatId === sv.seatId);
            sv.updateSeat(seatData || { status: 'EMPTY' });
          }
          liveTable.updateMugStates(viewData.seats);
          liveAnim.syncWithViewData(viewData, syncSource);
        },
        onActionFx: (fxPayload) => {
          fxLog.push(fxPayload);
          liveAnim.enqueueActionFx(fxPayload);
        },
      },
      'Test24Scene'
    );

    try {
      socketClient.connect();
      await waitForCondition(
        () => socketClient.status === 'CONNECTED' && socketClient.hasSynchronizedSnapshot
      );

      // Join 2 players
      mockService.simulateCommentNhau('live_u1', 'Hung_Dz');
      mockService.simulateCommentNhau('live_u2', 'Minh_Beo');
      await waitForCondition(
        () =>
          liveSeats[0].getDisplayState().userId === 'live_u1' &&
          liveSeats[1].getDisplayState().userId === 'live_u2'
      );

      // Send MOCK_GIFT_VIP (+25 drunkLevel -> DRINK_MEDIUM) to seatIndex 0 (live_u1)
      mockService.simulateGift('sender_1', 'Dai_Gia', 'MOCK_GIFT_VIP', 1, 0);
      await waitForCondition(() => fxLog.some((fx) => fx.actionType === 'DRINK_MEDIUM'));
      assert.strictEqual(liveAnim.seatFxPool.get(1).calloutText.visible, true);
      liveAnim.flushTimers();

      // Send MOCK_GIFT_WIFE to seatIndex 1 (live_u2) -> triggers WIFE_DRAG FX + LEAVING status
      mockService.simulateGift('sender_2', 'Vo_Nha', 'MOCK_GIFT_WIFE', 1, 1);
      await waitForCondition(() => fxLog.some((fx) => fx.actionType === 'WIFE_DRAG'));
      assert.strictEqual(liveSeats[1].getDisplayState().status, 'LEAVING');
      assert.strictEqual(liveAnim.seatFxPool.get(2).calloutText.visible, true);
      assert.ok(liveAnim.seatFxPool.get(2).calloutText.text.includes('VỢ BẮT VỀ!'));
      liveAnim.flushTimers();

      // Disconnect & Reconnect -> must not replay old WIFE_DRAG callout on snapshot recovery
      socketClient.disconnect();
      liveAnim.clearActiveVisuals();
      socketClient.connect();
      await waitForCondition(
        () => socketClient.status === 'CONNECTED' && socketClient.hasSynchronizedSnapshot
      );
      assert.strictEqual(
        liveAnim.seatFxPool.get(2).calloutText.visible,
        false,
        'Reconnecting while player is LEAVING must not replay WIFE_DRAG callout'
      );
    } finally {
      socketClient.disconnect();
      liveAnim.shutdown();
      await shutdown();
    }
  });

  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
})();
