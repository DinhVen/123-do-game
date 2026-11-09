'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const defaultConfig = require('../server/config');
const { startServer } = require('../server/index');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(predicate, timeoutMs = 4000, intervalMs = 20) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await wait(intervalMs);
  }
  throw new Error(`Condition timed out after ${timeoutMs}ms`);
}

/**
 * Attach Mock Phaser Scene methods to a MainScene instance so MainScene.create()
 * can run in Node.js with real SeatView, TableView, PlayerPlaceholder, and SocketClient.
 */
function attachMockPhaserContext(sceneInstance) {
  const createdGraphics = [];
  const createdTexts = [];
  const sceneEvents = new Map();

  sceneInstance.createdGraphics = createdGraphics;
  sceneInstance.createdTexts = createdTexts;

  sceneInstance.events = {
    once(eventName, handler) {
      sceneEvents.set(eventName, handler);
    },
    emit(eventName) {
      const h = sceneEvents.get(eventName);
      if (h) {
        sceneEvents.delete(eventName);
        h();
      }
    }
  };

  sceneInstance.input = {
    keyboard: {
      on() {}
    }
  };

  sceneInstance.add = {
    graphics() {
      const gfx = {
        depth: 0,
        visible: true,
        ops: [],
        clear() {
          this.ops = [];
          return this;
        },
        setDepth(d) {
          this.depth = d;
          return this;
        },
        setVisible(v) {
          this.visible = Boolean(v);
          return this;
        },
        fillStyle(color, alpha = 1) {
          this.ops.push({ type: 'fillStyle', color, alpha });
          return this;
        },
        lineStyle(width, color, alpha = 1) {
          this.ops.push({ type: 'lineStyle', width, color, alpha });
          return this;
        },
        fillRect(x, y, w, h) {
          this.ops.push({ type: 'fillRect', x, y, w, h });
          return this;
        },
        strokeRect(x, y, w, h) {
          this.ops.push({ type: 'strokeRect', x, y, w, h });
          return this;
        },
        fillRoundedRect(x, y, w, h, r) {
          this.ops.push({ type: 'fillRoundedRect', x, y, w, h, r });
          return this;
        },
        strokeRoundedRect(x, y, w, h, r) {
          this.ops.push({ type: 'strokeRoundedRect', x, y, w, h, r });
          return this;
        },
        fillCircle(x, y, r) {
          this.ops.push({ type: 'fillCircle', x, y, r });
          return this;
        },
        strokeCircle(x, y, r) {
          this.ops.push({ type: 'strokeCircle', x, y, r });
          return this;
        },
        lineBetween(x1, y1, x2, y2) {
          this.ops.push({ type: 'lineBetween', x1, y1, x2, y2 });
          return this;
        },
        fillTriangle(x1, y1, x2, y2, x3, y3) {
          this.ops.push({ type: 'fillTriangle', x1, y1, x2, y2, x3, y3 });
          return this;
        }
      };
      createdGraphics.push(gfx);
      return gfx;
    },
    text(x, y, textContent, style = {}) {
      const txt = {
        x,
        y,
        text: String(textContent || ''),
        style: { ...style },
        depth: 0,
        alpha: 1,
        originX: 0,
        originY: 0,
        setOrigin(ox = 0.5, oy = ox) {
          this.originX = ox;
          this.originY = oy;
          return this;
        },
        setDepth(d) {
          this.depth = d;
          return this;
        },
        setText(newText) {
          this.text = String(newText || '');
          return this;
        },
        setColor(c) {
          this.style.color = c;
          return this;
        },
        setAlpha(a) {
          this.alpha = a;
          return this;
        },
        setPosition(nx, ny) {
          this.x = nx;
          this.y = ny;
          return this;
        }
      };
      createdTexts.push(txt);
      return txt;
    }
  };

  return sceneInstance;
}

async function runPhase23Tests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TÍCH HỢP NHIỆM VỤ 2.3 (PHASER 3 <-> BACKEND SOCKET.IO) ===');

  const clientDir = path.resolve(__dirname, '..', 'client');
  const socketClientUrl = pathToFileURL(
    path.join(clientDir, 'src/network/SocketClient.js')
  ).href;
  const seatViewUrl = pathToFileURL(path.join(clientDir, 'src/game/entities/SeatView.js')).href;
  const tableViewUrl = pathToFileURL(path.join(clientDir, 'src/game/entities/TableView.js')).href;
  const layoutUrl = pathToFileURL(path.join(clientDir, 'src/game/ui/Layout.js')).href;

  const { SocketClient, CONNECTION_STATUS, mapBackendStateToViewData } = await import(
    socketClientUrl
  );
  const { SeatView } = await import(seatViewUrl);
  const { TableView } = await import(tableViewUrl);
  const Layout = await import(layoutUrl);

  // Create a lightweight controller mirroring MainScene's exact Backend-connected methods
  // (since importing 'phaser' directly inside Node without DOM canvas fails on browser globals,
  // we test SocketClient + SeatView + TableView + MainScene sync logic against the real Backend server
  // AND verify MainScene.js via Vite Dev Server & Production Build).
  function createConnectedSceneHarness(socketClient, previewMode = false) {
    const harness = attachMockPhaserContext({
      seatViews: new Map(),
      tableView: null,
      uiRefs: {},
      isPreviewMode: previewMode,
      socketClient,
      unsubscribeSocket: null,
      lastAppliedStateVersion: -1,
      recentFxEvents: [],
      connectionStatus: CONNECTION_STATUS.DISCONNECTED
    });

    harness.tableView = new TableView(harness);
    Layout.SEAT_LAYOUTS.forEach((seatLayout) => {
      harness.seatViews.set(seatLayout.seatId, new SeatView(harness, seatLayout));
    });

    harness.uiRefs.liveBadgeText = harness.add.text(0, 0, '● LIVE');
    harness.uiRefs.statsText = harness.add.text(0, 0, '');
    harness.uiRefs.eventBannerText = harness.add.text(0, 0, '');
    harness.uiRefs.leaderboardText = harness.add.text(0, 0, '');
    harness.uiRefs.queueTitleText = harness.add.text(0, 0, '');
    harness.uiRefs.vipQueueText = harness.add.text(0, 0, '');
    harness.uiRefs.normalQueueText = harness.add.text(0, 0, '');

    harness.applyPreviewPreset = (presetKey) => {
      if (!harness.isPreviewMode) return false;
      const preset = Layout.PREVIEW_PRESETS[presetKey];
      if (!preset) return false;
      preset.forEach((entry) => {
        const sv = harness.seatViews.get(entry.seatId);
        if (sv) sv.updateSeat(entry);
      });
      return true;
    };

    harness.unsubscribeSocket = socketClient.subscribe(
      {
        onStatusChange: (status, err) => {
          harness.connectionStatus = status;
          if (status === CONNECTION_STATUS.DISCONNECTED || status === CONNECTION_STATUS.ERROR) {
            harness.uiRefs.liveBadgeText.setText('● OFFLINE');
            harness.uiRefs.eventBannerText.setText(
              `🔴 Mất kết nối Backend${err ? ` (${err})` : ''} — Đang tự động kết nối lại...`
            );
          } else if (status === CONNECTION_STATUS.CONNECTED) {
            harness.uiRefs.liveBadgeText.setText('● LIVE');
          }
        },
        onStateSync: (viewData, syncSource) => {
          harness.lastAppliedStateVersion = viewData.stateVersion;
          Layout.SEAT_LAYOUTS.forEach((seatLayout) => {
            const sv = harness.seatViews.get(seatLayout.seatId);
            const entry =
              (viewData.seats || []).find((s) => s.seatId === seatLayout.seatId) || null;
            if (entry) sv.updateSeat(entry);
            else sv.clearSeat();
          });
          harness.tableView.updateMugStates(viewData.seats || []);

          const q = viewData.waitingQueue;
          const vipStr = q.vipQueue.map((n) => Layout.formatNickname(n, 13)).join(', ') || 'Trống';
          const normStr =
            q.normalQueue.map((n) => Layout.formatNickname(n, 13)).join(', ') || 'Trống';
          harness.uiRefs.queueTitleText.setText(`⏳ HÀNG CHỜ (${q.totalWaiting}/${q.maxSize})`);
          harness.uiRefs.vipQueueText.setText(`★ VIP (${q.vipQueue.length}): ${vipStr}`);
          harness.uiRefs.normalQueueText.setText(`• Thường (${q.normalQueue.length}): ${normStr}`);

          const lm = viewData.likeMetrics || {
            totalLikes: 0,
            unconsumedLikes: 0,
            milestoneStep: 100
          };
          harness.uiRefs.statsText.setText(
            `♥ Like: ${lm.totalLikes} (${lm.unconsumedLikes}/${lm.milestoneStep}) | v${viewData.stateVersion}`
          );
          harness.uiRefs.leaderboardText.setText(
            viewData.leaderboard
              ? '🏆 BXH'
              : '🏆 BXH TỬU LƯỢNG: Chưa có dữ liệu xếp hạng từ Server'
          );

          if (syncSource === 'SNAPSHOT') {
            harness.recentFxEvents = [];
            harness.uiRefs.eventBannerText.setText(
              `🟢 Đã đồng bộ Server (${viewData.mode || 'MOCK'} • v${viewData.stateVersion})`
            );
          }
        },
        onActionFx: (fx) => {
          harness.recentFxEvents.push(fx);
        }
      },
      'MainScene'
    );

    return harness;
  }

  // Start real Backend server with fast KO/LEAVING hold (200ms) for fast deterministic testing
  const testConfig = defaultConfig.buildConfig({
    port: 0,
    gameplayV1: {
      koHoldDurationMs: 200,
      leavingHoldDurationMs: 200,
      cheersIntervalMs: 600000,
      randomWifeCheckIntervalMs: 600000
    }
  });

  const server = await startServer(testConfig);
  const { port, gameStateManager, mockService, io, shutdown } = server;
  const backendUrl = `http://127.0.0.1:${port}`;
  gameStateManager.stopCheersScheduler();
  gameStateManager.stopWifeScheduler();

  const socketClient = new SocketClient({
    backendUrl,
    socketOptions: {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 100
    }
  });

  const harness = createConnectedSceneHarness(socketClient, false);

  try {
    // 1, 2, 3, 4: Connect to real Backend, receive initial snapshot (v0), verify 6 EMPTY seats & no backend mutation
    socketClient.connect();
    await waitForCondition(
      () =>
        socketClient.status === CONNECTION_STATUS.CONNECTED &&
        socketClient.hasSynchronizedSnapshot &&
        harness.lastAppliedStateVersion === 0
    );

    assert.strictEqual(gameStateManager.stateVersion, 0, 'Frontend kết nối không được làm đổi stateVersion của Backend');
    assert.strictEqual(harness.seatViews.size, 6);
    for (let id = 1; id <= 6; id += 1) {
      const sv = harness.seatViews.get(id).getDisplayState();
      assert.strictEqual(sv.status, 'EMPTY');
      assert.strictEqual(sv.isCharacterVisible, false);
      assert.strictEqual(sv.rawNickname, null);
    }
    assert.ok(
      harness.uiRefs.leaderboardText.text.includes('Chưa có dữ liệu xếp hạng từ Server'),
      'Không được giữ tên demo trên BXH khi chạy chế độ Backend'
    );
    assert.strictEqual(
      harness.applyPreviewPreset('FULL_TABLE'),
      false,
      'Phím preview không được ghi đè dữ liệu thật khi đang ở chế độ Backend'
    );
    console.log('[PASS 1, 2, 3 & 4] Kết nối Backend thật, nhận snapshot v0, hiển thị 6 ghế EMPTY và khóa ghi đè preview.');

    // 5 & 6: Add players (including long nickname) & increase drunkLevel via Like and Gift
    mockService.simulateCommentNhau('u_1', 'Anh Tư Sài Gòn Quận 4 Rất Dài');
    mockService.simulateCommentDo('u_2', 'Chị Bảy');
    mockService.simulateCommentNhau('u_3', 'Chú Tám');
    mockService.simulateCommentNhau('u_4', 'Út Mót');
    mockService.simulateCommentNhau('u_5', 'Anh Năm');
    mockService.simulateCommentNhau('u_6', 'Bé Sáu');

    await waitForCondition(() => harness.lastAppliedStateVersion === 6);

    const s1 = harness.seatViews.get(1).getDisplayState();
    assert.strictEqual(s1.status, 'SEATED');
    assert.strictEqual(s1.drunkLevel, 0);
    assert.ok(s1.displayNickname.length <= 12 && s1.displayNickname.endsWith('…'));

    // Send 150 Likes -> +1 drunkLevel for all 6 seated players, unconsumedLikes = 50
    mockService.simulateLike('liker_1', 'Liker 1', 150);
    // Send MOCK_GIFT_VIP (+25 drunkLevel) to seatIndex 0 (Seat 1) -> Seat 1 drunkLevel = 26
    mockService.simulateGift('gifter_1', 'Gifter 1', 'MOCK_GIFT_VIP', 1, 0);

    await waitForCondition(() => harness.lastAppliedStateVersion === 8);

    assert.strictEqual(harness.seatViews.get(1).getDisplayState().drunkLevel, 26);
    assert.strictEqual(harness.seatViews.get(2).getDisplayState().drunkLevel, 1);
    assert.ok(harness.uiRefs.statsText.text.includes('♥ Like: 150 (50/100)'));
    console.log('[PASS 5 & 6] Đồng bộ 6 người chơi mới, nickname dài rút gọn, drunkLevel và Like counter chính xác.');

    // 8: Add players to Normal Queue and VIP Queue when table is full (6/6)
    mockService.simulateCommentNhau('q_norm_1', 'Khách Thường 1');
    mockService.simulateCommentNhau('q_norm_2', 'Khách Thường 2');
    mockService.simulateGift('q_vip_1', 'Đại Gia VIP 1', 'MOCK_GIFT_VIP_PASS', 1, null);

    await waitForCondition(() => harness.lastAppliedStateVersion === 11);

    assert.ok(harness.uiRefs.queueTitleText.text.includes('(3/30)'));
    assert.ok(harness.uiRefs.vipQueueText.text.includes('★ VIP (1): Đại Gia VIP 1'));
    assert.ok(
      harness.uiRefs.normalQueueText.text.includes('• Thường (2): Khách Thường…, Khách Thường…')
    );
    console.log('[PASS 8] Đồng bộ chính xác VIP Queue, Normal Queue và tổng số người chờ (3/30).');

    // 7: Trigger KO on Seat 1 (drunkLevel 26 + 4*25 = 100) and LEAVING (Wife summon) on Seat 2
    mockService.simulateGift('gifter_ko', 'Gifter KO', 'MOCK_GIFT_VIP', 4, 0);
    mockService.simulateGift('gifter_wife', 'Gifter Wife', 'MOCK_GIFT_WIFE', 1, 1);

    await waitForCondition(() => harness.lastAppliedStateVersion === 13);

    const s1Ko = harness.seatViews.get(1).getDisplayState();
    const s2Leaving = harness.seatViews.get(2).getDisplayState();
    assert.strictEqual(s1Ko.status, 'KO');
    assert.strictEqual(s1Ko.drunkLevel, 100);
    assert.strictEqual(s2Leaving.status, 'LEAVING');

    // Wait 260ms for Backend 200ms hold timers to release Seat 1 & Seat 2 and promote VIP 1 & Normal 1
    await waitForCondition(() => harness.lastAppliedStateVersion === 15);

    const s1Promoted = harness.seatViews.get(1).getDisplayState();
    const s2Promoted = harness.seatViews.get(2).getDisplayState();
    assert.strictEqual(s1Promoted.status, 'SEATED');
    assert.strictEqual(s1Promoted.rawNickname, 'Đại Gia VIP 1');
    assert.strictEqual(s1Promoted.drunkLevel, 0);
    assert.strictEqual(s2Promoted.status, 'SEATED');
    assert.strictEqual(s2Promoted.rawNickname, 'Khách Thường 1');
    assert.strictEqual(s2Promoted.drunkLevel, 0);
    assert.ok(harness.uiRefs.queueTitleText.text.includes('(1/30)'));
    console.log('[PASS 7] Đồng bộ trạng thái KO (100%) / LEAVING và tự động cập nhật người mới từ hàng chờ sau khi Backend giải phóng ghế.');

    // 9: Verify stale snapshots/patches are ignored and version gap triggers client:request_snapshot
    const verBeforeStale = socketClient.lastStateVersion;
    const staleSnapApplied = socketClient.handleStateSnapshot({
      stateVersion: verBeforeStale - 3,
      state: { stateVersion: verBeforeStale - 3, seats: [] }
    });
    assert.strictEqual(staleSnapApplied, false);
    assert.strictEqual(socketClient.stats.ignoredStaleSnapshots, 1);
    assert.strictEqual( harness.seatViews.get(1).getDisplayState().rawNickname, 'Đại Gia VIP 1' );

    const stalePatchApplied = socketClient.handleStatePatch({
      stateVersion: verBeforeStale,
      seats: []
    });
    assert.strictEqual(stalePatchApplied, false);
    assert.strictEqual(socketClient.stats.ignoredStalePatches >= 1, true);

    // Simulate a patch with a version gap (verBeforeStale + 5) -> must detect gap and not apply incomplete patch
    const gapApplied = socketClient.handleStatePatch({
      stateVersion: verBeforeStale + 5,
      seats: []
    });
    assert.strictEqual(gapApplied, false);
    assert.strictEqual(socketClient.stats.versionGapsDetected, 1);
    console.log('[PASS 9] Bỏ qua snapshot/patch cũ (stateVersion <= current) và phát hiện nhảy cóc version an toàn.');

    // 12: Verify duplicate/old FX are ignored and FX never mutates state
    const fxCountBefore = harness.recentFxEvents.length;
    assert.ok(fxCountBefore > 0);
    const sampleFx = harness.recentFxEvents[fxCountBefore - 1];
    // Re-feeding the same FX eventId must be ignored
    const dupFxAccepted = socketClient.handleActionFx(sampleFx);
    assert.strictEqual(dupFxAccepted, false);
    // Feeding an FX with older stateVersion must be ignored
    const oldFxAccepted = socketClient.handleActionFx({
      eventId: 'evt_brand_new_but_old_ver',
      actionType: 'CHEERS',
      stateVersion: verBeforeStale - 2
    });
    assert.strictEqual(oldFxAccepted, false);
    console.log('[PASS 12] Chống phát lặp FX trùng eventId hoặc FX cũ có stateVersion thấp hơn hiện tại.');

    // 10: Verify disconnect & reconnect behavior
    // Force server-side socket disconnect, mutate Backend state while client is disconnected, then let client reconnect
    for (const s of io.sockets.sockets.values()) {
      s.disconnect(true);
    }

    await waitForCondition(() => harness.connectionStatus === CONNECTION_STATUS.DISCONNECTED);
    assert.strictEqual(harness.uiRefs.liveBadgeText.text, '● OFFLINE');
    assert.ok(harness.uiRefs.eventBannerText.text.includes('Mất kết nối Backend'));
    // Must NOT revert to static demo data ('Anh Tư Sài Gòn Quận 4') when disconnected
    assert.strictEqual(harness.seatViews.get(1).getDisplayState().rawNickname, 'Đại Gia VIP 1');

    // Mutate state on Backend while client is offline: release Seat 1 (promotes 'Khách Thường 2') and release Seat 3 (becomes EMPTY)
    mockService.simulateReleaseSeat(1);
    mockService.simulateReleaseSeat(3);
    const backendVerAfterOffline = gameStateManager.stateVersion;

    // Reconnect client and verify it synchronizes to the latest snapshot without keeping old players or replaying old FX
    socketClient.connect();
    await waitForCondition(
      () =>
        harness.connectionStatus === CONNECTION_STATUS.CONNECTED &&
        harness.lastAppliedStateVersion === backendVerAfterOffline
    );

    assert.strictEqual(
      harness.seatViews.get(1).getDisplayState().rawNickname,
      'Khách Thường 2',
      'Sau khi reconnect, Ghế 1 phải hiển thị người mới thay vì giữ người cũ'
    );
    assert.strictEqual(
      harness.seatViews.get(3).getDisplayState().status,
      'EMPTY',
      'Sau khi reconnect, Ghế 3 đã trống phải về EMPTY'
    );
    assert.strictEqual(
      harness.recentFxEvents.length,
      0,
      'Sau khi nhận snapshot reconnect, không được phát lại FX cũ'
    );
    console.log('[PASS 10] Khi mất kết nối hiển thị OFFLINE (không chuyển sang demo); khi reconnect đồng bộ đúng snapshot mới nhất.');

    // 11: Verify no duplicate listeners when subscribing again with same key and clean unsubscribe on shutdown
    assert.strictEqual(socketClient.subscribers.size, 1);
    createConnectedSceneHarness(socketClient, false);
    assert.strictEqual(
      socketClient.subscribers.size,
      1,
      'Subscribe lại với khóa MainScene không được nhân đôi listener'
    );
    socketClient.unsubscribe('MainScene');
    assert.strictEqual(socketClient.subscribers.size, 0, 'Unsubscribe khi scene shutdown phải xóa sạch listener');
    console.log('[PASS 11] Không đăng ký trùng listeners và dọn dẹp sạch khi scene shutdown.');

    // 13 & 14: Verify static source rules (no admin token, no /api/mock, no second GameStateManager)
    const socketClientSrc = fs.readFileSync(
      path.join(clientDir, 'src/network/SocketClient.js'),
      'utf8'
    );
    const mainSceneSrc = fs.readFileSync(
      path.join(clientDir, 'src/game/scenes/MainScene.js'),
      'utf8'
    );
    const combinedSrc = `${socketClientSrc}\n${mainSceneSrc}`;
    assert.strictEqual(
      combinedSrc.includes('x-admin-token') ||
        combinedSrc.includes('ADMIN_SECRET_TOKEN') ||
        combinedSrc.includes('/api/mock'),
      false,
      'Frontend tuyệt đối không chứa token admin hoặc gọi mock admin endpoint'
    );
    assert.strictEqual(
      combinedSrc.includes('GameStateManager'),
      false,
      'Frontend không tạo GameStateManager thứ hai'
    );
    console.log('[PASS 13 & 14] Frontend tuân thủ Single Source of Truth, không chứa admin token hay logic gameplay.');
  } finally {
    socketClient.disconnect();
    await shutdown();
  }

  console.log('=== TẤT CẢ KIỂM THỬ TÍCH HỢP NHIỆM VỤ 2.3 ĐỀU PASS ===');
}

runPhase23Tests().catch((err) => {
  console.error('[FAIL] Kiểm thử 2.3 thất bại:', err);
  process.exit(1);
});
