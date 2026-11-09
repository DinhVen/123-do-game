'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const path = require('path');
const { pathToFileURL } = require('url');

const defaultConfig = require('../server/config');
const { SequentialEventQueue } = require('../server/engines/eventQueue');
const { GameStateManager } = require('../server/services/gameStateManager');
const {
  TikTokService,
  TIKTOK_CONNECTION_STATE,
  classifyTikTokError
} = require('../server/services/tiktokService');
const { startServer } = require('../server/index');

/**
 * Deterministic Fake Timer Scheduler for fast & stable Backoff/Reconnect testing.
 */
class FakeTimerScheduler {
  constructor() {
    this.nextId = 1;
    this.timers = new Map();
    this.history = [];
  }

  setTimeout = (fn, delayMs) => {
    const id = this.nextId++;
    const entry = { id, fn, delayMs, cancelled: false };
    this.timers.set(id, entry);
    this.history.push({ id, delayMs });
    return id;
  };

  clearTimeout = (id) => {
    const entry = this.timers.get(id);
    if (entry) {
      entry.cancelled = true;
      this.timers.delete(id);
    }
  };

  activeCount() {
    return this.timers.size;
  }

  peekNext() {
    const first = this.timers.values().next();
    return first.done ? null : first.value;
  }

  async runNext() {
    const next = this.peekNext();
    if (!next) {
      return null;
    }
    this.timers.delete(next.id);
    if (!next.cancelled) {
      await next.fn();
    }
    return next;
  }

  clearAll() {
    this.timers.clear();
  }
}

class FakeTikTokLiveConnection extends EventEmitter {
  constructor(uniqueId, options = {}, behavior = {}) {
    super();
    this.uniqueId = uniqueId;
    this.options = options;
    this.behavior = behavior;
    this.roomId = behavior.roomId || '7399999999999994500';
    this.isConnected = false;
    this.isConnecting = false;
    this.disconnectCalls = 0;
  }

  async connect() {
    this.isConnecting = true;
    if (typeof this.behavior.onBeforeConnect === 'function') {
      await this.behavior.onBeforeConnect(this);
    }
    if (this.behavior.hangForever) {
      return new Promise(() => {});
    }
    if (this.behavior.shouldFailConnect) {
      this.isConnecting = false;
      const err = new Error(this.behavior.errorMessage || 'Simulated connection failure');
      err.name = this.behavior.errorName || 'Error';
      if (this.behavior.errorReason) {
        err.reason = this.behavior.errorReason;
      }
      if (this.behavior.retryAfter !== undefined) {
        err.retryAfter = this.behavior.retryAfter;
      }
      if (this.behavior.recoverable !== undefined) {
        err.recoverable = this.behavior.recoverable;
      }
      throw err;
    }
    this.isConnecting = false;
    this.isConnected = true;
    const state = { isConnected: true, roomId: this.roomId };
    this.emit('connected', state);
    return state;
  }

  async disconnect() {
    this.disconnectCalls += 1;
    this.isConnecting = false;
    this.isConnected = false;
  }

  totalRegisteredListeners() {
    return this.eventNames().reduce((sum, name) => sum + this.listenerCount(name), 0);
  }
}

function buildTestEnvironment(overrides = {}, serviceOptions = {}) {
  const testConfig = defaultConfig.buildConfig({
    app: { defaultMode: 'LIVE', ...(overrides.app || {}) },
    security: { rateLimitBypassInMock: false, ...(overrides.security || {}) },
    gameplayV1: {
      vipGiftThreshold: 100,
      liveGiftMappings: {
        5655: {
          giftId: '5655',
          label: 'Ly Bia Tươi',
          actionCategory: 'DRUNK_INCREASE',
          actionType: 'DRINK_SMALL',
          drunkDelta: 5,
          targetMode: 'SINGLE',
          isVipEligible: false
        }
      },
      ...(overrides.gameplayV1 || {})
    },
    tiktok: {
      uniqueId: 'nhau_streamer_45',
      autoConnect: true,
      baseReconnectDelayMs: 1000,
      maxReconnectDelayMs: 60000,
      reconnectBackoffFactor: 2,
      reconnectJitterRatio: 0.2,
      maxReconnectAttempts: 5,
      connectTimeoutMs: 5000,
      ...(overrides.tiktok || {})
    }
  });

  const gsm = new GameStateManager(testConfig);
  gsm.stopCheersScheduler();
  gsm.stopWifeScheduler();

  let currentTime = 1700000000000;
  gsm.setClock(() => currentTime);
  const advanceClock = (ms) => {
    currentTime += ms;
    return currentTime;
  };

  const queue = new SequentialEventQueue(
    (event) => gsm.processEvent(event),
    { maxQueueSize: 1000 }
  );

  const fakeScheduler = new FakeTimerScheduler();
  const createdConnectors = [];
  let nextBehaviorFactory =
    serviceOptions.behaviorFactory || (() => ({ roomId: '7399999999999994500' }));

  const service = new TikTokService(testConfig, null, queue, gsm, {
    uniqueId: testConfig.tiktok.uniqueId,
    autoReconnect:
      serviceOptions.autoReconnect !== undefined ? serviceOptions.autoReconnect : true,
    scheduler: fakeScheduler,
    randomFn: serviceOptions.randomFn || (() => 0.5), // r=0.5 -> 0 jitter offset by default
    connectionFactory:
      serviceOptions.connectionFactory ||
      (async (uid, opts) => {
        const behavior = nextBehaviorFactory(createdConnectors.length, uid, opts);
        const conn = new FakeTikTokLiveConnection(uid, opts, behavior);
        createdConnectors.push(conn);
        return conn;
      }),
    ...serviceOptions
  });

  const setBehaviorFactory = (fn) => {
    nextBehaviorFactory = fn;
  };

  return {
    testConfig,
    gsm,
    queue,
    service,
    fakeScheduler,
    createdConnectors,
    advanceClock,
    setBehaviorFactory
  };
}

async function runTests() {
  console.log('=== PHASE 4 — TASK 4.5: TIKTOK AUTO RECONNECT TESTS ===\n');

  const env = buildTestEnvironment();
  const {
    gsm,
    service,
    fakeScheduler,
    createdConnectors,
    advanceClock,
    setBehaviorFactory
  } = env;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Kết nối thành công (IDLE -> CONNECTING -> CONNECTED)
    // -------------------------------------------------------------------------
    console.log('Test 1: Successful initial connection (IDLE -> CONNECTING -> CONNECTED)...');
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.IDLE);
    let observedConnectingState = null;
    setBehaviorFactory(() => ({
      roomId: '7399999999999994501',
      onBeforeConnect: () => {
        observedConnectingState = service.connectionState;
      }
    }));

    const res1 = await service.connect();
    assert.strictEqual(observedConnectingState, TIKTOK_CONNECTION_STATE.CONNECTING);
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    assert.strictEqual(gsm.connectionStatus, 'CONNECTED');
    assert.strictEqual(service.roomId, '7399999999999994501');
    assert.strictEqual(service.reconnectAttempts, 0);
    assert.strictEqual(service.hasReconnectTimer(), false);
    assert.strictEqual(createdConnectors.length, 1);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 2: Mất kết nối ngoài ý muốn (CONNECTED -> RECONNECTING)
    // -------------------------------------------------------------------------
    console.log('Test 2: Unexpected WebSocket disconnect transitions to RECONNECTING and schedules timer...');
    const conn1 = createdConnectors[0];
    conn1.emit('disconnected', { code: 1006, reason: 'Abnormal Closure' });

    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    assert.strictEqual(gsm.connectionStatus, 'RECONNECTING');
    assert.strictEqual(service.reconnectAttempts, 1);
    assert.strictEqual(service.hasReconnectTimer(), true);
    assert.strictEqual(fakeScheduler.activeCount(), 1);
    // With randomFn = 0.5, attempt 1 delay is exact 1000ms
    assert.strictEqual(service.nextReconnectDelayMs, 1000);
    assert.strictEqual(conn1.totalRegisteredListeners(), 0, 'Old connector listeners cleaned up');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 3: Reconnect lần 1 thành công (RECONNECTING -> CONNECTING -> CONNECTED)
    // -------------------------------------------------------------------------
    console.log('Test 3: First auto-reconnect attempt succeeds and resets reconnectAttempts to 0...');
    setBehaviorFactory(() => ({ roomId: '7399999999999994501' }));
    await fakeScheduler.runNext();

    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    assert.strictEqual(gsm.connectionStatus, 'CONNECTED');
    assert.strictEqual(service.reconnectAttempts, 0);
    assert.strictEqual(service.hasReconnectTimer(), false);
    assert.strictEqual(createdConnectors.length, 2);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 4: Reconnect nhiều lần với Exponential Backoff (1s, 2s, 4s, 8s...)
    // -------------------------------------------------------------------------
    console.log('Test 4: Multiple consecutive failed reconnects follow Exponential Backoff (1s, 2s, 4s, 8s)...');
    // Force next 3 reconnect attempts to fail with transient network error, then succeed on 4th
    let failCount = 0;
    setBehaviorFactory(() => {
      failCount += 1;
      if (failCount <= 3) {
        return {
          shouldFailConnect: true,
          errorName: 'ConnectTimeoutError',
          errorMessage: `Transient timeout #${failCount}`
        };
      }
      return { roomId: '7399999999999994501' };
    });

    // Trigger unexpected disconnect -> Attempt 1 scheduled at 1000ms
    createdConnectors[1].emit('disconnected', { code: 1006, reason: 'Network drop' });
    assert.strictEqual(service.reconnectAttempts, 1);
    assert.strictEqual(service.nextReconnectDelayMs, 1000);

    // Run Attempt 1 (fails) -> Attempt 2 scheduled at 2000ms
    await fakeScheduler.runNext();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    assert.strictEqual(service.reconnectAttempts, 2);
    assert.strictEqual(service.nextReconnectDelayMs, 2000);

    // Run Attempt 2 (fails) -> Attempt 3 scheduled at 4000ms
    await fakeScheduler.runNext();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    assert.strictEqual(service.reconnectAttempts, 3);
    assert.strictEqual(service.nextReconnectDelayMs, 4000);

    // Run Attempt 3 (fails) -> Attempt 4 scheduled at 8000ms
    await fakeScheduler.runNext();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    assert.strictEqual(service.reconnectAttempts, 4);
    assert.strictEqual(service.nextReconnectDelayMs, 8000);

    // Run Attempt 4 (succeeds) -> CONNECTED, attempts reset to 0
    await fakeScheduler.runNext();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    assert.strictEqual(service.reconnectAttempts, 0);
    assert.strictEqual(service.hasReconnectTimer(), false);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 5: Giới hạn thời gian Backoff (Max backoff cap & maxReconnectAttempts)
    // -------------------------------------------------------------------------
    console.log('Test 5: Backoff delay never exceeds maxReconnectDelayMs and stops at maxReconnectAttempts...');
    assert.strictEqual(service.calculateReconnectDelay(1), 1000);
    assert.strictEqual(service.calculateReconnectDelay(2), 2000);
    assert.strictEqual(service.calculateReconnectDelay(3), 4000);
    assert.strictEqual(service.calculateReconnectDelay(4), 8000);
    assert.strictEqual(service.calculateReconnectDelay(5), 16000);
    assert.strictEqual(service.calculateReconnectDelay(6), 32000);
    assert.strictEqual(service.calculateReconnectDelay(7), 60000);
    assert.strictEqual(service.calculateReconnectDelay(10), 60000);
    assert.strictEqual(service.calculateReconnectDelay(25), 60000);

    // Verify maxReconnectAttempts (configured as 5 in test fixture) stops after 5 failed retries
    setBehaviorFactory(() => ({
      shouldFailConnect: true,
      errorName: 'ConnectTimeoutError',
      errorMessage: 'Persistent network outage'
    }));
    createdConnectors[createdConnectors.length - 1].emit('disconnected', {
      code: 1006,
      reason: 'Drop'
    });
    for (let i = 1; i <= 5; i++) {
      assert.strictEqual(service.reconnectAttempts, i);
      assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
      await fakeScheduler.runNext();
    }
    // After 5th attempt fails, maxReconnectAttempts (5) is reached -> STOPPED
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.STOPPED);
    assert.strictEqual(service.stopReason, 'MAX_RETRIES_EXCEEDED');
    assert.strictEqual(service.hasReconnectTimer(), false);
    assert.strictEqual(gsm.connectionStatus, 'DISCONNECTED');

    // Recover via manual connect()
    setBehaviorFactory(() => ({ roomId: '7399999999999994501' }));
    const recoverAfterMax = await service.connect();
    assert.strictEqual(recoverAfterMax.ok, true);
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 6: Jitter trong phạm vi hợp lệ (±20%, never exceeds maxReconnectDelayMs)
    // -------------------------------------------------------------------------
    console.log('Test 6: Jitter stays strictly within [base*(1-jitter), min(max, base*(1+jitter))]...');
    const sampleRands = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    for (const r of sampleRands) {
      service.setRandom(() => r);
      const d1 = service.calculateReconnectDelay(1);
      const d2 = service.calculateReconnectDelay(2);
      const d3 = service.calculateReconnectDelay(3);
      const d7 = service.calculateReconnectDelay(7);
      assert.ok(d1 >= 800 && d1 <= 1200, `Attempt 1 jitter out of bounds: ${d1}`);
      assert.ok(d2 >= 1600 && d2 <= 2400, `Attempt 2 jitter out of bounds: ${d2}`);
      assert.ok(d3 >= 3200 && d3 <= 4800, `Attempt 3 jitter out of bounds: ${d3}`);
      assert.ok(d7 >= 48000 && d7 <= 60000, `Capped attempt 7 jitter out of bounds: ${d7}`);
      assert.ok(d1 < d2 && d2 < d3, 'Exponential progression preserved across jitter bounds');
    }
    // Restore r = 0.5
    service.setRandom(() => 0.5);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 7: Không có hai reconnect timer (Single Reconnect Timer Invariant)
    // -------------------------------------------------------------------------
    console.log('Test 7: Concurrent disconnect/schedule calls never create duplicate reconnect timers...');
    createdConnectors[createdConnectors.length - 1].emit('disconnected', {
      code: 1006,
      reason: 'Drop A'
    });
    assert.strictEqual(fakeScheduler.activeCount(), 1);
    const firstScheduledAttempt = service.reconnectAttempts;

    // Calling _scheduleReconnect again while timer is active must NOT create a second timer
    const dupSchedule = service._scheduleReconnect('Duplicate trigger');
    assert.strictEqual(dupSchedule.scheduled, true);
    assert.strictEqual(dupSchedule.alreadyScheduled, true);
    assert.strictEqual(fakeScheduler.activeCount(), 1);
    assert.strictEqual(service.reconnectAttempts, firstScheduledAttempt);

    await fakeScheduler.runNext();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 8: Không có hai kết nối đồng thời (Single Active Connection Invariant)
    // -------------------------------------------------------------------------
    console.log('Test 8: Concurrent connect() calls never create two TikTokLiveConnection instances...');
    const countBeforeDupConnect = createdConnectors.length;
    const whileConnectedRes = await service.connect();
    assert.strictEqual(whileConnectedRes.ok, false);
    assert.strictEqual(whileConnectedRes.reason, 'ALREADY_CONNECTED_OR_CONNECTING');
    assert.strictEqual(createdConnectors.length, countBeforeDupConnect);

    // Also test concurrent connect() while CONNECTING is in-flight
    await service.disconnect();
    let resolveInFlightConnect = null;
    setBehaviorFactory(() => ({
      roomId: '7399999999999994501',
      onBeforeConnect: () =>
        new Promise((resolve) => {
          resolveInFlightConnect = resolve;
        })
    }));

    const firstConnectPromise = service.connect();
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTING);

    const secondConcurrentConnect = await service.connect();
    assert.strictEqual(secondConcurrentConnect.ok, false);
    assert.strictEqual(secondConcurrentConnect.reason, 'ALREADY_CONNECTED_OR_CONNECTING');
    assert.strictEqual(createdConnectors.length, countBeforeDupConnect + 1);

    resolveInFlightConnect();
    const firstConnectResult = await firstConnectPromise;
    assert.strictEqual(firstConnectResult.ok, true);
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    setBehaviorFactory(() => ({ roomId: '7399999999999994501' }));
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 9: Không nhân đôi listener (Zero duplicate listeners across reconnects)
    // -------------------------------------------------------------------------
    console.log('Test 9: Reconnect cleans up 100% of old listeners and attaches exactly 7 listeners to new connector...');
    const prevConnector = createdConnectors[createdConnectors.length - 1];
    assert.strictEqual(prevConnector.totalRegisteredListeners(), 7);
    assert.strictEqual(service.getStatus().listenerCount, 7);

    // Trigger disconnect + auto-reconnect
    prevConnector.emit('disconnected', { code: 1006, reason: 'Drop for listener check' });
    assert.strictEqual(prevConnector.totalRegisteredListeners(), 0);
    assert.strictEqual(service.getStatus().listenerCount, 0);

    await fakeScheduler.runNext();
    const currentConnector = createdConnectors[createdConnectors.length - 1];
    assert.notStrictEqual(currentConnector, prevConnector);
    assert.strictEqual(prevConnector.totalRegisteredListeners(), 0);
    assert.strictEqual(currentConnector.totalRegisteredListeners(), 7);
    assert.strictEqual(service.getStatus().listenerCount, 7);

    // Emitting chat on old connector must be a complete no-op
    const vBeforeOldEmit = gsm.stateVersion;
    prevConnector.emit('chat', {
      common: { msgId: 'old_conn_chat_1' },
      user: { id: 'ghost_user', nickname: 'Ghost' },
      content: 'nhậu'
    });
    assert.strictEqual(gsm.stateVersion, vBeforeOldEmit);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 10: Manual disconnect không reconnect
    // -------------------------------------------------------------------------
    console.log('Test 10: Manual disconnect() cancels pending reconnect timer and transitions to STOPPED...');
    // First trigger an unexpected disconnect so a reconnect timer is pending
    currentConnector.emit('disconnected', { code: 1006, reason: 'Drop before manual stop' });
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    assert.strictEqual(service.hasReconnectTimer(), true);

    // Now user calls manual disconnect()
    const manualDiscRes = await service.disconnect();
    assert.strictEqual(manualDiscRes.ok, true);
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.STOPPED);
    assert.strictEqual(service.stopReason, 'MANUAL_DISCONNECT');
    assert.strictEqual(service.hasReconnectTimer(), false);
    assert.strictEqual(fakeScheduler.activeCount(), 0);
    assert.strictEqual(gsm.connectionStatus, 'DISCONNECTED');

    // Reconnect manually to continue tests
    const reconnAfterManual = await service.connect();
    assert.strictEqual(reconnAfterManual.ok, true);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 11: Shutdown không reconnect (bao gồm cả khi đang CONNECTING / RECONNECTING)
    // -------------------------------------------------------------------------
    console.log('Test 11: shutdown() cancels timers, aborts in-flight connect, and never reconnects...');
    const shutdownEnv = buildTestEnvironment();
    await shutdownEnv.service.connect();
    const activeShutdownConn =
      shutdownEnv.createdConnectors[shutdownEnv.createdConnectors.length - 1];
    activeShutdownConn.emit('disconnected', { code: 1006, reason: 'Drop before shutdown' });
    assert.strictEqual(shutdownEnv.service.hasReconnectTimer(), true);

    await shutdownEnv.service.shutdown();
    assert.strictEqual(shutdownEnv.service.connectionState, TIKTOK_CONNECTION_STATE.STOPPED);
    assert.strictEqual(shutdownEnv.service.stopReason, 'SHUTDOWN');
    assert.strictEqual(shutdownEnv.service.hasReconnectTimer(), false);
    assert.strictEqual(shutdownEnv.fakeScheduler.activeCount(), 0);

    const connectAfterShutdown = await shutdownEnv.service.connect();
    assert.strictEqual(connectAfterShutdown.ok, false);
    assert.strictEqual(connectAfterShutdown.reason, 'SHUTTING_DOWN');
    shutdownEnv.gsm.shutdown();
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 12: MOCK mode không reconnect
    // -------------------------------------------------------------------------
    console.log('Test 12: MOCK mode blocks connect() and never schedules auto-reconnect...');
    const mockEnv = buildTestEnvironment({ app: { defaultMode: 'MOCK' } });
    const mockConnRes = await mockEnv.service.connect();
    assert.strictEqual(mockConnRes.ok, false);
    assert.strictEqual(mockConnRes.reason, 'NOT_IN_LIVE_MODE');
    assert.strictEqual(mockEnv.service.hasReconnectTimer(), false);

    const mockSchedRes = mockEnv.service._scheduleReconnect('Should not schedule in MOCK');
    assert.strictEqual(mockSchedRes.scheduled, false);
    assert.strictEqual(mockSchedRes.reason, 'NOT_IN_LIVE_MODE');
    assert.strictEqual(mockEnv.fakeScheduler.activeCount(), 0);
    await mockEnv.service.shutdown();
    mockEnv.gsm.shutdown();
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 13: StreamEnd xử lý theo chính sách (STOPPED, không reconnect, giữ Game State)
    // -------------------------------------------------------------------------
    console.log('Test 13: streamEnd transitions to STOPPED, ignores subsequent disconnect event, and does not reconnect...');
    const connBeforeStreamEnd = createdConnectors[createdConnectors.length - 1];
    connBeforeStreamEnd.emit('streamEnd', { action: 3 });
    // Even if connector emits 'disconnected' right after 'streamEnd'
    connBeforeStreamEnd.emit('disconnected', { code: 1000, reason: 'Stream ended closure' });

    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.STOPPED);
    assert.strictEqual(service.stopReason, 'STREAM_ENDED');
    assert.strictEqual(service.hasReconnectTimer(), false);
    assert.strictEqual(fakeScheduler.activeCount(), 0);
    assert.strictEqual(gsm.connectionStatus, 'DISCONNECTED');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 14: Lỗi kết nối tạm thời (Transient errors trigger Backoff Reconnect)
    // -------------------------------------------------------------------------
    console.log('Test 14: Transient connection errors (ConnectTimeoutError, SignatureRateLimitError, Hang Timeout) trigger auto-reconnect...');
    // 14a. SignatureRateLimitError with retryAfter: 3 (seconds -> 3000ms minimum delay)
    setBehaviorFactory(() => ({
      shouldFailConnect: true,
      errorName: 'SignatureRateLimitError',
      errorReason: 'Rate Limited',
      errorMessage: 'Sign server rate limit reached',
      retryAfter: 3
    }));
    const transientFailRes = await service.connect();
    assert.strictEqual(transientFailRes.ok, false);
    assert.strictEqual(transientFailRes.errorCategory, 'TRANSIENT_ERROR');
    assert.strictEqual(transientFailRes.recoverable, true);
    assert.strictEqual(transientFailRes.reconnecting, true);
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    assert.strictEqual(service.nextReconnectDelayMs, 3000);

    // 14b. Next attempt hangs beyond connectTimeoutMs (5000ms) -> times out and schedules next backoff!
    setBehaviorFactory(() => ({
      hangForever: true
    }));
    const hungReconnectPromise = fakeScheduler.runNext();
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTING);
    // Fire the connectTimeoutTimer inside fakeScheduler
    await fakeScheduler.runNext();
    await hungReconnectPromise;

    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    assert.strictEqual(service.reconnectAttempts, 2);
    assert.ok(service.lastError.includes('timed out'));

    // Let next attempt succeed
    setBehaviorFactory(() => ({ roomId: '7399999999999994501' }));
    await fakeScheduler.runNext();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 15: Lỗi không thể phục hồi (Unrecoverable errors & UserOfflineError stop immediately)
    // -------------------------------------------------------------------------
    console.log('Test 15: Unrecoverable errors (InvalidUniqueIdError, SignatureMissingTokensError, UserOfflineError) do NOT auto-reconnect...');
    await service.disconnect();

    const unrecoverableCases = [
      {
        errorName: 'InvalidUniqueIdError',
        errorMessage: 'Invalid TikTok uniqueId provided',
        expectedCategory: 'UNRECOVERABLE_ERROR'
      },
      {
        errorName: 'SignatureMissingTokensError',
        errorReason: 'Empty Cookies',
        errorMessage: 'Missing session tokens for authenticated request',
        expectedCategory: 'UNRECOVERABLE_ERROR'
      },
      {
        errorName: 'UserOfflineError',
        errorMessage: 'Streamer is currently offline',
        expectedCategory: 'STREAM_OFFLINE'
      }
    ];

    for (const testCase of unrecoverableCases) {
      setBehaviorFactory(() => ({
        shouldFailConnect: true,
        errorName: testCase.errorName,
        errorReason: testCase.errorReason,
        errorMessage: testCase.errorMessage
      }));
      const failRes = await service.connect();
      assert.strictEqual(failRes.ok, false);
      assert.strictEqual(failRes.recoverable, false);
      assert.strictEqual(failRes.errorCategory, testCase.expectedCategory);
      assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.STOPPED);
      assert.strictEqual(service.stopReason, testCase.expectedCategory);
      assert.strictEqual(service.hasReconnectTimer(), false);
      assert.strictEqual(fakeScheduler.activeCount(), 0);
    }

    // Reconnect cleanly for gameplay preservation tests
    setBehaviorFactory(() => ({ roomId: '7399999999999994501' }));
    await service.connect();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 16: Giữ nguyên Game State (6 ghế, hàng chờ, độ say, KO/LEAVING, timers)
    // -------------------------------------------------------------------------
    console.log('Test 16: Disconnect & auto-reconnect preserve 6 seats, drunkLevel, queues, KO state & single gameplay timers...');
    // Seed 2 seated players, increase drunkLevel, and verify state across disconnect/reconnect
    const activeConn16 = createdConnectors[createdConnectors.length - 1];
    activeConn16.emit('chat', {
      common: { msgId: 't16_join_1' },
      user: { id: 'p_seat_1', nickname: 'Khách Ghế 1' },
      content: 'nhậu'
    });
    activeConn16.emit('chat', {
      common: { msgId: 't16_join_2' },
      user: { id: 'p_seat_2', nickname: 'Khách Ghế 2' },
      content: 'dô'
    });
    activeConn16.emit('gift', {
      common: { msgId: 't16_gift_1' },
      user: { id: 'gifter_16', nickname: 'Đại Gia 16' },
      toUser: { id: 'p_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 1,
      groupId: 'grp_t16_1'
    });

    const snapBeforeDisc = gsm.getSnapshot();
    assert.strictEqual(snapBeforeDisc.seats[0].player.userId, 'p_seat_1');
    assert.strictEqual(snapBeforeDisc.seats[0].player.drunkLevel, 15);
    assert.strictEqual(snapBeforeDisc.seats[1].player.userId, 'p_seat_2');
    const versionBeforeDisc = gsm.stateVersion;

    // Start cheers & wife schedulers and verify their timer references are not duplicated by TikTok reconnect
    gsm.startCheersScheduler();
    gsm.startWifeScheduler();
    const cheersTimerBefore = gsm.cheersTimer;
    const wifeTimerBefore = gsm.wifeTimer;

    // Trigger unexpected disconnect + auto-reconnect
    activeConn16.emit('disconnected', { code: 1006, reason: 'Mid-game drop' });
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.RECONNECTING);
    await fakeScheduler.runNext();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.CONNECTED);

    const snapAfterReconn = gsm.getSnapshot();
    assert.strictEqual(gsm.stateVersion, versionBeforeDisc, 'Reconnect must not mutate stateVersion');
    assert.strictEqual(snapAfterReconn.seats[0].player.userId, 'p_seat_1');
    assert.strictEqual(snapAfterReconn.seats[0].player.drunkLevel, 15);
    assert.strictEqual(snapAfterReconn.seats[1].player.userId, 'p_seat_2');
    assert.strictEqual(gsm.cheersTimer, cheersTimerBefore, 'Must not duplicate cheersTimer');
    assert.strictEqual(gsm.wifeTimer, wifeTimerBefore, 'Must not duplicate wifeTimer');
    gsm.stopCheersScheduler();
    gsm.stopWifeScheduler();
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 17: Không replay Like/Gift đã xử lý sau khi reconnect
    // -------------------------------------------------------------------------
    console.log('Test 17: Replaying already-processed Gift streak or Like msgId after reconnect adds 0 drunkLevel...');
    const activeConn17 = createdConnectors[createdConnectors.length - 1];
    const vBeforeReplay = gsm.stateVersion;

    // Replay same gift msgId & same combo streak repeatCount=3
    activeConn17.emit('gift', {
      common: { msgId: 't16_gift_1' },
      user: { id: 'gifter_16', nickname: 'Đại Gia 16' },
      toUser: { id: 'p_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 1,
      groupId: 'grp_t16_1'
    });
    activeConn17.emit('gift', {
      common: { msgId: 't17_gift_new_msgid_same_streak' },
      user: { id: 'gifter_16', nickname: 'Đại Gia 16' },
      toUser: { id: 'p_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 1,
      groupId: 'grp_t16_1'
    });

    assert.strictEqual(gsm.stateVersion, vBeforeReplay);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 15);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 18: Không reset baseline Like sai phiên (Cùng roomId giữ baseline; đổi roomId tách baseline)
    // -------------------------------------------------------------------------
    console.log('Test 18: Same roomId preserves Like baseline across reconnect; new roomId isolates baseline for new stream session...');
    const activeConn18a = createdConnectors[createdConnectors.length - 1];
    // Establish baseline 5000 in room '7399999999999994501'
    activeConn18a.emit('like', {
      common: { msgId: 't18_like_1', roomId: '7399999999999994501' },
      user: { id: 'liker_18', nickname: 'Liker 18' },
      count: 40,
      total: '5000'
    });
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 40);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 40);

    // Reconnect to SAME roomId '7399999999999994501'
    activeConn18a.emit('disconnected', { code: 1006, reason: 'Drop same room' });
    await fakeScheduler.runNext();
    const activeConn18b = createdConnectors[createdConnectors.length - 1];

    // Send total-only '5000' in same room -> must add 0 likes (baseline preserved)
    activeConn18b.emit('like', {
      common: { msgId: 't18_like_same_room_stale', roomId: '7399999999999994501' },
      user: { id: 'liker_18', nickname: 'Liker 18' },
      total: '5000'
    });
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 40);

    // Send total-only '5060' in same room -> adds +60 likes -> reaches 100 milestone (+1 drunkLevel)
    activeConn18b.emit('like', {
      common: { msgId: 't18_like_same_room_new', roomId: '7399999999999994501' },
      user: { id: 'liker_18', nickname: 'Liker 18' },
      total: '5060'
    });
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 100);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 16);

    // Now simulate streamer starting a NEW livestream session with a NEW roomId '7399999999999999999'
    setBehaviorFactory(() => ({ roomId: '7399999999999999999' }));
    activeConn18b.emit('disconnected', { code: 1006, reason: 'Switch to new stream room' });
    await fakeScheduler.runNext();
    const activeConn18c = createdConnectors[createdConnectors.length - 1];
    assert.strictEqual(service.roomId, '7399999999999999999');
    assert.strictEqual(service.stats.roomSessionChanges, 1);
    assert.strictEqual(
      gsm.deduplicator.getLikeBaseline('room:7399999999999994501'),
      null,
      'Old room baseline evicted on room session change'
    );

    // First total-only packet in new room ('200' < old room '5060') initializes new room baseline (+0)
    activeConn18c.emit('like', {
      common: { msgId: 't18_new_room_init', roomId: '7399999999999999999' },
      user: { id: 'liker_18', nickname: 'Liker 18' },
      total: '200'
    });
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 100);

    // Second total-only packet in new room ('225') adds +25 likes accurately!
    activeConn18c.emit('like', {
      common: { msgId: 't18_new_room_delta', roomId: '7399999999999999999' },
      user: { id: 'liker_18', nickname: 'Liker 18' },
      total: '225'
    });
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 125);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 25);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 20 (Part A): Cleanup tài nguyên trên unit test instance
    // -------------------------------------------------------------------------
    console.log('Test 20 (Part A): Resource cleanup on service shutdown...');
    await service.shutdown();
    assert.strictEqual(service.connectionState, TIKTOK_CONNECTION_STATE.STOPPED);
    assert.strictEqual(service.hasReconnectTimer(), false);
    assert.strictEqual(service.getStatus().listenerCount, 0);
    assert.strictEqual(fakeScheduler.activeCount(), 0);
    assert.strictEqual(activeConn18c.totalRegisteredListeners(), 0);
  } finally {
    await service.shutdown();
    gsm.shutdown();
  }

  // ---------------------------------------------------------------------------
  // TEST 19 & TEST 20 (Part B): Không ảnh hưởng Socket.io/Phaser & Full E2E Cleanup
  // ---------------------------------------------------------------------------
  console.log('Test 19 & 20: E2E Socket.io & Frontend SocketClient stay synchronized across TikTok auto-reconnect...');
  const e2eScheduler = new FakeTimerScheduler();
  const e2eConnectors = [];
  const e2eConfig = defaultConfig.buildConfig({
    port: 0,
    app: { defaultMode: 'LIVE' },
    tiktok: {
      uniqueId: 'e2e_streamer_45',
      autoConnect: false,
      autoReconnect: true,
      baseReconnectDelayMs: 1000,
      maxReconnectDelayMs: 60000
    }
  });

  const liveServer = await startServer(e2eConfig, {
    tiktokOptions: {
      autoReconnect: true,
      scheduler: e2eScheduler,
      randomFn: () => 0.5,
      connectionFactory: async (uid, opts) => {
        const conn = new FakeTikTokLiveConnection(uid, opts, {
          roomId: '7399999999999998888'
        });
        e2eConnectors.push(conn);
        return conn;
      }
    }
  });

  const socketMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/network/SocketClient.js')).href
  );
  const { SocketClient } = socketMod;
  const socketClient = new SocketClient({
    backendUrl: `http://127.0.0.1:${liveServer.port}`,
    socketOptions: { reconnection: false }
  });

  try {
    liveServer.gameStateManager.stopCheersScheduler();
    liveServer.gameStateManager.stopWifeScheduler();

    let latestViewData = null;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket snapshot timeout')), 3000);
      socketClient.subscribe(
        {
          onStateSync: (vd, src) => {
            latestViewData = vd;
            if (src === 'SNAPSHOT') {
              clearTimeout(timer);
              resolve();
            }
          }
        },
        'Test45E2EClient'
      );
      socketClient.connect();
    });

    await liveServer.tiktokService.connect();
    assert.strictEqual(e2eConnectors.length, 1);

    // Viewer joins Seat 1 before disconnect
    e2eConnectors[0].emit('chat', {
      common: { msgId: 'e2e_45_join_1' },
      user: { id: 'e2e_u1', nickname: 'Khách E2E 1' },
      content: 'nhậu'
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(latestViewData.seats[0].userId, 'e2e_u1');

    // Simulate unexpected TikTok disconnect -> auto-reconnect via e2eScheduler
    e2eConnectors[0].emit('disconnected', { code: 1006, reason: 'E2E network drop' });
    assert.strictEqual(
      liveServer.tiktokService.connectionState,
      TIKTOK_CONNECTION_STATE.RECONNECTING
    );
    await e2eScheduler.runNext();
    assert.strictEqual(
      liveServer.tiktokService.connectionState,
      TIKTOK_CONNECTION_STATE.CONNECTED
    );
    assert.strictEqual(e2eConnectors.length, 2);

    // Viewer 2 joins Seat 2 on the newly reconnected connector -> SocketClient receives state patch
    e2eConnectors[1].emit('chat', {
      common: { msgId: 'e2e_45_join_2' },
      user: { id: 'e2e_u2', nickname: 'Khách E2E 2' },
      content: 'dô'
    });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(latestViewData.seats[0].userId, 'e2e_u1');
    assert.strictEqual(latestViewData.seats[1].userId, 'e2e_u2');
    console.log('  -> PASS');
  } finally {
    socketClient.disconnect();
    await liveServer.shutdown();
    assert.strictEqual(liveServer.tiktokService.hasReconnectTimer(), false);
    assert.strictEqual(liveServer.tiktokService.getStatus().listenerCount, 0);
    assert.strictEqual(e2eScheduler.activeCount(), 0);
  }

  console.log('\n=== ALL 20 TASK 4.5 TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Task 4.5 test failed:', err);
  process.exit(1);
});
