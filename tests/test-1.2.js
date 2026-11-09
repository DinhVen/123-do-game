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

function connectClient(baseUrl) {
  return new Promise((resolve, reject) => {
    const socket = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false
    });
    let initialSnapshot = null;
    socket.once('game:state_snapshot', (snap) => {
      initialSnapshot = snap;
    });
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve({ socket, getInitialSnapshot: () => initialSnapshot });
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function assertStateInvariants(state) {
  assert.strictEqual(state.seats.length, 6, 'Must have exactly 6 seats');
  const seenUserIds = new Set();

  state.seats.forEach((seat, idx) => {
    assert.strictEqual(seat.seatId, idx + 1, 'seatId must be fixed 1..6');
    assert.strictEqual(seat.seatIndex, idx, 'seatIndex must be fixed 0..5');
    if (seat.player !== null) {
      assert.strictEqual(seat.player.seatId, seat.seatId);
      assert.strictEqual(seat.player.status, 'SEATED');
      assert.strictEqual(
        seenUserIds.has(seat.player.userId),
        false,
        `Duplicate userId in seats: ${seat.player.userId}`
      );
      seenUserIds.add(seat.player.userId);
    }
  });

  state.vipQueue.forEach((p) => {
    assert.strictEqual(p.status, 'QUEUED_VIP');
    assert.strictEqual(p.isVIP, true);
    assert.strictEqual(p.seatId, null);
    assert.strictEqual(
      seenUserIds.has(p.userId),
      false,
      `Duplicate userId in vipQueue: ${p.userId}`
    );
    seenUserIds.add(p.userId);
  });

  state.normalQueue.forEach((p) => {
    assert.strictEqual(p.status, 'QUEUED_NORMAL');
    assert.strictEqual(p.isVIP, false);
    assert.strictEqual(p.seatId, null);
    assert.strictEqual(
      seenUserIds.has(p.userId),
      false,
      `Duplicate userId in normalQueue: ${p.userId}`
    );
    seenUserIds.add(p.userId);
  });

  assert.strictEqual(
    state.totalWaiting,
    state.vipQueue.length + state.normalQueue.length,
    'totalWaiting must equal vipQueue.length + normalQueue.length'
  );
  assert.ok(state.totalWaiting <= 30, 'totalWaiting must never exceed 30');
}

async function runTests() {
  const testConfig = buildConfig({
    host: '127.0.0.1',
    port: 0,
    env: 'development'
  });

  const serverInstance = await startServer(testConfig);
  const baseUrl = `http://127.0.0.1:${serverInstance.port}`;
  const activeSockets = [];

  async function triggerMock(socket, rawEvent) {
    return emitWithAck(socket, 'mock:trigger_event', { rawEvent });
  }

  function getSnapshot() {
    const snap = serverInstance.gameStateManager.getSnapshot();
    assertStateInvariants(snap);
    return snap;
  }

  try {
    const { socket: mainClient } = await connectClient(baseUrl);
    activeSockets.push(mainClient);

    // 1. Người đầu tiên vào ghế 1 (comment "nhậu")
    const r1 = await triggerMock(mainClient, {
      eventType: 'COMMENT',
      userId: 'user_seat_1',
      nickname: 'Người Chơi 1',
      payload: { comment: 'nhậu' }
    });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.stateResult.stateChanged, true);
    assert.strictEqual(r1.stateResult.seatId, 1);
    let snap = getSnapshot();
    assert.strictEqual(snap.seats[0].player.userId, 'user_seat_1');
    assert.strictEqual(snap.seats[0].player.seatId, 1);
    assert.strictEqual(snap.seatedPlayers.length, 1);
    assert.strictEqual(snap.stateVersion, 1);
    console.log('[PASS] 1. Người đầu tiên vào ghế 1.');

    // 2 & 5. Sáu người vào đủ 6 ghế & Hai lệnh "nhậu" và "dô" hoạt động đúng
    for (let i = 2; i <= 6; i += 1) {
      const cmd = i % 2 === 0 ? 'dô' : 'nhậu';
      const res = await triggerMock(mainClient, {
        eventType: 'COMMENT',
        userId: `user_seat_${i}`,
        nickname: `Người Chơi ${i}`,
        payload: { comment: cmd }
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.stateResult.stateChanged, true);
      assert.strictEqual(res.stateResult.seatId, i);
    }
    snap = getSnapshot();
    assert.strictEqual(snap.seatedPlayers.length, 6);
    assert.strictEqual(snap.totalWaiting, 0);
    assert.strictEqual(snap.stateVersion, 6);
    console.log('[PASS] 2 & 5. Sáu người vào đủ 6 ghế; cả 2 lệnh "nhậu" và "dô" đều hoạt động đúng.');

    // 3. Người thứ 7 vào Normal Queue
    const r7 = await triggerMock(mainClient, {
      eventType: 'COMMENT',
      userId: 'user_normal_1',
      nickname: 'Khách Chờ Thường 1',
      payload: { comment: 'nhậu' }
    });
    assert.strictEqual(r7.ok, true);
    assert.strictEqual(r7.stateResult.stateChanged, true);
    assert.strictEqual(r7.stateResult.action, 'ENQUEUED_NORMAL');
    snap = getSnapshot();
    assert.strictEqual(snap.normalQueue.length, 1);
    assert.strictEqual(snap.normalQueue[0].userId, 'user_normal_1');
    assert.strictEqual(snap.totalWaiting, 1);
    console.log('[PASS] 3. Người thứ 7 vào Normal Queue.');

    // 4 & 13. Không cho phép userId trùng & stateVersion chỉ tăng khi state thực sự thay đổi
    const versionBeforeDup = snap.stateVersion;
    const dupSeated = await triggerMock(mainClient, {
      eventType: 'COMMENT',
      userId: 'user_seat_1',
      nickname: 'Tên Khác Nhưng Cùng UserId',
      payload: { comment: 'dô' }
    });
    assert.strictEqual(dupSeated.stateResult.stateChanged, false);
    assert.strictEqual(dupSeated.stateResult.reason, 'ALREADY_SEATED');

    const dupQueued = await triggerMock(mainClient, {
      eventType: 'COMMENT',
      userId: 'user_normal_1',
      nickname: 'Tên Khác 2',
      payload: { comment: 'nhậu' }
    });
    assert.strictEqual(dupQueued.stateResult.stateChanged, false);
    assert.strictEqual(dupQueued.stateResult.reason, 'ALREADY_IN_NORMAL_QUEUE');

    // Cho phép 2 người khác userId nhưng trùng nickname
    const sameNicknameDiffUser = await triggerMock(mainClient, {
      eventType: 'COMMENT',
      userId: 'user_normal_2',
      nickname: 'Người Chơi 1', // Trùng nickname với user_seat_1 nhưng khác userId
      payload: { comment: 'dô' }
    });
    assert.strictEqual(sameNicknameDiffUser.stateResult.stateChanged, true);
    snap = getSnapshot();
    assert.strictEqual(snap.stateVersion, versionBeforeDup + 1);
    assert.strictEqual(snap.normalQueue.length, 2);
    console.log('[PASS] 4 & 13. Chống trùng userId (không dùng nickname làm khóa) & stateVersion chỉ tăng khi state đổi.');

    // 7, 8, 9. VIP được ưu tiên khi giải phóng ghế; FIFO trong VIP Queue & FIFO trong Normal Queue
    await triggerMock(mainClient, {
      eventType: 'VIP_JOIN',
      userId: 'user_vip_1',
      nickname: 'VIP Số 1'
    });
    await triggerMock(mainClient, {
      eventType: 'VIP_JOIN',
      userId: 'user_vip_2',
      nickname: 'VIP Số 2'
    });
    snap = getSnapshot();
    assert.strictEqual(snap.vipQueue.length, 2);
    assert.strictEqual(snap.normalQueue.length, 2);
    // VIP mới không đuổi người đang ngồi
    assert.strictEqual(snap.seats[0].player.userId, 'user_seat_1');

    // Giải phóng ghế 2 -> user_vip_1 vào ghế 2 (VIP ưu tiên + FIFO VIP)
    const relSeat2 = await triggerMock(mainClient, {
      eventType: 'MOCK_RELEASE_SEAT',
      payload: { seatId: 2 }
    });
    assert.strictEqual(relSeat2.stateResult.stateChanged, true);
    assert.strictEqual(relSeat2.stateResult.nextPlayer.userId, 'user_vip_1');
    snap = getSnapshot();
    assert.strictEqual(snap.seats[1].player.userId, 'user_vip_1');
    assert.strictEqual(snap.seats[1].player.isVIP, true);

    // Giải phóng ghế 4 -> user_vip_2 vào ghế 4 (FIFO VIP)
    const relSeat4 = await triggerMock(mainClient, {
      eventType: 'MOCK_RELEASE_SEAT',
      payload: { seatId: 4 }
    });
    assert.strictEqual(relSeat4.stateResult.nextPlayer.userId, 'user_vip_2');
    snap = getSnapshot();
    assert.strictEqual(snap.vipQueue.length, 0);

    // Giải phóng ghế 1 -> VIP Queue đã trống, lấy user_normal_1 đầu Normal Queue (FIFO Normal)
    const relSeat1 = await triggerMock(mainClient, {
      eventType: 'MOCK_RELEASE_SEAT',
      payload: { seatId: 1 }
    });
    assert.strictEqual(relSeat1.stateResult.nextPlayer.userId, 'user_normal_1');

    // Giải phóng ghế 3 -> lấy user_normal_2 tiếp theo trong Normal Queue (FIFO Normal)
    const relSeat3 = await triggerMock(mainClient, {
      eventType: 'MOCK_RELEASE_SEAT',
      payload: { seatId: 3 }
    });
    assert.strictEqual(relSeat3.stateResult.nextPlayer.userId, 'user_normal_2');
    snap = getSnapshot();
    assert.strictEqual(snap.totalWaiting, 0);
    console.log('[PASS] 7, 8 & 9. VIP ưu tiên khi trống ghế; FIFO trong VIP Queue và FIFO trong Normal Queue.');

    // 6. Hàng chờ không vượt quá 30
    for (let i = 1; i <= 30; i += 1) {
      const res = await triggerMock(mainClient, {
        eventType: 'COMMENT',
        userId: `q_norm_${i}`,
        nickname: `Normal ${i}`,
        payload: { comment: 'nhậu' }
      });
      assert.strictEqual(res.stateResult.stateChanged, true);
    }
    snap = getSnapshot();
    assert.strictEqual(snap.totalWaiting, 30);
    assert.strictEqual(snap.normalQueue.length, 30);

    const verAt30 = snap.stateVersion;
    const norm31 = await triggerMock(mainClient, {
      eventType: 'COMMENT',
      userId: 'q_norm_31',
      nickname: 'Normal 31',
      payload: { comment: 'dô' }
    });
    assert.strictEqual(norm31.stateResult.stateChanged, false);
    assert.strictEqual(norm31.stateResult.reason, 'QUEUE_FULL');
    snap = getSnapshot();
    assert.strictEqual(snap.totalWaiting, 30);
    assert.strictEqual(snap.stateVersion, verAt30);
    console.log('[PASS] 6. Hàng chờ không vượt quá 30 người.');

    // 12. Nâng cấp Normal thành VIP không tăng tổng số người chờ (ngay cả khi hàng chờ đang 30/30)
    const promoteRes = await triggerMock(mainClient, {
      eventType: 'VIP_JOIN',
      userId: 'q_norm_15',
      nickname: 'Normal 15 Lên VIP'
    });
    assert.strictEqual(promoteRes.stateResult.stateChanged, true);
    assert.strictEqual(promoteRes.stateResult.action, 'PROMOTED_TO_VIP_QUEUE');
    snap = getSnapshot();
    assert.strictEqual(snap.totalWaiting, 30);
    assert.strictEqual(snap.vipQueue.length, 1);
    assert.strictEqual(snap.normalQueue.length, 29);
    assert.strictEqual(snap.vipQueue[0].userId, 'q_norm_15');
    console.log('[PASS] 12. Nâng cấp Normal thành VIP không tăng tổng số người chờ.');

    // 10. VIP mới thay thế người cuối Normal Queue khi hàng chờ đầy (30/30)
    // Hiện tại người cuối Normal Queue là q_norm_30
    const replaceRes = await triggerMock(mainClient, {
      eventType: 'VIP_JOIN',
      userId: 'brand_new_vip',
      nickname: 'VIP Mới Tinh'
    });
    assert.strictEqual(replaceRes.stateResult.stateChanged, true);
    assert.strictEqual(replaceRes.stateResult.action, 'ENQUEUED_VIP_REPLACED_NORMAL');
    assert.strictEqual(replaceRes.stateResult.replacedPlayer.userId, 'q_norm_30');
    snap = getSnapshot();
    assert.strictEqual(snap.totalWaiting, 30);
    assert.strictEqual(snap.vipQueue.length, 2);
    assert.strictEqual(snap.normalQueue.length, 28);
    assert.strictEqual(
      snap.normalQueue.some((p) => p.userId === 'q_norm_30'),
      false,
      'q_norm_30 must be removed from Normal Queue'
    );
    assert.strictEqual(snap.vipQueue[1].userId, 'brand_new_vip');
    console.log('[PASS] 10. VIP mới thay thế người cuối Normal Queue khi hàng chờ đầy.');

    // 11. Từ chối VIP mới nếu toàn bộ hàng chờ (30/30) là VIP
    // Nâng cấp nốt 28 người trong Normal Queue lên VIP (hoặc thay thế bằng VIP) để cả 30 người đều là VIP
    const remainingNormalIds = snap.normalQueue.map((p) => p.userId);
    for (const uid of remainingNormalIds) {
      await triggerMock(mainClient, {
        eventType: 'VIP_JOIN',
        userId: uid,
        nickname: `Promoted ${uid}`
      });
    }
    snap = getSnapshot();
    assert.strictEqual(snap.vipQueue.length, 30);
    assert.strictEqual(snap.normalQueue.length, 0);
    assert.strictEqual(snap.totalWaiting, 30);

    const verBefore31Vip = snap.stateVersion;
    const rejectVip31 = await triggerMock(mainClient, {
      eventType: 'VIP_JOIN',
      userId: 'vip_overflow_31',
      nickname: 'VIP Thứ 31'
    });
    assert.strictEqual(rejectVip31.stateResult.stateChanged, false);
    assert.strictEqual(rejectVip31.stateResult.reason, 'VIP_QUEUE_FULL');
    snap = getSnapshot();
    assert.strictEqual(snap.vipQueue.length, 30);
    assert.strictEqual(snap.stateVersion, verBefore31Vip);
    console.log('[PASS] 11. Từ chối VIP mới nếu toàn bộ 30 vị trí hàng chờ đều là VIP.');

    // 14 & 15. Client mới nhận snapshot đúng & Client reconnect nhận trạng thái mới nhất
    const { socket: newClient, getInitialSnapshot } = await connectClient(baseUrl);
    activeSockets.push(newClient);
    const readyNewAck = await emitWithAck(newClient, 'client:ready', { clientType: 'obs' });
    assert.strictEqual(readyNewAck.ok, true);
    assert.strictEqual(readyNewAck.stateVersion, snap.stateVersion);
    assert.strictEqual(readyNewAck.state.seatedPlayers.length, 6);
    assert.strictEqual(readyNewAck.state.vipQueue.length, 30);
    assert.ok(getInitialSnapshot() !== null);

    // Ngắt kết nối newClient, thay đổi state trên server, sau đó kết nối lại
    newClient.disconnect();
    await triggerMock(mainClient, {
      eventType: 'MOCK_RELEASE_SEAT',
      payload: { seatId: 6 }
    });
    const latestServerSnap = getSnapshot();
    assert.strictEqual(latestServerSnap.vipQueue.length, 29);

    const { socket: reconnectedClient } = await connectClient(baseUrl);
    activeSockets.push(reconnectedClient);
    const reconnSnapAck = await emitWithAck(reconnectedClient, 'client:request_snapshot', {});
    assert.strictEqual(reconnSnapAck.ok, true);
    assert.strictEqual(reconnSnapAck.stateVersion, latestServerSnap.stateVersion);
    assert.strictEqual(reconnSnapAck.state.seats[5].player.userId, 'q_norm_15');
    assert.strictEqual(reconnSnapAck.state.vipQueue.length, 29);
    console.log('[PASS] 14 & 15. Client mới và Client reconnect nhận đúng snapshot mới nhất.');

    // 16. Các Mock Event liên tiếp (burst đồng thời) không làm trùng người chơi hoặc vượt giới hạn ghế
    const burstPromises = [];
    for (let i = 0; i < 25; i += 1) {
      burstPromises.push(
        triggerMock(mainClient, {
          eventType: 'COMMENT',
          userId: 'burst_same_user',
          nickname: 'Burst User',
          payload: { comment: 'nhậu' }
        })
      );
      burstPromises.push(
        triggerMock(mainClient, {
          eventType: 'VIP_JOIN',
          userId: `burst_vip_${i % 5}`,
          nickname: `Burst VIP ${i % 5}`
        })
      );
    }
    await Promise.all(burstPromises);
    const finalSnap = getSnapshot();
    assert.strictEqual(finalSnap.seats.length, 6);
    assert.ok(finalSnap.totalWaiting <= 30);
    console.log('[PASS] 16. Các Mock Event liên tiếp xử lý tuần tự, không trùng userId hoặc vượt giới hạn ghế.');

    console.log('\nALL 16 TASK 1.2 TESTS PASSED.');
  } finally {
    for (const s of activeSockets) {
      if (s && s.connected) {
        s.disconnect();
      }
    }
    await serverInstance.shutdown();
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Test 1.2 failed:', err);
  process.exit(1);
});
