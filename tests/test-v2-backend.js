'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const defaultConfig = require('../server/config');
const { GameStateManager } = require('../server/services/gameStateManager');
const { SnapshotStore } = require('../server/services/snapshotStore');
const { validateRawEvent } = require('../server/engines/inputValidator');
const { normalizeEvent } = require('../server/engines/eventNormalizer');

function dispatchEvent(gsm, rawEvent, config) {
  const validated = validateRawEvent(rawEvent, config);
  assert.strictEqual(validated.valid, true, `Validation failed: ${validated.error}`);
  const normalized = normalizeEvent(validated.sanitized, config);
  return gsm.processEvent(normalized);
}

async function runTests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ PHASE V2-1 (BACKEND 7 BÀN / 28 GHẾ / ĐỔI BÀN / BXH ĐÔI / SNAPSHOT V2) ===');

  const v2Config = defaultConfig.buildV2Config({
    gameplayV1: {
      drinkChatCooldownMs: 3000,
      tableSwitchCooldownMs: 10000,
      koHoldDurationMs: 3000
    }
  });

  assert.strictEqual(v2Config.gameplayV1.layoutVersion, 2);
  assert.strictEqual(v2Config.gameplayV1.tableCount, 7);
  assert.strictEqual(v2Config.gameplayV1.seatsPerTable, 4);
  assert.strictEqual(v2Config.gameplayV1.maxSeats, 28);
  assert.strictEqual(v2Config.gameplayV1.maxQueueSize, 30);

  let fakeNow = 1794030000000;
  const fxEvents = [];
  const gsm = new GameStateManager(
    v2Config,
    null,
    (fx) => fxEvents.push(fx),
    null
  );
  gsm.setClock(() => fakeNow);

  // 1. Kiểm tra khởi tạo 7 bàn và 28 ghế
  let snap = gsm.getSnapshot();
  assert.strictEqual(snap.layoutVersion, 2);
  assert.strictEqual(snap.tables.length, 7);
  assert.strictEqual(snap.seats.length, 28);
  const vipTable = snap.tables.find((t) => t.tableId === 'TABLE_VIP');
  assert.ok(vipTable, 'Phải có BÀN VIP');
  assert.deepStrictEqual(vipTable.seatIds, [13, 14, 15, 16]);
  console.log('[PASS 1] Khởi tạo chuẩn 7 bàn (6 bàn thường + 1 bàn VIP) và 28 ghế.');

  // 2. Kiểm tra lệnh "VAO" và gom bàn thông minh (ưu tiên BÀN 2 trước để né vùng chat góc dưới trái)
  const join1 = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u1', nickname: 'Anh Tư', comment: 'VAO' },
    v2Config
  );
  assert.strictEqual(join1.stateChanged, true);
  assert.strictEqual(join1.action, 'ASSIGNED_SEAT');
  assert.strictEqual(join1.tableId, 'TABLE_2');
  assert.strictEqual(join1.seatId, 5);

  const join2 = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u2', nickname: 'Chú Bảy', comment: 'vào' },
    v2Config
  );
  assert.strictEqual(join2.tableId, 'TABLE_2');
  assert.strictEqual(join2.seatId, 6);
  console.log('[PASS 2] Lệnh "VAO" tự động gom khách vào bàn đang hoạt động (BÀN 2).');

  // 3. Kiểm tra người mới gõ thẳng "BAN 3" để chọn bàn ngay khi vào quán
  const joinBan3 = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u3', nickname: 'Minh An', comment: 'BAN 3' },
    v2Config
  );
  assert.strictEqual(joinBan3.stateChanged, true);
  assert.strictEqual(joinBan3.tableId, 'TABLE_3');
  assert.strictEqual(joinBan3.seatId, 9);
  console.log('[PASS 3] Khách mới gõ "BAN 3" vào thẳng ghế số 9 của BÀN 3.');

  // 4. Kiểm tra lệnh uống bia ("BIA") và nâng ly ("DZO") + Cooldown 3s + BXH THẦN CỒN
  const drink1 = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u1', nickname: 'Anh Tư', comment: 'BIA' },
    v2Config
  );
  assert.strictEqual(drink1.stateChanged, true);
  assert.strictEqual(drink1.action, 'DRINK_BEER');
  assert.strictEqual(drink1.beerCount, 1);
  assert.strictEqual(drink1.drunkLevel, 3);

  // Gõ liên tiếp trong vòng < 3s sẽ bị chặn bởi cooldown
  fakeNow += 1000;
  const drinkCooldown = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u1', nickname: 'Anh Tư', comment: 'BIA' },
    v2Config
  );
  assert.strictEqual(drinkCooldown.stateChanged, false);
  assert.strictEqual(drinkCooldown.reason, 'DRINK_CHAT_COOLDOWN');

  // Sau 3.5s gõ "DZO" thành công -> lên 2 ly bia, độ say 6%
  fakeNow += 2500;
  const toast1 = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u1', nickname: 'Anh Tư', comment: 'DZO' },
    v2Config
  );
  assert.strictEqual(toast1.stateChanged, true);
  assert.strictEqual(toast1.action, 'TABLE_CHEERS');
  assert.strictEqual(toast1.beerCount, 2);
  assert.strictEqual(toast1.drunkLevel, 6);

  // Chu kỳ "1, 2, 3 DÔ!" toàn quán cộng thêm +1 ly bia và +5% say cho mọi người đang ngồi
  const cheersRes = gsm.handleCheers('evt_test_cheers', 'SCHEDULER');
  assert.strictEqual(cheersRes.stateChanged, true);
  snap = gsm.getSnapshot();
  assert.strictEqual(snap.leaderboards.topDrinkers[0].userId, 'u1');
  assert.strictEqual(snap.leaderboards.topDrinkers[0].beerCount, 3);
  console.log('[PASS 4] Lệnh "BIA", "DZO" và chu kỳ "1, 2, 3 DÔ!" cập nhật chính xác số ly trên BXH THẦN CỒN.');

  // 5. Kiểm tra đổi bàn ("BAN 5") và điều kiện vào "BÀN VIP"
  const switchBan5 = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u2', nickname: 'Chú Bảy', comment: 'BAN 5' },
    v2Config
  );
  assert.strictEqual(switchBan5.stateChanged, true);
  assert.strictEqual(switchBan5.action, 'SWITCHED_TABLE');
  assert.strictEqual(switchBan5.fromTableId, 'TABLE_2');
  assert.strictEqual(switchBan5.tableId, 'TABLE_5');
  assert.strictEqual(switchBan5.seatId, 21);
  assert.strictEqual(switchBan5.player.moveFromSeatId, 6);

  // User mới u4 chưa có VIP và chưa nằm trong Top 3 thử gõ "VIP" -> bị từ chối VIP_REQUIRED
  // Trước tiên cho thêm u_top1, u_top2, u_top3 có điểm BXH để u4 không nằm trong Top 3
  const join4 = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u4', nickname: 'Khách Thường', comment: 'VAO' },
    v2Config
  );
  assert.strictEqual(join4.stateChanged, true);
  const tryVipRejected = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u4', nickname: 'Khách Thường', comment: 'VIP' },
    v2Config
  );
  assert.strictEqual(tryVipRejected.stateChanged, false);
  assert.strictEqual(tryVipRejected.reason, 'VIP_REQUIRED');
  console.log('[PASS 5] Đổi bàn thường thành công và chặn đúng khách chưa đủ điều kiện vào BÀN VIP.');

  // 6. Kiểm tra gọi món Thực Đơn (7 món) + BXH THẦN DIỆT MỒI + Mở khóa quyền vào BÀN VIP
  // u4 gọi Mực Nướng (10 xu -> +3 món, giảm say 12%, đủ >= 10 xu lên VIP)
  const orderMuc = dispatchEvent(
    gsm,
    {
      source: 'MOCK',
      eventType: 'GIFT',
      userId: 'u4',
      nickname: 'Khách Thường',
      mockGiftKey: 'MENU_MUC_NUONG',
      repeatCount: 1
    },
    v2Config
  );
  assert.strictEqual(orderMuc.stateChanged, true);
  assert.strictEqual(orderMuc.action, 'GIFT_MENU_SNACK_APPLIED');
  assert.strictEqual(orderMuc.snackPointsAdded, 3);
  assert.strictEqual(gsm.isUserVipEligible('u4'), true);

  // Giờ u4 gõ "VIP" sẽ chuyển sang BÀN VIP (ghế 13) thành công!
  fakeNow += 15000;
  const switchToVip = dispatchEvent(
    gsm,
    { source: 'MOCK', eventType: 'COMMENT', userId: 'u4', nickname: 'Khách Thường', comment: 'VIP' },
    v2Config
  );
  assert.strictEqual(switchToVip.stateChanged, true);
  assert.strictEqual(switchToVip.action, 'SWITCHED_TABLE');
  assert.strictEqual(switchToVip.tableId, 'TABLE_VIP');
  assert.strictEqual(switchToVip.seatId, 13);

  // Kiểm tra món "MỜI CẢ QUÁN (>100 xu)" bày Bò nướng lên tất cả 7 bàn và cộng +25 món vào BXH THẦN DIỆT MỒI
  const orderAll = dispatchEvent(
    gsm,
    {
      source: 'Live',
      eventType: 'GIFT',
      userId: 'u_whale',
      nickname: 'Đại Gia Sài Gòn',
      giftId: '9999',
      giftName: 'Siêu Xe',
      diamondCount: 199,
      repeatCount: 1
    },
    v2Config
  );
  assert.strictEqual(orderAll.stateChanged, true);
  assert.strictEqual(orderAll.action, 'GIFT_MENU_SNACK_ALL_APPLIED');
  assert.strictEqual(orderAll.snackPointsAdded, 25);

  snap = gsm.getSnapshot();
  assert.strictEqual(snap.leaderboards.topEaters[0].userId, 'u_whale');
  assert.strictEqual(snap.leaderboards.topEaters[0].snackCount, 25);
  assert.strictEqual(snap.leaderboards.topEaters[1].userId, 'u4');
  assert.strictEqual(snap.leaderboards.topEaters[1].snackCount, 3);
  for (const t of snap.tables) {
    assert.ok(t.activeSnacks.length >= 1, `Bàn ${t.tableId} phải có đĩa Bò nướng từ Mời Cả Quán`);
  }
  console.log('[PASS 6] Hệ thống Thực Đơn 7 món, Mời Cả Quán và BXH THẦN DIỆT MỒI hoạt động chính xác.');

  // 7. Kiểm tra lấp đầy 28 ghế + Hàng chờ 30 người + Snapshot Recovery v2.0
  for (let i = 1; i <= 35; i += 1) {
    dispatchEvent(
      gsm,
      {
        source: 'MOCK',
        eventType: ' VIP_JOIN'.trim(),
        userId: `fill_u_${i}`,
        nickname: `Khách ${i}`
      },
      v2Config
    );
  }
  snap = gsm.getSnapshot();
  assert.strictEqual(snap.seatedPlayers.length, 28, 'Phải lấp đầy đúng 28 ghế');
  assert.ok(snap.totalWaiting > 0 && snap.totalWaiting <= 30, 'Số dư phải vào hàng chờ (tối đa 30)');

  // Đặt ghế #1 vào trạng thái KO trước khi lưu Snapshot để kiểm tra chính sách Recovery
  gsm.seats[0].player.drunkLevel = 100;
  gsm.seats[0].player.status = 'KO';
  gsm.seats[0].player.visualTier = 'KO';
  const koUserId = gsm.seats[0].player.userId;
  const firstWaitingVipId = gsm.vipQueue[0].userId;

  gsm.setHostConfig({
    avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    title: 'QUÁN NHẬU GIÁ SV'
  });

  const tempSnapshotPath = path.resolve(__dirname, '..', 'data', 'snapshot.v2.test.json');
  const store = new SnapshotStore({
    filePath: tempSnapshotPath,
    nowFn: () => fakeNow
  });

  const saveRes = store.saveSnapshotSync(gsm.getSnapshot(), fakeNow);
  assert.strictEqual(saveRes.ok, true);

  // Khởi tạo GameStateManager v2.0 mới và khôi phục từ Snapshot
  const gsmRecovered = new GameStateManager(v2Config);
  gsmRecovered.setClock(() => fakeNow);
  const restoreRes = store.loadAndRestore(gsmRecovered, fakeNow);
  assert.strictEqual(restoreRes.ok, true);
  assert.strictEqual(restoreRes.evictedDuringRecovery, true);

  const recoveredSnap = gsmRecovered.getSnapshot();
  assert.strictEqual(recoveredSnap.seats.length, 28);
  assert.strictEqual(recoveredSnap.seats[0].player.userId, firstWaitingVipId);
  assert.notStrictEqual(recoveredSnap.seats[0].player.userId, koUserId);
  assert.strictEqual(gsmRecovered.koTimers.size, 0, 'Không được tạo lại timer 3000ms khi recovery');
  assert.strictEqual(recoveredSnap.leaderboards.topEaters[0].userId, 'u_whale');
  assert.strictEqual(recoveredSnap.leaderboards.topEaters[0].snackCount, 25);
  assert.strictEqual(recoveredSnap.hostConfig.title, 'QUÁN NHẬU GIÁ SV');

  try {
    if (fs.existsSync(tempSnapshotPath)) fs.unlinkSync(tempSnapshotPath);
  } catch (_) {}

  console.log('[PASS 7] Snapshot v2.0 lưu & khôi phục chuẩn 28 ghế, BXH Đôi, Host Config và xử lý đúng KO khi recovery.');
  console.log('=== TẤT CẢ KIỂM THỬ PHASE V2-1 ĐỀU PASS 100% ===');
}

runTests().catch((err) => {
  console.error('KIỂM THỬ PHASE V2-1 THẤT BẠI:', err);
  process.exit(1);
});
