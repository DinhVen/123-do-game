'use strict';

/**
 * PHASE 4 — TASK 4.4 TEST SUITE
 * TikTok Like Delta & Deduplication, Room Baseline Tracking & E2E Verification
 * Covers all 18 mandatory scenarios from Task 4.4 Specification.
 */

const assert = require('assert');
const EventEmitter = require('events');
const path = require('path');
const { pathToFileURL } = require('url');
const defaultConfig = require('../server/config');
const { GameStateManager } = require('../server/services/gameStateManager');
const { SequentialEventQueue } = require('../server/engines/eventQueue');
const { BoundedDeduplicator } = require('../server/engines/deduplicator');
const { validateRawEvent } = require('../server/engines/inputValidator');
const { normalizeEvent } = require('../server/engines/eventNormalizer');
const { TikTokService } = require('../server/services/tiktokService');
const { startServer } = require('../server/index');

class FakeTikTokLiveConnection extends EventEmitter {
  constructor(uniqueId, options = {}, roomId = '7399999999999994444') {
    super();
    this.uniqueId = uniqueId;
    this.options = options;
    this.roomId = roomId;
  }
  async connect() {
    this.emit('connected', { roomId: this.roomId });
    return { roomId: this.roomId };
  }
  async disconnect() {
    this.emit('disconnected', { code: 1000, reason: 'Normal Closure' });
  }
}

function createLiveLikeEnv(customOverrides = {}, customRoomId = '7399999999999994444') {
  const liveConfig = JSON.parse(JSON.stringify(defaultConfig));
  liveConfig.app.defaultMode = 'LIVE';
  liveConfig.tiktok.uniqueId = 'nhau_streamer_44';
  liveConfig.gameplayV1.liveGiftMappings = {
    '5655': {
      label: 'Bia Tươi (Rose Fixture)',
      actionCategory: 'DRUNK_INCREASE',
      actionType: 'DRINK',
      drunkDelta: 2,
      targetMode: 'SINGLE',
      giftType: 1,
      combo: true,
      diamondCount: 1
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
      fakeConnector = new FakeTikTokLiveConnection(uid, opts, customRoomId);
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
  console.log('=== PHASE 4 — TASK 4.4: LIKE DELTA & DEDUPLICATION TESTS ===\n');

  const env = createLiveLikeEnv();
  const { gsm, service, statePatches, actionFxList } = env;
  await service.connect();

  try {
    // Seed 2 seated players on Seats 1 & 2
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_44_1' },
      user: { id: 'u_seat_1', nickname: 'Anh Tư' },
      content: 'nhậu'
    });
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'seed_44_2' },
      user: { id: 'u_seat_2', nickname: 'Chú Bảy' },
      content: 'dô'
    });
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 0);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, 0);

    // -------------------------------------------------------------------------
    // TEST 1: Like có likeDelta (count / likeCount)
    // -------------------------------------------------------------------------
    console.log('Test 1: Like with explicit likeDelta (count / likeCount) adds exact delta...');
    const r1 = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't1_like_1' },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      count: 25
    });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.stateResult.stateChanged, true);
    assert.strictEqual(r1.stateResult.likeDelta, 25);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 25);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 25);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 2: Like có cả likeDelta và totalLikeCount (không tính cả hai, cập nhật baseline)
    // -------------------------------------------------------------------------
    console.log('Test 2: Like with BOTH count (likeDelta) and total (totalLikeCount) uses only count & updates room baseline...');
    const r2 = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't2_like_both', roomId: 'room_44_main', createTime: '1700000100000' },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      count: 35,
      total: '5035'
    });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.stateResult.stateChanged, true);
    assert.strictEqual(r2.stateResult.likeDelta, 35);
    // Must be 25 + 35 = 60, NEVER 25 + 5035 or 25 + 35 + 5035!
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 60);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 60);
    const roomBaselineAfterT2 = gsm.deduplicator.getLikeBaseline('room:room_44_main');
    assert.ok(roomBaselineAfterT2);
    assert.strictEqual(roomBaselineAfterT2.lastTotalLikeCount, 5035);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 3: Like chỉ có totalLikeCount (Gói đầu lập baseline +0; gói sau tính delta)
    // -------------------------------------------------------------------------
    console.log('Test 3: Like with ONLY totalLikeCount initializes baseline on first packet (+0) and computes delta on subsequent packet...');
    // New room 'room_total_only' has no baseline yet -> first packet total='8000' must add 0 likes!
    const vBeforeT3Init = gsm.stateVersion;
    const r3Init = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't3_total_init', roomId: 'room_total_only', createTime: '1700000200000' },
      user: { id: 'fan_2', nickname: 'Fan 2' },
      total: '8000'
    });
    assert.strictEqual(r3Init.ok, true);
    assert.strictEqual(r3Init.stateResult.stateChanged, false);
    assert.strictEqual(r3Init.stateResult.reason, 'LIKE_BASELINE_INITIALIZED');
    assert.strictEqual(r3Init.stateResult.likeDelta, 0);
    assert.strictEqual(gsm.stateVersion, vBeforeT3Init);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 60);

    // Second packet in 'room_total_only' has total='8040' -> delta = 8040 - 8000 = 40 (+40 likes -> reaches 100 total!)
    const r3Next = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't3_total_next', roomId: 'room_total_only', createTime: '1700000201000' },
      user: { id: 'fan_3', nickname: 'Fan 3' },
      total: '8040'
    });
    assert.strictEqual(r3Next.ok, true);
    assert.strictEqual(r3Next.stateResult.stateChanged, true);
    assert.strictEqual(r3Next.stateResult.likeDelta, 40);
    assert.strictEqual(r3Next.stateResult.likeResolutionReason, 'DERIVED_FROM_TOTAL_BASELINE');
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 100);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 0);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 1);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, 1);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 4: Gói trùng msgId (Duplicate msgId blocked)
    // -------------------------------------------------------------------------
    console.log('Test 4: Duplicate msgId Like packet is blocked with 0 likes added...');
    const vBeforeT4 = gsm.stateVersion;
    const r4Dup = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't3_total_next', roomId: 'room_total_only' },
      user: { id: 'fan_3', nickname: 'Fan 3' },
      count: 50,
      total: '8090'
    });
    assert.strictEqual(r4Dup.ok, true);
    assert.strictEqual(r4Dup.stateResult.stateChanged, false);
    assert.strictEqual(r4Dup.stateResult.reason, 'DUPLICATE_EVENT_ID');
    assert.strictEqual(gsm.stateVersion, vBeforeT4);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 100);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 5: Gói đến trễ (Delayed packet ignored safely)
    // -------------------------------------------------------------------------
    console.log('Test 5: Delayed packet (stale createTime or already-covered total) adds 0 likes...');
    const r5DelayedByTime = service.handleRawWebcastEvent('LIKE', {
      common: {
        msgId: 't5_delayed_time',
        roomId: 'room_44_main',
        createTime: '1700000080000' // 20s older than room_44_main's 1700000100000 (> 5s threshold)
      },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      count: 15,
      total: '5050'
    });
    assert.strictEqual(r5DelayedByTime.stateResult.stateChanged, false);
    assert.strictEqual(r5DelayedByTime.stateResult.reason, 'STALE_LIKE_PACKET');
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 100);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 6: Gói đảo thứ tự (Out-of-order packets handled accurately)
    // -------------------------------------------------------------------------
    console.log('Test 6: Out-of-order packets (Packet #2 arrives before Packet #1) reconcile to exact total...');
    // Room 'room_44_main' currently has baseline coveredUpToTotal=5035, lastTotalLikeCount=5035.
    // Suppose Packet #1 (count: 20, total: 5055) and Packet #2 (count: 15, total: 5070) arrive reversed:
    const r6Pkt2First = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't6_pkt_2', roomId: 'room_44_main', createTime: '1700000102000' },
      user: { id: 'fan_2', nickname: 'Fan 2' },
      count: 15,
      total: '5070'
    });
    assert.strictEqual(r6Pkt2First.stateResult.stateChanged, true);
    assert.strictEqual(r6Pkt2First.stateResult.likeDelta, 15);

    const r6Pkt1Second = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't6_pkt_1', roomId: 'room_44_main', createTime: '1700000101000' },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      count: 20,
      total: '5055'
    });
    assert.strictEqual(r6Pkt1Second.stateResult.stateChanged, true);
    assert.strictEqual(r6Pkt1Second.stateResult.likeDelta, 20);
    assert.strictEqual(r6Pkt1Second.stateResult.likeResolutionReason, 'OUT_OF_ORDER_GAP_FILLED');
    // Total likes added = 15 + 20 = 35 -> totalLikes = 100 + 35 = 135
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 135);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 35);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 7: Bộ đếm giảm (Decreased counter never subtracts or adds negative)
    // -------------------------------------------------------------------------
    console.log('Test 7: Decreased totalLikeCount never subtracts and preserves high-water mark...');
    const r7DecTotalOnly = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't7_dec_1', roomId: 'room_total_only', createTime: '1700000202000' },
      user: { id: 'fan_3', nickname: 'Fan 3' },
      total: '7900' // < 8040 baseline
    });
    assert.strictEqual(r7DecTotalOnly.stateResult.stateChanged, false);
    assert.strictEqual(r7DecTotalOnly.stateResult.reason, 'STALE_OR_DECREASED_LIKE_TOTAL');
    assert.strictEqual(r7DecTotalOnly.stateResult.likeDelta, 0);

    const r7DecWithCount = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't7_dec_2', roomId: 'room_44_main', createTime: '1700000103000' },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      count: 10,
      total: '5040' // < 5070 coveredUpToTotal with unfilledGap === 0
    });
    assert.strictEqual(r7DecWithCount.stateResult.stateChanged, false);
    assert.strictEqual(r7DecWithCount.stateResult.reason, 'STALE_OR_DECREASED_LIKE_TOTAL');
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 135);
    assert.strictEqual(gsm.deduplicator.getLikeBaseline('room:room_44_main').lastTotalLikeCount, 5070);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 8: Reconnect (Preserves baseline & msgId dedup, does not replay old Likes)
    // -------------------------------------------------------------------------
    console.log('Test 8: Reconnect preserves room baseline and msgId deduplication...');
    await service.disconnect();
    await service.connect();

    // Replay old total='5070' after reconnect -> must add 0 likes
    const r8ReplayTotal = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't8_after_reconn_1', roomId: 'room_44_main', createTime: '1700000104000' },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      total: '5070'
    });
    assert.strictEqual(r8ReplayTotal.stateResult.stateChanged, false);
    assert.strictEqual(r8ReplayTotal.stateResult.reason, 'STALE_OR_DECREASED_LIKE_TOTAL');

    // New likes after reconnect (total='5085' -> +15 likes from preserved 5070 baseline -> totalLikes = 150)
    const r8NewAfterReconn = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't8_after_reconn_2', roomId: 'room_44_main', createTime: '1700000105000' },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      total: '5085'
    });
    assert.strictEqual(r8NewAfterReconn.stateResult.stateChanged, true);
    assert.strictEqual(r8NewAfterReconn.stateResult.likeDelta, 15);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 150);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 9: Hai người chơi Like độc lập
    // -------------------------------------------------------------------------
    console.log('Test 9: Two users sending independent Like batches accumulate accurately...');
    const r9UserA = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't9_uA', roomId: 'room_44_main', createTime: '1700000106000' },
      user: { id: 'independent_A', nickname: 'Người A' },
      count: 20,
      total: '5105'
    });
    const r9UserB = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't9_uB', roomId: 'room_44_main', createTime: '1700000107000' },
      user: { id: 'independent_B', nickname: 'Người B' },
      count: 30,
      total: '5135'
    });
    assert.strictEqual(r9UserA.stateResult.likeDelta, 20);
    assert.strictEqual(r9UserB.stateResult.likeDelta, 30);
    // 150 + 20 + 30 = 200 -> 2nd milestone reached -> drunkLevel of Seats 1 & 2 becomes 2!
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 200);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 0);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 2);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, 2);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 10: Tổng Like toàn phòng không cộng nhầm cho một người
    // -------------------------------------------------------------------------
    console.log('Test 10: Room totalLikeCount is scoped to roomId, never attributed as personal delta of a single userId...');
    // In 'room_shared_scope', user_X sends first total='9500' (init baseline -> +0), then user_Y sends total='9512' (+12, NOT 9512!)
    const r10UserX = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't10_x', roomId: 'room_shared_scope' },
      user: { id: 'user_X', nickname: 'User X' },
      total: '9500'
    });
    const r10UserY = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't10_y', roomId: 'room_shared_scope' },
      user: { id: 'user_Y', nickname: 'User Y' },
      total: '9512'
    });
    assert.strictEqual(r10UserX.stateResult.likeDelta, 0);
    assert.strictEqual(r10UserY.stateResult.likeDelta, 12);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 212);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 12);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 11: Like không hợp lệ
    // -------------------------------------------------------------------------
    console.log('Test 11: Invalid Like payloads (negative, zero, >10000, non-numeric, missing fields) rejected...');
    const invalidPayloads = [
      { common: { msgId: 't11_1' }, user: { id: 'u1' }, count: 0 },
      { common: { msgId: 't11_2' }, user: { id: 'u1' }, count: -10 },
      { common: { msgId: 't11_3' }, user: { id: 'u1' }, count: 10001 },
      { common: { msgId: 't11_4' }, user: { id: 'u1' }, count: 'abc' },
      { common: { msgId: 't11_5' }, user: { id: 'u1' }, count: 5, total: -100 },
      { common: { msgId: 't11_6' }, user: { id: 'u1' } } // missing both count and total
    ];
    for (const bad of invalidPayloads) {
      const res = service.handleRawWebcastEvent('LIKE', bad);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.reason, 'VALIDATION_FAILED');
    }
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 212);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 12: Burst load (50 Like events in rapid succession)
    // -------------------------------------------------------------------------
    console.log('Test 12: Burst load of 50 rapid Like events (50 * 4 = 200 likes -> +2 drunkLevel)...');
    let runningRoomTotal = 5135;
    for (let i = 1; i <= 50; i += 1) {
      runningRoomTotal += 4;
      const bRes = service.handleRawWebcastEvent('LIKE', {
        common: {
          msgId: `t12_burst_${i}`,
          roomId: 'room_44_main',
          createTime: String(1700000110000 + i * 10)
        },
        user: { id: `burst_user_${(i % 5) + 1}`, nickname: `Burst ${(i % 5) + 1}` },
        count: 4,
        total: String(runningRoomTotal)
      });
      assert.strictEqual(bRes.ok, true);
      assert.strictEqual(bRes.stateResult.likeDelta, 4);
    }
    // 212 + 200 = 412 totalLikes -> 2 milestones triggered -> drunkLevel goes from 2 to 4
    assert.strictEqual(gsm.getSnapshot().likeMetrics.totalLikes, 412);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 12);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 4);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, 4);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 13: Cleanup baseline cache & bounded memory limit
    // -------------------------------------------------------------------------
    console.log('Test 13: BoundedDeduplicator enforces maxLikeBaselineEntries and cleans up expired baselines...');
    const boundedDedup = new BoundedDeduplicator({
      maxLikeBaselineEntries: 4,
      likeBaselineTtlMs: 1000
    });
    const baseNow = 5000000;
    for (let r = 1; r <= 7; r += 1) {
      boundedDedup.resolveLikeDelta(`room:r_${r}`, { totalLikeCount: r * 100 }, baseNow + r);
    }
    assert.strictEqual(
      boundedDedup.getLikeBaselineSize(baseNow + 10),
      4,
      'Must cap likeBaselineCache at maxLikeBaselineEntries (4)'
    );
    boundedDedup.cleanup(baseNow + 2000);
    assert.strictEqual(
      boundedDedup.getLikeBaselineSize(baseNow + 2000),
      0,
      'Expired room like baselines must be evicted'
    );
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 14: MOCK/LIVE isolation
    // -------------------------------------------------------------------------
    console.log('Test 14: MOCK/LIVE isolation strictly enforced for Like events...');
    const mockLikeInLive = gsm.processEvent(
      normalizeEvent(
        validateRawEvent({
          source: 'MOCK',
          eventType: 'LIKE',
          userId: 'mock_liker',
          nickname: 'Mock Liker',
          payload: { likeDelta: 50 }
        }).sanitized
      )
    );
    assert.strictEqual(mockLikeInLive.stateChanged, false);
    assert.strictEqual(mockLikeInLive.reason, 'MOCK_DISABLED_IN_LIVE_MODE');

    gsm.mode = 'MOCK';
    const liveLikeInMock = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't14_live_in_mock' },
      user: { id: 'fan_1', nickname: 'Fan 1' },
      count: 50
    });
    assert.strictEqual(liveLikeInMock.ok, false);
    assert.strictEqual(liveLikeInMock.reason, 'LIVE_DISABLED_IN_MOCK_MODE');
    gsm.mode = 'LIVE';
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 15: Quy tắc 100 Like = +1 độ say (multi-milestone & remainder)
    // -------------------------------------------------------------------------
    console.log('Test 15: 100 Like = +1 drunkLevel rule (288 new likes + 12 remainder = 300 -> +3 drunk, 0 remainder)...');
    const r15 = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 't15_milestone' },
      user: { id: 'fan_big', nickname: 'Fan Bự' },
      count: 288
    });
    assert.strictEqual(r15.stateResult.milestonesTriggered, 3);
    assert.strictEqual(r15.stateResult.drunkDeltaApplied, 3);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 0);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, 7);
    assert.strictEqual(gsm.getSnapshot().seats[1].player.drunkLevel, 7);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 16: Không làm sai Game State (stateVersion monotonic +1 on stateChanged)
    // -------------------------------------------------------------------------
    console.log('Test 16: stateVersion increments strictly by +1 on every state mutation...');
    assert.ok(statePatches.length > 55);
    for (let i = 1; i < statePatches.length; i += 1) {
      assert.strictEqual(
        statePatches[i].stateVersion,
        statePatches[i - 1].stateVersion + 1,
        `stateVersion must increase by 1 at patch index ${i}`
      );
    }
    assert.strictEqual(statePatches[statePatches.length - 1].stateVersion, gsm.stateVersion);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 17: Không ảnh hưởng Gift combo
    // -------------------------------------------------------------------------
    console.log('Test 17: Gift combo (1 -> 3 -> repeatEnd 3) continues to work accurately alongside Like processing...');
    const s1BeforeGift = gsm.getSnapshot().seats[0].player.drunkLevel;
    service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't17_g1' },
      user: { id: 'gifter_44', nickname: 'Gifter 44' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 1,
      repeatEnd: 0,
      groupId: 'grp_44_combo'
    });
    service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't17_g2' },
      user: { id: 'gifter_44', nickname: 'Gifter 44' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 0,
      groupId: 'grp_44_combo'
    });
    const gEnd = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 't17_g3' },
      user: { id: 'gifter_44', nickname: 'Gifter 44' },
      toUser: { id: 'u_seat_1' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 1,
      groupId: 'grp_44_combo'
    });
    assert.strictEqual(gEnd.stateResult.stateChanged, false);
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, s1BeforeGift + 6); // 3 * 2 = +6
    assert.ok(actionFxList.some((fx) => fx.actionType === 'LIKE_MILESTONE'));
    console.log('  -> PASS');
  } finally {
    await service.shutdown();
    gsm.shutdown();
  }

  // ---------------------------------------------------------------------------
  // TEST 18: Không ảnh hưởng Socket.io / Phaser Client (E2E SocketClient test)
  // ---------------------------------------------------------------------------
  console.log('Test 18: E2E Socket.io & Frontend SocketClient receives LIVE Like milestone state & FX...');
  let e2eConnector = null;
  const e2eConfig = defaultConfig.buildConfig({
    port: 0,
    app: { defaultMode: 'LIVE' },
    tiktok: { uniqueId: 'e2e_streamer_44', autoConnect: false }
  });

  const liveServer = await startServer(e2eConfig, {
    tiktokOptions: {
      connectionFactory: async (uid, opts) => {
        e2eConnector = new FakeTikTokLiveConnection(uid, opts, '7399999999999995555');
        return e2eConnector;
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
    const receivedFx = [];
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
          },
          onActionFx: (fx) => receivedFx.push(fx)
        },
        'Test44E2EClient'
      );
      socketClient.connect();
    });

    await liveServer.tiktokService.connect();
    e2eConnector.emit('chat', {
      common: { msgId: 'e2e_join_1' },
      user: { id: 'e2e_u1', nickname: 'E2E Nhậu 1' },
      content: 'nhậu'
    });
    await new Promise((r) => setTimeout(r, 40));

    // Send 100 Likes -> triggers LIKE_MILESTONE (+1 drunk)
    e2eConnector.emit('like', {
      common: { msgId: 'e2e_like_100', roomId: '7399999999999995555' },
      user: { id: 'e2e_liker', nickname: 'E2E Liker' },
      count: 100,
      total: '1100'
    });
    await new Promise((r) => setTimeout(r, 60));

    assert.strictEqual(latestViewData.seats[0].userId, 'e2e_u1');
    assert.strictEqual(latestViewData.seats[0].drunkLevel, 1);
    assert.ok(receivedFx.some((fx) => fx.actionType === 'LIKE_MILESTONE'));
    console.log('  -> PASS');
  } finally {
    socketClient.disconnect();
    await liveServer.shutdown();
  }

  console.log('\n=== ALL 18 TASK 4.4 TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Task 4.4 test failed:', err);
  process.exit(1);
});
