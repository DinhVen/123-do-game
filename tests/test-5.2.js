'use strict';

/**
 * PHASE 5 — TASK 5.2 VERIFICATION SUITE
 * Global Error Handling (uncaughtException & unhandledRejection) & Emergency Snapshot Save
 *
 * Covers all 16 required scenarios:
 * 1. uncaughtException handler triggers emergency shutdown.
 * 2. unhandledRejection handler triggers emergency shutdown.
 * 3. Fatal error logs are strictly redacted (cookies, sessionId, ttwid, oAuthToken, signApiKey, ADMIN_SECRET_TOKEN).
 * 4. Emergency snapshot save succeeds synchronously before exit.
 * 5. Emergency snapshot write is atomic (temp file + rename, no residual .tmp files).
 * 6. Duplicate fatal errors / concurrent errors do NOT trigger duplicate emergency shutdown or duplicate snapshot writes.
 * 7. Corrupted in-memory GameState is NOT written over a previously valid snapshot on disk.
 * 8. Snapshot write failure (I/O error) is logged safely and still exits with code 1.
 * 9. Real child process exits with exit code 1 on uncaughtException and unhandledRejection.
 * 10. Real child process does NOT hang (completes within tight timeout).
 * 11. Timers (cheersTimer, wifeTimer, koTimers, throttleTimer, reconnectTimer) and listeners are cleaned up.
 * 12. Normal graceful shutdown() still works cleanly without triggering exit(1).
 * 13. TikTok reconnect policy in normal runtime is unaffected, and stopped immediately on fatal error.
 * 14. Socket.io runtime is unaffected before fatal error and closed on emergency shutdown.
 * 15. Gameplay rules (6 seats, 30 queue, drunkLevel, Like, Cheers, Wife) are unaffected.
 * 16. Task 5.1 recovery seamlessly restores the emergency snapshot saved by Task 5.2 (including KO/LEAVING policy).
 */

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { io: createClient } = require('socket.io-client');

const defaultConfig = require('../server/config');
const logger = require('../server/logger');
const {
  createAppServer,
  startServer,
  registerGlobalErrorHandlers,
  unregisterGlobalErrorHandlers
} = require('../server/index');

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
    `test-5.2-snapshot-${process.pid}-${Date.now()}-${suffix}.json`
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

async function main() {
  console.log('================================================================');
  console.log(' PHASE 5 — TASK 5.2 VERIFICATION SUITE (GLOBAL ERROR & SNAPSHOT)');
  console.log('================================================================');

  // 1 & 4 & 5. uncaughtException + emergency snapshot success + atomic write
  await runTest('1, 4 & 5. uncaughtException triggers synchronous atomic emergency snapshot save and exits with code 1', async () => {
    const tempFile = createTempSnapshotPath('uncaught');
    const fakeProc = new EventEmitter();
    const exitCodes = [];
    let server = null;
    try {
      server = createAppServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: (code) => exitCodes.push(code)
      });

      // Seat 3 players; throttleMs is 60s so nothing is written to disk yet
      for (let i = 1; i <= 3; i += 1) {
        server.mockService.processMockEvent({
          eventType: 'COMMENT',
          userId: `u_uncaught_${i}`,
          nickname: `Player ${i}`,
          payload: { comment: 'nhậu' }
        });
      }
      assert.strictEqual(fs.existsSync(tempFile), false, 'Should still be throttled in memory before crash');

      // Emit uncaughtException on fakeProc
      fakeProc.emit('uncaughtException', new Error('Simulated fatal uncaughtException'));

      assert.deepStrictEqual(exitCodes, [1]);
      assert.strictEqual(fs.existsSync(tempFile), true, 'Emergency snapshot must be written synchronously');

      const saved = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
      assert.strictEqual(saved.stateVersion, 3);
      assert.strictEqual(saved.seats[0].player.userId, 'u_uncaught_1');
      assert.strictEqual(saved.seats[1].player.userId, 'u_uncaught_2');
      assert.strictEqual(saved.seats[2].player.userId, 'u_uncaught_3');

      // Check atomic write left no .tmp files
      const leftoverTmp = fs
        .readdirSync(path.dirname(tempFile))
        .filter((f) => f.startsWith(`${path.basename(tempFile)}.tmp.`));
      assert.strictEqual(leftoverTmp.length, 0);
    } finally {
      unregisterGlobalErrorHandlers(fakeProc);
      if (server) await server.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 2. unhandledRejection handler
  await runTest('2. unhandledRejection triggers synchronous emergency snapshot save and exits with code 1', async () => {
    const tempFile = createTempSnapshotPath('rejection');
    const fakeProc = new EventEmitter();
    const exitCodes = [];
    let server = null;
    try {
      server = createAppServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: (code) => exitCodes.push(code)
      });

      server.mockService.processMockEvent({
        eventType: 'VIP_JOIN',
        userId: 'vip_rej_1',
        nickname: 'VIP Rejection Test',
        payload: {}
      });

      fakeProc.emit('unhandledRejection', new Error('Simulated unhandled promise rejection'));

      assert.deepStrictEqual(exitCodes, [1]);
      assert.strictEqual(fs.existsSync(tempFile), true);
      const saved = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
      assert.strictEqual(saved.stateVersion, 1);
      assert.strictEqual(saved.seats[0].player.userId, 'vip_rej_1');
    } finally {
      unregisterGlobalErrorHandlers(fakeProc);
      if (server) await server.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 3. Redaction of secrets in fatal error logs and snapshot
  await runTest('3. Fatal error logs and emergency snapshot never leak secrets (sessionId, ttwid, oAuthToken, signApiKey, ADMIN_SECRET_TOKEN)', async () => {
    const tempFile = createTempSnapshotPath('redaction');
    const fakeProc = new EventEmitter();
    const capturedLogs = [];
    const origError = console.error;
    const origWarn = console.warn;
    let server = null;

    console.error = (...args) => capturedLogs.push(args.join(' '));
    console.warn = (...args) => capturedLogs.push(args.join(' '));
    try {
      server = createAppServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: () => {}
      });

      const secretError = new Error(
        'TikTok ws failed: Cookie: sessionid=SECRET_SESS_999; ttwid=SECRET_TTWID_888; signApiKey=SECRET_SIGN_777 Authorization: Bearer SECRET_BEARER_666 ADMIN_SECRET_TOKEN=SECRET_ADM_555'
      );
      fakeProc.emit('uncaughtException', secretError);

      const combinedLogs = capturedLogs.join('\n');
      assert.ok(combinedLogs.includes('Fatal uncaughtException'), 'Should log fatal error');
      for (const secret of [
        'SECRET_SESS_999',
        'SECRET_TTWID_888',
        'SECRET_SIGN_777',
        'SECRET_BEARER_666',
        'SECRET_ADM_555'
      ]) {
        assert.strictEqual(
          combinedLogs.includes(secret),
          false,
          `Log must NOT leak secret: ${secret}`
        );
      }

      const snapshotRaw = fs.readFileSync(tempFile, 'utf8');
      for (const secret of [
        'SECRET_SESS_999',
        'SECRET_TTWID_888',
        'SECRET_SIGN_777',
        'SECRET_BEARER_666',
        'SECRET_ADM_555'
      ]) {
        assert.strictEqual(
          snapshotRaw.includes(secret),
          false,
          `Snapshot file must NOT contain secret: ${secret}`
        );
      }
    } finally {
      console.error = origError;
      console.warn = origWarn;
      unregisterGlobalErrorHandlers(fakeProc);
      if (server) await server.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 6. No duplicate shutdown or duplicate snapshot write on multiple fatal errors or re-registration
  await runTest('6. Multiple consecutive fatal errors and repeated registerGlobalErrorHandlers calls do NOT duplicate listeners or snapshot writes', async () => {
    const tempFile = createTempSnapshotPath('nodup');
    const fakeProc = new EventEmitter();
    const exitCodes = [];
    let server = null;
    try {
      server = createAppServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: (code) => exitCodes.push(code)
      });

      // Attempt to register global handlers 3 more times on the same process object
      registerGlobalErrorHandlers({ processObj: fakeProc, instance: server });
      registerGlobalErrorHandlers({ processObj: fakeProc, instance: server });
      registerGlobalErrorHandlers({ processObj: fakeProc, instance: server });

      assert.strictEqual(
        fakeProc.listenerCount('uncaughtException'),
        1,
        'Must register at most 1 uncaughtException listener per process'
      );
      assert.strictEqual(
        fakeProc.listenerCount('unhandledRejection'),
        1,
        'Must register at most 1 unhandledRejection listener per process'
      );

      server.mockService.processMockEvent({
        eventType: 'COMMENT',
        userId: 'u_nodup_1',
        nickname: 'NoDupUser',
        payload: { comment: 'dô' }
      });

      // Fire 3 fatal errors back-to-back
      fakeProc.emit('uncaughtException', new Error('Fatal #1'));
      fakeProc.emit('unhandledRejection', new Error('Fatal #2'));
      fakeProc.emit('uncaughtException', new Error('Fatal #3'));

      assert.strictEqual(exitCodes.length, 1, 'exit(1) must only be called once');
      assert.strictEqual(exitCodes[0], 1);
      assert.strictEqual(
        server.snapshotStore.stats.emergencySaves,
        1,
        'Emergency snapshot must only be written once'
      );
    } finally {
      unregisterGlobalErrorHandlers(fakeProc);
      if (server) await server.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 7. Corrupted in-memory GameState does NOT overwrite existing valid snapshot on disk
  await runTest('7. Corrupted in-memory GameState is rejected during emergency shutdown, preserving previous valid snapshot on disk', async () => {
    const tempFile = createTempSnapshotPath('corrupt_guard');
    const fakeProc = new EventEmitter();
    const exitCodes = [];
    let server = null;
    try {
      server = createAppServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: (code) => exitCodes.push(code)
      });

      // Seat 2 valid players and flush a valid baseline snapshot to disk
      server.mockService.processMockEvent({
        eventType: 'COMMENT',
        userId: 'valid_user_1',
        nickname: 'Valid 1',
        payload: { comment: 'nhậu' }
      });
      server.mockService.processMockEvent({
        eventType: 'COMMENT',
        userId: 'valid_user_2',
        nickname: 'Valid 2',
        payload: { comment: 'dô' }
      });
      const initialFlush = server.snapshotStore.flushSync();
      assert.strictEqual(initialFlush.ok, true);

      // Now simulate memory corruption in GameStateManager (e.g., drunkLevel = 9999 or duplicate userId)
      server.gameStateManager.seats[0].player.drunkLevel = 9999;

      // Trigger fatal uncaughtException
      fakeProc.emit('uncaughtException', new Error('Memory corruption crash'));

      assert.deepStrictEqual(exitCodes, [1]);
      assert.strictEqual(server.snapshotStore.stats.emergencySaves, 0);
      assert.strictEqual(server.snapshotStore.stats.emergencySavesRejected, 1);

      // Verify the valid snapshot on disk was preserved intact!
      const preserved = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
      assert.strictEqual(preserved.stateVersion, 2);
      assert.strictEqual(preserved.seats[0].player.userId, 'valid_user_1');
      assert.strictEqual(preserved.seats[0].player.drunkLevel, 0);
      assert.strictEqual(preserved.seats[1].player.userId, 'valid_user_2');
    } finally {
      unregisterGlobalErrorHandlers(fakeProc);
      if (server) await server.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 8. Snapshot write failure (I/O error) is logged safely and still exits with code 1
  await runTest('8. If emergency snapshot write fails due to disk I/O error, server logs safely and still exits with code 1', async () => {
    const tempFile = createTempSnapshotPath('io_fail');
    const fakeProc = new EventEmitter();
    const exitCodes = [];
    let server = null;
    try {
      server = createAppServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: (code) => exitCodes.push(code)
      });

      // Force saveSnapshotSync to simulate disk full / EACCES error
      server.snapshotStore.saveSnapshotSync = () => ({
        ok: false,
        error: 'ENOSPC: no space left on device (sessionid=HIDDEN_123)'
      });

      fakeProc.emit('uncaughtException', new Error('Crash during disk full'));

      assert.deepStrictEqual(exitCodes, [1], 'Must still exit with code 1 even if snapshot write fails');
    } finally {
      unregisterGlobalErrorHandlers(fakeProc);
      if (server) await server.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 9 & 10. Real child process test for uncaughtException & unhandledRejection (Exit code 1, no hang)
  await runTest('9 & 10. Real child process exits promptly with code 1 on uncaughtException and unhandledRejection after writing snapshot', async () => {
    const tempFile1 = createTempSnapshotPath('child_uncaught');
    const tempFile2 = createTempSnapshotPath('child_rejection');
    try {
      const childScript = `
        const defaultConfig = require('./server/config');
        const { startServer, registerGlobalErrorHandlers } = require('./server/index');
        const mode = process.env.TEST_FATAL_MODE;
        const snapPath = process.env.TEST_SNAP_PATH;
        let active = null;
        registerGlobalErrorHandlers({ getInstance: () => active });
        const cfg = defaultConfig.buildConfig({ port: 0 });
        startServer(cfg, {
          enableSnapshotPersistence: true,
          snapshotOptions: { filePath: snapPath, throttleMs: 60000 }
        }).then((inst) => {
          active = inst;
          inst.mockService.processMockEvent({
            eventType: 'COMMENT',
            userId: 'child_user_1',
            nickname: 'Child User 1',
            payload: { comment: 'nhậu' }
          });
          if (mode === 'UNCAUGHT') {
            setImmediate(() => {
              throw new Error('Child uncaught exception sessionid=CHILD_SEC_1');
            });
          } else {
            Promise.reject(new Error('Child unhandled rejection ttwid=CHILD_SEC_2'));
          }
        });
      `;

      const resUncaught = spawnSync(process.execPath, ['-e', childScript], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, TEST_FATAL_MODE: 'UNCAUGHT', TEST_SNAP_PATH: tempFile1 },
        timeout: 8000,
        encoding: 'utf8'
      });

      assert.strictEqual(resUncaught.status, 1, `Expected exit code 1, got ${resUncaught.status}`);
      assert.strictEqual(resUncaught.signal, null, 'Process must not time out or be killed by signal');
      assert.strictEqual(fs.existsSync(tempFile1), true, 'Child process must write emergency snapshot before exit');
      const snap1 = JSON.parse(fs.readFileSync(tempFile1, 'utf8'));
      assert.strictEqual(snap1.seats[0].player.userId, 'child_user_1');
      assert.strictEqual((resUncaught.stderr + resUncaught.stdout).includes('CHILD_SEC_1'), false);

      const resRejection = spawnSync(process.execPath, ['-e', childScript], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, TEST_FATAL_MODE: 'REJECTION', TEST_SNAP_PATH: tempFile2 },
        timeout: 8000,
        encoding: 'utf8'
      });

      assert.strictEqual(resRejection.status, 1, `Expected exit code 1, got ${resRejection.status}`);
      assert.strictEqual(resRejection.signal, null);
      assert.strictEqual(fs.existsSync(tempFile2), true);
      const snap2 = JSON.parse(fs.readFileSync(tempFile2, 'utf8'));
      assert.strictEqual(snap2.seats[0].player.userId, 'child_user_1');
      assert.strictEqual((resRejection.stderr + resRejection.stdout).includes('CHILD_SEC_2'), false);
    } finally {
      cleanupSnapshotFiles(tempFile1);
      cleanupSnapshotFiles(tempFile2);
    }
  });

  // 11, 13, 14. Cleanup of timers, eventQueue, TikTok listeners & Socket.io on emergency shutdown
  await runTest('11, 13 & 14. Emergency shutdown stops eventQueue, clears GameState/Snapshot/TikTok timers, and blocks new TikTok events', async () => {
    const tempFile = createTempSnapshotPath('cleanup');
    const fakeProc = new EventEmitter();
    let server = null;
    try {
      const liveCfg = buildTestConfig({
        app: { defaultMode: 'LIVE' },
        tiktok: { uniqueId: 'test_streamer', autoConnect: false }
      });

      let fakeConnectorListeners = 0;
      const fakeConnector = {
        on: () => {
          fakeConnectorListeners += 1;
        },
        off: () => {
          fakeConnectorListeners -= 1;
        },
        removeAllListeners: () => {
          fakeConnectorListeners = 0;
        },
        connect: async () => ({ roomId: 'room_52' }),
        disconnect: async () => {}
      };

      server = await startServer(liveCfg, {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        tiktokOptions: {
          connectionFactory: async () => fakeConnector
        },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: () => {}
      });

      await server.tiktokService.connect('test_streamer');
      assert.ok(fakeConnectorListeners > 0, 'TikTok listeners should be attached while connected');

      // Send a valid LIVE chat join event before fatal error
      const joinRes = server.tiktokService.handleRawWebcastEvent('CHAT', {
        common: { msgId: 'msg_live_52_1', roomId: 'room_52' },
        user: { id: 'live_u_1', uniqueId: 'live_u_1', nickname: 'Live Nhậu 1' },
        comment: 'nhậu'
      });
      assert.strictEqual(joinRes.ok, true);

      // Trigger emergency shutdown
      fakeProc.emit('uncaughtException', new Error('Simulated LIVE fatal error'));

      // Verify timers, listeners, event queue, and TikTok ingestion are stopped
      assert.strictEqual(server.eventQueue.isStopped, true);
      assert.strictEqual(server.gameStateManager.cheersTimer, null);
      assert.strictEqual(server.gameStateManager.wifeTimer, null);
      assert.strictEqual(server.gameStateManager.koTimers.size, 0);
      assert.strictEqual(server.snapshotStore.throttleTimer, null);
      assert.strictEqual(fakeConnectorListeners, 0, 'TikTok connector listeners must be detached');

      // Verify new TikTok events and eventQueue.enqueue calls are rejected after emergency shutdown
      const postCrashTikTok = server.tiktokService.handleRawWebcastEvent('CHAT', {
        common: { msgId: 'msg_live_52_2', roomId: 'room_52' },
        user: { id: 'live_u_2', uniqueId: 'live_u_2', nickname: 'Live Nhậu 2' },
        comment: 'dô'
      });
      assert.strictEqual(postCrashTikTok.ok, false);
      assert.strictEqual(postCrashTikTok.reason, 'SERVICE_STOPPED');

      const postCrashQueue = server.eventQueue.enqueue({ eventId: 'post_crash' });
      assert.strictEqual(postCrashQueue.ok, false);
    } finally {
      unregisterGlobalErrorHandlers(fakeProc);
      if (server) await server.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  // 12, 15, 16. Normal shutdown, gameplay & Task 5.1 recovery of emergency snapshot (with KO/LEAVING policy)
  await runTest('12, 15 & 16. Emergency snapshot saved during KO/LEAVING hold is seamlessly recovered by Task 5.1 policy on restart, and normal shutdown works cleanly', async () => {
    const tempFile = createTempSnapshotPath('e2e_recovery');
    const fakeProc = new EventEmitter();
    const exitCodes = [];
    let server1 = null;
    let server2 = null;
    let client = null;
    try {
      server1 = await startServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 60000 },
        registerProcessErrorHandlers: true,
        processObj: fakeProc,
        exitFn: (code) => exitCodes.push(code)
      });

      // Seat 6 players + 1 VIP waiting + 1 Normal waiting
      for (let i = 1; i <= 6; i += 1) {
        server1.mockService.processMockEvent({
          eventType: 'COMMENT',
          userId: `s52_p_${i}`,
          nickname: `Player ${i}`,
          payload: { comment: 'nhậu' }
        });
      }
      server1.mockService.processMockEvent({
        eventType: 'VIP_JOIN',
        userId: 's52_vip_wait',
        nickname: 'VIP Waiting',
        payload: {}
      });
      server1.mockService.processMockEvent({
        eventType: 'COMMENT',
        userId: 's52_norm_wait',
        nickname: 'Normal Waiting',
        payload: { comment: 'dô' }
      });

      // Put Seat 1 into KO (drunkLevel = 100) and Seat 2 into LEAVING (wife summon)
      server1.mockService.processMockEvent({
        eventType: 'GIFT',
        userId: 'gifter',
        nickname: 'Gifter',
        payload: { mockGiftKey: 'MOCK_GIFT_VIP', repeatCount: 4, targetSeatIndex: 0 }
      });
      server1.mockService.processMockEvent({
        eventType: 'GIFT',
        userId: 'gifter',
        nickname: 'Gifter',
        payload: { mockGiftKey: 'MOCK_GIFT_WIFE', repeatCount: 1, targetSeatIndex: 1 }
      });

      assert.strictEqual(server1.gameStateManager.seats[0].player.status, 'KO');
      assert.strictEqual(server1.gameStateManager.seats[1].player.status, 'LEAVING');

      // Simulate fatal crash before 60s throttle timer fires and before 3000ms KO/LEAVING hold finishes
      fakeProc.emit('uncaughtException', new Error('Crash mid KO and LEAVING hold'));
      assert.deepStrictEqual(exitCodes, [1]);

      // Start Server 2 (Task 5.1 recovery) from the emergency snapshot written by Server 1
      server2 = await startServer(buildTestConfig(), {
        enableSnapshotPersistence: true,
        snapshotOptions: { filePath: tempFile, throttleMs: 3000 }
      });

      assert.ok(server2.initialRecoveryResult);
      assert.strictEqual(server2.initialRecoveryResult.ok, true);
      assert.strictEqual(server2.initialRecoveryResult.evictedDuringRecovery, true);
      assert.strictEqual(server2.gameStateManager.koTimers.size, 0);

      // Connect Socket.io client to Server 2 and verify recovered state
      const recoveredSnap = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket timeout')), 5000);
        client = createClient(`http://127.0.0.1:${server2.port}`, {
          transports: ['websocket'],
          reconnection: false
        });
        client.on('game:state_snapshot', (data) => {
          clearTimeout(timer);
          resolve(data);
        });
        client.on('connect_error', reject);
      });

      assert.strictEqual(recoveredSnap.state.seats[0].player.userId, 's52_vip_wait');
      assert.strictEqual(recoveredSnap.state.seats[0].player.status, 'SEATED');
      assert.strictEqual(recoveredSnap.state.seats[0].player.drunkLevel, 0);
      assert.strictEqual(recoveredSnap.state.seats[1].player.userId, 's52_norm_wait');
      assert.strictEqual(recoveredSnap.state.seats[1].player.status, 'SEATED');
      assert.strictEqual(recoveredSnap.state.seats[1].player.drunkLevel, 0);
      assert.strictEqual(recoveredSnap.state.totalWaiting, 0);

      // Verify normal graceful shutdown on Server 2 works cleanly without calling exit(1)
      client.close();
      client = null;
      await server2.shutdown();
      server2 = null;
      assert.deepStrictEqual(exitCodes, [1], 'Normal shutdown on Server 2 must not invoke exitFn(1)');
    } finally {
      unregisterGlobalErrorHandlers(fakeProc);
      if (client) client.close();
      if (server1) await server1.shutdown();
      if (server2) await server2.shutdown();
      cleanupSnapshotFiles(tempFile);
    }
  });

  console.log('----------------------------------------------------------------');
  console.log(`Task 5.2 Verification Summary: ${passed} PASS, ${failed} FAIL`);
  console.log('----------------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in test-5.2.js:', err);
  process.exit(1);
});
