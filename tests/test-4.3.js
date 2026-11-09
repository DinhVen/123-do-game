'use strict';

/**
 * PHASE 4 — TASK 4.3 TEST SUITE
 * TikTok Gift Combo / Streak Processing, Gift Mapping Fixture & Invariants
 * Covers all 18 mandatory scenarios from Task 4.3 Specification.
 */

const assert = require('assert');
const EventEmitter = require('events');
const defaultConfig = require('../server/config');
const { GameStateManager } = require('../server/services/gameStateManager');
const { SequentialEventQueue } = require('../server/engines/eventQueue');
const { BoundedDeduplicator } = require('../server/engines/deduplicator');
const { validateRawEvent } = require('../server/engines/inputValidator');
const { normalizeEvent } = require('../server/engines/eventNormalizer');
const { TikTokService } = require('../server/services/tiktokService');

class FakeTikTokLiveConnection extends EventEmitter {
  constructor(uniqueId, options = {}) {
    super();
    this.uniqueId = uniqueId;
    this.options = options;
    this.roomId = '7399999999999998888';
  }
  async connect() {
    this.emit('connected', { roomId: this.roomId });
    return { roomId: this.roomId };
  }
  async disconnect() {
    this.emit('disconnected', { code: 1000, reason: 'Normal Closure' });
  }
}

/**
 * Isolated test fixture with custom liveGiftMappings (never mutates production default.json)
 */
const TEST_LIVE_GIFT_MAPPINGS = Object.freeze({
  '5655': {
    label: 'Bia Tươi (Rose Fixture)',
    actionCategory: 'DRUNK_INCREASE',
    actionType: 'DRINK',
    drunkDelta: 2,
    targetMode: 'SINGLE',
    giftType: 1,
    combo: true,
    diamondCount: 1
  },
  '5656': {
    label: 'Tháp Bia Cả Bàn (All Seated Fixture)',
    actionCategory: 'DRUNK_INCREASE',
    actionType: 'DRINK',
    drunkDelta: 1,
    targetMode: 'ALL_SEATED',
    giftType: 1,
    combo: true,
    diamondCount: 10
  },
  '5657': {
    label: 'Trà Giải Rượu (Sober Fixture)',
    actionCategory: 'DRUNK_DECREASE',
    actionType: 'SOBER',
    drunkDelta: 3,
    targetMode: 'SINGLE',
    giftType: 1,
    combo: true,
    diamondCount: 5
  },
  '5658': {
    label: 'Siêu Xe Non-Streak (Single Big Gift Fixture)',
    actionCategory: 'DRUNK_INCREASE',
    actionType: 'DRINK',
    drunkDelta: 5,
    targetMode: 'SINGLE',
    giftType: 2,
    combo: false,
    diamondCount: 100
  },
  '5659': {
    label: 'Vé VIP Vào Bàn (VIP Fixture)',
    actionCategory: 'VIP_ACCESS',
    actionType: 'VIP_JOIN',
    isVipEligible: true,
    giftType: 2,
    combo: false,
    diamondCount: 50
  },
  '5660': {
    label: 'Alo Vợ Bắt Về (Wife Summon Fixture)',
    actionCategory: 'WIFE_EVENT',
    actionType: 'WIFE_DRAG',
    targetMode: 'SINGLE',
    giftType: 2,
    combo: false,
    diamondCount: 99
  }
});

function createLiveTestEnv(customOverrides = {}) {
  const liveConfig = JSON.parse(JSON.stringify(defaultConfig));
  liveConfig.app.defaultMode = 'LIVE';
  liveConfig.tiktok.uniqueId = 'nhau_streamer_43';
  liveConfig.gameplayV1.liveGiftMappings = JSON.parse(
    JSON.stringify(TEST_LIVE_GIFT_MAPPINGS)
  );
  liveConfig.security.rateLimits = {
    windowsMs: {
      JOIN_CMD: 0,
      COMMENT: 0,
      CHAT: 0,
      LIKE: 0,
      GIFT: 0
    }
  };
  Object.assign(liveConfig, customOverrides);

  const statePatches = [];
  const actionFxList = [];
  let fakeConnector = null;

  const gsm = new GameStateManager(
    liveConfig,
    (snapshot) => {
      statePatches.push({ stateVersion: snapshot.stateVersion, snapshot });
    },
    (fxPayload) => {
      actionFxList.push(fxPayload);
    }
  );

  const queue = new SequentialEventQueue((event) => gsm.processEvent(event));
  gsm.eventDispatcher = async (internalEvent) => queue.enqueue(internalEvent);

  const service = new TikTokService(liveConfig, null, queue, gsm, {
    connectionFactory: async (uid, opts) => {
      fakeConnector = new FakeTikTokLiveConnection(uid, opts);
      return fakeConnector;
    }
  });

  return {
    liveConfig,
    gsm,
    queue,
    service,
    statePatches,
    actionFxList,
    getConnector: () => fakeConnector
  };
}

async function runTests() {
  console.log('=== PHASE 4 — TASK 4.3: TIKTOK GIFT COMBO / STREAK TESTS ===\n');

  const env = createLiveTestEnv();
  const { gsm, service, statePatches } = env;
  await service.connect();

  try {
    // Seed 3 seated players on seats 1, 2, 3
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_1' },
      user: { id: 'u_seat_1', nickname: 'Người Ghế 1' },
      content: 'nhậu'
    });
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_2' },
      user: { id: 'u_seat_2', nickname: 'Người Ghế 2' },
      content: 'dô'
    });
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_3' },
      user: { id: 'u_seat_3', nickname: 'Người Ghế 3' },
      content: 'nhậu'
    });

    assert.strictEqual(gsm.getSnapshot().seats[0].player.userId, 'u_seat_1');
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 0);

    // -------------------------------------------------------------------------
    // TEST 1: Combo 1 -> 3 -> 5 -> repeatEnd 5 = 5 Gift
    // Gift '5655' adds +2 drunk per gift -> 5 gifts = +10 drunkLevel on Seat 1
    // -------------------------------------------------------------------------
    console.log('Test 1: Combo 1 -> 3 -> 5 -> repeatEnd 5 = 5 Gifts total (+1, +2, +2, +0)...');
    const c1 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't1_m1' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 1,
      repeatEnd: 0,
      groupId: 'grp_combo_101',
      gift: { id: '5655', name: 'Rose', type: 1, combo: true }
    });
    assert.strictEqual(c1.stateResult.stateChanged, true);
    assert.strictEqual(c1.stateResult.deltaRepeat, 1);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 2);

    const c2 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't1_m2' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 0,
      groupId: 'grp_combo_101',
      gift: { id: '5655', name: 'Rose', type: 1, combo: true }
    });
    assert.strictEqual(c2.stateResult.stateChanged, true);
    assert.strictEqual(c2.stateResult.deltaRepeat, 2);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 6);

    const c3 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't1_m3' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 5,
      repeatEnd: 0,
      groupId: 'grp_combo_101',
      gift: { id: '5655', name: 'Rose', type: 1, combo: true }
    });
    assert.strictEqual(c3.stateResult.stateChanged, true);
    assert.strictEqual(c3.stateResult.deltaRepeat, 2);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 10);

    const vBeforeRepeatEnd = gsm.stateVersion;
    const c4 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't1_m4' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 5,
      repeatEnd: 1,
      groupId: 'grp_combo_101',
      gift: { id: '5655', name: 'Rose', type: 1, combo: true }
    });
    assert.strictEqual(c4.stateResult.stateChanged, false);
    assert.strictEqual(c4.stateResult.reason, 'STREAK_ALREADY_PROCESSED');
    assert.strictEqual(c4.stateResult.deltaRepeat, 0);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 10);
    assert.strictEqual(gsm.stateVersion, vBeforeRepeatEnd);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 2: Gửi lại cùng msgId (Duplicate msgId blocked)
    // -------------------------------------------------------------------------
    console.log('Test 2: Re-sending identical msgId is blocked by deduplicator...');
    const dupMsg = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't1_m3' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 10,
      repeatEnd: 0,
      groupId: 'grp_combo_101'
    });
    assert.strictEqual(dupMsg.stateResult.stateChanged, false);
    assert.strictEqual(dupMsg.stateResult.reason, 'DUPLICATE_EVENT_ID');
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 10);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 3: repeatCount giảm (Out-of-order decreasing repeatCount never adds negative or resets peak)
    // -------------------------------------------------------------------------
    console.log('Test 3: Decreasing repeatCount (e.g. 5 -> 3 -> 6) never subtracts and keeps high-water mark...');
    service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't3_m1' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 5,
      repeatEnd: 0,
      groupId: 'grp_decreasing_303'
    });
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 20); // 10 + 5*2 = 20

    // Delayed packet with repeatCount = 3 (< 5)
    const decRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't3_m2' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 0,
      groupId: 'grp_decreasing_303'
    });
    assert.strictEqual(decRes.stateResult.stateChanged, false);
    assert.strictEqual(decRes.stateResult.deltaRepeat, 0);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 20);

    // Next packet with repeatCount = 6 -> must only add (6 - 5) = 1 gift (+2 drunk -> 22), NOT (6 - 3) = 3!
    const afterDecRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't3_m3' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 6,
      repeatEnd: 1,
      groupId: 'grp_decreasing_303'
    });
    assert.strictEqual(afterDecRes.stateResult.stateChanged, true);
    assert.strictEqual(afterDecRes.stateResult.deltaRepeat, 1);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 22);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 4: Hai combo khác groupId của cùng một người
    // -------------------------------------------------------------------------
    console.log('Test 4: Two combos with different groupId from the same user are tracked independently...');
    const grpA = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't4_a1' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_2' },
      giftId: '5655',
      repeatCount: 2,
      repeatEnd: 1,
      groupId: 'grp_A_401'
    });
    const grpB = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't4_b1' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_2' },
      giftId: '5655',
      repeatCount: 1,
      repeatEnd: 1,
      groupId: 'grp_B_402'
    });
    assert.strictEqual(grpA.stateResult.deltaRepeat, 2);
    assert.strictEqual(grpB.stateResult.deltaRepeat, 1);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, 6); // (2 + 1) * 2 = 6
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 5: Hai người gửi cùng giftId (kể cả trùng nickname, định danh theo userId)
    // -------------------------------------------------------------------------
    console.log('Test 5: Two different users with identical nickname sending same giftId/groupId never collide...');
    const userARes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't5_uA' },
      user: { id: 'sender_alpha', nickname: 'Tên Trùng Nhau' },
      toUser: { id: 'u_seat_2' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 0,
      groupId: 'shared_grp_500'
    });
    const userBRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't5_uB' },
      user: { id: 'sender_beta', nickname: 'Tên Trùng Nhau' },
      toUser: { id: 'u_seat_2' },
      giftId: '5655',
      repeatCount: 2,
      repeatEnd: 0,
      groupId: 'shared_grp_500'
    });
    assert.strictEqual(userARes.stateResult.deltaRepeat, 3);
    assert.strictEqual(userBRes.stateResult.deltaRepeat, 2);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, 6 + (3 + 2) * 2); // 16
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 6: Gift non-streakable (giftType !== 1 / combo === false)
    // -------------------------------------------------------------------------
    console.log('Test 6: Non-streakable gift (giftType: 2, combo: false) sent multiple times counts every distinct event...');
    const nonStreak1 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't6_ns1' },
      user: { id: 'gifter_car', nickname: 'Đại Gia Xe' },
      toUser: { id: 'u_seat_3' },
      giftId: '5658',
      repeatCount: 1,
      repeatEnd: 0,
      groupId: '0',
      gift: { id: '5658', name: 'Sports Car', type: 2, combo: false }
    });
    const nonStreak2 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't6_ns2' },
      user: { id: 'gifter_car', nickname: 'Đại Gia Xe' },
      toUser: { id: 'u_seat_3' },
      giftId: '5658',
      repeatCount: 1,
      repeatEnd: 0,
      groupId: '0',
      gift: { id: '5658', name: 'Sports Car', type: 2, combo: false }
    });
    assert.strictEqual(nonStreak1.event.payload.isNonStreakable, true);
    assert.strictEqual(nonStreak1.event.payload.isStreak, false);
    assert.strictEqual(nonStreak1.stateResult.stateChanged, true);
    assert.strictEqual(nonStreak2.stateResult.stateChanged, true);
    assert.strictEqual(gsm.getSnapshot().seats[2].player.drunkLevel, 10); // 5 + 5 = 10
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 7: Gift thiếu groupId (missing or "0" groupId fallback & non-merging of subsequent combo)
    // -------------------------------------------------------------------------
    console.log('Test 7: Streakable gift missing groupId tracks active combo and does not merge next combo after repeatEnd...');
    const drunkBeforeT7 = gsm.getSnapshot().seats[2].player.drunkLevel;
    // Combo #1 without groupId: 1 -> 3 -> repeatEnd 3 (total = 3 gifts = +6 drunk)
    const ng1 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't7_c1_1' },
      user: { id: 'gifter_nogrp', nickname: 'No Group User' },
      toUser: { id: 'u_seat_3' },
      giftId: '5655',
      repeatCount: 1,
      repeatEnd: 0,
      groupId: ''
    });
    const ng2 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't7_c1_2' },
      user: { id: 'gifter_nogrp', nickname: 'No Group User' },
      toUser: { id: 'u_seat_3' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 0
    });
    const ng3 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't7_c1_3' },
      user: { id: 'gifter_nogrp', nickname: 'No Group User' },
      toUser: { id: 'u_seat_3' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 1
    });
    assert.strictEqual(ng1.stateResult.deltaRepeat, 1);
    assert.strictEqual(ng2.stateResult.deltaRepeat, 2);
    assert.strictEqual(ng3.stateResult.deltaRepeat, 0);
    assert.strictEqual(gsm.getSnapshot().seats[2].player.drunkLevel, drunkBeforeT7 + 6);

    // Combo #2 from the SAME user without groupId after Combo #1 completed: 1 -> 2 (repeatEnd) = 2 gifts (+4 drunk)
    const ngNext1 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't7_c2_1' },
      user: { id: 'gifter_nogrp', nickname: 'No Group User' },
      toUser: { id: 'u_seat_3' },
      giftId: '5655',
      repeatCount: 1,
      repeatEnd: 0
    });
    const ngNext2 = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't7_c2_2' },
      user: { id: 'gifter_nogrp', nickname: 'No Group User' },
      toUser: { id: 'u_seat_3' },
      giftId: '5655',
      repeatCount: 2,
      repeatEnd: 1
    });
    assert.strictEqual(ngNext1.stateResult.deltaRepeat, 1);
    assert.strictEqual(ngNext2.stateResult.deltaRepeat, 1);
    assert.strictEqual(gsm.getSnapshot().seats[2].player.drunkLevel, drunkBeforeT7 + 10);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 8: Gift chưa mapping (Unmapped gift ignored safely; production config untouched)
    // -------------------------------------------------------------------------
    console.log('Test 8: Unmapped giftId is safely ignored and production defaultConfig has empty liveGiftMappings...');
    assert.deepStrictEqual(defaultConfig.gameplayV1.liveGiftMappings, {});
    assert.strictEqual(defaultConfig.gameplayV1.vipGiftThreshold, null);
    const vBeforeUnmapped = gsm.stateVersion;
    const unmappedRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't8_unmapped' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_1' },
      giftId: '999999',
      repeatCount: 5,
      repeatEnd: 1,
      groupId: 'grp_unmapped_1'
    });
    assert.strictEqual(unmappedRes.stateResult.stateChanged, false);
    assert.strictEqual(unmappedRes.stateResult.reason, 'UNMAPPED_GIFT');
    assert.strictEqual(gsm.stateVersion, vBeforeUnmapped);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 9: Gift đã mapping trong test fixture (DRUNK_DECREASE & ALL_SEATED)
    // -------------------------------------------------------------------------
    console.log('Test 9: Mapped gifts in test fixture (ALL_SEATED & DRUNK_DECREASE combo) apply exact deltas...');
    const s1Before = gsm.getSnapshot().seats[0].player.drunkLevel;
    const s2Before = gsm.getSnapshot().seats[1].player.drunkLevel;
    // '5656' is ALL_SEATED (+1 per gift), combo repeatCount = 4 -> +4 to all seated players
    const allSeatedRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't9_all' },
      user: { id: 'gifter_all', nickname: 'Mời Cả Bàn' },
      giftId: '5656',
      repeatCount: 4,
      repeatEnd: 1,
      groupId: 'grp_all_901'
    });
    assert.strictEqual(allSeatedRes.stateResult.stateChanged, true);
    assert.strictEqual(allSeatedRes.stateResult.deltaRepeat, 4);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, s1Before + 4);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, s2Before + 4);

    // '5657' is DRUNK_DECREASE (-3 per gift), combo repeatCount = 2 on Seat 1 -> -6 drunkLevel
    const soberRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't9_sober' },
      user: { id: 'gifter_sober', nickname: 'Giải Rượu' },
      toUser: { id: 'u_seat_1' },
      giftId: '5657',
      repeatCount: 2,
      repeatEnd: 1,
      groupId: 'grp_sober_902'
    });
    assert.strictEqual(soberRes.stateResult.stateChanged, true);
    assert.strictEqual(soberRes.stateResult.deltaRepeat, 2);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, s1Before + 4 - 6);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 10: Gift gửi tới người đã KO
    // -------------------------------------------------------------------------
    console.log('Test 10: Gift sent to KO player does not change state, does not revive, and does not redirect...');
    // Bring Seat 1 to KO (100 drunkLevel)
    service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't10_ko_make' },
      user: { id: 'gifter_ko', nickname: 'Kẻ Huỷ Diệt' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 50,
      repeatEnd: 1,
      groupId: 'grp_ko_make'
    });
    assert.strictEqual(gsm.getSnapshot().seats[0].player.status, 'KO');
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 100);

    const vAtKo = gsm.stateVersion;
    const giftToKoDrink = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't10_ko_drink' },
      user: { id: 'gifter_ko', nickname: 'Kẻ Huỷ Diệt' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 1,
      groupId: 'grp_ko_drink'
    });
    assert.strictEqual(giftToKoDrink.stateResult.stateChanged, false);
    assert.strictEqual(giftToKoDrink.stateResult.reason, 'TARGET_ALREADY_KO');

    const giftToKoSober = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't10_ko_sober' },
      user: { id: 'gifter_ko', nickname: 'Kẻ Huỷ Diệt' },
      toUser: { id: 'u_seat_1' },
      giftId: '5657',
      repeatCount: 5,
      repeatEnd: 1,
      groupId: 'grp_ko_sober'
    });
    assert.strictEqual(giftToKoSober.stateResult.stateChanged, false);
    assert.strictEqual(giftToKoSober.stateResult.reason, 'TARGET_ALREADY_KO');
    assert.strictEqual(gsm.getSnapshot().seats[0].player.status, 'KO');
    assert.strictEqual(gsm.stateVersion, vAtKo);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 11: Gift gửi tới người đang LEAVING
    // -------------------------------------------------------------------------
    console.log('Test 11: Gift sent to LEAVING player does not change state and does not redirect...');
    // Trigger WIFE_EVENT ('5660') on Seat 2 -> transitions Seat 2 to LEAVING
    const wifeSummon = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't11_wife' },
      user: { id: 'gifter_wife', nickname: 'Báo Vợ' },
      toUser: { id: 'u_seat_2' },
      giftId: '5660',
      repeatCount: 1
    });
    assert.strictEqual(wifeSummon.stateResult.stateChanged, true);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.status, 'LEAVING');

    const vAtLeaving = gsm.stateVersion;
    const giftToLeaving = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't11_leaving_drink' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_2' },
      giftId: '5655',
      repeatCount: 2,
      repeatEnd: 1,
      groupId: 'grp_leaving_11'
    });
    assert.strictEqual(giftToLeaving.stateResult.stateChanged, false);
    assert.strictEqual(giftToLeaving.stateResult.reason, 'TARGET_ALREADY_LEAVING');
    assert.strictEqual(gsm.stateVersion, vAtLeaving);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 12: Gift gửi tới người không có mặt / đã rời bàn
    // -------------------------------------------------------------------------
    console.log('Test 12: Gift sent to absent/departed user is ignored without redirecting to another seat...');
    const giftToAbsent = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't12_absent' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'user_not_on_table' },
      giftId: '5655',
      repeatCount: 4,
      repeatEnd: 1,
      groupId: 'grp_absent_12'
    });
    assert.strictEqual(giftToAbsent.stateResult.stateChanged, false);
    assert.strictEqual(giftToAbsent.stateResult.reason, 'TARGET_ALREADY_LEFT');
    assert.strictEqual(gsm.stateVersion, vAtLeaving);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 13: Reconnect không tính lại combo cũ
    // -------------------------------------------------------------------------
    console.log('Test 13: Stream disconnect & reconnect does not replay or double-count previous combos...');
    const seat3DrunkBeforeReconnect = gsm.getSnapshot().seats[2].player.drunkLevel;
    await service.disconnect();
    await service.connect();

    // Replay packet from Test 1 / Test 4 after reconnect with a new msgId or same groupId
    const replayComboAfterReconnect = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't13_replay_after_reconnect' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_3' },
      giftId: '5655',
      repeatCount: 2,
      repeatEnd: 1,
      groupId: 'grp_A_401' // already processed up to repeatCount=2 in Test 4!
    });
    assert.strictEqual(replayComboAfterReconnect.stateResult.stateChanged, false);
    assert.strictEqual(replayComboAfterReconnect.stateResult.reason, 'STREAK_ALREADY_PROCESSED');
    assert.strictEqual(gsm.getSnapshot().seats[2].player.drunkLevel, seat3DrunkBeforeReconnect);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 14: Cleanup combo cache & bounded memory limit
    // -------------------------------------------------------------------------
    console.log('Test 14: BoundedDeduplicator enforces maxStreakEntries and cleans up expired combos...');
    const smallDedup = new BoundedDeduplicator({
      maxEntries: 5,
      maxStreakEntries: 5,
      ttlMs: 1000,
      streakTtlMs: 1000,
      fallbackStreakTtlMs: 500
    });
    const t0 = 1000000;
    for (let i = 1; i <= 8; i += 1) {
      smallDedup.resolveStreakDelta(`streak:u1:5655:grp:g_${i}`, 2, false, t0 + i);
    }
    assert.strictEqual(smallDedup.getStreakSize(t0 + 10), 5, 'Must cap streakCache at maxStreakEntries (5)');

    // Advance time past TTL (t0 + 2000) and verify cleanup
    smallDedup.cleanup(t0 + 2000);
    assert.strictEqual(smallDedup.getStreakSize(t0 + 2000), 0, 'Expired streaks must be cleaned up');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 15: Burst load nhiều combo đồng thời
    // -------------------------------------------------------------------------
    console.log('Test 15: Burst load of 15 concurrent combos (60 packets) processed deterministically...');
    // Seat a fresh player on Seat 4 with drunkLevel = 0
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_4' },
      user: { id: 'u_seat_4', nickname: 'Người Ghế 4' },
      content: 'nhậu'
    });
    assert.strictEqual(gsm.getSnapshot().seats[3].player.userId, 'u_seat_4');
    assert.strictEqual(gsm.getSnapshot().seats[3].player.drunkLevel, 0);

    // 15 combos, each goes 1 -> 2 -> 3 -> repeatEnd 3 (total 3 gifts * 15 = 45 gifts * 2 drunk = +90 drunkLevel)
    for (let c = 1; c <= 15; c += 1) {
      const grp = `burst_grp_${c}`;
      const sender = `burst_sender_${c}`;
      service.handleRawWebcastEvent('GIFT', {
        common: { msgId: `burst_${c}_1` },
        user: { id: sender, nickname: `Burst ${c}` },
        toUser: { id: 'u_seat_4' },
        giftId: '5655',
        repeatCount: 1,
        repeatEnd: 0,
        groupId: grp
      });
      service.handleRawWebcastEvent('GIFT', {
        common: { msgId: `burst_${c}_2` },
        user: { id: sender, nickname: `Burst ${c}` },
        toUser: { id: 'u_seat_4' },
        giftId: '5655',
        repeatCount: 2,
        repeatEnd: 0,
        groupId: grp
      });
      service.handleRawWebcastEvent('GIFT', {
        common: { msgId: `burst_${c}_3` },
        user: { id: sender, nickname: `Burst ${c}` },
        toUser: { id: 'u_seat_4' },
        giftId: '5655',
        repeatCount: 3,
        repeatEnd: 0,
        groupId: grp
      });
      service.handleRawWebcastEvent('GIFT', {
        common: { msgId: `burst_${c}_end` },
        user: { id: sender, nickname: `Burst ${c}` },
        toUser: { id: 'u_seat_4' },
        giftId: '5655',
        repeatCount: 3,
        repeatEnd: 1,
        groupId: grp
      });
    }
    assert.strictEqual(gsm.getSnapshot().seats[3].player.drunkLevel, 90);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 16: Không làm sai stateVersion
    // -------------------------------------------------------------------------
    console.log('Test 16: stateVersion increments strictly by +1 on every state mutation and never on no-op...');
    assert.ok(statePatches.length > 40);
    for (let i = 1; i < statePatches.length; i += 1) {
      assert.strictEqual(
        statePatches[i].stateVersion,
        statePatches[i - 1].stateVersion + 1,
        `stateVersion must increase strictly by 1 at index ${i}`
      );
    }
    assert.strictEqual(statePatches[statePatches.length - 1].stateVersion, gsm.stateVersion);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 17: Không thay đổi luật VIP
    // -------------------------------------------------------------------------
    console.log('Test 17: VIP Gift rules preserved (priority queue, no kicking seated players, upgrade normal->VIP)...');
    // Fill remaining empty seats (Seat 5 and Seat 6)
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_5' },
      user: { id: 'u_seat_5', nickname: 'Người Ghế 5' },
      content: 'nhậu'
    });
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_6' },
      user: { id: 'u_seat_6', nickname: 'Người Ghế 6' },
      content: 'nhậu'
    });
    // Add a Normal Queue player
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'q_norm_1' },
      user: { id: 'u_queue_normal_1', nickname: 'Chờ Thường 1' },
      content: 'nhậu'
    });
    assert.strictEqual(gsm.getTotalWaiting(), 1);
    assert.strictEqual(gsm.normalQueue.length, 1);
    assert.strictEqual(gsm.vipQueue.length, 0);

    // Upgrade u_queue_normal_1 to VIP via mapped VIP gift '5659' -> does not kick seated players, does not increase totalWaiting
    const vipUpgrade = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't17_vip_up' },
      user: { id: 'u_queue_normal_1', nickname: 'Chờ Thường 1' },
      giftId: '5659',
      repeatCount: 1
    });
    assert.strictEqual(vipUpgrade.stateResult.stateChanged, true);
    assert.strictEqual(vipUpgrade.stateResult.action, 'PROMOTED_TO_VIP_QUEUE');
    assert.strictEqual(gsm.getTotalWaiting(), 1);
    assert.strictEqual(gsm.normalQueue.length, 0);
    assert.strictEqual(gsm.vipQueue.length, 1);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 18: MOCK/LIVE isolation
    // -------------------------------------------------------------------------
    console.log('Test 18: MOCK/LIVE isolation strictly enforced...');
    const mockGiftInLive = gsm.processEvent(
      normalizeEvent(
        validateRawEvent({
          source: 'MOCK',
          eventType: 'GIFT',
          userId: 'mock_user',
          nickname: 'Mock User',
          payload: {
            mockGiftKey: 'MOCK_GIFT_SMALL',
            repeatCount: 1,
            targetSeatId: 3
          }
        }).sanitized
      )
    );
    assert.strictEqual(mockGiftInLive.stateChanged, false);
    assert.strictEqual(mockGiftInLive.reason, 'MOCK_DISABLED_IN_LIVE_MODE');

    gsm.mode = 'MOCK';
    const liveGiftInMock = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't18_live_in_mock' },
      user: { id: 'gifter_1', nickname: 'Gifter Một' },
      toUser: { id: 'u_seat_3' },
      giftId: '5655',
      repeatCount: 1
    });
    assert.strictEqual(liveGiftInMock.ok, false);
    assert.strictEqual(liveGiftInMock.reason, 'LIVE_DISABLED_IN_MOCK_MODE');
    gsm.mode = 'LIVE';
    console.log('  -> PASS');
  } finally {
    await service.shutdown();
    gsm.shutdown();
  }

  console.log('\n=== ALL 18 TASK 4.3 TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Task 4.3 test failed:', err);
  process.exit(1);
});
