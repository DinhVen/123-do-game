'use strict';

/**
 * PHASE 4 — TASK 4.2 TEST SUITE
 * TikTok Event Normalization (CHAT, LIKE, GIFT) & E2E Pipeline Verification
 * Covers all 15 mandatory scenarios from Task 4.2 Specification.
 */

const assert = require('assert');
const EventEmitter = require('events');
const defaultConfig = require('../server/config');
const { GameStateManager } = require('../server/services/gameStateManager');
const { SequentialEventQueue } = require('../server/engines/eventQueue');
const { validateRawEvent } = require('../server/engines/inputValidator');
const { normalizeEvent } = require('../server/engines/eventNormalizer');
const {
  TikTokService,
  extractStableUserId,
  normalizeTikTokRawPayload
} = require('../server/services/tiktokService');

class FakeTikTokLiveConnection extends EventEmitter {
  constructor(uniqueId, options = {}) {
    super();
    this.uniqueId = uniqueId;
    this.options = options;
    this.roomId = '7399999999999999999';
  }
  async connect() {
    this.emit('connected', { roomId: this.roomId });
    return { roomId: this.roomId };
  }
  async disconnect() {
    this.emit('disconnected', { code: 1000, reason: 'Normal Closure' });
  }
}

function createLivePipeline(customConfigOverrides = {}) {
  const liveConfig = JSON.parse(JSON.stringify(defaultConfig));
  liveConfig.app.defaultMode = 'LIVE';
  liveConfig.tiktok.uniqueId = 'nhau_streamer_test';
  // High rate limit for deterministic multi-event tests unless overridden
  liveConfig.security.rateLimits = {
    windowMs: 1000,
    maxCommentsPerWindow: 50,
    maxLikesPerWindow: 50
  };
  Object.assign(liveConfig, customConfigOverrides);

  const emittedSocketEvents = [];
  const fakeIo = {
    emit(eventName, payload) {
      emittedSocketEvents.push({ eventName, payload });
    }
  };

  let fakeConnector = null;
  const gsm = new GameStateManager(
    liveConfig,
    (snapshot) => {
      fakeIo.emit('game:state_sync', snapshot);
    },
    (fxPayload) => {
      fakeIo.emit('game:action_fx', fxPayload);
    },
    (bubblePayload) => {
      fakeIo.emit('game:chat_bubble', bubblePayload);
    }
  );
  const queue = new SequentialEventQueue((event) => {
    return gsm.processEvent(event);
  });

  const service = new TikTokService(liveConfig, fakeIo, queue, gsm, {
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
    emittedSocketEvents,
    getConnector: () => fakeConnector
  };
}

async function runTests() {
  console.log('=== PHASE 4 — TASK 4.2: TIKTOK EVENT NORMALIZATION TESTS ===\n');

  const {
    gsm,
    queue,
    service,
    emittedSocketEvents,
    getConnector
  } = createLivePipeline();

  await service.connect();
  const connector = getConnector();
  assert.ok(connector, 'FakeTikTokLiveConnection must be initialized');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Chat "nhậu" tham gia bàn (JOIN_CMD)
    // -------------------------------------------------------------------------
    console.log('Test 1: Chat "nhậu" (case-insensitive & whitespace) joins table as JOIN_CMD...');
    connector.emit('chat', {
      common: { msgId: '90001' },
      user: {
        id: '7100000001',
        displayId: 'user_nhau_1',
        nickname: 'Anh Tư Nhậu',
        avatarThumb: { urlList: ['https://p16-sign.tiktokcdn.com/avatar1.jpeg'] }
      },
      content: '  NhẬu  '
    });

    let snap = gsm.getSnapshot();
    assert.strictEqual(snap.seats[0].player.userId, '7100000001');
    assert.strictEqual(snap.seats[0].player.nickname, 'Anh Tư Nhậu');
    assert.strictEqual(snap.seats[0].player.status, 'SEATED');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 2: Chat "dô" tham gia bàn (JOIN_CMD)
    // -------------------------------------------------------------------------
    console.log('Test 2: Chat "dô" joins table as JOIN_CMD...');
    connector.emit('chat', {
      common: { msgId: '90002' },
      user: {
        id: '7100000002',
        displayId: 'user_do_2',
        nickname: 'Chú Bảy Dô',
        avatarThumb: { urlList: ['https://p16-sign.tiktokcdn.com/avatar2.jpeg'] }
      },
      content: 'DÔ'
    });

    snap = gsm.getSnapshot();
    assert.strictEqual(snap.seats[1].player.userId, '7100000002');
    assert.strictEqual(snap.seats[1].player.nickname, 'Chú Bảy Dô');
    assert.strictEqual(snap.seats[1].player.status, 'SEATED');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 3: Chat thường hiển thị chat bubble (game:chat_bubble)
    // -------------------------------------------------------------------------
    console.log('Test 3: Regular chat normalized as CHAT and triggers game:chat_bubble for SEATED player...');
    const beforeBubbles = emittedSocketEvents.filter((e) => e.eventName === 'game:chat_bubble').length;
    connector.emit('chat', {
      common: { msgId: '90003' },
      user: {
        id: '7100000001',
        displayId: 'user_nhau_1',
        nickname: 'Anh Tư Nhậu'
      },
      content: 'Rót đầy ly đi anh em ơi!'
    });

    const afterBubbles = emittedSocketEvents.filter((e) => e.eventName === 'game:chat_bubble');
    assert.strictEqual(afterBubbles.length, beforeBubbles + 1);
    const lastBubble = afterBubbles[afterBubbles.length - 1].payload;
    assert.strictEqual(lastBubble.userId, '7100000001');
    assert.strictEqual(lastBubble.seatId, 1);
    assert.strictEqual(lastBubble.message, 'Rót đầy ly đi anh em ơi!');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 4: Nickname có Unicode tiếng Việt và emoji (không cắt đứt surrogate pair)
    // -------------------------------------------------------------------------
    console.log('Test 4: Nickname with Vietnamese diacritics and emoji preserved safely...');
    connector.emit('chat', {
      common: { msgId: '90004' },
      user: {
        id: '7100000003',
        displayId: 'unicode_emoji_user',
        nickname: '🍻🔥Nguyễn Văn Đạt🍺🎉🥳'
      },
      content: 'nhậu'
    });

    snap = gsm.getSnapshot();
    const p3 = snap.seats[2].player;
    assert.strictEqual(p3.userId, '7100000003');
    assert.strictEqual(p3.nickname, '🍻🔥Nguyễn Văn Đạt🍺🎉🥳');
    // Check no lone surrogates in displayNickname
    assert.strictEqual(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p3.displayNickname), false);
    assert.ok(p3.displayNickname.startsWith('🍻🔥Nguyễn'));
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 5: userId ổn định (không dùng nickname làm userId, đổi nickname không tạo người mới)
    // -------------------------------------------------------------------------
    console.log('Test 5: Stable userId (never uses nickname as userId; nickname change keeps same player)...');
    const noIdOnlyNickname = extractStableUserId({
      user: { nickname: 'Chỉ Có Nickname Không Có ID' },
      nickname: 'Chỉ Có Nickname Không Có ID'
    });
    assert.strictEqual(noIdOnlyNickname, '', 'extractStableUserId must return empty when only nickname exists');

    // Same user 7100000001 changes nickname and chats "nhậu" again -> must NOT create a duplicate seat
    connector.emit('chat', {
      common: { msgId: '90005' },
      user: {
        id: '7100000001',
        displayId: 'user_nhau_1',
        nickname: 'Anh Tư Đổi Tên Mới'
      },
      content: 'nhậu'
    });

    snap = gsm.getSnapshot();
    const occupiedSeats = snap.seats.filter((s) => s.player !== null);
    assert.strictEqual(occupiedSeats.length, 3, 'Must still have exactly 3 seated players (no duplicate)');
    assert.strictEqual(snap.seats[0].player.userId, '7100000001');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 6: Chat thiếu trường bắt buộc (thiếu userId hoặc thiếu/rỗng comment)
    // -------------------------------------------------------------------------
    console.log('Test 6: Chat missing required fields (missing userId or empty/HTML-only comment) rejected...');
    const resMissingUser = service.handleRawWebcastEvent('CHAT', {
      common: { msgId: '90006_a' },
      user: { nickname: 'NoIdUser' },
      content: 'nhậu'
    });
    assert.strictEqual(resMissingUser.ok, false);
    assert.strictEqual(resMissingUser.reason, 'VALIDATION_FAILED');

    const resEmptyComment = service.handleRawWebcastEvent('CHAT', {
      common: { msgId: '90006_b' },
      user: { id: '7100000099', nickname: 'ValidUser' },
      content: '   <>   '
    });
    assert.strictEqual(resEmptyComment.ok, false);
    assert.strictEqual(resEmptyComment.reason, 'VALIDATION_FAILED');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 7: Like có likeDelta (count / likeCount) + phân biệt totalLikeCount
    // -------------------------------------------------------------------------
    console.log('Test 7: Like with count (likeDelta) and total (totalLikeCount) normalized & accumulated...');
    const likeRes = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: '90007_a' },
      user: { id: '7100000001', nickname: 'Anh Tư Nhậu' },
      count: 60,
      total: '15420'
    });

    assert.strictEqual(likeRes.ok, true);
    assert.strictEqual(likeRes.event.eventType, 'LIKE');
    assert.strictEqual(likeRes.event.payload.likeDelta, 60);
    assert.strictEqual(likeRes.event.payload.totalLikeCount, 15420);
    snap = gsm.getSnapshot();
    assert.strictEqual(snap.likeMetrics.unconsumedLikes, 60);
    assert.strictEqual(snap.seats[0].player.drunkLevel, 0);

    // Send another 40 likes -> reaches 100 Like milestone -> +1 drunkLevel for all 3 seated players
    service.handleRawWebcastEvent('LIKE', {
      common: { msgId: '90007_b' },
      user: { id: '7100000002', nickname: 'Chú Bảy Dô' },
      likeCount: 40,
      totalLikeCount: 15460
    });

    snap = gsm.getSnapshot();
    assert.strictEqual(snap.likeMetrics.unconsumedLikes, 0);
    assert.strictEqual(snap.seats[0].player.drunkLevel, 1);
    assert.strictEqual(snap.seats[1].player.drunkLevel, 1);
    assert.strictEqual(snap.seats[2].player.drunkLevel, 1);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 8: Like chỉ có totalLikeCount (TUYỆT ĐỐI không cộng nhầm totalLikeCount thành likeDelta)
    // -------------------------------------------------------------------------
    console.log('Test 8: Like with ONLY totalLikeCount/total rejected (never treated as likeDelta)...');
    const drunkBeforeTotalOnly = gsm.getSnapshot().seats[0].player.drunkLevel;
    const totalOnlyRes = service.handleRawWebcastEvent('LIKE', {
      common: { msgId: '90008' },
      user: { id: '7100000001', nickname: 'Anh Tư Nhậu' },
      total: '50000',
      totalLikeCount: 50000
    });

    assert.strictEqual(totalOnlyRes.ok, false);
    assert.strictEqual(totalOnlyRes.reason, 'VALIDATION_FAILED');
    assert.strictEqual(gsm.getSnapshot().seats[0].player.drunkLevel, drunkBeforeTotalOnly);
    assert.strictEqual(gsm.getSnapshot().likeMetrics.unconsumedLikes, 0);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 9: Gift có giftId hợp lệ (không tự suy đoán giá trị khi liveGiftMappings rỗng)
    // -------------------------------------------------------------------------
    console.log('Test 9: Gift with valid giftId normalized properly without guessing unmapped gift value...');
    const giftRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: '90009' },
      user: {
        id: '7100000088',
        displayId: 'gifter_pro',
        nickname: 'Đại Gia Bia',
        avatarThumb: { urlList: ['https://p16-sign.tiktokcdn.com/gifter.jpeg'] }
      },
      giftId: 5655,
      repeatCount: 1,
      gift: {
        id: 5655,
        name: 'Rose',
        type: 1,
        diamondCount: 1
      }
    });

    assert.strictEqual(giftRes.ok, true);
    assert.strictEqual(giftRes.event.eventType, 'GIFT');
    assert.strictEqual(giftRes.event.payload.giftId, '5655');
    assert.strictEqual(giftRes.event.payload.giftName, 'Rose');
    assert.strictEqual(giftRes.event.payload.giftType, 1);
    assert.strictEqual(giftRes.event.payload.actionCategory, 'UNMAPPED');
    assert.strictEqual(giftRes.event.payload.mappedActionType, 'UNMAPPED_LIVE_GIFT');
    assert.strictEqual(giftRes.stateResult.stateChanged, false);
    assert.strictEqual(giftRes.stateResult.reason, 'UNMAPPED_GIFT');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 10: Gift thiếu giftId
    // -------------------------------------------------------------------------
    console.log('Test 10: Gift missing giftId rejected safely...');
    const missingGiftIdRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: '90010' },
      user: { id: '7100000088', nickname: 'Đại Gia Bia' },
      repeatCount: 1
    });
    assert.strictEqual(missingGiftIdRes.ok, false);
    assert.strictEqual(missingGiftIdRes.reason, 'VALIDATION_FAILED');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 11: Gift có repeatCount / repeatEnd / groupId (streakId) giữ nguyên trong payload
    // -------------------------------------------------------------------------
    console.log('Test 11: Gift with repeatCount / repeatEnd (0/1 & boolean) / groupId preserved in NormalizedGameEvent...');
    const streakStartRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: '90011_a' },
      user: { id: '7100000088', nickname: 'Đại Gia Bia' },
      giftId: '5655',
      repeatCount: 3,
      repeatEnd: 0, // protobuf v3 sends 0 while streaking
      groupId: '17100000999',
      toUser: { id: '7100000001', nickname: 'Anh Tư Nhậu' }
    });

    assert.strictEqual(streakStartRes.ok, true);
    assert.strictEqual(streakStartRes.event.payload.repeatCount, 3);
    assert.strictEqual(streakStartRes.event.payload.repeatEnd, false);
    assert.strictEqual(streakStartRes.event.payload.groupId, '17100000999');
    assert.strictEqual(streakStartRes.event.payload.streakId, '17100000999');
    assert.strictEqual(streakStartRes.event.payload.isStreak, true);
    assert.strictEqual(streakStartRes.event.payload.targetUserId, '7100000001');

    const streakEndRes = service.handleRawWebcastEvent('GIFT', {
      common: { msgId: '90011_b' },
      user: { id: '7100000088', nickname: 'Đại Gia Bia' },
      giftId: '5655',
      repeatCount: 5,
      repeatEnd: 1, // protobuf v3 sends 1 when streak ends
      groupId: '17100000999'
    });

    assert.strictEqual(streakEndRes.ok, true);
    assert.strictEqual(streakEndRes.event.payload.repeatCount, 5);
    assert.strictEqual(streakEndRes.event.payload.repeatEnd, true);
    assert.strictEqual(streakEndRes.event.payload.groupId, '17100000999');
    assert.strictEqual(streakEndRes.event.payload.streakId, '17100000999');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 12: Sự kiện trùng msgId (Deduplication)
    // -------------------------------------------------------------------------
    console.log('Test 12: Duplicate msgId event deduplicated by GameStateManager...');
    const duplicateChatPayload = {
      common: { msgId: '90012_dup' },
      user: { id: '7100000004', displayId: 'user_4', nickname: 'Người Thứ Tư' },
      content: 'nhậu'
    };
    const firstDupRes = service.handleRawWebcastEvent('CHAT', duplicateChatPayload);
    // Clear rate-limit bucket so the duplicate packet reaches GameStateManager deduplicator
    service.rateLimiter.clear();
    const secondDupRes = service.handleRawWebcastEvent('CHAT', duplicateChatPayload);

    assert.strictEqual(firstDupRes.ok, true);
    assert.strictEqual(firstDupRes.stateResult.stateChanged, true);
    assert.strictEqual(secondDupRes.ok, true);
    assert.strictEqual(secondDupRes.stateResult.stateChanged, false);
    assert.strictEqual(secondDupRes.stateResult.reason, 'DUPLICATE_EVENT_ID');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 13: Sự kiện sai cấu trúc (Malformed payloads)
    // -------------------------------------------------------------------------
    console.log('Test 13: Malformed payloads (null, primitive, array, invalid repeatCount, invalid repeatEnd) never crash...');
    const malformedCases = [
      ['CHAT', null],
      ['CHAT', 'raw string'],
      ['CHAT', [1, 2, 3]],
      ['LIKE', { user: { id: '7100000001' }, count: -15 }],
      ['LIKE', { user: { id: '7100000001' }, count: 'not_a_number' }],
      ['GIFT', { user: { id: '7100000001' }, giftId: '5655', repeatCount: 0 }],
      ['GIFT', { user: { id: '7100000001' }, giftId: '5655', repeatEnd: 'invalid_bool' }],
      ['UNKNOWN_TYPE', { user: { id: '7100000001' } }]
    ];
    for (const [type, badData] of malformedCases) {
      const res = service.handleRawWebcastEvent(type, badData);
      assert.strictEqual(res.ok, false, `Expected malformed ${type} to be rejected`);
    }
    assert.strictEqual(normalizeTikTokRawPayload('CHAT', null), null);
    assert.strictEqual(normalizeTikTokRawPayload('CHAT', []), null);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 14: MOCK/LIVE Isolation
    // -------------------------------------------------------------------------
    console.log('Test 14: MOCK/LIVE Isolation enforced in both directions...');
    // 14a: MOCK event submitted while gsm is in LIVE mode -> rejected
    const mockVal = validateRawEvent({
      source: 'MOCK',
      eventType: 'JOIN_CMD',
      userId: 'mock_intruder',
      nickname: 'Mock Intruder',
      payload: { comment: 'nhậu' }
    });
    const mockNorm = normalizeEvent(mockVal.sanitized);
    const mockInLiveResult = gsm.processEvent(mockNorm);
    assert.strictEqual(mockInLiveResult.stateChanged, false);
    assert.strictEqual(mockInLiveResult.reason, 'MOCK_DISABLED_IN_LIVE_MODE');

    // 14b: LIVE event submitted while gsm is in MOCK mode -> blocked by TikTokService
    gsm.mode = 'MOCK';
    const liveInMockResult = service.handleRawWebcastEvent('CHAT', {
      common: { msgId: '90014' },
      user: { id: '7100000077', nickname: 'Live User' },
      content: 'nhậu'
    });
    assert.strictEqual(liveInMockResult.ok, false);
    assert.strictEqual(liveInMockResult.reason, 'LIVE_DISABLED_IN_MOCK_MODE');
    gsm.mode = 'LIVE';
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    // TEST 15: Giữ nguyên gameplay rules hiện tại (6 ghế, hàng chờ 30, 100 Like = +1 độ say)
    // -------------------------------------------------------------------------
    console.log('Test 15: Core gameplay invariants (6 seats, 30 max queue, 100 Like = +1 drunk) preserved...');
    snap = gsm.getSnapshot();
    assert.strictEqual(snap.seats.length, 6);
    assert.strictEqual(gsm.maxSeats, 6);
    assert.strictEqual(gsm.maxQueueSize, 30);
    assert.strictEqual(gsm.likeMilestoneStep, 100);
    assert.strictEqual(gsm.likeDrunkDelta, 1);
    assert.strictEqual(defaultConfig.app.defaultMode, 'MOCK');
    console.log('  -> PASS');
  } finally {
    await service.shutdown();
    gsm.shutdown();
  }

  console.log('\n=== ALL 15 TASK 4.2 TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Task 4.2 test failed:', err);
  process.exit(1);
});
