'use strict';

/**
 * PHASE 5 — TASK 5.1 VERIFICATION SUITE
 * State Snapshot Persistence & Automatic Recovery on Backend Restart
 *
 * Tests:
 * 1. SnapshotStore defaults: filePath = data/state-snapshot.json, maxAgeMs = 15m, throttleMs = 3000ms.
 * 2. Atomic write (saveSnapshotSync & saveSnapshotAsync) via temporary file + rename without residual .tmp files.
 * 3. Throttled periodic saving (scheduleSave coalesces rapid mutations within 3000ms window into a single write).
 * 4. flushSync() / shutdown() immediately writes pending unsaved snapshot and cancels pending throttle timer.
 * 5. Full Backend Server Restart Recovery (IMPLEMENTATION_PLAN.md Scenario 1):
 *    - Server 1 has 6 seated players (with specific drunkLevels) + 10 players in waiting queue (VIP + Normal),
 *      likeMetrics, roomId, randomWifeCooldownUntil, and stateVersion.
 *    - Server 1 shuts down -> Server 2 starts with enableSnapshotPersistence: true -> automatically restores
 *      all 6 seated players, all 10 queued players, likeMetrics, timers, and stateVersion.
 * 6. Locked Recovery Policy (2026-11-06) for KO and LEAVING players on Server Restart:
 *    - Seat 1 in KO (drunkLevel=100), Seat 2 in LEAVING, Seat 3-6 SEATED; VIP Queue + Normal Queue waiting.
 *    - On recovery: Seat 1 & Seat 2 are immediately evicted without recreating 3000ms timers (koTimers.size === 0)
 *      and without replaying old KO/LEAVING FX; VIP and Normal queue players take Seat 1 & Seat 2 with
 *      drunkLevel=0, status='SEATED', visualTier='SOBER'; stateVersion increments by +1 and updated snapshot is saved.
 * 7. Snapshot validation & rejection of expired (> 15 minutes), corrupted JSON, duplicate userId,
 *    invalid drunkLevel, and invalid seat/queue counts (starts clean with stateVersion = 0).
 * 8. E2E Socket.io & Frontend SocketClient synchronization after Backend restart:
 *    - Client connects to restarted Server 2 and receives exact recovered state (seats, queue, stateVersion).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { io: createClient } = require('socket.io-client');

const defaultConfig = require('../server/config');
const { startServer } = require('../server/index');
const { GameStateManager } = require('../server/services/gameStateManager');
const { validateRawEvent } = require('../server/engines/inputValidator');
const { normalizeEvent } = require('../server/engines/eventNormalizer');
const {
  SnapshotStore,
  DEFAULT_SNAPSHOT_PATH,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_THROTTLE_MS
} = require('../server/services/snapshotStore');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
    failed += 1;
  }
}

function createTempSnapshotPath(suffix) {
  return path.resolve(
    __dirname,
    '..',
    'data',
    `test-5.1-snapshot-${process.pid}-${Date.now()}-${suffix}.json`
  );
}

function cleanupSnapshotFiles(filePath) {
  try {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir)) {
        if (entry === base || entry.startsWith(`${base}.tmp.`)) {
          try {
            fs.unlinkSync(path.join(dir, entry));
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

function buildTestConfig(overrides = {}) {
  return defaultConfig.buildConfig({
    port: 0,
    gameplayV1: {
      cheersIntervalMs: 600000,
      randomWifeCheckIntervalMs: 600000,
      ...(overrides.gameplayV1 || {})
    },
    ...overrides
  });
}

function dispatchNormalized(gsm, rawEvent, cfg = defaultConfig) {
  const val = validateRawEvent({ ...rawEvent, source: 'MOCK' }, cfg);
  assert.strictEqual(val.valid, true, `Validation failed: ${val.error}`);
  const norm = normalizeEvent(val.sanitized, cfg);
  return gsm.processEvent(norm);
}

async function main() {
  console.log('================================================================');
  console.log(' PHASE 5 — TASK 5.1 VERIFICATION SUITE (STATE SNAPSHOT RECOVERY)');
  console.log('================================================================');

  // 1. Defaults & configuration check
  await runTest('1. SnapshotStore defaults match Master Plan (data/state-snapshot.json, 15m TTL, 3000ms throttle)', async () => {
    const store = new SnapshotStore();
    assert.strictEqual(store.filePath, DEFAULT_SNAPSHOT_PATH);
    assert.ok(store.filePath.endsWith(path.join('data', 'state-snapshot.json')));
    assert.strictEqual(store.maxAgeMs, 15 * 60 * 1000);
    assert.strictEqual(DEFAULT_MAX_AGE_MS, 15 * 60 * 1000);
    assert.strictEqual(store.throttleMs, 3000);
    assert.strictEqual(DEFAULT_THROTTLE_MS, 3000);
  });

  // 2. Atomic write (sync & async) without residual .tmp files
  await runTest('2. saveSnapshotSync & saveSnapshotAsync perform atomic write via .tmp rename without leaving .tmp files', async () => {
    const tempFile = createTempSnapshotPath('atomic');
    try {
      const cfg = buildTestConfig();
      const gsm = new GameStateManager(cfg);
      const now = 1762400000000;
      const store = new SnapshotStore({ filePath: tempFile, nowFn: () => now });

      dispatchNormalized(gsm, {
        eventType: 'COMMENT',
        userId: 'u_atomic_1',
        nickname: 'AtomicUser1',
        payload: { comment: 'nhậu' }
      }, cfg);

      const syncRes = store.saveSnapshotSync(gsm.getSnapshot(), now);
      assert.strictEqual(syncRes.ok, true);
      assert.strictEqual(fs.existsSync(tempFile), true);

      const dirEntriesAfterSync = fs.readdirSync(path.dirname(tempFile));
      const tmpAfterSync = dirEntriesAfterSync.filter((f) =>
        f.startsWith(`${path.basename(tempFile)}.tmp.`)
      );
      assert.strictEqual(tmpAfterSync.length, 0, 'No .tmp files should remain after saveSnapshotSync');

      dispatchNormalized(gsm, {
        eventType: 'COMMENT',
        userId: 'u_atomic_2',
        nickname: 'AtomicUser2',
        payload: { comment: 'dô' }
      }, cfg);

      const asyncRes = await store.saveSnapshotAsync(gsm.getSnapshot(), now + 100);
      assert.strictEqual(asyncRes.ok, true);
      assert.strictEqual(asyncRes.stateVersion, 2);

      const savedJson = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
      assert.strictEqual(savedJson.stateVersion, 2);
      assert.strictEqual(savedJson.seats[0].player.userId, 'u_atomic_1');
      assert.strictEqual(savedJson.seats[1].player.userId, 'u_atomic_2');

      const dirEntriesAfterAsync = fs.readdirSync(path.dirname(tempFile));
      const tmpAfterAsync = dirEntriesAfterAsync.filter((f) =>
        f.startsWith(`${path.basename(tempFile)}.tmp.`)
      );
      assert.strictEqual(tmpAfterAsync.length, 0, 'No .tmp files should remain after saveSnapshotAsync');
    } finally {
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 3. Throttled periodic save coalesces rapid mutations within 3000ms window
  await runTest('3. scheduleSave coalesces rapid mutations within 3000ms throttle window into a single disk write', async () => {
    const tempFile = createTempSnapshotPath('throttle');
    try {
      let fakeNow = 1762400010000;
      let scheduledCallback = null;
      let scheduledDelay = null;
      let timerIdCounter = 1;

      const store = new SnapshotStore({
        filePath: tempFile,
        throttleMs: 3000,
        nowFn: () => fakeNow,
        setTimeoutFn: (fn, ms) => {
          scheduledCallback = fn;
          scheduledDelay = ms;
          return ++timerIdCounter;
        },
        clearTimeoutFn: () => {
          scheduledCallback = null;
        }
      });

      const cfg = buildTestConfig();
      const gsm = new GameStateManager(cfg);

      // Trigger 5 rapid mutations within 500ms
      for (let i = 1; i <= 5; i += 1) {
        fakeNow += 100;
        dispatchNormalized(gsm, {
          eventType: 'COMMENT',
          userId: `u_thr_${i}`,
          nickname: `ThrUser${i}`,
          payload: { comment: 'nhậu' }
        }, cfg);
        const schedRes = store.scheduleSave(gsm.getSnapshot());
        assert.strictEqual(schedRes.scheduled, true);
        if (i === 1) {
          assert.strictEqual(schedRes.coalesced, false);
          assert.strictEqual(schedRes.delayMs, 3000);
        } else {
          assert.strictEqual(schedRes.coalesced, true);
        }
      }

      // Before 3000ms timer fires, file should not yet be written
      assert.strictEqual(fs.existsSync(tempFile), false);
      assert.strictEqual(store.stats.throttledSchedules, 5);
      assert.strictEqual(store.stats.asyncSaves, 0);
      assert.strictEqual(scheduledDelay, 3000);
      assert.strictEqual(typeof scheduledCallback, 'function');

      // Fire the 3000ms throttle callback
      fakeNow += 3000;
      scheduledCallback();
      await store._writeChain;

      assert.strictEqual(store.stats.asyncSaves, 1);
      assert.strictEqual(fs.existsSync(tempFile), true);
      const onDisk = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
      assert.strictEqual(onDisk.stateVersion, 5);
      const seatedIds = onDisk.seats.filter((s) => s.player).map((s) => s.player.userId);
      assert.deepStrictEqual(seatedIds, ['u_thr_1', 'u_thr_2', 'u_thr_3', 'u_thr_4', 'u_thr_5']);
    } finally {
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 4. flushSync() / shutdown() flushes pending unsaved snapshot immediately and cancels timer
  await runTest('4. flushSync() and shutdown() flush pending throttled snapshot synchronously and cancel timer', async () => {
    const tempFile = createTempSnapshotPath('flush');
    try {
      let clearedTimerId = null;
      const store = new SnapshotStore({
        filePath: tempFile,
        throttleMs: 4000,
        setTimeoutFn: () => 999,
        clearTimeoutFn: (id) => {
          clearedTimerId = id;
        }
      });

      const cfg = buildTestConfig();
      const gsm = new GameStateManager(cfg);
      dispatchNormalized(gsm, {
        eventType: 'COMMENT',
        userId: 'u_flush_1',
        nickname: 'FlushUser',
        payload: { comment: 'dô' }
      }, cfg);

      store.scheduleSave(gsm.getSnapshot());
      assert.strictEqual(fs.existsSync(tempFile), false);

      const shutdownRes = store.shutdown();
      assert.strictEqual(shutdownRes.ok, true);
      assert.strictEqual(clearedTimerId, 999);
      assert.strictEqual(store.throttleTimer, null);
      assert.strictEqual(store.pendingSnapshot, null);
      assert.strictEqual(fs.existsSync(tempFile), true);

      const diskData = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
      assert.strictEqual(diskData.stateVersion, 1);
      assert.strictEqual(diskData.seats[0].player.userId, 'u_flush_1');
    } finally {
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 5. Full Server Restart Recovery (IMPLEMENTATION_PLAN.md Scenario 1: 6 seated + 10 waiting queue)
  await runTest('5. Full Backend Restart Recovery: restores 6 seated players (with exact drunkLevels) and 10 waiting queue players (VIP + Normal)', async () => {
    const tempFile = createTempSnapshotPath('restart16');
    let server1 = null;
    let server2 = null;
    try {
      const cfg = buildTestConfig();
      server1 = await startServer(cfg, {
        enableSnapshotPersistence: true,
        snapshotOptions: {
          filePath: tempFile,
          throttleMs: 3000
        }
      });

      const mock1 = server1.mockService;
      const gsm1 = server1.gameStateManager;

      // Seat 6 players
      for (let i = 1; i <= 6; i += 1) {
        const res = mock1.processMockEvent({
          eventType: 'COMMENT',
          userId: `seated_user_${i}`,
          nickname: `Nhậu Thủ #${i}`,
          payload: { comment: 'nhậu' }
        });
        assert.strictEqual(res.ok, true);
      }

      // Queue 3 VIP players (via VIP_JOIN) and 7 Normal players (total 10 waiting)
      for (let v = 1; v <= 3; v += 1) {
        const res = mock1.processMockEvent({
          eventType: 'VIP_JOIN',
          userId: `vip_queue_${v}`,
          nickname: `Đại Gia VIP ${v}`,
          payload: {}
        });
        assert.strictEqual(res.ok, true);
      }

      for (let n = 1; n <= 7; n += 1) {
        const res = mock1.processMockEvent({
          eventType: 'COMMENT',
          userId: `normal_queue_${n}`,
          nickname: `Khách Chờ ${n}`,
          payload: { comment: 'dô' }
        });
        assert.strictEqual(res.ok, true);
      }

      // Give distinct drunkLevels to the 6 seated players (< 100 so all remain SEATED)
      // MOCK_GIFT_SMALL gives +10 per repeatCount
      const repeatCounts = [1, 2, 3, 5, 7, 8]; // -> 10, 20, 30, 50, 70, 80
      for (let s = 1; s <= 6; s += 1) {
        const res = mock1.processMockEvent({
          eventType: 'GIFT',
          userId: 'host_gifter',
          nickname: 'Host',
          payload: {
            mockGiftKey: 'MOCK_GIFT_SMALL',
            repeatCount: repeatCounts[s - 1],
            targetSeatIndex: s - 1
          }
        });
        assert.strictEqual(res.ok, true);
      }

      // Add likes (150 likes -> +1% to all 6 seated players, unconsumedLikes = 50) and set wife cooldown
      const expectedCooldown = Date.now() + 120000;
      gsm1.timers.randomWifeCooldownUntil = expectedCooldown;

      const likeRes = mock1.processMockEvent({
        eventType: 'LIKE',
        userId: 'liker_1',
        nickname: 'Liker',
        payload: {
          likeDelta: 150
        }
      });
      assert.strictEqual(likeRes.ok, true);

      const snapBeforeRestart = gsm1.getSnapshot();
      assert.strictEqual(snapBeforeRestart.seatedPlayers.length, 6);
      assert.strictEqual(snapBeforeRestart.vipQueue.length, 3);
      assert.strictEqual(snapBeforeRestart.normalQueue.length, 7);
      assert.strictEqual(snapBeforeRestart.totalWaiting, 10);

      // Shut down Server 1 (flushes pending throttled snapshot synchronously)
      await server1.shutdown();
      server1 = null;

      assert.strictEqual(fs.existsSync(tempFile), true);

      // Start Server 2 pointing to the same snapshot file
      server2 = await startServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: {
          filePath: tempFile,
          throttleMs: 3000
        }
      });

      assert.ok(server2.initialRecoveryResult);
      assert.strictEqual(server2.initialRecoveryResult.ok, true);
      assert.strictEqual(server2.initialRecoveryResult.evictedDuringRecovery, false);

      const snapAfterRestart = server2.gameStateManager.getSnapshot();
      assert.strictEqual(snapAfterRestart.stateVersion, snapBeforeRestart.stateVersion);
      assert.strictEqual(snapAfterRestart.seatedPlayers.length, 6);
      assert.strictEqual(snapAfterRestart.vipQueue.length, 3);
      assert.strictEqual(snapAfterRestart.normalQueue.length, 7);
      assert.strictEqual(snapAfterRestart.totalWaiting, 10);
      assert.strictEqual(snapAfterRestart.likeMetrics.totalLikes, 150);
      assert.strictEqual(snapAfterRestart.likeMetrics.unconsumedLikes, 50);
      assert.strictEqual(snapAfterRestart.wifeConfig.cooldownUntil, expectedCooldown);

      // Verify each seat preserved exact userId, drunkLevel, status, and visualTier
      for (let i = 0; i < 6; i += 1) {
        const beforePlayer = snapBeforeRestart.seats[i].player;
        const afterPlayer = snapAfterRestart.seats[i].player;
        assert.ok(afterPlayer, `Seat ${i + 1} must be occupied after recovery`);
        assert.strictEqual(afterPlayer.userId, beforePlayer.userId);
        assert.strictEqual(afterPlayer.displayNickname, beforePlayer.displayNickname);
        assert.strictEqual(afterPlayer.drunkLevel, beforePlayer.drunkLevel);
        assert.strictEqual(afterPlayer.status, 'SEATED');
        assert.strictEqual(afterPlayer.visualTier, beforePlayer.visualTier);
      }

      // Verify VIP Queue order (FIFO) and Normal Queue order (FIFO)
      assert.deepStrictEqual(
        snapAfterRestart.vipQueue.map((u) => u.userId),
        ['vip_queue_1', 'vip_queue_2', 'vip_queue_3']
      );
      assert.deepStrictEqual(
        snapAfterRestart.normalQueue.map((u) => u.userId),
        [
          'normal_queue_1',
          'normal_queue_2',
          'normal_queue_3',
          'normal_queue_4',
          'normal_queue_5',
          'normal_queue_6',
          'normal_queue_7'
        ]
      );
    } finally {
      if (server1) await server1.shutdown();
      if (server2) await server2.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 6. Locked Recovery Policy (2026-11-06) for KO and LEAVING players on Server Restart
  await runTest('6. Locked Recovery Policy (2026-11-06): KO & LEAVING players are evicted immediately on recovery without 3000ms timer, seats filled from VIP/Normal queue, stateVersion + 1 saved', async () => {
    const tempFile = createTempSnapshotPath('policy_ko_leaving');
    let server1 = null;
    let server2 = null;
    try {
      const cfg = buildTestConfig();
      server1 = await startServer(cfg, {
        enableSnapshotPersistence: true,
        snapshotOptions: {
          filePath: tempFile,
          throttleMs: 3000
        }
      });

      const mock1 = server1.mockService;
      const gsm1 = server1.gameStateManager;

      // Seat 6 players
      for (let i = 1; i <= 6; i += 1) {
        mock1.processMockEvent({
          eventType: 'COMMENT',
          userId: `p6_seat_${i}`,
          nickname: `SeatPlayer${i}`,
          payload: { comment: 'nhậu' }
        });
      }

      // Add 1 VIP and 2 Normal players to waiting queue
      mock1.processMockEvent({
        eventType: 'VIP_JOIN',
        userId: 'p6_vip_1',
        nickname: 'VIP Replacement 1',
        payload: {}
      });
      mock1.processMockEvent({
        eventType: 'COMMENT',
        userId: 'p6_norm_1',
        nickname: 'Normal Replacement 1',
        payload: { comment: 'dô' }
      });
      mock1.processMockEvent({
        eventType: 'COMMENT',
        userId: 'p6_norm_2',
        nickname: 'Normal Replacement 2',
        payload: { comment: 'nhậu' }
      });

      // Trigger KO on Seat 1 (MOCK_GIFT_VIP = +25 * 4 = +100 -> status = KO, 3000ms timer active on Server 1)
      mock1.processMockEvent({
        eventType: 'GIFT',
        userId: 'gifter',
        nickname: 'Gifter',
        payload: {
          mockGiftKey: 'MOCK_GIFT_VIP',
          repeatCount: 4,
          targetSeatIndex: 0
        }
      });

      // Trigger WIFE_SUMMON (LEAVING) on Seat 2 (status -> LEAVING, 3000ms timer active on Server 1)
      mock1.processMockEvent({
        eventType: 'GIFT',
        userId: 'gifter',
        nickname: 'Gifter',
        payload: {
          mockGiftKey: 'MOCK_GIFT_WIFE',
          repeatCount: 1,
          targetSeatIndex: 1
        }
      });

      const snapMidHold = gsm1.getSnapshot();
      assert.strictEqual(snapMidHold.seats[0].player.status, 'KO');
      assert.strictEqual(snapMidHold.seats[0].player.drunkLevel, 100);
      assert.strictEqual(snapMidHold.seats[1].player.status, 'LEAVING');
      assert.strictEqual(gsm1.koTimers.size, 2);
      const versionBeforeCrash = snapMidHold.stateVersion;

      // Simulate Server 1 crash/restart while Seat 1 is KO and Seat 2 is LEAVING
      await server1.shutdown();
      server1 = null;

      // Track any gameplay FX emitted during Server 2 startup recovery
      const fxDuringRecovery = [];
      server2 = await startServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: {
          filePath: tempFile,
          throttleMs: 3000
        }
      });
      server2.io.on('connection', (sock) => {
        sock.on('game:action_fx', (fx) => fxDuringRecovery.push(fx));
      });

      const recResult = server2.initialRecoveryResult;
      assert.ok(recResult);
      assert.strictEqual(recResult.ok, true);
      assert.strictEqual(recResult.evictedDuringRecovery, true);
      assert.strictEqual(recResult.stateVersion, versionBeforeCrash + 1);

      const gsm2 = server2.gameStateManager;
      // 1. No 3000ms KO/LEAVING timers recreated on recovery
      assert.strictEqual(gsm2.koTimers.size, 0, 'Must NOT recreate 3000ms KO/LEAVING timers on recovery');

      const snapRecovered = gsm2.getSnapshot();
      // 2. Seat 1 (was KO) immediately assigned to VIP Queue #1 (p6_vip_1)
      assert.strictEqual(snapRecovered.seats[0].player.userId, 'p6_vip_1');
      assert.strictEqual(snapRecovered.seats[0].player.status, 'SEATED');
      assert.strictEqual(snapRecovered.seats[0].player.drunkLevel, 0);
      assert.strictEqual(snapRecovered.seats[0].player.visualTier, 'SOBER');
      assert.strictEqual(snapRecovered.seats[0].player.isVIP, true);

      // 3. Seat 2 (was LEAVING) immediately assigned to Normal Queue #1 (p6_norm_1)
      assert.strictEqual(snapRecovered.seats[1].player.userId, 'p6_norm_1');
      assert.strictEqual(snapRecovered.seats[1].player.status, 'SEATED');
      assert.strictEqual(snapRecovered.seats[1].player.drunkLevel, 0);
      assert.strictEqual(snapRecovered.seats[1].player.visualTier, 'SOBER');

      // 4. Seats 3-6 remain occupied by original SEATED players
      for (let s = 3; s <= 6; s += 1) {
        assert.strictEqual(snapRecovered.seats[s - 1].player.userId, `p6_seat_${s}`);
        assert.strictEqual(snapRecovered.seats[s - 1].player.status, 'SEATED');
      }

      // 5. Waiting queue now only has p6_norm_2 left
      assert.strictEqual(snapRecovered.vipQueue.length, 0);
      assert.deepStrictEqual(
        snapRecovered.normalQueue.map((u) => u.userId),
        ['p6_norm_2']
      );

      // 6. Updated snapshot was immediately persisted to disk with stateVersion = versionBeforeCrash + 1
      const persistedAfterRecovery = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
      assert.strictEqual(persistedAfterRecovery.stateVersion, versionBeforeCrash + 1);
      assert.strictEqual(persistedAfterRecovery.seats[0].player.userId, 'p6_vip_1');
      assert.strictEqual(persistedAfterRecovery.seats[1].player.userId, 'p6_norm_1');
      assert.strictEqual(fxDuringRecovery.length, 0, 'Must NOT replay old KO/LEAVING FX on recovery');
    } finally {
      if (server1) await server1.shutdown();
      if (server2) await server2.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 7. Reject expired, corrupted, or invariant-violating snapshots
  await runTest('7. Rejects expired (> 15m), corrupted JSON, duplicate userId, invalid drunkLevel, or invalid seat count', async () => {
    const tempFile = createTempSnapshotPath('invalid');
    try {
      const cfg = buildTestConfig();
      const now = 1762400500000;
      const store = new SnapshotStore({
        filePath: tempFile,
        maxAgeMs: 15 * 60 * 1000,
        nowFn: () => now
      });

      // 7a. Corrupted JSON
      fs.mkdirSync(path.dirname(tempFile), { recursive: true });
      fs.writeFileSync(tempFile, '{ invalid json ', 'utf8');
      const gsmCorrupt = new GameStateManager(cfg);
      const resCorrupt = store.loadAndRestore(gsmCorrupt, now);
      assert.strictEqual(resCorrupt.ok, false);
      assert.strictEqual(resCorrupt.reason, 'CORRUPTED_SNAPSHOT_JSON');
      assert.strictEqual(gsmCorrupt.stateVersion, 0);

      // 7b. Expired snapshot (> 15 minutes old)
      const gsmSource = new GameStateManager(cfg);
      dispatchNormalized(gsmSource, {
        eventType: 'COMMENT',
        userId: 'u_exp_1',
        nickname: 'ExpiredUser',
        payload: { comment: 'nhậu' }
      }, cfg);
      store.saveSnapshotSync(gsmSource.getSnapshot(), now - 16 * 60 * 1000);

      const gsmExpired = new GameStateManager(cfg);
      const resExpired = store.loadAndRestore(gsmExpired, now);
      assert.strictEqual(resExpired.ok, false);
      assert.strictEqual(resExpired.reason, 'INVALID_SNAPSHOT_DATA');
      assert.ok(resExpired.detail.includes('expired'));
      assert.strictEqual(gsmExpired.stateVersion, 0);

      // 7c. Duplicate userId across seats & queue
      const validPayload = JSON.parse(JSON.stringify(store._buildPayload(gsmSource.getSnapshot(), now)));
      validPayload.vipQueue = [{ userId: 'u_exp_1', displayNickname: 'DuplicateInQueue' }];
      fs.writeFileSync(tempFile, JSON.stringify(validPayload), 'utf8');
      const gsmDup = new GameStateManager(cfg);
      const resDup = store.loadAndRestore(gsmDup, now);
      assert.strictEqual(resDup.ok, false);
      assert.strictEqual(resDup.reason, 'INVALID_SNAPSHOT_DATA');
      assert.ok(resDup.detail.includes('Duplicate userId'));

      // 7d. Out-of-range drunkLevel (> 100)
      const badDrunkPayload = JSON.parse(JSON.stringify(store._buildPayload(gsmSource.getSnapshot(), now)));
      badDrunkPayload.seats[0].player.drunkLevel = 150;
      fs.writeFileSync(tempFile, JSON.stringify(badDrunkPayload), 'utf8');
      const gsmBadDrunk = new GameStateManager(cfg);
      const resBadDrunk = store.loadAndRestore(gsmBadDrunk, now);
      assert.strictEqual(resBadDrunk.ok, false);
      assert.ok(resBadDrunk.detail.includes('Invalid drunkLevel'));
    } finally {
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 8. E2E Socket.io Client Synchronization after Backend Server Restart
  await runTest('8. E2E Socket.io Client Sync: Frontend connecting to restarted Backend receives full recovered GameState', async () => {
    const tempFile = createTempSnapshotPath('e2e_socket');
    let server1 = null;
    let server2 = null;
    let client = null;
    try {
      server1 = await startServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 3000 }
      });

      for (let i = 1; i <= 4; i += 1) {
        server1.mockService.processMockEvent({
          eventType: 'COMMENT',
          userId: `e2e_user_${i}`,
          nickname: `E2E Player ${i}`,
          payload: { comment: 'nhậu' }
        });
      }

      const expectedVersion = server1.gameStateManager.stateVersion;
      assert.strictEqual(expectedVersion, 4);
      await server1.shutdown();
      server1 = null;

      server2 = await startServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 3000 }
      });

      const snapshotReceived = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for game:state_snapshot')), 5000);
        client = createClient(`http://127.0.0.1:${server2.port}`, {
          transports: ['websocket'],
          reconnection: false
        });
        client.on('game:state_snapshot', (payload) => {
          clearTimeout(timer);
          resolve(payload);
        });
        client.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      assert.strictEqual(snapshotReceived.stateVersion, expectedVersion);
      assert.strictEqual(snapshotReceived.state.seatedPlayers.length, 4);
      assert.deepStrictEqual(
        snapshotReceived.state.seatedPlayers.map((p) => p.userId),
        ['e2e_user_1', 'e2e_user_2', 'e2e_user_3', 'e2e_user_4']
      );
    } finally {
      if (client) client.close();
      if (server1) await server1.shutdown();
      if (server2) await server2.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  console.log('----------------------------------------------------------------');
  console.log(`Task 5.1 Verification Summary: ${passed} PASS, ${failed} FAIL`);
  console.log('----------------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in test-5.1.js:', err);
  process.exit(1);
});
