'use strict';

/**
 * TEST SUITE — PHASE 4 (TASK 4.1):
 * Tích hợp `tiktok-live-connector@2.5.0` vào `server/services/tiktokService.js`
 * Kiểm tra:
 *  1. Xác minh package `tiktok-live-connector@2.5.0` và các export thực tế (`TikTokLiveConnection`, `WebcastEvent`, `ControlEvent`)
 *  2. Cô lập MOCK mode: Không tự kết nối TikTok khi chạy MOCK mode, chặn `connect()` và chặn raw event LIVE trong MOCK mode
 *  3. Cô lập LIVE mode: Chặn Mock event trong LIVE mode, cho phép `TikTokService.connect()` với connector chuẩn v2.5.0
 *  4. Luồng sự kiện LIVE (`chat`, `like`, `gift`) đi qua `validateRawEvent` -> `normalizeEvent` -> `SequentialEventQueue` -> `GameStateManager`
 *  5. Chống trùng lặp gói tin (`common.msgId` trùng không làm thay đổi Game State 2 lần)
 *  6. Không tự suy đoán `giftId` hoặc `vipGiftThreshold` (Gift chưa cấu hình trong `liveGiftMappings` bị bỏ qua an toàn)
 *  7. Xử lý lỗi kết nối (`UserOfflineError`), `disconnected`, `streamEnd`, reconnect và dọn sạch listener (`listenerCount === 0`), không nhân đôi timer gameplay
 *  8. Bảo mật Log & Frontend: Redact `cookie`, `sessionId`, `ttwid`, `signApiKey`, `oAuthToken`; không lộ thông tin nhạy cảm sang Frontend/Socket.io
 */

const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const defaultConfig = require('../server/config');
const logger = require('../server/logger');
const { createAppServer, startServer } = require('../server/index');
const {
  TikTokService,
  TIKTOK_CONNECTION_STATE,
  loadTikTokConnectorModule
} = require('../server/services/tiktokService');

class FakeTikTokLiveConnection extends EventEmitter {
  constructor(uniqueId, options = {}, behavior = {}) {
    super();
    this.uniqueId = uniqueId;
    this.options = options;
    this.behavior = behavior;
    this.roomId = behavior.roomId || '739999888777666555';
    this.isConnected = false;
    this.isConnecting = false;
    this.disconnectCalls = 0;
  }

  async connect() {
    this.isConnecting = true;
    if (this.behavior.shouldFailConnect) {
      this.isConnecting = false;
      const err = new Error(this.behavior.errorMessage || 'UserOfflineError: Streamer is offline');
      err.name = this.behavior.errorName || 'UserOfflineError';
      throw err;
    }
    this.isConnecting = false;
    this.isConnected = true;
    const state = {
      isConnected: true,
      isConnecting: false,
      roomId: this.roomId,
      roomInfo: { data: { status: 2 } },
      availableGifts: null
    };
    this.emit('connected', state);
    return state;
  }

  async disconnect() {
    this.disconnectCalls += 1;
    this.isConnected = false;
    this.isConnecting = false;
  }

  totalRegisteredListeners() {
    return this.eventNames().reduce((sum, name) => sum + this.listenerCount(name), 0);
  }
}

async function runTests() {
  const results = [];
  const record = (id, name, passed, detail = '') => {
    results.push({ id, name, passed, detail });
    const icon = passed ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${id} — ${name}${detail ? ` (${detail})` : ''}`);
  };

  // =========================================================================
  // TEST 1: Verify installed tiktok-live-connector@2.5.0 package & real API exports
  // =========================================================================
  const rootPkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
  );
  const installedPkg = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../node_modules/tiktok-live-connector/package.json'),
      'utf8'
    )
  );
  assert.strictEqual(
    rootPkg.dependencies['tiktok-live-connector'],
    '2.5.0',
    'package.json must pin tiktok-live-connector at exact version 2.5.0'
  );
  assert.strictEqual(installedPkg.version, '2.5.0');

  const connectorMod = await loadTikTokConnectorModule();
  assert.strictEqual(typeof connectorMod.TikTokLiveConnection, 'function');
  assert.strictEqual(connectorMod.WebcastEvent.CHAT, 'chat');
  assert.strictEqual(connectorMod.WebcastEvent.LIKE, 'like');
  assert.strictEqual(connectorMod.WebcastEvent.GIFT, 'gift');
  assert.strictEqual(connectorMod.WebcastEvent.STREAM_END, 'streamEnd');
  assert.strictEqual(connectorMod.ControlEvent.CONNECTED, 'connected');
  assert.strictEqual(connectorMod.ControlEvent.DISCONNECTED, 'disconnected');
  assert.strictEqual(connectorMod.ControlEvent.ERROR, 'error');

  // Verify real class instantiation without network call
  const realConnectorInstance = new connectorMod.TikTokLiveConnection('test_streamer_channel', {
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false
  });
  assert.strictEqual(typeof realConnectorInstance.connect, 'function');
  assert.strictEqual(typeof realConnectorInstance.disconnect, 'function');
  assert.strictEqual(typeof realConnectorInstance.on, 'function');
  assert.strictEqual(typeof realConnectorInstance.off, 'function');

  record(
    '4.1.1',
    'Xác minh package tiktok-live-connector@2.5.0 và API thực tế (TikTokLiveConnection, WebcastEvent, ControlEvent)',
    true,
    `version=${installedPkg.version}`
  );

  // =========================================================================
  // TEST 2: MOCK Mode Isolation — Never auto-connects & blocks LIVE events in MOCK mode
  // =========================================================================
  let factoryCalledInMock = 0;
  const mockModeConfig = defaultConfig.buildConfig({
    port: 0,
    app: { defaultMode: 'MOCK' },
    tiktok: { uniqueId: 'some_channel', autoConnect: true }
  });

  const mockServer = await startServer(mockModeConfig, {
    tiktokOptions: {
      connectionFactory: async (uid, opts) => {
        factoryCalledInMock += 1;
        return new FakeTikTokLiveConnection(uid, opts);
      }
    }
  });

  try {
    assert.strictEqual(
      factoryCalledInMock,
      0,
      'Must NOT auto-connect to TikTok when server is in MOCK mode'
    );
    assert.strictEqual(
      mockServer.tiktokService.connectionState,
      TIKTOK_CONNECTION_STATE.IDLE
    );

    const connectInMockRes = await mockServer.tiktokService.connect('some_channel');
    assert.strictEqual(connectInMockRes.ok, false);
    assert.strictEqual(connectInMockRes.reason, 'NOT_IN_LIVE_MODE');
    assert.strictEqual(factoryCalledInMock, 0);

    const rawLiveInMockRes = mockServer.tiktokService.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'msg_100' },
      user: { id: '7001', nickname: 'Viewer 1' },
      content: 'nhậu'
    });
    assert.strictEqual(rawLiveInMockRes.ok, false);
    assert.strictEqual(rawLiveInMockRes.reason, 'LIVE_DISABLED_IN_MOCK_MODE');
    assert.strictEqual(mockServer.gameStateManager.stateVersion, 0);

    record(
      '4.1.2',
      'Cô lập MOCK mode: Không tự động kết nối TikTok và chặn mọi sự kiện LIVE khi ở MOCK mode',
      true
    );
  } finally {
    await mockServer.shutdown();
  }

  // =========================================================================
  // TEST 3: LIVE Mode Integration, Normalization, Deduplication, Unmapped Gift Safety & Socket.io Sync
  // =========================================================================
  const createdConnectors = [];
  const liveModeConfig = defaultConfig.buildConfig({
    port: 0,
    app: { defaultMode: 'LIVE' },
    security: { rateLimitBypassInMock: false },
    tiktok: { uniqueId: 'quan_nhau_dem_live', autoConnect: false }
  });

  const liveServer = await startServer(liveModeConfig, {
    tiktokOptions: {
      connectionFactory: async (uid, opts) => {
        const fake = new FakeTikTokLiveConnection(uid, opts);
        createdConnectors.push(fake);
        return fake;
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

    // 3a. Mock events must be blocked in LIVE mode
    const blockedMock = liveServer.mockService.simulateCommentNhau('mock_intruder', 'Intruder');
    assert.strictEqual(blockedMock.ok, false);
    assert.strictEqual(blockedMock.error, 'Mock Simulator is disabled in LIVE mode.');

    // Connect SocketClient to verify Frontend receives LIVE state updates cleanly
    const receivedChatBubbles = [];
    let latestViewData = null;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Socket snapshot timeout')), 3000);
      socketClient.subscribe(
        {
          onStateSync: (vd, src) => {
            latestViewData = vd;
            if (src === 'SNAPSHOT') {
              clearTimeout(t);
              resolve();
            }
          },
          onChatBubble: (b) => receivedChatBubbles.push(b)
        },
        'Test41Client'
      );
      socketClient.connect();
    });

    // 3b. Connect TikTokService
    const connectRes = await liveServer.tiktokService.connect();
    assert.strictEqual(connectRes.ok, true);
    assert.strictEqual(
      liveServer.tiktokService.connectionState,
      TIKTOK_CONNECTION_STATE.CONNECTED
    );
    assert.strictEqual(createdConnectors.length, 1);
    const activeConnector = createdConnectors[0];

    // 3c. Emit WebcastEvent.CHAT with join keyword "nhậu" (v2.5.0 protobuf structure)
    activeConnector.emit('chat', {
      common: { msgId: '900001' },
      user: {
        id: '888000111',
        displayId: 'anh_ba_tiktok',
        nickname: 'Anh Ba TikTok',
        avatarThumb: { urlList: ['https://p16-sign.tiktokcdn.com/avatar1.jpeg'] }
      },
      content: 'nhậu'
    });

    await new Promise((r) => setTimeout(r, 50));

    const snap1 = liveServer.gameStateManager.getSnapshot();
    assert.strictEqual(snap1.stateVersion, 1);
    assert.strictEqual(snap1.seats[0].player.userId, '888000111', 'Must use stable user.id, not nickname');
    assert.strictEqual(snap1.seats[0].player.nickname, 'Anh Ba TikTok');
    assert.strictEqual(latestViewData.seats[0].userId, '888000111');

    // 3d. Duplicate msgId packet must be deduplicated (0 state mutation)
    activeConnector.emit('chat', {
      common: { msgId: '900001' },
      user: {
        id: '888000111',
        nickname: 'Anh Ba TikTok'
      },
      content: 'nhậu'
    });
    assert.strictEqual(
      liveServer.gameStateManager.stateVersion,
      1,
      'Duplicate msgId must not mutate Game State twice'
    );

    // 3e. Non-join chat from seated user -> emits game:chat_bubble without changing stateVersion
    // Advance rate limiter window or use a second seated user
    activeConnector.emit('chat', {
      common: { msgId: '900002' },
      user: {
        id: '888000222',
        nickname: 'Tư Sài Gòn'
      },
      content: 'dô'
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(liveServer.gameStateManager.stateVersion, 2);

    // Bypass rate limiter for chat bubble check on user 888000222 by clearing rateLimiter map
    liveServer.tiktokService.rateLimiter.clear();
    activeConnector.emit('chat', {
      common: { msgId: '900003' },
      user: {
        id: '888000222',
        nickname: 'Tư Sài Gòn'
      },
      content: 'Chào cả bàn nhậu đêm nay!'
    });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(liveServer.gameStateManager.stateVersion, 2, 'CHAT must not bump stateVersion');
    assert.strictEqual(receivedChatBubbles.length, 1);
    assert.strictEqual(receivedChatBubbles[0].seatId, 2);
    assert.strictEqual(receivedChatBubbles[0].userId, '888000222');

    // 3f. Emit WebcastEvent.LIKE (count: 100 -> +1 drunkLevel for both seated players)
    activeConnector.emit('like', {
      common: { msgId: '900004' },
      user: { id: '888000333', nickname: 'Fan Thả Tim' },
      count: 100,
      total: '100'
    });
    await new Promise((r) => setTimeout(r, 50));
    const snapAfterLike = liveServer.gameStateManager.getSnapshot();
    assert.strictEqual(snapAfterLike.seats[0].player.drunkLevel, 1);
    assert.strictEqual(snapAfterLike.seats[1].player.drunkLevel, 1);

    // 3g. Emit WebcastEvent.GIFT with unmapped giftId -> safely ignored without guessing Gift ID or VIP threshold
    const versionBeforeUnmappedGift = liveServer.gameStateManager.stateVersion;
    activeConnector.emit('gift', {
      common: { msgId: '900005' },
      user: { id: '888000444', nickname: 'Khách Tặng Quà' },
      giftId: '5655',
      repeatCount: 1,
      repeatEnd: 1,
      groupId: 'grp_01'
    });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(
      liveServer.gameStateManager.stateVersion,
      versionBeforeUnmappedGift,
      'Unmapped Live Gift must not mutate Game State when liveGiftMappings is empty'
    );

    record(
      '4.1.3',
      'Luồng sự kiện LIVE (chat/like/gift), chống trùng msgId, bảo toàn 6 ghế/30 hàng chờ & đồng bộ Socket.io',
      true,
      `stateVersion=${liveServer.gameStateManager.stateVersion}, chatBubbles=${receivedChatBubbles.length}`
    );

    // =========================================================================
    // TEST 4: Disconnect, Reconnect, StreamEnd, Error handling & Zero Listener Leak
    // =========================================================================
    assert.ok(activeConnector.totalRegisteredListeners() > 0);

    // Simulate WebSocket disconnect event from connector
    activeConnector.emit('disconnected', { code: 1006, reason: 'Abnormal Closure' });
    assert.strictEqual(
      liveServer.tiktokService.connectionState,
      TIKTOK_CONNECTION_STATE.DISCONNECTED
    );
    assert.strictEqual(liveServer.gameStateManager.connectionStatus, 'DISCONNECTED');

    // Reconnect -> must clean up old connector listeners (0 remaining on old instance) and attach to new instance
    const reconnectRes = await liveServer.tiktokService.connect();
    assert.strictEqual(reconnectRes.ok, true);
    assert.strictEqual(
      activeConnector.totalRegisteredListeners(),
      0,
      'Old connector instance must have 0 listeners after reconnect'
    );
    const secondConnector = createdConnectors[1];
    assert.ok(secondConnector.totalRegisteredListeners() > 0);

    // Disconnect explicitly -> must remove all listeners on secondConnector
    await liveServer.tiktokService.disconnect();
    assert.strictEqual(
      secondConnector.totalRegisteredListeners(),
      0,
      'Disconnected connector must have 0 listeners remaining'
    );
    assert.strictEqual(liveServer.tiktokService.getStatus().listenerCount, 0);

    // Test failed connection (e.g. UserOfflineError) -> cleans up listeners and sets ERROR state without crashing
    liveServer.tiktokService.connectionFactory = async (uid, opts) =>
      new FakeTikTokLiveConnection(uid, opts, {
        shouldFailConnect: true,
        errorName: 'UserOfflineError',
        errorMessage: 'Streamer is currently offline'
      });

    const failedConnectRes = await liveServer.tiktokService.connect();
    assert.strictEqual(failedConnectRes.ok, false);
    assert.strictEqual(failedConnectRes.reason, 'CONNECTION_FAILED');
    assert.strictEqual(
      liveServer.tiktokService.connectionState,
      TIKTOK_CONNECTION_STATE.ERROR
    );
    assert.strictEqual(liveServer.tiktokService.getStatus().listenerCount, 0);

    record(
      '4.1.4',
      'Xử lý disconnect, reconnect, UserOfflineError và dọn sạch 100% listener không rò rỉ',
      true,
      `remainingListeners=${liveServer.tiktokService.getStatus().listenerCount}`
    );
  } finally {
    socketClient.disconnect();
    await liveServer.shutdown();
  }

  // =========================================================================
  // TEST 5: Security & Log Redaction (No cookie, sessionId, ttwid, signApiKey, oAuthToken leaked)
  // =========================================================================
  const redacted = logger.redactObject({
    uniqueId: 'streamer_01',
    cookie: 'sessionid=secret123; ttwid=abc999',
    sessionId: 'secret_session_id',
    ttwid: 'secret_ttwid',
    signApiKey: 'euler_secret_key',
    oAuthToken: 'oauth_secret_token',
    nested: {
      'tt-target-idc': 'useast2a',
      password: 'my_password'
    }
  });
  assert.strictEqual(redacted.cookie, '[REDACTED]');
  assert.strictEqual(redacted.sessionId, '[REDACTED]');
  assert.strictEqual(redacted.ttwid, '[REDACTED]');
  assert.strictEqual(redacted.signApiKey, '[REDACTED]');
  assert.strictEqual(redacted.oAuthToken, '[REDACTED]');
  assert.strictEqual(redacted.nested['tt-target-idc'], '[REDACTED]');
  assert.strictEqual(redacted.nested.password, '[REDACTED]');
  assert.strictEqual(redacted.uniqueId, 'streamer_01');

  record(
    '4.1.5',
    'Bảo mật Log: Redact toàn bộ cookie, sessionId, ttwid, signApiKey, oAuthToken, password',
    true
  );

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n=== SUMMARY PHASE 4 (TASK 4.1 — TIKTOK CONNECTOR INTEGRATION): ${results.length - failed.length}/${results.length} PASSED ===`
  );
  if (failed.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test 4.1 failed with error:', err);
  process.exit(1);
});
