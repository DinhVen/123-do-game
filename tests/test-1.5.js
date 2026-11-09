'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { io: createClient } = require('socket.io-client');
const defaultConfig = require('../server/config');
const logger = require('../server/logger');
const { startServer } = require('../server/index');
const { SnapshotStore } = require('../server/services/snapshotStore');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitWithAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout on ${eventName}`)), 5000);
    socket.emit(eventName, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function assertInvariants(snapshot, previousStateVersion = 0, label = '') {
  const prefix = label ? `[Invariant:${label}] ` : '[Invariant] ';
  assert.ok(snapshot && typeof snapshot === 'object', `${prefix}Snapshot must be an object`);
  assert.strictEqual(snapshot.seats.length, 6, `${prefix}seats.length must be 6`);
  assert.ok(
    Number.isInteger(snapshot.stateVersion) && snapshot.stateVersion >= previousStateVersion,
    `${prefix}stateVersion (${snapshot.stateVersion}) must be >= ${previousStateVersion}`
  );

  const seenUserIds = new Set();
  for (let i = 0; i < 6; i += 1) {
    const seat = snapshot.seats[i];
    assert.strictEqual(seat.seatId, i + 1, `${prefix}seatId mismatch at index ${i}`);
    assert.strictEqual(seat.seatIndex, i, `${prefix}seatIndex mismatch at index ${i}`);
    if (seat.player !== null) {
      const p = seat.player;
      assert.ok(typeof p.userId === 'string' && p.userId.length > 0, `${prefix}Invalid userId on seat ${seat.seatId}`);
      assert.strictEqual(
        seenUserIds.has(p.userId),
        false,
        `${prefix}Duplicate userId on seats: ${p.userId}`
      );
      seenUserIds.add(p.userId);
      assert.ok(
        Number.isInteger(p.drunkLevel) && p.drunkLevel >= 0 && p.drunkLevel <= 100,
        `${prefix}drunkLevel out of [0,100]: ${p.drunkLevel}`
      );
      assert.ok(
        ['SEATED', 'KO', 'LEAVING'].includes(p.status),
        `${prefix}Invalid seated player status: ${p.status}`
      );
      if (p.status === 'KO') {
        assert.strictEqual(p.drunkLevel, 100, `${prefix}KO player must have drunkLevel === 100`);
      }
    }
  }

  assert.strictEqual(
    snapshot.totalWaiting,
    snapshot.vipQueue.length + snapshot.normalQueue.length,
    `${prefix}totalWaiting mismatch`
  );
  assert.ok(
    snapshot.totalWaiting <= 30,
    `${prefix}totalWaiting (${snapshot.totalWaiting}) exceeds 30`
  );

  for (const v of snapshot.vipQueue) {
    assert.strictEqual(
      seenUserIds.has(v.userId),
      false,
      `${prefix}Duplicate userId in vipQueue: ${v.userId}`
    );
    seenUserIds.add(v.userId);
    assert.strictEqual(v.isVIP, true, `${prefix}vipQueue item must have isVIP=true`);
  }

  for (const n of snapshot.normalQueue) {
    assert.strictEqual(
      seenUserIds.has(n.userId),
      false,
      `${prefix}Duplicate userId in normalQueue: ${n.userId}`
    );
    seenUserIds.add(n.userId);
    assert.strictEqual(n.isVIP, false, `${prefix}normalQueue item must have isVIP=false`);
  }

  return snapshot.stateVersion;
}

async function runIntegrationTests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TÍCH HỢP NHIỆM VỤ 1.5 (BACKEND MVP) ===');

  // Use real 3000ms KO & LEAVING hold durations as locked in Master Plan v1.0
  const testConfig = defaultConfig.buildConfig({
    port: 0,
    env: 'development',
    gameplayV1: {
      koHoldDurationMs: 3000,
      leavingHoldDurationMs: 3000
    }
  });

  const serverInstance = await startServer(testConfig);
  const { port, shutdown, mockService, gameStateManager, eventQueue } = serverInstance;
  const baseUrl = `http://127.0.0.1:${port}`;
  let client = null;
  let reconnectClient = null;

  let fakeNow = 1700000000000;
  let randomValues = [0.5];
  gameStateManager.setClock(() => fakeNow);
  gameStateManager.setRandom(() => (randomValues.length > 0 ? randomValues.shift() : 0.5));

  // Stop automatic background intervals so we can drive deterministic integration steps first
  gameStateManager.stopCheersScheduler();
  gameStateManager.stopWifeScheduler();

  try {
    client = createClient(baseUrl, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Connect timeout')), 5000);
      client.once('connect', () => {
        clearTimeout(t);
        resolve();
      });
      client.once('connect_error', reject);
    });

    let lastVer = assertInvariants(gameStateManager.getSnapshot(), 0, 'Initial');

    // 1. 6 players join and fill the table
    for (let i = 1; i <= 6; i += 1) {
      mockService.simulateCommentNhau(`seated_user_${i}`, `Khách Ngồi ${i}`);
    }
    let snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step1_6Seated');
    assert.strictEqual(snap.seatedPlayers.length, 6);
    console.log('[PASS 1] 6 người tham gia và lấp đầy bàn.');

    // 2. Next 30 players enter Normal Queue
    for (let i = 1; i <= 30; i += 1) {
      mockService.simulateCommentDo(`wait_norm_${i}`, `Khách Chờ ${i}`);
    }
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step2_30Waiting');
    assert.strictEqual(snap.normalQueue.length, 30);
    assert.strictEqual(snap.totalWaiting, 30);
    console.log('[PASS 2] 30 người tiếp theo vào hàng chờ.');

    // 3. New VIP joins when waiting queue is full (30/30) -> evicts wait_norm_30
    const vipFullRes = mockService.simulateGift(
      'vip_new_01',
      'Đại Gia VIP 01',
      'MOCK_GIFT_VIP_PASS',
      1,
      null
    );
    assert.strictEqual(vipFullRes.stateResult.action, 'ENQUEUED_VIP_REPLACED_NORMAL');
    assert.strictEqual(vipFullRes.stateResult.replacedPlayer.userId, 'wait_norm_30');
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step3_VipReplacedNormal');
    assert.strictEqual(snap.vipQueue.length, 1);
    assert.strictEqual(snap.normalQueue.length, 29);
    assert.strictEqual(snap.totalWaiting, 30);
    console.log('[PASS 3] VIP mới tham gia khi hàng chờ đầy thay thế người cuối Normal Queue.');

    // 4. Upgrade a Normal waiting player (wait_norm_5) to VIP -> FIFO in VIP queue, totalWaiting stays 30
    const promoteRes = mockService.simulateGift(
      'wait_norm_5',
      'Khách Chờ 5',
      'MOCK_GIFT_VIP_PASS',
      1,
      null
    );
    assert.strictEqual(promoteRes.stateResult.action, 'PROMOTED_TO_VIP_QUEUE');
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step4_PromoteNormalToVip');
    assert.strictEqual(snap.vipQueue.length, 2);
    assert.strictEqual(snap.vipQueue[0].userId, 'vip_new_01');
    assert.strictEqual(snap.vipQueue[1].userId, 'wait_norm_5');
    assert.strictEqual(snap.totalWaiting, 30);
    console.log('[PASS 4] Nâng cấp người chờ thường thành VIP giữ nguyên tổng hàng chờ.');

    // 5. Likes (250 + 50 = 300 -> +3) and DÔ (+5) increase drunkLevel of all SEATED players
    mockService.simulateLike('like_user', 'Khách Like', 250);
    mockService.simulateLike('like_user', 'Khách Like', 50);
    mockService.simulateCheers();
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step5_LikeAndCheers');
    for (const s of snap.seats) {
      assert.strictEqual(s.player.drunkLevel, 8);
    }
    assert.strictEqual(snap.likeMetrics.unconsumedLikes, 0);
    console.log('[PASS 5] Like và vòng lặp DÔ tăng độ say chính xác (+8).');

    // 6, 7, 8, 9, 15:
    // Gift increases drunkLevel on Seat 1 (seatIndex 0) to 100 -> KO!
    // Seat 1 is at 8. Send MOCK_GIFT_VIP (+25) x 4 = +100 -> clamped at 100 -> KO!
    const koRes = mockService.simulateGift('gifter_ko', 'Ép Say Ghế 1', 'MOCK_GIFT_VIP', 4, 0);
    assert.strictEqual(koRes.stateResult.newlyKoPlayers.length, 1);
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step6_GiftTriggersKO');
    assert.strictEqual(snap.seats[0].player.status, 'KO');
    assert.strictEqual(snap.seats[0].player.drunkLevel, 100);
    console.log('[PASS 6] Gift tăng say làm người chơi KO.');

    // 9 & 15: While Seat 1 is KO, sober gift does NOT revive KO and drink gift does NOT redirect to Seat 2
    const vAtKo = gameStateManager.stateVersion;
    const soberKo = mockService.simulateGift('gifter_sober', 'Giải Say KO', 'MOCK_GIFT_SOBER', 1, 0);
    assert.strictEqual(soberKo.stateResult.stateChanged, false);
    assert.strictEqual(soberKo.stateResult.reason, 'TARGET_ALREADY_KO');
    console.log('[PASS 9] Gift giải say không hồi sinh KO.');

    const drinkKo = mockService.simulateGift('gifter_drink', 'Tặng Nhầm KO', 'MOCK_GIFT_SMALL', 1, 0);
    assert.strictEqual(drinkKo.stateResult.stateChanged, false);
    assert.strictEqual(drinkKo.stateResult.reason, 'TARGET_ALREADY_KO');
    assert.strictEqual(gameStateManager.getSnapshot().seats[1].player.drunkLevel, 8);
    assert.strictEqual(gameStateManager.stateVersion, vAtKo);
    console.log('[PASS 15] Gift nhắm vào người vừa KO không chuyển mục tiêu.');

    // 7: Verify Seat 1 is still holding KO player at ~1500ms (< 3000ms)
    await wait(1500);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.userId, 'seated_user_1');
    assert.strictEqual(snap.seats[0].player.status, 'KO');
    console.log('[PASS 7] KO giữ ghế 3000ms.');

    // 8: Wait remaining ~1650ms (total ~3150ms) -> Seat 1 released and assigned to vip_new_01 (first in VIP Queue) with drunkLevel = 0
    await wait(1650);
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step8_VipAssignedAfterKO');
    assert.strictEqual(snap.seats[0].player.userId, 'vip_new_01');
    assert.strictEqual(snap.seats[0].player.isVIP, true);
    assert.strictEqual(snap.seats[0].player.status, 'SEATED');
    assert.strictEqual(snap.seats[0].player.drunkLevel, 0);
    console.log('[PASS 8] Sau KO, người đầu VIP Queue được cấp ghế.');

    // 16: Gift targeting old userId ('seated_user_1') on Seat 1 does NOT affect new player 'vip_new_01'
    const vBeforeStaleTarget = gameStateManager.stateVersion;
    const giftToOldSeat1User = mockService.simulateGift(
      'gifter_old',
      'Tặng Người Cũ',
      'MOCK_GIFT_SMALL',
      1,
      0,
      { targetUserId: 'seated_user_1' }
    );
    assert.strictEqual(giftToOldSeat1User.stateResult.stateChanged, false);
    assert.strictEqual(giftToOldSeat1User.stateResult.reason, 'TARGET_ALREADY_LEFT');
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 0);
    assert.strictEqual(gameStateManager.stateVersion, vBeforeStaleTarget);
    console.log('[PASS 16] Gift nhắm vào ghế đã đổi người không ảnh hưởng người mới.');

    // 10 & 11: Gift "Vợ bắt về" transitions Seat 2 (seatIndex 1, 'seated_user_2') to LEAVING,
    // holds seat for 3000ms, then releases to next VIP ('wait_norm_5').
    const wifeGift = mockService.simulateGift('gifter_wife', 'Vợ Gọi Ghế 2', 'MOCK_GIFT_WIFE', 1, 1);
    assert.strictEqual(wifeGift.stateResult.stateChanged, true);
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step10_WifeGiftLeaving');
    assert.strictEqual(snap.seats[1].player.userId, 'seated_user_2');
    assert.strictEqual(snap.seats[1].player.status, 'LEAVING');
    console.log('[PASS 10] Gift vợ bắt về chuyển người chơi sang LEAVING.');

    await wait(1500);
    assert.strictEqual(gameStateManager.getSnapshot().seats[1].player.status, 'LEAVING');
    await wait(1650);
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step11_LeavingReleased');
    assert.strictEqual(snap.seats[1].player.userId, 'wait_norm_5');
    assert.strictEqual(snap.seats[1].player.status, 'SEATED');
    assert.strictEqual(snap.seats[1].player.drunkLevel, 0);
    console.log('[PASS 11] LEAVING giữ ghế 3000ms rồi giải phóng.');

    // Speed up hold duration to 200ms for remaining multi-KO and random wife checks
    gameStateManager.koHoldDurationMs = 200;
    gameStateManager.leavingHoldDurationMs = 200;

    // 12: Random Wife event respects cooldown (180s)
    randomValues = [0.05, 0.0]; // Trigger on first active seated player (Seat 1: vip_new_01)
    const randWife1 = mockService.simulateRandomWifeCheck();
    assert.strictEqual(randWife1.stateResult.stateChanged, true);
    assert.strictEqual(randWife1.stateResult.action, 'RANDOM_WIFE_TRIGGERED');

    fakeNow += 90000; // +90s (< 180s cooldown)
    randomValues = [0.01, 0.0];
    const randWifeBlocked = mockService.simulateRandomWifeCheck();
    assert.strictEqual(randWifeBlocked.stateResult.stateChanged, false);
    assert.strictEqual(randWifeBlocked.stateResult.reason, 'WIFE_COOLDOWN_ACTIVE');
    await wait(260);
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step12_RandomWifeCooldown');
    console.log('[PASS 12] Sự kiện vợ bắt về ngẫu nhiên tuân thủ cooldown.');

    // 13 & 14: Continuous Gift streak updates & duplicate eventId
    const s2DrunkBefore = snap.seats[1].player.drunkLevel;
    mockService.simulateGift('combo_sender', 'Combo', 'MOCK_GIFT_SMALL', 1, 1, {
      streakId: 'stk_500',
      repeatEnd: false
    });
    mockService.simulateGift('combo_sender', 'Combo', 'MOCK_GIFT_SMALL', 2, 1, {
      streakId: 'stk_500',
      repeatEnd: false
    });
    mockService.simulateGift('combo_sender', 'Combo', 'MOCK_GIFT_SMALL', 5, 1, {
      streakId: 'stk_500',
      repeatEnd: false
    });
    const stkEnd = mockService.simulateGift('combo_sender', 'Combo', 'MOCK_GIFT_SMALL', 5, 1, {
      streakId: 'stk_500',
      repeatEnd: true
    });
    assert.strictEqual(stkEnd.stateResult.stateChanged, false);
    assert.strictEqual(stkEnd.stateResult.reason, 'STREAK_ALREADY_PROCESSED');
    assert.strictEqual(gameStateManager.getSnapshot().seats[1].player.drunkLevel, s2DrunkBefore + 50);
    console.log('[PASS 13] Nhiều Gift streak cập nhật liên tục không bị tính trùng.');

    const dupId = 'evt_integration_dup_check_01';
    const firstIdRes = mockService.simulateGift('dup_sender', 'Dup', 'MOCK_GIFT_SMALL', 1, 1, {
      eventId: dupId
    });
    assert.strictEqual(firstIdRes.stateResult.stateChanged, true);
    const secondIdRes = mockService.simulateGift('dup_sender', 'Dup', 'MOCK_GIFT_SMALL', 1, 1, {
      eventId: dupId
    });
    assert.strictEqual(secondIdRes.stateResult.stateChanged, false);
    assert.strictEqual(secondIdRes.stateResult.reason, 'DUPLICATE_EVENT_ID');
    console.log('[PASS 14] Duplicate eventId không làm thay đổi Game State lần hai.');

    // 17: Multiple players reaching KO simultaneously preserve queue FIFO order
    // Expected next 6 players in Normal Queue: wait_norm_2, wait_norm_3, wait_norm_4, wait_norm_6, wait_norm_7, wait_norm_8
    // (since wait_norm_1 took Seat 1 after vip_new_01 left, and wait_norm_5 was promoted to VIP earlier)
    const expectedNext6 = gameStateManager
      .getSnapshot()
      .normalQueue.slice(0, 6)
      .map((item) => item.userId);
    assert.strictEqual(expectedNext6.length, 6);

    // Send MOCK_GIFT_ALL (+15) x 7 (+105) -> all 6 currently seated players reach 100 and KO simultaneously!
    const multiKoRes = mockService.simulateGift('all_ko_sender', 'Bao Cả Bàn KO', 'MOCK_GIFT_ALL', 7, null);
    assert.strictEqual(multiKoRes.stateResult.newlyKoPlayers.length, 6);
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step17_MultiKO');

    // Wait 280ms for all 6 KO timers (200ms) to release sequentially
    await wait(280);
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step17_MultiKOReleased');
    assert.deepStrictEqual(
      snap.seats.map((s) => s.player.userId),
      expectedNext6
    );
    console.log('[PASS 17] Nhiều người cùng KO không làm sai hàng chờ.');

    // 18: Client disconnect & reconnect receives accurate snapshot
    reconnectClient = createClient(baseUrl, { transports: ['websocket'], reconnection: false });
    const reconSnap = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Reconnect timeout')), 5000);
      reconnectClient.once('game:state_snapshot', (data) => {
        clearTimeout(t);
        resolve(data);
      });
      reconnectClient.once('connect_error', reject);
    });
    assert.strictEqual(reconSnap.stateVersion, gameStateManager.stateVersion);
    assertInvariants(reconSnap.state, lastVer, 'Step18_ReconnectSnapshot');
    console.log('[PASS 18] Client ngắt kết nối rồi kết nối lại nhận snapshot đúng.');

    // 19: Concurrent burst of events for the same userId never creates duplicate userId
    for (let b = 0; b < 20; b += 1) {
      mockService.simulateCommentNhau('burst_concurrent_user', 'Burst User');
      mockService.simulateGift('burst_concurrent_user', 'Burst User', 'MOCK_GIFT_VIP_PASS', 1, null);
    }
    snap = gameStateManager.getSnapshot();
    lastVer = assertInvariants(snap, lastVer, 'Step19_ConcurrentBurst');
    console.log('[PASS 19] Các sự kiện đến liên tiếp không làm trùng userId.');

    // === SNAPSHOT & RECOVERY VERIFICATION (Section VII) ===
    const tempSnapshotPath = path.resolve(__dirname, '..', 'data', 'test-state-snapshot.json');
    const snapshotStore = new SnapshotStore({ filePath: tempSnapshotPath });
    const saveRes = snapshotStore.saveSnapshotSync(snap);
    assert.strictEqual(saveRes.ok, true);
    assert.ok(fs.existsSync(tempSnapshotPath));

    // Restore into a fresh GameStateManager and verify invariants & stateVersion
    const { GameStateManager } = require('../server/services/gameStateManager');
    const restoredManager = new GameStateManager(testConfig);
    const loadRes = snapshotStore.loadAndRestore(restoredManager);
    assert.strictEqual(loadRes.ok, true);
    assert.strictEqual(loadRes.evictedDuringRecovery, false);
    assert.strictEqual(restoredManager.stateVersion, snap.stateVersion);
    assertInvariants(restoredManager.getSnapshot(), snap.stateVersion, 'SnapshotRestored');

    // Verify Recovery Policy v1.0 for KO and LEAVING players:
    // - KO and LEAVING players are immediately evicted on recovery (no 3000ms timer re-created)
    // - Seats are assigned to VIP Queue (FIFO) first, then Normal Queue (FIFO)
    // - No duplicate userIds, no orphan koTimers, no old KO/LEAVING FX emitted, consistent stateVersion & snapshot
    const midKoLeavingSnapshot = restoredManager.getSnapshot();
    const evictedKoUserId = midKoLeavingSnapshot.seats[0].player.userId;
    const evictedLeavingUserId = midKoLeavingSnapshot.seats[1].player.userId;
    const keptSeatedUserId = midKoLeavingSnapshot.seats[2].player.userId;
    midKoLeavingSnapshot.seats[0].player.status = 'KO';
    midKoLeavingSnapshot.seats[0].player.drunkLevel = 100;
    midKoLeavingSnapshot.seats[1].player.status = 'LEAVING';
    midKoLeavingSnapshot.vipQueue = [
      { userId: 'rec_vip_1', nickname: 'RecVIP1', displayNickname: 'RecVIP1', avatarUrl: '' },
      { userId: 'rec_vip_2', nickname: 'RecVIP2', displayNickname: 'RecVIP2', avatarUrl: '' }
    ];
    midKoLeavingSnapshot.normalQueue = [
      { userId: 'rec_norm_1', nickname: 'RecNorm1', displayNickname: 'RecNorm1', avatarUrl: '' }
    ];
    const preRecoveryVersion = midKoLeavingSnapshot.stateVersion;
    assert.strictEqual(snapshotStore.saveSnapshotSync(midKoLeavingSnapshot).ok, true);

    const emittedDuringRecovery = [];
    const policyManager = new GameStateManager(testConfig, {
      onGameplayEvent: (fx) => emittedDuringRecovery.push(fx)
    });
    const policyRes = snapshotStore.loadAndRestore(policyManager);
    assert.strictEqual(policyRes.ok, true);
    assert.strictEqual(policyRes.evictedDuringRecovery, true);
    assert.strictEqual(policyManager.koTimers.size, 0, 'Must not create orphan KO/LEAVING timers');
    assert.strictEqual(
      emittedDuringRecovery.length,
      0,
      'Must not replay old KO/LEAVING FX during recovery'
    );
    assert.strictEqual(policyManager.stateVersion, preRecoveryVersion + 1);
    const postRecoverySnap = policyManager.getSnapshot();
    assertInvariants(postRecoverySnap, preRecoveryVersion, 'RecoveryPolicy_KO_LEAVING');
    assert.strictEqual(postRecoverySnap.seats[0].player.userId, 'rec_vip_1');
    assert.strictEqual(postRecoverySnap.seats[0].player.status, 'SEATED');
    assert.strictEqual(postRecoverySnap.seats[0].player.drunkLevel, 0);
    assert.strictEqual(postRecoverySnap.seats[1].player.userId, 'rec_vip_2');
    assert.strictEqual(postRecoverySnap.seats[1].player.status, 'SEATED');
    assert.strictEqual(postRecoverySnap.seats[1].player.drunkLevel, 0);
    assert.strictEqual(postRecoverySnap.seats[2].player.userId, keptSeatedUserId);
    assert.strictEqual(postRecoverySnap.vipQueue.length, 0);
    assert.strictEqual(postRecoverySnap.normalQueue.length, 1);
    assert.strictEqual(postRecoverySnap.normalQueue[0].userId, 'rec_norm_1');
    assert.strictEqual(
      postRecoverySnap.seats.some(
        (s) =>
          s.player &&
          (s.player.userId === evictedKoUserId || s.player.userId === evictedLeavingUserId)
      ),
      false,
      'Evicted KO/LEAVING players must not occupy any seat after recovery'
    );

    // Verify corrupted snapshot is rejected safely
    fs.writeFileSync(tempSnapshotPath, '{ corrupted json', 'utf8');
    const corruptLoad = snapshotStore.loadAndRestore(restoredManager);
    assert.strictEqual(corruptLoad.ok, false);
    assert.strictEqual(corruptLoad.reason, 'CORRUPTED_SNAPSHOT_JSON');
    if (fs.existsSync(tempSnapshotPath)) {
      fs.unlinkSync(tempSnapshotPath);
    }
    console.log('[PASS Snapshot] Lưu atomic và khôi phục state-snapshot.json an toàn, chống dữ liệu hỏng.');

    // === PERFORMANCE BENCHMARK (Section VIII) ===
    if (global.gc) {
      global.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;
    const totalPerfEvents = 1000;
    let acceptedCount = 0;
    let rejectedCount = 0;
    const startPerf = performance.now();

    for (let i = 0; i < totalPerfEvents; i += 1) {
      const mod = i % 5;
      let res;
      if (mod === 0) {
        res = mockService.simulateCommentNhau(`perf_user_${i % 40}`, `Perf ${i}`);
      } else if (mod === 1) {
        res = mockService.simulateLike(`perf_liker_${i % 10}`, 'Perf Liker', 25);
      } else if (mod === 2) {
        res = mockService.simulateGift(
          `perf_gifter_${i % 10}`,
          'Perf Gifter',
          'MOCK_GIFT_SMALL',
          1,
          i % 6
        );
      } else if (mod === 3) {
        res = mockService.simulateGift(
          `perf_gifter_${i % 10}`,
          'Perf Gifter',
          'MOCK_GIFT_SOBER',
          1,
          i % 6
        );
      } else {
        // Intentional invalid payload (20% of traffic) to measure rejection handling
        res = mockService.processMockEvent({
          eventType: 'LIKE',
          userId: 'bad_perf_user',
          payload: { likeDelta: -10 }
        });
      }
      if (res.ok) {
        acceptedCount += 1;
      } else {
        rejectedCount += 1;
      }
    }

    const elapsedMs = Number((performance.now() - startPerf).toFixed(2));
    const memAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2));
    const finalSnap = gameStateManager.getSnapshot();
    assertInvariants(finalSnap, lastVer, 'AfterPerfBenchmark');
    assert.strictEqual(eventQueue.getLength(), 0, 'EventQueue must be completely drained');

    console.log(
      `[PASS Performance] Đã xử lý ${totalPerfEvents} sự kiện (Hợp lệ: ${acceptedCount}, Từ chối: ${rejectedCount}) trong ${elapsedMs} ms | Queue tồn đọng: ${eventQueue.getLength()} | ΔHeap: ${heapDeltaMb} MB | stateVersion: ${finalSnap.stateVersion}.`
    );

    // 20: Shutdown cancels all timers safely
    gameStateManager.startCheersScheduler();
    gameStateManager.startWifeScheduler();
    if (client) client.disconnect();
    if (reconnectClient) reconnectClient.disconnect();
    await shutdown();

    assert.strictEqual(gameStateManager.cheersTimer, null);
    assert.strictEqual(gameStateManager.wifeTimer, null);
    assert.strictEqual(gameStateManager.koTimers.size, 0);
    console.log('[PASS 20] Shutdown hủy toàn bộ timer an toàn.');
  } finally {
    if (client && client.connected) client.disconnect();
    if (reconnectClient && reconnectClient.connected) reconnectClient.disconnect();
    await shutdown();
  }

  // === SECURITY VERIFICATION (Section VI) ===
  await runSecurityTests();

  console.log('=== TẤT CẢ KIỂM THỬ TÍCH HỢP, INVARIANTS, BẢO MẬT, SNAPSHOT & HIỆU NĂNG 1.5 ĐỀU PASS ===');
}

async function runSecurityTests() {
  const secretToken = 'super_secret_admin_token_2026';
  const secConfig = defaultConfig.buildConfig({
    port: 0,
    env: 'production',
    adminToken: secretToken,
    corsOrigins: ['http://localhost:3000', '*'],
    security: {
      rateLimitBypassInMock: false,
      rateLimitWindowsMs: {
        JOIN_CMD: 3000
      }
    }
  });

  // Check 8: Wildcard '*' is stripped from corsOrigins
  assert.strictEqual(secConfig.server.corsOrigins.includes('*'), false);

  // Check 3: ADMIN_SECRET_TOKEN is redacted in logger
  const redacted = logger.redactObject({
    adminToken: secretToken,
    'x-admin-token': secretToken,
    nested: { token: secretToken }
  });
  assert.strictEqual(redacted.adminToken, '[REDACTED]');
  assert.strictEqual(redacted['x-admin-token'], '[REDACTED]');
  assert.strictEqual(redacted.nested.token, '[REDACTED]');

  const secServer = await startServer(secConfig);
  const secUrl = `http://127.0.0.1:${secServer.port}`;
  let secSocket = null;

  try {
    // Check 1 & 2: Mock Dashboard & API blocked without valid token (403 Forbidden)
    const unauthDashboard = await fetch(`${secUrl}/mock`);
    assert.strictEqual(unauthDashboard.status, 403);

    const unauthPost = await fetch(`${secUrl}/api/mock/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'wrong_token' },
      body: JSON.stringify({
        eventType: 'COMMENT',
        userId: 'sec_user_1',
        payload: { comment: 'nhậu' }
      })
    });
    assert.strictEqual(unauthPost.status, 403);

    // Authorized HTTP POST with valid x-admin-token succeeds
    const authPost1 = await fetch(`${secUrl}/api/mock/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': secretToken },
      body: JSON.stringify({
        eventType: 'COMMENT',
        userId: 'sec_user_1',
        nickname: '<script>alert(1)</script>AnhHai',
        payload: { comment: 'nhậu' }
      })
    });
    assert.strictEqual(authPost1.status, 200);
    const authJson1 = await authPost1.json();
    assert.strictEqual(authJson1.ok, true);
    // Check 4: XSS script tags sanitized
    assert.strictEqual(authJson1.event.nickname.includes('<'), false);
    assert.strictEqual(authJson1.event.nickname.includes('>'), false);

    // Check 5: Rate Limiter blocks rapid second JOIN_CMD from same userId within 3000ms
    const rateLimitedPost = await fetch(`${secUrl}/api/mock/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': secretToken },
      body: JSON.stringify({
        eventType: 'COMMENT',
        userId: 'sec_user_1',
        payload: { comment: 'dô' }
      })
    });
    assert.strictEqual(rateLimitedPost.status, 400);
    const rateLimitedJson = await rateLimitedPost.json();
    assert.strictEqual(rateLimitedJson.ok, false);
    assert.strictEqual(rateLimitedJson.error, 'Rate limit exceeded.');

    // Check Socket mock:trigger_event auth protection
    secSocket = createClient(secUrl, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Socket timeout')), 5000);
      secSocket.once('connect', () => {
        clearTimeout(t);
        resolve();
      });
      secSocket.once('connect_error', reject);
    });

    const unauthSocketAck = await emitWithAck(secSocket, 'mock:trigger_event', {
      token: 'wrong_token',
      rawEvent: {
        eventType: 'COMMENT',
        userId: 'sec_user_2',
        payload: { comment: 'nhậu' }
      }
    });
    assert.strictEqual(unauthSocketAck.ok, false);

    const authSocketAck = await emitWithAck(secSocket, 'mock:trigger_event', {
      token: secretToken,
      rawEvent: {
        eventType: 'COMMENT',
        userId: 'sec_user_2',
        payload: { comment: 'nhậu' }
      }
    });
    assert.strictEqual(authSocketAck.ok, true);

    // Check 3: Snapshot never exposes adminToken
    const snapString = JSON.stringify(secServer.gameStateManager.getSnapshot());
    assert.strictEqual(snapString.includes(secretToken), false);
  } finally {
    if (secSocket && secSocket.connected) secSocket.disconnect();
    await secServer.shutdown();
  }

  // Check 7: Mock Events blocked when server is in LIVE mode
  const liveModeConfig = defaultConfig.buildConfig({
    port: 0,
    app: { defaultMode: 'LIVE' }
  });
  const liveServer = await startServer(liveModeConfig);
  try {
    const mockInLiveRes = liveServer.mockService.simulateCommentNhau('hacker_mock', 'Hacker');
    assert.strictEqual(mockInLiveRes.ok, false);
    assert.strictEqual(mockInLiveRes.error, 'Mock Simulator is disabled in LIVE mode.');
    assert.strictEqual(liveServer.gameStateManager.stateVersion, 0);
  } finally {
    await liveServer.shutdown();
  }

  console.log('[PASS Security] Xác thực Mock, Rate Limiter, Sanitization, CORS, Redaction & chặn Mock trong LIVE Mode đều PASS.');
}

runIntegrationTests().catch((err) => {
  console.error('[FAIL] Kiểm thử tích hợp 1.5 thất bại:', err);
  process.exit(1);
});
