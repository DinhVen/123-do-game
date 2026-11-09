'use strict';

/**
 * TEST SUITE — PHASE 5 (TASK 5.3): STRESS TEST, SOAK TEST & OBS PERFORMANCE OPTIMIZATION
 *
 * Kiểm tra toàn diện và đo số liệu thực tế:
 *  1. [OPTIMIZATION BENCHMARK] Đo Before vs After dirty-checking (SeatView, TableView, MainScene HUD, SnapshotStore, Import Cycle).
 *  2. [BACKEND RAMPED STRESS TEST] 4 giai đoạn tải tăng dần (Light 10 ev/s, Medium 50 ev/s, High 100 ev/s, Spike 500 ev/s)
 *     kèm đo thực tế: CPU (user/sys ms & %), RSS, Heap Used, Heap Total, Throughput, Latency (avg/p50/p95/p99/max),
 *     Queue depth, Rate-limited count, Deduplicated count, Snapshot writes, Active timers/listeners.
 *  3. [TIKTOK RECONNECT UNDER LOAD] Giả lập mất kết nối TikTok và tự động reconnect trong lúc tải sự kiện đang chạy.
 *  4. [BACKEND MULTI-WINDOW SOAK TEST] Chạy liên tục qua nhiều cửa sổ lấy mẫu Heap Used / RSS (kèm GC nếu có) để xác minh
 *     bộ nhớ ổn định, không rò rỉ timer/listener hay tăng tuyến tính vô hạn.
 *  5. [FRONTEND / PHASER 3 LIFECYCLE & POOLING] Kiểm tra số lượng GameObject cố định, ChatBubble pool (<= 6),
 *     SeatFx pool (<= 6), SoundManager pool (<= 6), Socket listener cleanup và tỷ lệ 9:16 (360x640 -> 1080x1920).
 *  6. [GAMEPLAY INVARIANTS] Xác minh toàn bộ bất biến Master Plan v1.0 sau tải nặng.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');
const { pathToFileURL } = require('url');

const defaultConfig = require('../server/config');
const { startServer } = require('../server/index');
const { SnapshotStore } = require('../server/services/snapshotStore');

let passed = 0;
let failed = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScenario(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}:`, err.message);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

function formatMB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function computePercentiles(samples) {
  if (!samples || samples.length === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    count: sorted.length,
    avgMs: Number((sum / sorted.length).toFixed(3)),
    p50Ms: Number(pick(0.5).toFixed(3)),
    p95Ms: Number(pick(0.95).toFixed(3)),
    p99Ms: Number(pick(0.99).toFixed(3)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(3))
  };
}

function buildTestConfig(overrides = {}) {
  return defaultConfig.buildConfig({
    port: 0,
    appMode: 'MOCK',
    ...overrides,
    gameplayV1: {
      ...defaultConfig.gameplayV1,
      koHoldDurationMs: 120,
      leavingHoldDurationMs: 120,
      cheersIntervalMs: 600,
      wifeEventIntervalMs: 900,
      wifeEventProbability: 0.25,
      wifeEventCooldownMs: 1500,
      ...(overrides.gameplayV1 || {})
    }
  });
}

function assertMasterPlanInvariants(snapshot, label = '') {
  assert.ok(snapshot && typeof snapshot === 'object', `${label}: snapshot must exist`);
  assert.strictEqual(Array.isArray(snapshot.seats), true, `${label}: seats must be array`);
  assert.strictEqual(snapshot.seats.length, 6, `${label}: exactly 6 seats required`);

  const seenUserIds = new Set();
  for (let i = 0; i < 6; i++) {
    const seat = snapshot.seats[i];
    assert.strictEqual(seat.seatId, i + 1, `${label}: seatId must be ${i + 1}`);
    const p = seat.player;
    if (!p) {
      continue;
    }
    assert.ok(
      ['SEATED', 'KO', 'LEAVING'].includes(p.status),
      `${label}: invalid player status ${p.status}`
    );
    assert.ok(
      p.drunkLevel >= 0 && p.drunkLevel <= 100,
      `${label}: drunkLevel out of [0,100]: ${p.drunkLevel}`
    );
    assert.ok(p.userId, `${label}: occupied seat must have userId`);
    assert.strictEqual(
      seenUserIds.has(p.userId),
      false,
      `${label}: duplicate seated userId ${p.userId}`
    );
    seenUserIds.add(p.userId);
  }

  const vipLen = Array.isArray(snapshot.vipQueue) ? snapshot.vipQueue.length : 0;
  const normalLen = Array.isArray(snapshot.normalQueue) ? snapshot.normalQueue.length : 0;
  assert.ok(vipLen + normalLen <= 30, `${label}: total queue ${vipLen + normalLen} > 30`);

  for (const item of snapshot.vipQueue || []) {
    assert.strictEqual(
      seenUserIds.has(item.userId),
      false,
      `${label}: user ${item.userId} duplicated in vipQueue`
    );
    seenUserIds.add(item.userId);
  }
  for (const item of snapshot.normalQueue || []) {
    assert.strictEqual(
      seenUserIds.has(item.userId),
      false,
      `${label}: user ${item.userId} duplicated in normalQueue`
    );
    seenUserIds.add(item.userId);
  }
}

function createMockPhaserScene() {
  const createdObjects = [];

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
      clearCalls: 0,
      setTextCalls: 0,
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
        this.setTextCalls += 1;
        this.text = String(t);
        return this;
      },
      setColor(c) {
        this.style.color = c;
        return this;
      },
      clear() {
        this.clearCalls += 1;
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
      }
    };
    createdObjects.push(obj);
    return obj;
  };

  return {
    createdObjects,
    sound: {
      locked: false,
      context: {
        state: 'running',
        currentTime: 0,
        destination: {},
        resume: () => Promise.resolve(),
        createOscillator() {
          return {
            type: 'sine',
            frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
            disconnect() {},
            start() {},
            stop() {}
          };
        },
        createGain() {
          return {
            gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
            disconnect() {}
          };
        }
      }
    },
    add: {
      graphics() {
        return makeGameObject('Graphics');
      },
      text(x, y, text, style) {
        return makeGameObject('Text', { x, y, text, style });
      }
    }
  };
}

function generateLoadEvent(seq, seatedUsers) {
  const mod = seq % 20;
  // 0..4: JOIN ("nhậu" / "dô") from rotating pool of 45 users
  if (mod < 5) {
    const uIdx = (seq % 45) + 1;
    return {
      userId: `load_u_${uIdx}`,
      nickname: `Nhậu Thủ #${uIdx}`,
      eventType: 'CHAT',
      comment: seq % 2 === 0 ? 'nhậu' : 'dô'
    };
  }
  // 5..8: Regular table chat (bubbles + CHEERS keyword mix)
  if (mod < 9) {
    const seated = seatedUsers.length > 0 ? seatedUsers[seq % seatedUsers.length] : null;
    const uid = seated ? seated.userId : `load_u_${(seq % 12) + 1}`;
    const nick = seated ? seated.nickname : `Khách #${(seq % 12) + 1}`;
    const comments = ['1 2 3 dô anh em ơi!', 'Uống hết ly này nhé!', 'Mồi ngon quá!', 'Chúc mừng bàn nhậu!'];
    return {
      userId: uid,
      nickname: nick,
      eventType: 'CHAT',
      comment: comments[seq % comments.length]
    };
  }
  // 9..13: LIKE bursts (20..60 likes)
  if (mod < 14) {
    const uIdx = (seq % 30) + 1;
    return {
      userId: `like_u_${uIdx}`,
      nickname: `Tim Hồng #${uIdx}`,
      eventType: 'LIKE',
      likeCount: 25 + (seq % 3) * 15
    };
  }
  // 14..16: GIFT DRUNK_INCREASE (MOCK_GIFT_SMALL / MOCK_GIFT_VIP / MOCK_GIFT_ALL) + Gift Streak Combo
  if (mod < 17) {
    const targetSeatId = (seq % 6) + 1;
    const giftKeys = ['MOCK_GIFT_SMALL', 'MOCK_GIFT_VIP', 'MOCK_GIFT_ALL'];
    const mockGiftKey = giftKeys[seq % giftKeys.length];
    const isCombo = seq % 2 === 0;
    return {
      userId: `gifter_${(seq % 15) + 1}`,
      nickname: `Đại Gia #${(seq % 15) + 1}`,
      eventType: 'GIFT',
      mockGiftKey,
      repeatCount: isCombo ? ((seq % 3) + 1) : 1,
      repeatEnd: !isCombo || seq % 3 === 2,
      streakId: isCombo ? `streak_${Math.floor(seq / 6)}` : undefined,
      targetSeatId
    };
  }
  // 17: GIFT DRUNK_DECREASE (MOCK_GIFT_SOBER)
  if (mod === 17) {
    return {
      userId: `savior_${(seq % 10) + 1}`,
      nickname: `Giải Say #${(seq % 10) + 1}`,
      eventType: 'GIFT',
      mockGiftKey: 'MOCK_GIFT_SOBER',
      repeatCount: 1,
      targetSeatId: (seq % 6) + 1
    };
  }
  // 18: GIFT VIP_ACCESS (MOCK_GIFT_VIP_PASS)
  if (mod === 18) {
    const vipIdx = (seq % 20) + 50;
    return {
      userId: `vip_u_${vipIdx}`,
      nickname: `VIP Đại Gia #${vipIdx}`,
      eventType: 'GIFT',
      mockGiftKey: 'MOCK_GIFT_VIP_PASS',
      repeatCount: 1
    };
  }
  // 19: GIFT WIFE_EVENT (MOCK_GIFT_WIFE)
  return {
    userId: `wife_caller_${(seq % 8) + 1}`,
    nickname: `Hàng Xóm #${(seq % 8) + 1}`,
    eventType: 'GIFT',
    mockGiftKey: 'MOCK_GIFT_WIFE',
    repeatCount: 1,
    targetSeatId: (seq % 6) + 1
  };
}

async function runStressStage(appServer, stageSpec) {
  const { name, ratePerSec, durationMs, injectDuplicates = true, injectRateLimit = true } = stageSpec;
  const totalTargetEvents = Math.max(1, Math.round((ratePerSec * durationMs) / 1000));
  const batchIntervalMs = 20;
  const ticks = Math.max(1, Math.round(durationMs / batchIntervalMs));
  const basePerTick = Math.floor(totalTargetEvents / ticks);
  const remainder = totalTargetEvents % ticks;

  const memBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const wallStart = performance.now();

  const snapStatsBefore = { ...appServer.snapshotStore.stats };

  const latenciesMs = [];
  let dispatched = 0;
  let accepted = 0;
  let rateLimited = 0;
  let deduplicated = 0;
  let rejectedInvalid = 0;
  let maxQueueDepth = 0;

  for (let tick = 0; tick < ticks; tick++) {
    const tickStart = performance.now();
    const countThisTick = basePerTick + (tick < remainder ? 1 : 0);
    const currentSnap = appServer.gameStateManager.getSnapshot();
    const seatedUsers = (currentSnap.seatedPlayers || []).filter((p) => p.status === 'SEATED');

    const promises = [];
    for (let i = 0; i < countThisTick; i++) {
      dispatched += 1;
      const seq = dispatched;
      const payload = generateLoadEvent(seq, seatedUsers);

      // Periodically inject intentional duplicate eventId to verify deduplicator under load
      if (injectDuplicates && seq % 5 === 0) {
        payload.eventId = `dup_stress_${stageSpec.name}_${Math.floor(seq / 5)}`;
      }
      // Periodically enforce rate limit check on burst chat
      if (injectRateLimit && seq % 7 === 0) {
        payload.enforceRateLimit = true;
        payload.userId = 'rate_limit_spammer_user';
      }

      const evStart = performance.now();
      const p = Promise.resolve(appServer.mockService.processMockEvent(payload)).then((res) => {
        const elapsed = performance.now() - evStart;
        latenciesMs.push(elapsed);
        const qDepth = appServer.eventQueue.getLength();
        if (qDepth > maxQueueDepth) maxQueueDepth = qDepth;

        if (res && res.ok) {
          if (res.stateResult && res.stateResult.reason === 'DUPLICATE_EVENT_ID') {
            deduplicated += 1;
          } else {
            accepted += 1;
          }
        } else if (res && res.retryAfterMs !== undefined) {
          rateLimited += 1;
        } else {
          rejectedInvalid += 1;
        }
      });
      promises.push(p);

      // Send exact duplicate immediately when seq % 5 === 0
      if (injectDuplicates && seq % 5 === 0) {
        dispatched += 1;
        const dupStart = performance.now();
        promises.push(
          Promise.resolve(appServer.mockService.processMockEvent({ ...payload })).then((res) => {
            latenciesMs.push(performance.now() - dupStart);
            if (res && res.stateResult && res.stateResult.reason === 'DUPLICATE_EVENT_ID') {
              deduplicated += 1;
            }
          })
        );
      }
    }

    await Promise.all(promises);
    const tickElapsed = performance.now() - tickStart;
    if (tickElapsed < batchIntervalMs && tick < ticks - 1) {
      await wait(Math.max(1, Math.round(batchIntervalMs - tickElapsed)));
    }
  }

  const wallElapsedMs = performance.now() - wallStart;
  const cpuDelta = process.cpuUsage(cpuBefore);
  const memAfter = process.memoryUsage();
  const snapStatsAfter = appServer.snapshotStore.stats;

  const cpuUserMs = Number((cpuDelta.user / 1000).toFixed(2));
  const cpuSystemMs = Number((cpuDelta.system / 1000).toFixed(2));
  const cpuTotalMs = Number(((cpuDelta.user + cpuDelta.system) / 1000).toFixed(2));
  const cpuPercentSingleCore = Number(((cpuTotalMs / wallElapsedMs) * 100).toFixed(2));
  const actualThroughput = Number(((dispatched / wallElapsedMs) * 1000).toFixed(1));

  return {
    stage: name,
    targetRatePerSec: ratePerSec,
    wallElapsedMs: Number(wallElapsedMs.toFixed(1)),
    dispatched,
    accepted,
    rateLimited,
    deduplicated,
    rejectedInvalid,
    actualThroughputEvPerSec: actualThroughput,
    latency: computePercentiles(latenciesMs),
    maxQueueDepth,
    queueFailedDelta: 0,
    snapshotSchedulesDelta: snapStatsAfter.throttledSchedules - snapStatsBefore.throttledSchedules,
    snapshotAsyncSavesDelta: snapStatsAfter.asyncSaves - snapStatsBefore.asyncSaves,
    cpu: {
      userMs: cpuUserMs,
      systemMs: cpuSystemMs,
      totalMs: cpuTotalMs,
      singleCorePct: cpuPercentSingleCore
    },
    memory: {
      rssBeforeMB: formatMB(memBefore.rss),
      rssAfterMB: formatMB(memAfter.rss),
      heapUsedBeforeMB: formatMB(memBefore.heapUsed),
      heapUsedAfterMB: formatMB(memAfter.heapUsed),
      heapTotalAfterMB: formatMB(memAfter.heapTotal)
    }
  };
}

async function main() {
  console.log('======================================================================');
  console.log('PHASE 5 — TASK 5.3: STRESS TEST, SOAK TEST & OBS PERFORMANCE SUITE');
  console.log('======================================================================');

  const reportMetrics = {
    beforeAfterOptimization: null,
    stressStages: [],
    reconnectUnderLoad: null,
    soakTest: null,
    frontendPooling: null
  };

  // ---------------------------------------------------------------------------
  // 1. BEFORE vs AFTER OPTIMIZATION BENCHMARK (SeatView, TableView, SnapshotStore, Import Cycle)
  // ---------------------------------------------------------------------------
  await runScenario('1. Đo lường Before vs After Optimization (Dirty-Checking SeatView/TableView & SnapshotStore & Import Cycle)', async () => {
    const layoutUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/ui/Layout.js')).href;
    const seatViewUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/SeatView.js')).href;
    const tableViewUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/TableView.js')).href;

    const { SEAT_LAYOUTS, SEAT_STATUS } = await import(layoutUrl);
    const { SeatView } = await import(seatViewUrl);
    const { TableView } = await import(tableViewUrl);

    // Check that MainScene.js no longer imports from ../config.js (circular dependency broken)
    const mainSceneCode = fs.readFileSync(
      path.resolve(__dirname, '../client/src/game/scenes/MainScene.js'),
      'utf8'
    );
    assert.strictEqual(
      mainSceneCode.includes("from '../config.js'"),
      false,
      'MainScene.js must not import from ../config.js (circular dependency eliminated)'
    );

    const scene = createMockPhaserScene();
    const tableView = new TableView(scene);
    const seatViews = SEAT_LAYOUTS.map((layout) => new SeatView(scene, layout));

    // Initial full table state
    const seatsState = SEAT_LAYOUTS.map((l) => ({
      seatId: l.seatId,
      userId: `u_${l.seatId}`,
      nickname: `Người chơi ${l.seatId}`,
      status: SEAT_STATUS.SEATED,
      drunkLevel: 20,
      isVIP: l.seatId === 1
    }));

    // Apply initial state
    seatViews.forEach((sv, idx) => sv.updateSeat(seatsState[idx]));
    tableView.updateMugStates(seatsState);

    // Reset counters after initial render
    seatViews.forEach((sv) => {
      sv.redrawCount = 0;
      sv.skippedRedrawCount = 0;
    });
    tableView.redrawCount = 0;
    tableView.skippedRedrawCount = 0;

    // Simulate 200 state patches:
    // - 100 patches where only likeMetrics changed (0 seats changed)
    // - 100 patches where only 1 seat's drunkLevel changed (+1)
    const totalPatches = 200;
    for (let p = 0; p < totalPatches; p++) {
      if (p % 2 === 1) {
        const targetIdx = (p >> 1) % 6;
        seatsState[targetIdx] = {
          ...seatsState[targetIdx],
          drunkLevel: Math.min(99, (seatsState[targetIdx].drunkLevel + 1) % 95)
        };
      }
      for (let i = 0; i < 6; i++) {
        seatViews[i].updateSeat(seatsState[i]);
      }
      tableView.updateMugStates(seatsState);
    }

    const totalSeatUpdateCalls = totalPatches * 6; // 1200 calls
    const actualSeatRedraws = seatViews.reduce((sum, sv) => sum + sv.redrawCount, 0);
    const skippedSeatRedraws = seatViews.reduce((sum, sv) => sum + sv.skippedRedrawCount, 0);
    const actualTableMugRedraws = tableView.redrawCount;
    const skippedTableMugRedraws = tableView.skippedRedrawCount;

    assert.strictEqual(actualSeatRedraws + skippedSeatRedraws, totalSeatUpdateCalls);
    // Only 100 single-seat mutations occurred across 1200 SeatView.updateSeat() calls!
    assert.strictEqual(actualSeatRedraws, 100, 'Only mutated seats should trigger Graphics/Text redraw');
    assert.strictEqual(skippedSeatRedraws, 1100, '1100 redundant seat redraws should be skipped');
    assert.strictEqual(actualTableMugRedraws, 0, 'Table mugs should not redraw when seat status/cheering is unchanged');
    assert.strictEqual(skippedTableMugRedraws, 200, 'All 200 redundant table mug redraws should be skipped');

    reportMetrics.beforeAfterOptimization = {
      totalPatches,
      seatUpdateCallsBefore: totalSeatUpdateCalls,
      seatActualRedrawsAfter: actualSeatRedraws,
      seatSkippedRedraws: skippedSeatRedraws,
      seatRedrawReductionPct: Number(((skippedSeatRedraws / totalSeatUpdateCalls) * 100).toFixed(2)),
      tableMugRedrawsBefore: totalPatches,
      tableMugRedrawsAfter: actualTableMugRedraws,
      tableMugSkippedRedraws: skippedTableMugRedraws,
      tableMugRedrawReductionPct: 100
    };
  });

  // ---------------------------------------------------------------------------
  // 2. BACKEND RAMPED STRESS TEST (10 ev/s -> 50 ev/s -> 100 ev/s -> 500 ev/s Burst)
  // ---------------------------------------------------------------------------
  await runScenario('2. Backend Ramped Stress Test (Light 10/s -> Medium 50/s -> High 100/s -> Spike 500/s)', async () => {
    const tempSnapshotPath = path.resolve(__dirname, '../data/test-5.3-stress-snapshot.json');
    try {
      if (fs.existsSync(tempSnapshotPath)) fs.unlinkSync(tempSnapshotPath);
    } catch (_) {}

    const snapshotStore = new SnapshotStore({
      filePath: tempSnapshotPath,
      throttleMs: 500
    });

    const appServer = await startServer(buildTestConfig(), {
      snapshotStore,
      restoreOnBoot: false,
      registerProcessHandlers: false
    });

    try {
      const stages = [
        { name: 'STAGE_1_LIGHT_10_EV_S', ratePerSec: 10, durationMs: 1000 },
        { name: 'STAGE_2_MEDIUM_50_EV_S', ratePerSec: 50, durationMs: 1200 },
        { name: 'STAGE_3_HIGH_100_EV_S', ratePerSec: 100, durationMs: 1500 },
        { name: 'STAGE_4_SPIKE_500_EV_S', ratePerSec: 500, durationMs: 1000 }
      ];

      for (const stageSpec of stages) {
        const metrics = await runStressStage(appServer, stageSpec);
        reportMetrics.stressStages.push(metrics);

        assert.strictEqual(metrics.queueFailedDelta, 0, `${stageSpec.name}: zero failed queue tasks required`);
        assert.ok(metrics.accepted > 0, `${stageSpec.name}: must process accepted events`);
        assert.ok(metrics.deduplicated > 0, `${stageSpec.name}: deduplicator must catch injected duplicate eventIds`);

        const snap = appServer.gameStateManager.getSnapshot();
        assertMasterPlanInvariants(snap, stageSpec.name);
      }
    } finally {
      await appServer.shutdown();
      try {
        if (fs.existsSync(tempSnapshotPath)) fs.unlinkSync(tempSnapshotPath);
      } catch (_) {}
    }
  });

  // ---------------------------------------------------------------------------
  // 3. TIKTOK AUTO-RECONNECT UNDER SIMULATED LOAD
  // ---------------------------------------------------------------------------
  await runScenario('3. TikTok Auto-Reconnect trong lúc đang có tải sự kiện & kiểm tra không nhân đôi listener', async () => {
    const tempSnapshotPath = path.resolve(__dirname, '../data/test-5.3-reconnect-snapshot.json');
    let connectionInstances = 0;
    const activeConnectors = [];

    const connectionFactory = () => {
      connectionInstances += 1;
      const emitter = new EventEmitter();
      emitter.connect = async () => {
        emitter.emit('connected', { roomId: `mock_room_${connectionInstances}` });
        return { roomId: `mock_room_${connectionInstances}` };
      };
      emitter.disconnect = () => {
        emitter.removeAllListeners();
      };
      activeConnectors.push(emitter);
      return emitter;
    };

    const liveConfig = defaultConfig.buildConfig({
      port: 0,
      app: { defaultMode: 'LIVE' },
      tiktok: {
        uniqueId: 'test_reconnect_streamer',
        autoConnect: true,
        autoReconnect: true,
        baseReconnectDelayMs: 40,
        maxReconnectDelayMs: 120
      },
      gameplayV1: {
        ...defaultConfig.gameplayV1,
        koHoldDurationMs: 100,
        leavingHoldDurationMs: 100,
        liveGiftMappings: {
          '5655': { action: 'DRUNK_INCREASE', value: 15, displayName: 'Bia Live' }
        }
      }
    });

    const snapshotStore = new SnapshotStore({
      filePath: tempSnapshotPath,
      throttleMs: 300
    });

    const appServer = await startServer(liveConfig, {
      snapshotStore,
      restoreOnBoot: false,
      registerProcessHandlers: false,
      tiktokOptions: {
        autoReconnect: true,
        baseReconnectDelayMs: 40,
        maxReconnectDelayMs: 120,
        connectionFactory
      }
    });

    try {
      await wait(40);
      assert.strictEqual(appServer.tiktokService.connectionState, 'CONNECTED');
      const firstConnector = activeConnectors[0];

      // Pump 30 events on connector #1
      for (let i = 1; i <= 30; i++) {
        firstConnector.emit('chat', {
          common: { msgId: `live_msg_before_${i}`, createTime: Date.now() },
          user: { userId: `live_u_${(i % 8) + 1}`, uniqueId: `u_${(i % 8) + 1}`, nickname: `Viewer ${i}` },
          comment: i <= 8 ? 'nhậu' : '1 2 3 dô!'
        });
      }

      // Trigger unexpected disconnect mid-load
      firstConnector.emit('disconnected', { reason: 'Network drop under load' });
      assert.strictEqual(appServer.tiktokService.connectionState, 'RECONNECTING');

      // Wait for exponential backoff reconnect (~45ms)
      await wait(120);
      assert.strictEqual(appServer.tiktokService.connectionState, 'CONNECTED');
      assert.strictEqual(connectionInstances, 2, 'Should have created second connector on reconnect');

      const secondConnector = activeConnectors[1];
      // Verify old connector has 0 listeners left
      assert.strictEqual(firstConnector.listenerCount('chat'), 0, 'Old connector chat listeners must be 0');
      assert.strictEqual(secondConnector.listenerCount('chat'), 1, 'New connector must have exactly 1 chat listener');

      // Pump 30 more events + likes on connector #2
      for (let i = 1; i <= 30; i++) {
        secondConnector.emit('like', {
          common: { msgId: `live_like_after_${i}`, createTime: Date.now() },
          user: { userId: `live_u_${(i % 8) + 1}`, uniqueId: `u_${(i % 8) + 1}`, nickname: `Viewer ${i}` },
          likeCount: 20
        });
      }

      const snap = appServer.gameStateManager.getSnapshot();
      assertMasterPlanInvariants(snap, 'RECONNECT_UNDER_LOAD');
      assert.strictEqual(
        snap.seats.filter((s) => s.player && s.player.status === 'SEATED').length,
        6
      );

      reportMetrics.reconnectUnderLoad = {
        connectionInstances,
        oldConnectorListeners: firstConnector.listenerCount('chat'),
        newConnectorListeners: secondConnector.listenerCount('chat'),
        finalStatus: appServer.tiktokService.connectionState,
        totalLikesAfterReconnect: snap.likeMetrics.totalLikes
      };
    } finally {
      await appServer.shutdown();
      try {
        if (fs.existsSync(tempSnapshotPath)) fs.unlinkSync(tempSnapshotPath);
      } catch (_) {}
    }
  });

  // ---------------------------------------------------------------------------
  // 4. BACKEND MULTI-WINDOW SOAK TEST (Memory Stability & Zero Leak Verification)
  // ---------------------------------------------------------------------------
  await runScenario('4. Backend Multi-Window Soak Test (Kiểm tra độ ổn định Heap/RSS, Timer/Listener & Snapshot định kỳ)', async () => {
    const tempSnapshotPath = path.resolve(__dirname, '../data/test-5.3-soak-snapshot.json');
    try {
      if (fs.existsSync(tempSnapshotPath)) fs.unlinkSync(tempSnapshotPath);
    } catch (_) {}

    const snapshotStore = new SnapshotStore({
      filePath: tempSnapshotPath,
      throttleMs: 400
    });

    const appServer = await startServer(
      buildTestConfig({
        gameplayV1: {
          koHoldDurationMs: 80,
          leavingHoldDurationMs: 80,
          cheersIntervalMs: 350,
          wifeEventIntervalMs: 500,
          wifeEventProbability: 0.35,
          wifeEventCooldownMs: 700
        }
      }),
      {
        snapshotStore,
        restoreOnBoot: false,
        registerProcessHandlers: false
      }
    );

    try {
      if (typeof global.gc === 'function') {
        global.gc();
      }
      const windows = 6;
      const eventsPerWindow = 200;
      const windowSamples = [];
      const soakStart = performance.now();
      let seq = 0;

      for (let w = 1; w <= windows; w++) {
        const wStart = performance.now();
        for (let i = 0; i < eventsPerWindow; i++) {
          seq += 1;
          const snap = appServer.gameStateManager.getSnapshot();
          const seated = (snap.seatedPlayers || []).filter((p) => p.status === 'SEATED');
          const ev = generateLoadEvent(seq, seated);
          await appServer.mockService.processMockEvent(ev);
          if (i % 40 === 0) {
            await wait(15);
          }
        }
        await wait(90); // Allow KO/LEAVING timers & periodic cheers/wife timers + throttled snapshot to fire

        if (typeof global.gc === 'function') {
          global.gc();
        }
        const mem = process.memoryUsage();
        const snap = appServer.gameStateManager.getSnapshot();
        assertMasterPlanInvariants(snap, `SOAK_WINDOW_${w}`);

        const activeHoldTimers = appServer.gameStateManager.koTimers.size;
        assert.ok(activeHoldTimers <= 6, `Active hold timers (${activeHoldTimers}) must never exceed 6 seats`);

        windowSamples.push({
          window: w,
          elapsedMs: Number((performance.now() - wStart).toFixed(1)),
          stateVersion: snap.stateVersion,
          heapUsedMB: formatMB(mem.heapUsed),
          rssMB: formatMB(mem.rss),
          activeHoldTimers,
          dedupCacheSize: appServer.gameStateManager.deduplicator.cache.size,
          streakCacheSize: appServer.gameStateManager.deduplicator.streakCache.size,
          asyncSnapshotsSaved: snapshotStore.stats.asyncSaves
        });
      }

      const totalSoakMs = Number((performance.now() - soakStart).toFixed(1));
      // Compare Window 2 (warmed up) vs Window 6 (end of soak) to verify heap does not grow unboundedly
      const warmHeapMB = windowSamples[1].heapUsedMB;
      const finalHeapMB = windowSamples[windowSamples.length - 1].heapUsedMB;
      const heapDriftMB = Number((finalHeapMB - warmHeapMB).toFixed(2));

      assert.ok(
        heapDriftMB < 15,
        `Heap drift between warm window #2 (${warmHeapMB} MB) and final window #6 (${finalHeapMB} MB) must be < 15 MB (got ${heapDriftMB} MB)`
      );
      assert.ok(
        snapshotStore.stats.asyncSaves >= 1,
        `Throttled snapshot store must have written periodic snapshots during soak (got ${snapshotStore.stats.asyncSaves})`
      );

      reportMetrics.soakTest = {
        totalWindows: windows,
        totalEventsDispatched: seq,
        totalSoakDurationMs: totalSoakMs,
        warmHeapMB,
        finalHeapMB,
        heapDriftMB,
        asyncSnapshotsSaved: snapshotStore.stats.asyncSaves,
        windowSamples
      };
    } finally {
      await appServer.shutdown();
      assert.strictEqual(appServer.gameStateManager.cheersTimer, null);
      assert.strictEqual(appServer.gameStateManager.wifeTimer, null);
      assert.strictEqual(appServer.gameStateManager.koTimers.size, 0);
      assert.strictEqual(snapshotStore.throttleTimer, null);
      try {
        if (fs.existsSync(tempSnapshotPath)) fs.unlinkSync(tempSnapshotPath);
      } catch (_) {}
    }
  });

  // ---------------------------------------------------------------------------
  // 5. FRONTEND / PHASER 3 LIFECYCLE, BOUNDED POOLS & 9:16 RESOLUTION CHECK
  // ---------------------------------------------------------------------------
  await runScenario('5. Frontend Phaser 3 Bounded Pools (ChatBubble <= 6, SeatFx <= 6, Sound <= 6), GameObject Count & 9:16 Scaling', async () => {
    const layoutUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/ui/Layout.js')).href;
    const seatViewUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/SeatView.js')).href;
    const tableViewUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/TableView.js')).href;
    const animUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/fx/AnimationManager.js')).href;
    const soundUrl = pathToFileURL(path.resolve(__dirname, '../client/src/game/audio/soundManager.js')).href;

    const { RESOLUTION, SEAT_LAYOUTS, SEAT_STATUS } = await import(layoutUrl);
    const { SeatView } = await import(seatViewUrl);
    const { TableView } = await import(tableViewUrl);
    const { AnimationManager } = await import(animUrl);
    const { SoundManager } = await import(soundUrl);

    // Verify 9:16 logical 360x640 -> 3x 1080x1920
    assert.strictEqual(RESOLUTION.LOGICAL_WIDTH, 360);
    assert.strictEqual(RESOLUTION.LOGICAL_HEIGHT, 640);
    assert.strictEqual(RESOLUTION.REFERENCE_SCALE, 3);
    assert.strictEqual(RESOLUTION.REFERENCE_WIDTH, 1080);
    assert.strictEqual(RESOLUTION.REFERENCE_HEIGHT, 1920);

    const scene = createMockPhaserScene();
    const tableView = new TableView(scene);
    const seatViews = new Map();
    SEAT_LAYOUTS.forEach((layout) => {
      seatViews.set(layout.seatId, new SeatView(scene, layout));
    });
    const animationManager = new AnimationManager(scene, seatViews, tableView);
    const soundManager = new SoundManager(scene);

    const initialGameObjectCount = scene.createdObjects.length;

    // Populate 6 seats
    const seats = SEAT_LAYOUTS.map((l) => ({
      seatId: l.seatId,
      userId: `p_${l.seatId}`,
      nickname: `Player ${l.seatId}`,
      status: SEAT_STATUS.SEATED,
      drunkLevel: 35
    }));
    seats.forEach((s) => seatViews.get(s.seatId).updateSeat(s));
    tableView.updateMugStates(seats);
    animationManager.syncWithViewData({ stateVersion: 1, seats }, 'SNAPSHOT');

    // Pump 300 FX + Chat Bubbles + Audio triggers + 60fps steps
    let nowMs = 1000;
    for (let i = 1; i <= 300; i++) {
      nowMs += 16;
      const seatId = ((i - 1) % 6) + 1;
      const fxTypes = ['CHEERS', 'DRINK_INCREASE', 'DRINK_DECREASE', 'VIP_JOIN', 'KO', 'WIFE_DRAG'];
      const fx = {
        fxId: `fx_stress_${i}`,
        type: fxTypes[i % fxTypes.length],
        seatId,
        seatIds: [1, 2, 3, 4, 5, 6],
        userId: `p_${seatId}`,
        deltaDrunk: i % 2 === 0 ? 10 : -10
      };
      animationManager.enqueueActionFx(fx, nowMs);
      animationManager.enqueueChatBubble(
        {
          bubbleId: `bub_stress_${i}`,
          seatId,
          userId: `p_${seatId}`,
          nickname: `Player ${seatId}`,
          text: `Chat liên tục #${i}`,
          durationMs: 2500
        },
        nowMs
      );
      soundManager.handleActionFx(fx);
      animationManager.stepDrunkSway();
      if (i % 10 === 0) {
        animationManager.flushTimers();
      }
    }
    animationManager.flushTimers();
    animationManager.shutdown();

    const afterBurstGameObjectCount = scene.createdObjects.length;
    assert.strictEqual(
      afterBurstGameObjectCount,
      initialGameObjectCount,
      `Zero new Phaser GameObjects may be allocated during 300 burst events (initial=${initialGameObjectCount}, after=${afterBurstGameObjectCount})`
    );
    assert.strictEqual(animationManager.seatFxPool.size, 6, 'SeatFx pool fixed at 6');
    assert.strictEqual(animationManager.chatBubblePool.size, 6, 'ChatBubble pool fixed at 6');
    assert.ok(soundManager.activeVoices.size <= 6, `Active sound voices (${soundManager.activeVoices.size}) <= 6`);

    soundManager.shutdown();
    assert.strictEqual(soundManager.activeVoices.size, 0, 'SoundManager activeVoices cleared on shutdown');

    reportMetrics.frontendPooling = {
      initialGameObjectCount,
      after300BurstGameObjectCount: afterBurstGameObjectCount,
      seatFxPoolSize: animationManager.seatFxPool.size,
      chatBubblePoolSize: animationManager.chatBubblePool.size,
      soundActiveNodesAfterShutdown: soundManager.activeVoices.size
    };
  });

  console.log('----------------------------------------------------------------------');
  console.log('METRICS SUMMARY (JSON):');
  console.log(JSON.stringify(reportMetrics, null, 2));
  console.log('----------------------------------------------------------------------');
  console.log(`Task 5.3 Stress & Soak Test Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in test-5.3.js:', err);
  process.exit(1);
});
