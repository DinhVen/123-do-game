'use strict';

const assert = require('assert');
const { io: createClient } = require('socket.io-client');
const defaultConfig = require('../server/config');
const { startServer } = require('../server/index');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ NHIỆM VỤ 1.4 (GIFT GAMEPLAY & VỢ BẮT VỀ) ===');

  // Verify Master Plan v1.0 config defaults
  assert.strictEqual(defaultConfig.gameplayV1.randomWifeCheckSec, 60);
  assert.strictEqual(defaultConfig.gameplayV1.randomWifeProbability, 0.10);
  assert.strictEqual(defaultConfig.gameplayV1.randomWifeCooldownSec, 180);
  assert.strictEqual(defaultConfig.gameplayV1.leavingHoldDurationMs, 3000);
  assert.strictEqual(defaultConfig.gameplayV1.vipGiftThreshold, null);
  assert.deepStrictEqual(defaultConfig.gameplayV1.liveGiftMappings, {});

  const testConfig = defaultConfig.buildConfig({
    port: 0,
    env: 'development',
    gameplayV1: {
      koHoldDurationMs: 250,
      leavingHoldDurationMs: 250
    }
  });

  const serverInstance = await startServer(testConfig);
  const { port, shutdown, mockService, gameStateManager } = serverInstance;
  const baseUrl = `http://127.0.0.1:${port}`;
  let socketClient = null;
  let reconnectClient = null;

  const receivedFx = [];
  const receivedPatches = [];

  let fakeNow = 1700000000000;
  let randomQueue = [0.5];
  gameStateManager.setClock(() => fakeNow);
  gameStateManager.setRandom(() => (randomQueue.length > 0 ? randomQueue.shift() : 0.5));

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

    socketClient.on('game:action_fx', (fx) => receivedFx.push(fx));
    socketClient.on('game:state_patch', (patch) => receivedPatches.push(patch));

    // Test 22: No duplicate schedulers
    assert.strictEqual(gameStateManager.startCheersScheduler(), false);
    assert.strictEqual(gameStateManager.startWifeScheduler(), false);
    console.log('[PASS 22] Không có scheduler trùng.');

    // Pause background schedulers during deterministic assertions
    gameStateManager.stopCheersScheduler();
    gameStateManager.stopWifeScheduler();

    // Test 18: Random Wife event does not run when table is empty
    const vBeforeEmptyWife = gameStateManager.stateVersion;
    randomQueue = [0.01, 0.0]; // Would trigger if seated players existed
    const emptyWifeRes = mockService.simulateRandomWifeCheck();
    assert.strictEqual(emptyWifeRes.stateResult.stateChanged, false);
    assert.strictEqual(emptyWifeRes.stateResult.reason, 'NO_SEATED_PLAYERS');
    assert.strictEqual(gameStateManager.stateVersion, vBeforeEmptyWife);
    console.log('[PASS 18] Sự kiện ngẫu nhiên không chạy khi bàn trống.');

    // Seat 6 players (seats 1..6, index 0..5)
    for (let i = 1; i <= 6; i += 1) {
      mockService.simulateCommentNhau(`p_seat_${i}`, `Người Chơi ${i}`);
    }
    let snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seatedPlayers.length, 6);

    // Test 1: Gift increases drunkLevel by exact configured value
    // MOCK_GIFT_SMALL (+10) on seatIndex 0
    const giftInc1 = mockService.simulateGift('gifter_1', 'Khách Tặng 1', 'MOCK_GIFT_SMALL', 1, 0);
    assert.strictEqual(giftInc1.stateResult.stateChanged, true);
    assert.strictEqual(giftInc1.stateResult.drunkDeltaApplied, 10);
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 10);

    // MOCK_GIFT_VIP (+25) on seatIndex 0 -> 10 + 25 = 35
    const giftInc2 = mockService.simulateGift('gifter_1', 'Khách Tặng 1', 'MOCK_GIFT_VIP', 1, 0);
    assert.strictEqual(giftInc2.stateResult.stateChanged, true);
    assert.strictEqual(giftInc2.stateResult.drunkDeltaApplied, 25);
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 35);

    // MOCK_GIFT_ALL (+15) on all seated players -> seat 0 becomes 50, seats 1..5 become 15
    const giftAll = mockService.simulateGift('gifter_1', 'Khách Tặng 1', 'MOCK_GIFT_ALL', 1, null);
    assert.strictEqual(giftAll.stateResult.stateChanged, true);
    assert.strictEqual(giftAll.stateResult.drunkDeltaApplied, 15);
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 50);
    assert.strictEqual(gameStateManager.getSnapshot().seats[1].player.drunkLevel, 15);
    console.log('[PASS 1] Gift tăng say đúng giá trị.');

    // Test 2: Gift decreases drunkLevel by exact configured value (MOCK_GIFT_SOBER -20)
    // Seat 0: 50 - 20 = 30
    const giftDec1 = mockService.simulateGift('gifter_2', 'Khách Giải Say', 'MOCK_GIFT_SOBER', 1, 0);
    assert.strictEqual(giftDec1.stateResult.stateChanged, true);
    assert.strictEqual(giftDec1.stateResult.drunkDeltaApplied, -20);
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 30);
    console.log('[PASS 2] Gift giảm say đúng giá trị.');

    // Test 4: drunkLevel never drops below 0
    // Seat 1 is at 15. Sending MOCK_GIFT_SOBER (-20) clamps Seat 1 at 0.
    const giftDecClamp = mockService.simulateGift('gifter_2', 'Khách Giải Say', 'MOCK_GIFT_SOBER', 1, 1);
    assert.strictEqual(giftDecClamp.stateResult.stateChanged, true);
    assert.strictEqual(gameStateManager.getSnapshot().seats[1].player.drunkLevel, 0);
    console.log('[PASS 4] Độ say không nhỏ hơn 0.');

    // Test 3 & 5: drunkLevel never exceeds 100, and reaching 100 via Gift triggers KO once
    // Seat 0 is at 30. Send MOCK_GIFT_VIP (+25) with repeatCount = 3 (+75) -> 30 + 75 = 105 -> clamped at 100 & KO!
    const giftToKo = mockService.simulateGift('gifter_3', 'Khách Ép Say', 'MOCK_GIFT_VIP', 3, 0);
    assert.strictEqual(giftToKo.stateResult.stateChanged, true);
    assert.strictEqual(giftToKo.stateResult.newlyKoPlayers.length, 1);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player.drunkLevel, 100);
    assert.strictEqual(snap.seats[0].player.status, 'KO');
    console.log('[PASS 3] Độ say không vượt 100.');
    console.log('[PASS 5] Gift tăng say có thể kích hoạt KO.');

    // Test 6 & 8: While Seat 0 is KO:
    // - Gift SOBER_UP (-20) does NOT revive KO player and does NOT cancel KO timer.
    // - Gift DRINK_SMALL (+10) on KO target does NOT change stateVersion.
    const vWhenSeat0Ko = gameStateManager.stateVersion;
    const soberOnKo = mockService.simulateGift('gifter_save', 'Cứu Bồ', 'MOCK_GIFT_SOBER', 1, 0);
    assert.strictEqual(soberOnKo.stateResult.stateChanged, false);
    assert.strictEqual(soberOnKo.stateResult.reason, 'TARGET_ALREADY_KO');
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.status, 'KO');
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 100);
    assert.strictEqual(gameStateManager.stateVersion, vWhenSeat0Ko);
    console.log('[PASS 6] Gift giảm say không hồi sinh KO.');

    const drinkOnKo = mockService.simulateGift('gifter_more', 'Bồi Thêm', 'MOCK_GIFT_SMALL', 1, 0);
    assert.strictEqual(drinkOnKo.stateResult.stateChanged, false);
    assert.strictEqual(drinkOnKo.stateResult.reason, 'TARGET_ALREADY_KO');
    assert.strictEqual(gameStateManager.stateVersion, vWhenSeat0Ko);
    console.log('[PASS 8] Gift mục tiêu KO không làm thay đổi state.');

    // Test 17: Wife summon Gift on KO player does NOT trigger
    const wifeOnKo = mockService.simulateGift('gifter_wife', 'Gọi Vợ', 'MOCK_GIFT_WIFE', 1, 0);
    assert.strictEqual(wifeOnKo.stateResult.stateChanged, false);
    assert.strictEqual(wifeOnKo.stateResult.reason, 'TARGET_ALREADY_KO');
    assert.strictEqual(gameStateManager.stateVersion, vWhenSeat0Ko);
    console.log('[PASS 17] Không kích hoạt vợ bắt về trên người KO.');

    // Wait for Seat 0 KO hold (250ms in testConfig) to release so Seat 0 becomes empty
    await wait(320);
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[0].player, null);

    // Test 10: Gift targeting a player who already left (or seat now occupied by someone else) does NOT redirect to another player
    // Seat 0 is empty -> targeting seatIndex 0 fails with TARGET_ALREADY_LEFT
    const vBeforeLeftTarget = gameStateManager.stateVersion;
    const giftOnEmptySeat = mockService.simulateGift('gifter_miss', 'Tặng Trễ', 'MOCK_GIFT_SMALL', 1, 0);
    assert.strictEqual(giftOnEmptySeat.stateResult.stateChanged, false);
    assert.strictEqual(giftOnEmptySeat.stateResult.reason, 'TARGET_ALREADY_LEFT');
    assert.strictEqual(gameStateManager.stateVersion, vBeforeLeftTarget);

    // Put a new player 'new_seat_1' into Seat 0, then send a Gift aimed at old 'p_seat_1' on seatIndex 0
    mockService.simulateCommentNhau('new_seat_1', 'Người Mới Ghế 1');
    const vAfterNewSeat1 = gameStateManager.stateVersion;
    const giftForOldUserOnSeat0 = mockService.simulateGift(
      'gifter_miss',
      'Tặng Người Cũ',
      'MOCK_GIFT_SMALL',
      1,
      0,
      { targetUserId: 'p_seat_1' }
    );
    assert.strictEqual(giftForOldUserOnSeat0.stateResult.stateChanged, false);
    assert.strictEqual(giftForOldUserOnSeat0.stateResult.reason, 'TARGET_ALREADY_LEFT');
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.drunkLevel, 0);
    assert.strictEqual(gameStateManager.stateVersion, vAfterNewSeat1);
    console.log('[PASS 10] Gift mục tiêu đã rời bàn không tự chuyển sang người khác.');

    // Test 7: Invalid / unmapped Gift is safely ignored without changing stateVersion
    const vBeforeInvalidGift = gameStateManager.stateVersion;
    const invalidMockGift = mockService.processMockEvent({
      eventType: 'GIFT',
      userId: 'bad_gifter',
      nickname: 'Bad Gifter',
      payload: { mockGiftKey: 'NON_EXISTENT_GIFT' }
    });
    assert.strictEqual(invalidMockGift.ok, false);
    assert.strictEqual(gameStateManager.stateVersion, vBeforeInvalidGift);

    // Also test unmapped LIVE gift reaching GameStateManager directly
    const unmappedLiveGift = gameStateManager.processEvent({
      eventId: 'evt_unmapped_live_gift_999',
      source: 'LIVE',
      eventType: 'GIFT',
      user: { userId: 'live_viewer_1', nickname: 'Live Viewer', displayNickname: 'Live Viewer' },
      payload: { giftId: 999999, repeatCount: 1, targetSeatIndex: 0 }
    });
    assert.strictEqual(unmappedLiveGift.stateChanged, false);
    assert.strictEqual(unmappedLiveGift.reason, 'UNMAPPED_GIFT');
    assert.strictEqual(gameStateManager.stateVersion, vBeforeInvalidGift);
    console.log('[PASS 7] Gift không hợp lệ bị bỏ qua.');

    // Test 11, 12, 13, 14, 15: VIP Gift Queue Rules (using MOCK_GIFT_VIP_PASS)
    // Currently all 6 seats are occupied. Add 2 Normal queue players: norm_1, norm_2
    mockService.simulateCommentNhau('norm_1', 'Thường 1');
    mockService.simulateCommentNhau('norm_2', 'Thường 2');
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.normalQueue.length, 2);
    assert.strictEqual(snap.vipQueue.length, 0);
    assert.strictEqual(snap.totalWaiting, 2);

    // Test 11: norm_2 sends MOCK_GIFT_VIP_PASS -> upgraded from Normal Queue to VIP Queue without increasing totalWaiting
    const vipUpgradeRes = mockService.simulateGift('norm_2', 'Thường 2', 'MOCK_GIFT_VIP_PASS', 1, null);
    assert.strictEqual(vipUpgradeRes.stateResult.stateChanged, true);
    assert.strictEqual(vipUpgradeRes.stateResult.action, 'PROMOTED_TO_VIP_QUEUE');
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.vipQueue.length, 1);
    assert.strictEqual(snap.vipQueue[0].userId, 'norm_2');
    assert.strictEqual(snap.normalQueue.length, 1);
    assert.strictEqual(snap.normalQueue[0].userId, 'norm_1');
    assert.strictEqual(snap.totalWaiting, 2);
    console.log('[PASS 11] Gift VIP nâng cấp Normal Queue đúng.');

    // Test 12 & 13: Sending MOCK_GIFT_VIP_PASS again by norm_2 (already in VIP queue) or by new_seat_1 (already seated)
    // does NOT create duplicate userId and does NOT evict seated players
    const seatedIdsBeforeVip = snap.seats.map((s) => s.player.userId);
    const dupVipInQueue = mockService.simulateGift('norm_2', 'Thường 2', 'MOCK_GIFT_VIP_PASS', 1, null);
    assert.strictEqual(dupVipInQueue.stateResult.stateChanged, false);
    assert.strictEqual(dupVipInQueue.stateResult.reason, 'ALREADY_IN_VIP_QUEUE');

    const dupVipSeated = mockService.simulateGift('new_seat_1', 'Người Mới Ghế 1', 'MOCK_GIFT_VIP_PASS', 1, null);
    assert.strictEqual(dupVipSeated.stateResult.stateChanged, false);
    assert.strictEqual(dupVipSeated.stateResult.reason, 'ALREADY_SEATED');

    const newVipJoin = mockService.simulateGift('vip_new_1', 'VIP Mới 1', 'MOCK_GIFT_VIP_PASS', 1, null);
    assert.strictEqual(newVipJoin.stateResult.stateChanged, true);
    assert.strictEqual(newVipJoin.stateResult.action, 'ENQUEUED_VIP');
    snap = gameStateManager.getSnapshot();
    assert.deepStrictEqual(
      snap.seats.map((s) => s.player.userId),
      seatedIdsBeforeVip
    );
    console.log('[PASS 12] Gift VIP không tạo userId trùng.');
    console.log('[PASS 13] Gift VIP không đuổi người đang ngồi.');

    // Test 14: Fill waiting queue to 30/30 (currently 2 VIP: norm_2, vip_new_1; 1 Normal: norm_1 -> total 3).
    // Add 27 more Normal players (norm_3 .. norm_29) -> totalWaiting = 30 (2 VIP + 28 Normal).
    for (let i = 3; i <= 29; i += 1) {
      mockService.simulateCommentNhau(`norm_${i}`, `Thường ${i}`);
    }
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.totalWaiting, 30);
    assert.strictEqual(snap.normalQueue[snap.normalQueue.length - 1].userId, 'norm_29');

    // New VIP via Gift when queue is 30/30 replaces last Normal Queue player (norm_29)
    const vipReplaceRes = mockService.simulateGift('vip_replace_last', 'VIP Thay Thế', 'MOCK_GIFT_VIP_PASS', 1, null);
    assert.strictEqual(vipReplaceRes.stateResult.stateChanged, true);
    assert.strictEqual(vipReplaceRes.stateResult.action, 'ENQUEUED_VIP_REPLACED_NORMAL');
    assert.strictEqual(vipReplaceRes.stateResult.replacedPlayer.userId, 'norm_29');
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.totalWaiting, 30);
    assert.strictEqual(snap.vipQueue.length, 3);
    assert.strictEqual(snap.normalQueue.length, 27);
    console.log('[PASS 14] VIP mới khi hàng chờ đầy thay thế người cuối Normal Queue.');

    // Test 15: Upgrade all remaining 27 Normal players to VIP so all 30 waiting slots are VIP (30 VIP, 0 Normal)
    for (const normItem of [...snap.normalQueue]) {
      mockService.simulateGift(normItem.userId, normItem.nickname, 'MOCK_GIFT_VIP_PASS', 1, null);
    }
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.vipQueue.length, 30);
    assert.strictEqual(snap.normalQueue.length, 0);

    // Now a brand new VIP via Gift must be rejected (VIP_QUEUE_FULL)
    const vipFullReject = mockService.simulateGift('vip_overflow_31', 'VIP Thứ 31', 'MOCK_GIFT_VIP_PASS', 1, null);
    assert.strictEqual(vipFullReject.stateResult.stateChanged, false);
    assert.strictEqual(vipFullReject.stateResult.reason, 'VIP_QUEUE_FULL');
    console.log('[PASS 15] VIP mới bị từ chối khi toàn bộ hàng chờ là VIP.');

    // Clear queues to keep subsequent tests focused
    gameStateManager.vipQueue = [];
    gameStateManager.normalQueue = [];

    // Test 16 & 9: Gift "Vợ bắt về" (MOCK_GIFT_WIFE) transitions valid SEATED player to LEAVING,
    // and targeting a LEAVING player does NOT change state!
    const wifeGiftRes = mockService.simulateGift('gifter_wife_1', 'Bà Xã Gọi', 'MOCK_GIFT_WIFE', 1, 1);
    assert.strictEqual(wifeGiftRes.stateResult.stateChanged, true);
    assert.strictEqual(wifeGiftRes.stateResult.action, 'GIFT_WIFE_SUMMON_APPLIED');
    snap = gameStateManager.getSnapshot();
    assert.strictEqual(snap.seats[1].player.status, 'LEAVING');
    console.log('[PASS 16] Gift vợ bắt về chuyển người hợp lệ sang LEAVING.');

    const vWhenSeat1Leaving = gameStateManager.stateVersion;
    const giftOnLeaving = mockService.simulateGift('gifter_late', 'Tặng Muộn', 'MOCK_GIFT_SMALL', 1, 1);
    assert.strictEqual(giftOnLeaving.stateResult.stateChanged, false);
    assert.strictEqual(giftOnLeaving.stateResult.reason, 'TARGET_ALREADY_LEAVING');
    assert.strictEqual(gameStateManager.stateVersion, vWhenSeat1Leaving);
    console.log('[PASS 9] Gift mục tiêu LEAVING không làm thay đổi state.');

    // Test 25: Stale LEAVING timer does NOT evict a newly seated player if seat changed early
    const staleLeavingToken = snap.seats[1].player.koToken;
    const oldLeavingUserId = snap.seats[1].player.userId;
    mockService.simulateReleaseSeat(2); // seatId 2 (seatIndex 1) released early
    mockService.simulateCommentNhau('fresh_after_leaving', 'Người Mới Ghế 2');
    assert.strictEqual(gameStateManager.getSnapshot().seats[1].player.userId, 'fresh_after_leaving');

    const staleLeavingAttempt = gameStateManager.processEvent({
      eventId: 'evt_stale_leaving_attempt',
      source: 'SYSTEM',
      eventType: 'SYSTEM_LEAVING_RELEASE',
      timestamp: fakeNow,
      payload: {
        seatId: 2,
        userId: oldLeavingUserId,
        koToken: staleLeavingToken
      }
    });
    assert.strictEqual(staleLeavingAttempt.stateChanged, false);
    assert.strictEqual(staleLeavingAttempt.reason, 'STALE_OR_INVALID_LEAVING_RELEASE');
    assert.strictEqual(gameStateManager.getSnapshot().seats[1].player.userId, 'fresh_after_leaving');
    console.log('[PASS 25] Timer cũ không xóa nhầm người mới.');

    // Test 19, 20, 21: Random Wife Event probability (10%), cooldown (180s), and Gift independence from cooldown
    // Roll = 0.10 (>= 0.10) -> MISS
    const vBeforeMiss = gameStateManager.stateVersion;
    randomQueue = [0.10];
    const missRes = mockService.simulateRandomWifeCheck();
    assert.strictEqual(missRes.stateResult.stateChanged, false);
    assert.strictEqual(missRes.stateResult.reason, 'PROBABILITY_MISS');
    assert.strictEqual(gameStateManager.stateVersion, vBeforeMiss);

    // Roll = 0.09 (< 0.10) -> HIT! Pick index 0.0 (first active seated player: Seat 1 / seatIndex 0)
    randomQueue = [0.09, 0.0];
    const hitRes = mockService.simulateRandomWifeCheck();
    assert.strictEqual(hitRes.stateResult.stateChanged, true);
    assert.strictEqual(hitRes.stateResult.action, 'RANDOM_WIFE_TRIGGERED');
    assert.strictEqual(hitRes.stateResult.seatId, 1);
    assert.strictEqual(gameStateManager.getSnapshot().seats[0].player.status, 'LEAVING');
    assert.strictEqual(hitRes.stateResult.cooldownUntil, fakeNow + 180000);
    console.log('[PASS 19] Sự kiện ngẫu nhiên tuân thủ xác suất 10%.');

    // Advance clock by 60 seconds (still within 180s cooldown) -> blocked by WIFE_COOLDOWN_ACTIVE
    fakeNow += 60000;
    randomQueue = [0.01, 0.0];
    const cooldownBlockedRes = mockService.simulateRandomWifeCheck();
    assert.strictEqual(cooldownBlockedRes.stateResult.stateChanged, false);
    assert.strictEqual(cooldownBlockedRes.stateResult.reason, 'WIFE_COOLDOWN_ACTIVE');

    // Test 21: While random cooldown is STILL active (at +60s < 180s), Gift WIFE_SUMMON on seatIndex 2 still works!
    const giftWifeDuringCooldown = mockService.simulateGift(
      'gifter_wife_cd',
      'Vợ Gọi Bất Chấp CD',
      'MOCK_GIFT_WIFE',
      1,
      2
    );
    assert.strictEqual(giftWifeDuringCooldown.stateResult.stateChanged, true);
    assert.strictEqual(giftWifeDuringCooldown.stateResult.action, 'GIFT_WIFE_SUMMON_APPLIED');
    assert.strictEqual(gameStateManager.getSnapshot().seats[2].player.status, 'LEAVING');
    console.log('[PASS 21] Gift vợ bắt về không bị chặn bởi cooldown ngẫu nhiên.');

    // Advance clock past 180s total (+120000ms more -> total +180000ms) -> random Wife can trigger again!
    fakeNow += 120000;
    randomQueue = [0.05, 0.0];
    const hitAfterCooldown = mockService.simulateRandomWifeCheck();
    assert.strictEqual(hitAfterCooldown.stateResult.stateChanged, true);
    assert.strictEqual(hitAfterCooldown.stateResult.action, 'RANDOM_WIFE_TRIGGERED');
    console.log('[PASS 20] Sự kiện ngẫu nhiên tuân thủ cooldown 180 giây.');

    // Wait for LEAVING holds (250ms in testConfig) to finish
    await wait(320);

    // Test 23: Gift streak deduplication
    // Seat 4 (seatIndex 3) is currently SEATED with drunkLevel = 15 (from earlier MOCK_GIFT_ALL).
    const baseDrunkSeat3 = gameStateManager.getSnapshot().seats[3].player.drunkLevel;
    // Streak update 1: repeatCount = 1, repeatEnd = false -> deltaRepeat = 1 (+10)
    const streak1 = mockService.simulateGift('streak_user', 'Combo User', 'MOCK_GIFT_SMALL', 1, 3, {
      streakId: 'combo_99',
      repeatEnd: false
    });
    assert.strictEqual(streak1.stateResult.stateChanged, true);
    assert.strictEqual(streak1.stateResult.deltaRepeat, 1);
    assert.strictEqual(gameStateManager.getSnapshot().seats[3].player.drunkLevel, baseDrunkSeat3 + 10);

    // Duplicate packet of repeatCount = 1, repeatEnd = false -> deltaRepeat = 0 (ignored)
    const streak1Dup = mockService.simulateGift('streak_user', 'Combo User', 'MOCK_GIFT_SMALL', 1, 3, {
      streakId: 'combo_99',
      repeatEnd: false
    });
    assert.strictEqual(streak1Dup.stateResult.stateChanged, false);
    assert.strictEqual(streak1Dup.stateResult.reason, 'STREAK_ALREADY_PROCESSED');
    assert.strictEqual(gameStateManager.getSnapshot().seats[3].player.drunkLevel, baseDrunkSeat3 + 10);

    // Streak update 2: repeatCount = 3, repeatEnd = false -> deltaRepeat = 3 - 1 = 2 (+20 -> total +30)
    const streak2 = mockService.simulateGift('streak_user', 'Combo User', 'MOCK_GIFT_SMALL', 3, 3, {
      streakId: 'combo_99',
      repeatEnd: false
    });
    assert.strictEqual(streak2.stateResult.stateChanged, true);
    assert.strictEqual(streak2.stateResult.deltaRepeat, 2);
    assert.strictEqual(gameStateManager.getSnapshot().seats[3].player.drunkLevel, baseDrunkSeat3 + 30);

    // Streak final packet: repeatCount = 3, repeatEnd = true -> deltaRepeat = 3 - 3 = 0 (ignored, not doubled!)
    const streakEnd = mockService.simulateGift('streak_user', 'Combo User', 'MOCK_GIFT_SMALL', 3, 3, {
      streakId: 'combo_99',
      repeatEnd: true
    });
    assert.strictEqual(streakEnd.stateResult.stateChanged, false);
    assert.strictEqual(streakEnd.stateResult.reason, 'STREAK_ALREADY_PROCESSED');
    assert.strictEqual(gameStateManager.getSnapshot().seats[3].player.drunkLevel, baseDrunkSeat3 + 30);
    console.log('[PASS 23] Gift streak không bị tính trùng.');

    // Test 24: Duplicate eventId does not mutate state a second time
    const customGiftEventId = 'evt_gift_idemp_check_104';
    const firstByEventId = mockService.simulateGift(
      'idemp_user',
      'Idemp User',
      'MOCK_GIFT_SMALL',
      1,
      3,
      { eventId: customGiftEventId }
    );
    assert.strictEqual(firstByEventId.stateResult.stateChanged, true);
    const vAfterFirst = gameStateManager.stateVersion;

    const secondByEventId = mockService.simulateGift(
      'idemp_user',
      'Idemp User',
      'MOCK_GIFT_SMALL',
      1,
      3,
      { eventId: customGiftEventId }
    );
    assert.strictEqual(secondByEventId.stateResult.stateChanged, false);
    assert.strictEqual(secondByEventId.stateResult.reason, 'DUPLICATE_EVENT_ID');
    assert.strictEqual(gameStateManager.stateVersion, vAfterFirst);
    console.log('[PASS 24] Duplicate eventId không thay đổi state lần hai.');

    // Test 26: stateVersion only increments when Game State actually mutates
    await wait(50);
    assert.ok(receivedPatches.length > 10);
    for (let i = 1; i < receivedPatches.length; i += 1) {
      assert.strictEqual(
        receivedPatches[i].stateVersion,
        receivedPatches[i - 1].stateVersion + 1,
        'Every emitted state_patch must increment stateVersion by exactly 1'
      );
    }
    console.log('[PASS 26] stateVersion chỉ tăng khi Game State thay đổi.');

    // Test 27: Reconnecting client receives accurate state snapshot without re-triggering past FX
    reconnectClient = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false
    });
    let fxOnReconnectCount = 0;
    reconnectClient.on('game:action_fx', () => {
      fxOnReconnectCount += 1;
    });

    const reconnectSnapshot = await new Promise((resolve, reject) => {
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

    assert.strictEqual(reconnectSnapshot.stateVersion, gameStateManager.stateVersion);
    assert.strictEqual(
      reconnectSnapshot.state.seats[3].player.drunkLevel,
      baseDrunkSeat3 + 40
    );
    assert.strictEqual(fxOnReconnectCount, 0, 'Reconnect must not replay old action_fx events');
    console.log('[PASS 27] Client reconnect nhận đúng trạng thái.');

    // Test 28: Shutdown cancels all timers (cheersTimer, wifeTimer, koTimers) cleanly
    gameStateManager.startCheersScheduler();
    gameStateManager.startWifeScheduler();
    gameStateManager._scheduleLeavingReleaseTimer(5, 'dummy_leave', 'leave_dummy');
    assert.ok(gameStateManager.cheersTimer !== null);
    assert.ok(gameStateManager.wifeTimer !== null);
    assert.strictEqual(gameStateManager.koTimers.size, 1);

    if (socketClient) socketClient.disconnect();
    if (reconnectClient) reconnectClient.disconnect();
    await shutdown();

    assert.strictEqual(gameStateManager.cheersTimer, null);
    assert.strictEqual(gameStateManager.wifeTimer, null);
    assert.strictEqual(gameStateManager.koTimers.size, 0);
    console.log('[PASS 28] Shutdown hủy timer an toàn.');

    console.log('=== TẤT CẢ 28 TIÊU CHÍ KIỂM THỬ NHIỆM VỤ 1.4 ĐỀU PASS ===');
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
  console.error('[FAIL] Kiểm thử Nhiệm vụ 1.4 thất bại:', err);
  process.exit(1);
});
