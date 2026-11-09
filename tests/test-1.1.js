'use strict';

const assert = require('assert');
const { io: createClient } = require('socket.io-client');
const { buildConfig } = require('../server/config');
const { startServer } = require('../server/index');

function emitWithAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ack on ${eventName}`));
    }, 5000);
    socket.emit(eventName, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function runTests() {
  const testConfig = buildConfig({
    host: '127.0.0.1',
    port: 0,
    env: 'development'
  });

  const serverInstance = await startServer(testConfig);
  const baseUrl = `http://127.0.0.1:${serverInstance.port}`;
  let clientSocket = null;

  try {
    // 1. Check GET /health
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200, 'GET /health must return HTTP 200');
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, 'ok');
    assert.strictEqual(healthJson.service, '1-2-3-do-backend');
    assert.strictEqual(healthJson.phase, '1.1');
    assert.strictEqual(healthJson.mode, 'MOCK');
    console.log('[PASS] 1. GET /health returned valid JSON status.');

    // 2. Check Socket.io client connection & client:ready handshake
    const receivedBroadcasts = [];
    clientSocket = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
      clientSocket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      clientSocket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    clientSocket.on('mock:event_normalized', (evt) => {
      receivedBroadcasts.push(evt);
    });

    const readyAck = await emitWithAck(clientSocket, 'client:ready', { clientType: 'mock' });
    assert.strictEqual(readyAck.ok, true);
    assert.strictEqual(readyAck.status, 'connected');
    assert.strictEqual(readyAck.phase, '1.1');
    console.log('[PASS] 2. Socket.io client connected & completed client:ready handshake.');

    // 3. Test Mock Event: Comment "nhậu"
    const resNhau = await emitWithAck(clientSocket, 'mock:trigger_event', {
      rawEvent: {
        eventType: 'COMMENT',
        userId: 'viewer_nhau_01',
        nickname: 'Anh Tư Vỉa Hè',
        payload: { comment: 'nhậu' }
      }
    });
    assert.strictEqual(resNhau.ok, true);
    assert.ok(resNhau.event.eventId.startsWith('evt_'));
    assert.strictEqual(resNhau.event.source, 'MOCK');
    assert.strictEqual(resNhau.event.eventType, 'JOIN_CMD');
    assert.strictEqual(resNhau.event.userId, 'viewer_nhau_01');
    assert.strictEqual(resNhau.event.nickname, 'Anh Tư Vỉa Hè');
    assert.strictEqual(typeof resNhau.event.timestamp, 'number');
    assert.strictEqual(resNhau.event.payload.isMock, true);
    assert.strictEqual(resNhau.event.payload.matchedKeyword, 'nhậu');
    console.log('[PASS] 3. Mock Event comment "nhậu" normalized to JOIN_CMD.');

    // 4. Test Mock Event: Comment "dô"
    const resDo = await emitWithAck(clientSocket, 'mock:trigger_event', {
      rawEvent: {
        eventType: 'COMMENT',
        userId: 'viewer_do_02',
        nickname: 'Chú Bảy Đô Bất Tử',
        payload: { comment: 'dô' }
      }
    });
    assert.strictEqual(resDo.ok, true);
    assert.strictEqual(resDo.event.source, 'MOCK');
    assert.strictEqual(resDo.event.eventType, 'JOIN_CMD');
    assert.strictEqual(resDo.event.userId, 'viewer_do_02');
    assert.strictEqual(resDo.event.payload.matchedKeyword, 'dô');
    assert.strictEqual(resDo.event.user.displayNickname, 'Chú Bảy Đô B…');
    console.log('[PASS] 4. Mock Event comment "dô" normalized to JOIN_CMD with 12-char displayNickname.');

    // 5. Test Mock Event: Like
    const resLike = await emitWithAck(clientSocket, 'mock:trigger_event', {
      rawEvent: {
        eventType: 'LIKE',
        userId: 'viewer_like_03',
        nickname: 'Thánh Thả Tim',
        payload: { likeDelta: 100 }
      }
    });
    assert.strictEqual(resLike.ok, true);
    assert.strictEqual(resLike.event.source, 'MOCK');
    assert.strictEqual(resLike.event.eventType, 'LIKE');
    assert.strictEqual(resLike.event.payload.isMock, true);
    assert.strictEqual(resLike.event.payload.likeDelta, 100);
    console.log('[PASS] 5. Mock Event LIKE normalized accurately.');

    // 6. Test Mock Event: Gift (with MOCK label)
    const resGift = await emitWithAck(clientSocket, 'mock:trigger_event', {
      rawEvent: {
        eventType: 'GIFT',
        userId: 'viewer_gift_04',
        nickname: 'Đại Gia Quận 1',
        payload: {
          mockGiftKey: 'MOCK_GIFT_VIP',
          repeatCount: 2,
          targetSeatIndex: 0
        }
      }
    });
    assert.strictEqual(resGift.ok, true);
    assert.strictEqual(resGift.event.source, 'MOCK');
    assert.strictEqual(resGift.event.eventType, 'GIFT');
    assert.strictEqual(resGift.event.payload.isMock, true);
    assert.strictEqual(resGift.event.payload.mockGiftKey, 'MOCK_GIFT_VIP');
    assert.strictEqual(resGift.event.payload.mappedActionType, 'DRINK_MEDIUM');
    assert.strictEqual(resGift.event.payload.repeatCount, 2);
    assert.strictEqual(resGift.event.payload.targetSeatIndex, 0);
    assert.strictEqual(receivedBroadcasts.length, 4, 'All 4 normalized events broadcast via Socket.io');
    console.log('[PASS] 6. Mock Event GIFT normalized & broadcast via Socket.io.');

    // 7. Test Invalid Mock Events (via Socket.io and HTTP POST)
    const invalidMissingUser = await emitWithAck(clientSocket, 'mock:trigger_event', {
      rawEvent: {
        eventType: 'COMMENT',
        userId: '',
        payload: { comment: 'nhậu' }
      }
    });
    assert.strictEqual(invalidMissingUser.ok, false);

    const invalidType = await emitWithAck(clientSocket, 'mock:trigger_event', {
      rawEvent: {
        eventType: 'HACK_EVENT',
        userId: 'user_bad'
      }
    });
    assert.strictEqual(invalidType.ok, false);

    const invalidLike = await emitWithAck(clientSocket, 'mock:trigger_event', {
      rawEvent: {
        eventType: 'LIKE',
        userId: 'user_bad',
        payload: { likeDelta: -50 }
      }
    });
    assert.strictEqual(invalidLike.ok, false);

    const invalidGiftHttpRes = await fetch(`${baseUrl}/api/mock/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'GIFT',
        userId: 'user_bad',
        payload: { mockGiftKey: 'UNVERIFIED_REAL_TIKTOK_GIFT_ID_9999' }
      })
    });
    assert.strictEqual(invalidGiftHttpRes.status, 400);
    const invalidGiftJson = await invalidGiftHttpRes.json();
    assert.strictEqual(invalidGiftJson.ok, false);
    console.log('[PASS] 7. Invalid Mock Event payloads rejected safely.');

    // 8. Test Client Disconnect & Server Resilience
    clientSocket.disconnect();
    clientSocket = null;
    await new Promise((r) => setTimeout(r, 150));

    const healthAfterDisconnect = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthAfterDisconnect.status, 200);
    console.log('[PASS] 8. Server remained stable after client disconnect.');

    console.log('\nALL TASK 1.1 TESTS PASSED.');
  } finally {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    await serverInstance.shutdown();
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Test 1.1 failed:', err);
  process.exit(1);
});
