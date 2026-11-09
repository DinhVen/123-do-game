'use strict';

const assert = require('assert');
const { io: createClient } = require('socket.io-client');
const defaultConfig = require('../server/config');
const { startServer } = require('../server/index');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ NHIỆM VỤ 1.3 (ĐỘ SAY, LIKE, DÔ & KO) ===');

  // Verify locked Master Plan v1.0 production parameters in defaultConfig
  assert.strictEqual(defaultConfig.gameplayV1.cheersIntervalMs, 30000, 'cheersIntervalMs must be 30000ms');
  assert.strictEqual(defaultConfig.gameplayV1.cheersDrunkDelta, 5, 'cheersDrunkDelta must be 5');
  assert.strictEqual(defaultConfig.gameplayV1.likeMilestoneStep, 100, 'likeMilestoneStep must be 100');
  assert.strictEqual(defaultConfig.gameplayV1.likeDrunkDelta, 1, 'likeDrunkDelta must be 1');
  assert.strictEqual(defaultConfig.gameplayV1.koHoldDurationMs, 3000, 'koHoldDurationMs must be 3000ms');
  console.log('[PASS] Cấu hình sản xuất Master Plan v1.0 giữ nguyên (30000ms/+5, 100/+1, KO 3000ms).');

  // Start server with real 3000ms KO hold duration
  const testConfig = defaultConfig.buildConfig({
    port: 0,
    env: 'development',
    gameplayV1: {
      koHoldDurationMs: 3000
    }
  });

  const serverInstance = await startServer(testConfig);
  const { port, shutdown, mockService, gameStateManager } = serverInstance;
  const baseUrl = `http://127.0.0.1:${port}`;
  let socketClient = null;
  let reconnectClient = null;

  const receivedFxEvents = [];
  const receivedStateVersions = [];

  try {
    socketClient = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
      socketClient.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socketClient.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    socketClient.on('game:action_fx', (fx) => {
      receivedFxEvents.push(fx);
    });

    socketClient.on('game:state_patch', (patch) => {
      receivedStateVersions.push(patch.stateVersion);
    });

    // Test 9 & 10: Single DÔ scheduler check & empty table DÔ does not change stateVersion
    const secondStartResult = gameStateManager.startCheersScheduler();
    assert.strictEqual(secondStartResult, false, 'startCheersScheduler must not create duplicate timer');
    console.log('[PASS 10] Không tạo trùng timer "DÔ".');

    // Stop automatic scheduler during deterministic step checks (we will test real scheduler tick separately)
    gameStateManager.stopCheersScheduler();

    const versionBeforeEmptyCheers = gameStateManager.stateVersion;
    const emptyCheersRes = mockService.simulateCheers();
    assert.strictEqual(emptyCheersRes.ok, true);
    assert.strictEqual(emptyCheersRes.stateResult.stateChanged, false);
    assert.strictEqual(emptyCheersRes.stateResult.reason, 'NO_SEATED_PLAYERS');
    assert.strictEqual(gameStateManager.stateVersion, versionBeforeEmptyCheers);
    console.log('[PASS 9] Chu kỳ "DÔ" khi bàn trống không làm đổi stateVersion.');

    // Test 5: When table has no SEATED players, Likes are NOT accumulated for future joiners
    const emptyLikeRes = mockService.simulateLike('like_sender_empty', 'Like Khi Bàn Trống', 80);
    assert.strictEqual(emptyLikeRes.ok, true);
    assert.strictEqual(emptyLikeRes.stateResult.stateChanged, false);
    assert.strictEqual(emptyLikeRes.stateResult.reason, 'NO_SEATED_PLAYERS');
    assert.strictEqual(gameStateManager.getSnapshot().likeMetrics.unconsumedLikes, 0);
    console.log('[PASS 5] Khi bàn không có người SEATED, Like không được tích lũy cho người vào sau.');

    // Test 1: Newly seated players have drunkLevel = 0
    const p1Join = mockService.simulateCommentNhau('user_seat_1', 'Chiến Thần Ghế 1');
    const p2Join = mockService.simulateCommentDo('user_seat_2', 'Chiến Thần Ghế 2');
    assert.strictEqual(p1Join.stateResult.player.drunkLevel, 0);
    assert.strictEqual(p1Join.stateResult.player.status, 'SEATED');
    assert.strictEqual(p2Join.stateResult.player.drunkLevel, 0);
    assert.strictEqual(p2Join.stateResult.player.status, 'SEATED');
    console.log('[PASS 1] Người mới ngồi có drunkLevel = 0.');

    // Test 2: 50 Likes -> drunkLevel unchanged (0), unconsumedLikes = 50
    const like50a = mockService.simulateLike('viewer_like_1', 'Khách Like 1', 50);
    assert.strictEqual(like50a.stateResult.stateChanged, true);
    assert.strictEqual(like50a.stateResult.milestonesTriggered, 0);
    assert.strictEqual(like50a.stateResult.unconsumedLikes, 50);
    let snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 0);
    assert.strictEqual(snap.seats[1].player.drunkLevel, 0);
    assert.strictEqual(snap.likeMetrics.unconsumedLikes, 50);
    console.log('[PASS 2] 50 Like chưa tăng độ say, unconsumedLikes = 50.');

    // Test 3: Another 50 Likes -> reaches 100 -> all SEATED players +1, unconsumedLikes = 0
    const like50b = mockService.simulateLike('viewer_like_1', 'Khách Like 1', 50);
    assert.strictEqual(like50b.stateResult.milestonesTriggered, 1);
    assert.strictEqual(like50b.stateResult.drunkDeltaApplied, 1);
    assert.strictEqual(like50b.stateResult.unconsumedLikes, 0);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 1);
    assert.strictEqual(snap.seats[1].player.drunkLevel, 1);
    assert.strictEqual(snap.likeMetrics.unconsumedLikes, 0);
    console.log('[PASS 3] Thêm 50 Like -> đủ 100 -> mọi người SEATED tăng +1, unconsumedLikes = 0.');

    // Test 4: 250 Likes -> all SEATED players +2, unconsumedLikes = 50
    const like250 = mockService.simulateLike('viewer_like_2', 'Khách Like 2', 250);
    assert.strictEqual(like250.stateResult.milestonesTriggered, 2);
    assert.strictEqual(like250.stateResult.drunkDeltaApplied, 2);
    assert.strictEqual(like250.stateResult.unconsumedLikes, 50);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 3);
    assert.strictEqual(snap.seats[1].player.drunkLevel, 3);
    assert.strictEqual(snap.likeMetrics.unconsumedLikes, 50);
    console.log('[PASS 4] 250 Like -> mọi người SEATED tăng +2, unconsumedLikes = 50.');

    // Test 6: Duplicate eventId must not add Likes or drunkLevel twice
    const dupEventId = 'evt_custom_dedup_test_001';
    const firstEventWithId = mockService.processMockEvent({
      eventId: dupEventId,
      eventType: 'LIKE',
      userId: 'viewer_dedup',
      nickname: 'Viewer Dedup',
      payload: { likeDelta: 100 }
    });
    assert.strictEqual(firstEventWithId.ok, true);
    assert.strictEqual(firstEventWithId.stateResult.stateChanged, true);
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 4);

    const duplicateEventWithSameId = mockService.processMockEvent({
      eventId: dupEventId,
      eventType: 'LIKE',
      userId: 'viewer_dedup',
      nickname: 'Viewer Dedup',
      payload: { likeDelta: 100 }
    });
    assert.strictEqual(duplicateEventWithSameId.ok, true);
    assert.strictEqual(duplicateEventWithSameId.stateResult.stateChanged, false);
    assert.strictEqual(duplicateEventWithSameId.stateResult.reason, 'DUPLICATE_EVENT_ID');
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 4);
    assert.strictEqual(gameStateManager.getSnapshot().likeMetrics.unconsumedLikes, 50);
    console.log('[PASS 6] Duplicate eventId không được cộng Like hoặc độ say hai lần.');

    // Test 7: "1, 2, 3 DÔ!" cycle adds +5 to all SEATED players
    const cheers1 = mockService.simulateCheers();
    assert.strictEqual(cheers1.stateResult.stateChanged, true);
    assert.strictEqual(cheers1.stateResult.action, 'CHEERS_APPLIED');
    assert.strictEqual(cheers1.stateResult.drunkDelta, 5);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 9);
    assert.strictEqual(snap.seats[1].player.drunkLevel, 9);
    console.log('[PASS 7] Chu kỳ "DÔ" tăng +5 cho tất cả người chơi SEATED.');

    // Test automatic scheduler tick via fast timer instance
    const originalInterval = gameStateManager.cheersIntervalMs;
    gameStateManager.cheersIntervalMs = 60;
    gameStateManager.startCheersScheduler();
    await wait(95);
    gameStateManager.stopCheersScheduler();
    gameStateManager.cheersIntervalMs = originalInterval;
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 14);
    assert.strictEqual(snap.seats[1].player.drunkLevel, 14);

    // Fill remaining 4 seats (seats 3..6) so table is full (6/6)
    // Seat 1 & 2 are at 14. Seat 3..6 join at 0.
    for (let i = 3; i <= 6; i += 1) {
      mockService.simulateCommentNhau(`user_seat_${i}`, `Chiến Thần Ghế ${i}`);
    }
    // Enqueue 1 VIP and 1 Normal in waiting queue to test replacement order after KO
    mockService.simulateCommentNhau('normal_wait_1', 'Khách Thường Chờ 1');
    mockService.simulateVipJoin('vip_wait_1', 'Khách VIP Chờ 1');

    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 14);
    assert.strictEqual(snap.seats[2].player.drunkLevel, 0);
    assert.strictEqual(snap.vipQueue.length, 1);
    assert.strictEqual(snap.normalQueue.length, 1);

    // Advance Seat 1 & Seat 2 to drunkLevel = 96:
    // Currently Seat 1 & 2 are at 14, Seat 3..6 are at 0.
    // 16 DÔ cycles (+80) -> Seat 1 & 2 = 94, Seat 3..6 = 80.
    for (let c = 0; c < 16; c += 1) {
      mockService.simulateCheers();
    }
    // Add 200 Likes (+2) -> Seat 1 & 2 = 96, Seat 3..6 = 82, unconsumedLikes = 50.
    mockService.simulateLike('viewer_boost', 'Viewer Boost', 200);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 96);
    assert.strictEqual(snap.seats[1].player.drunkLevel, 96);
    assert.strictEqual(snap.seats[2].player.drunkLevel, 82);

    // Test 11, 12, 21: Trigger DÔ (+5) -> Seat 1 & Seat 2 go 96 + 5 -> clamped at 100, both transition to KO once!
    const koEventsBefore = receivedFxEvents.filter((e) => e.actionType === 'KO').length;
    const cheersToKo = mockService.simulateCheers();
    assert.strictEqual(cheersToKo.stateResult.newlyKoPlayers.length, 2);

    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 100);
    assert.strictEqual(snap.seats[0].player.status, 'KO');
    assert.strictEqual(snap.seats[1].player.drunkLevel, 100);
    assert.strictEqual(snap.seats[1].player.status, 'KO');
    assert.strictEqual(snap.seats[2].player.drunkLevel, 87);
    assert.strictEqual(snap.seats[2].player.status, 'SEATED');
    console.log('[PASS 11] Độ say tăng từ 96 + 5 bị kẹp tại 100.');

    await wait(50);
    const koEventsAfter = receivedFxEvents.filter((e) => e.actionType === 'KO');
    assert.strictEqual(koEventsAfter.length - koEventsBefore, 2, 'Must emit exactly 1 KO event per newly KO player');
    console.log('[PASS 12] Đạt 100 chuyển sang KO đúng 1 lần.');
    console.log('[PASS 21] Nhiều người chơi cùng đạt 100 trong một lần "DÔ" đều được xử lý KO.');

    // Test 8 & 13: While Seat 1 & 2 are in KO (during 3000ms hold), extra Likes and DÔ do NOT affect KO players or trigger KO a second time
    mockService.simulateLike('viewer_extra', 'Viewer Extra', 100); // +1 to SEATED (Seats 3..6 become 88)
    mockService.simulateCheers(); // +5 to SEATED (Seats 3..6 become 93)
    await wait(50);

    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.userId, 'user_seat_1');
    assert.strictEqual(snap.seats[0].player.drunkLevel, 100);
    assert.strictEqual(snap.seats[0].player.status, 'KO');
    assert.strictEqual(snap.seats[2].player.drunkLevel, 93);
    const koEventsAfterExtra = receivedFxEvents.filter((e) => e.actionType === 'KO');
    assert.strictEqual(koEventsAfterExtra.length, koEventsAfter.length, 'KO players must not trigger KO a second time');
    console.log('[PASS 8] Chu kỳ "DÔ" không tăng độ say cho người đang KO.');
    console.log('[PASS 13] Người đang KO không bị KO lần thứ hai khi có thêm Like hoặc "DÔ".');

    // Test 14: Verify at ~1200ms after KO, Seat 1 & Seat 2 are STILL holding the KO players (3000ms hold)
    await wait(1100);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.userId, 'user_seat_1');
    assert.strictEqual(snap.seats[0].player.status, 'KO');
    assert.strictEqual(snap.seats[1].player.userId, 'user_seat_2');
    assert.strictEqual(snap.seats[1].player.status, 'KO');
    console.log('[PASS 14] Ghế của người KO được giữ trong 3000ms.');

    // Wait remaining time for the 3000ms KO hold to complete (~2050ms more -> total ~3250ms)
    await wait(2050);

    // Test 15, 16, 17, 18: After 3000ms, user_seat_1 & user_seat_2 leave table;
    // Seat 1 gets vip_wait_1 (from vipQueue first) with drunkLevel = 0;
    // Seat 2 gets normal_wait_1 (from normalQueue second) with drunkLevel = 0.
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.userId, 'vip_wait_1');
    assert.strictEqual(snap.seats[0].player.isVIP, true);
    assert.strictEqual(snap.seats[0].player.status, 'SEATED');
    assert.strictEqual(snap.seats[0].player.drunkLevel, 0);

    assert.strictEqual(snap.seats[1].player.userId, 'normal_wait_1');
    assert.strictEqual(snap.seats[1].player.isVIP, false);
    assert.strictEqual(snap.seats[1].player.status, 'SEATED');
    assert.strictEqual(snap.seats[1].player.drunkLevel, 0);
    assert.strictEqual(snap.totalWaiting, 0);
    console.log('[PASS 15] Sau 3000ms, người KO rời bàn.');
    console.log('[PASS 16] Nếu vipQueue có người, VIP đầu hàng vào ghế trống trước.');
    console.log('[PASS 17] Nếu vipQueue trống và normalQueue có người, Normal đầu hàng vào ghế trống.');
    console.log('[PASS 18] Người mới từ hàng chờ vào ghế có drunkLevel = 0.');

    // Test 19 & 20:
    // Currently Seats 3..6 are at drunkLevel = 93, waiting queue is empty (0).
    // Trigger 2 DÔ cycles (+10) -> Seats 3..6 reach 100 and enter KO!
    // For Seat 3, we manually release it early and put a new player 'fresh_seat_3' on Seat 3,
    // plus dispatch a stale SYSTEM_KO_RELEASE token to prove stale KO timer NEVER evicts 'fresh_seat_3'.
    // For Seats 4..6, waiting queue is empty, so after 3000ms they become null (empty).
    mockService.simulateCheers(); // Seats 3..6 -> 98
    mockService.simulateCheers(); // Seats 3..6 -> 100 (KO!)

    snap = gameStateManager.getSnapshot();
    const staleKoTokenSeat3 = snap.seats[2].player.koToken;
    assert.strictEqual(snap.seats[2].player.status, 'KO');
    assert.strictEqual(snap.seats[3].player.status, 'KO');

    // Manually release Seat 3 early and seat 'fresh_seat_3'
    mockService.simulateReleaseSeat(3);
    mockService.simulateCommentNhau('fresh_seat_3', 'Người Mới Ghế 3');
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[2].player.userId, 'fresh_seat_3');
    assert.strictEqual(snap.seats[2].player.status, 'SEATED');

    // Simulate stale KO timer firing for Seat 3 with old userId/koToken
    const staleReleaseResult = gameStateManager.processEvent({
      eventId: 'evt_stale_ko_test',
      source: 'SYSTEM',
      eventType: 'SYSTEM_KO_RELEASE',
      timestamp: Date.now(),
      payload: {
        seatId: 3,
        userId: 'user_seat_3',
        koToken: staleKoTokenSeat3
      }
    });
    assert.strictEqual(staleReleaseResult.stateChanged, false);
    assert.strictEqual(staleReleaseResult.reason, 'STALE_OR_INVALID_KO_RELEASE');
    assert.strictEqual(gameStateManager.getSnapshot().seats[2].player.userId, 'fresh_seat_3');
    console.log('[PASS 20] Timer KO cũ không xóa nhầm người chơi mới nếu ghế đã thay đổi.');

    // Wait 3150ms for Seats 4..6 KO timers to finish with empty waiting queue
    await wait(3150);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[3].player, null);
    assert.strictEqual(snap.seats[4].player, null);
    assert.strictEqual(snap.seats[5].player, null);
    console.log('[PASS 19] Nếu hàng chờ trống, ghế trở thành trống sau KO.');

    // Test 22: stateVersion always increments sequentially (1, 2, 3, ...)
    assert.ok(receivedStateVersions.length > 10, 'Should have received multiple state_patch versions');
    for (let i = 1; i < receivedStateVersions.length; i += 1) {
      assert.strictEqual(
        receivedStateVersions[i],
        receivedStateVersions[i - 1] + 1,
        `stateVersion must increment sequentially by 1 (got ${receivedStateVersions[i - 1]} -> ${receivedStateVersions[i]})`
      );
    }
    console.log(`[PASS 22] stateVersion luôn tăng tuần tự (1 -> ${receivedStateVersions[receivedStateVersions.length - 1]}).`);

    // Test 23: Reconnecting client receives accurate snapshot with drunkLevel, status, unconsumedLikes
    reconnectClient = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false
    });
    const reconnectSnap = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Reconnect snapshot timeout')), 5000);
      reconnectClient.once('game:state_snapshot', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      reconnectClient.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    assert.strictEqual(reconnectSnap.stateVersion, gameStateManager.stateVersion);
    assert.strictEqual(reconnectSnap.state.seats[0].player.userId, 'vip_wait_1');
    assert.strictEqual(reconnectSnap.state.seats[0].player.drunkLevel, 10);
    assert.strictEqual(reconnectSnap.state.seats[0].player.status, 'SEATED');
    assert.strictEqual(reconnectSnap.state.likeMetrics.unconsumedLikes, 50);
    console.log('[PASS 23] Client reconnect nhận snapshot có drunkLevel, status, unconsumedLikes chính xác.');

    // Test 24: Server shutdown cancels all DÔ and KO timers cleanly
    gameStateManager.startCheersScheduler();
    gameStateManager._scheduleKoReleaseTimer(6, 'dummy_user', 'ko_dummy');
    assert.ok(gameStateManager.cheersTimer !== null);
    assert.strictEqual(gameStateManager.koTimers.size, 1);

    if (socketClient) socketClient.disconnect();
    if (reconnectClient) reconnectClient.disconnect();
    await shutdown();

    assert.strictEqual(gameStateManager.cheersTimer, null, 'cheersTimer must be null after shutdown');
    assert.strictEqual(gameStateManager.koTimers.size, 0, 'koTimers must be empty after shutdown');
    console.log('[PASS 24] Khi dừng server, toàn bộ timer DÔ và KO được hủy sạch.');

    console.log('=== TẤT CẢ 24 TIÊU CHÍ KIỂM THỬ NHIỆM VỤ 1.3 ĐỀU PASS ===');
  } finally {
    if (socketClient && socketClient.connected) {
      socketClient.disconnect();
    }
    if (reconnectClient && reconnectClient.connected) {
      reconnectClient.disconnect();
    }
    await shutdown();
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Kiểm thử Nhiệm vụ 1.3 thất bại:', err);
  process.exit(1);
});
