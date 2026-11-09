'use strict';

/**
 * TEST SUITE — PHASE 3 (WORK ITEM 3.4):
 * - Verification of completed Phase 3 items (3.1 Auto CHEERS & Like/Gift Drunk Scoring, 3.2 Wife Event, 3.3 Bounded Animation Queue & Drunk Gauge)
 * - Implementation & E2E verification of Task 3.4:
 *   1. Bong bóng chat (`game:chat_bubble`) cho người đang `SEATED` trên bàn nhậu
 *   2. Banner thông báo sự kiện (`game:banner_notice`) đồng bộ từ Backend sang MainScene
 *   3. Bảng xếp hạng Tửu Lượng (`leaderboard`) Top 3 độ say cao nhất trên HUD
 */

const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');
const { createAppServer } = require('../server/index');
const config = require('../server/config');

function createMockScene() {
  const createdObjects = [];
  const makeGfx = () => {
    const gfx = {
      type: 'Graphics',
      visible: true,
      depth: 0,
      commands: [],
      clear() {
        this.commands = [];
        return this;
      },
      fillStyle(color, alpha) {
        this.commands.push({ op: 'fillStyle', color, alpha });
        return this;
      },
      lineStyle(width, color, alpha) {
        this.commands.push({ op: 'lineStyle', width, color, alpha });
        return this;
      },
      fillRect(x, y, w, h) {
        this.commands.push({ op: 'fillRect', x, y, w, h });
        return this;
      },
      strokeRect(x, y, w, h) {
        this.commands.push({ op: 'strokeRect', x, y, w, h });
        return this;
      },
      fillRoundedRect(x, y, w, h, r) {
        this.commands.push({ op: 'fillRoundedRect', x, y, w, h, r });
        return this;
      },
      strokeRoundedRect(x, y, w, h, r) {
        this.commands.push({ op: 'strokeRoundedRect', x, y, w, h, r });
        return this;
      },
      fillCircle(x, y, r) {
        this.commands.push({ op: 'fillCircle', x, y, r });
        return this;
      },
      strokeCircle(x, y, r) {
        this.commands.push({ op: 'strokeCircle', x, y, r });
        return this;
      },
      fillEllipse(x, y, w, h) {
        this.commands.push({ op: 'fillEllipse', x, y, w, h });
        return this;
      },
      strokeEllipse(x, y, w, h) {
        this.commands.push({ op: 'strokeEllipse', x, y, w, h });
        return this;
      },
      fillTriangle(x1, y1, x2, y2, x3, y3) {
        this.commands.push({ op: 'fillTriangle', x1, y1, x2, y2, x3, y3 });
        return this;
      },
      lineBetween(x1, y1, x2, y2) {
        this.commands.push({ op: 'lineBetween', x1, y1, x2, y2 });
        return this;
      },
      setDepth(d) {
        this.depth = d;
        return this;
      },
      setVisible(v) {
        this.visible = Boolean(v);
        return this;
      }
    };
    createdObjects.push(gfx);
    return gfx;
  };

  const makeText = (x, y, text, style) => {
    const txt = {
      type: 'Text',
      x,
      y,
      text: String(text || ''),
      style: { ...(style || {}) },
      visible: true,
      depth: 0,
      originX: 0,
      originY: 0,
      setText(next) {
        this.text = String(next ?? '');
        return this;
      },
      setPosition(nx, ny) {
        this.x = nx;
        this.y = ny;
        return this;
      },
      setOrigin(ox, oy = ox) {
        this.originX = ox;
        this.originY = oy;
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
      setColor(c) {
        this.style.color = c;
        return this;
      },
      setAlpha(a) {
        this.alpha = a;
        return this;
      }
    };
    createdObjects.push(txt);
    return txt;
  };

  return {
    createdObjects,
    add: {
      graphics: makeGfx,
      text: makeText
    }
  };
}

async function runTests() {
  const results = [];
  const record = (id, name, passed, detail = '') => {
    results.push({ id, name, passed, detail });
    const icon = passed ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${id} — ${name}${detail ? ` (${detail})` : ''}`);
  };

  const layoutMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/ui/Layout.js')).href
  );
  const seatMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/SeatView.js')).href
  );
  const tableMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/TableView.js')).href
  );
  const animMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/fx/AnimationManager.js')).href
  );
  const socketMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/network/SocketClient.js')).href
  );

  const { SEAT_LAYOUTS, LAYERS, PALETTE, LAYOUT_ZONES, PLACEHOLDER_SIZES, formatNickname, truncateTextSafe } =
    layoutMod;
  const { SeatView } = seatMod;
  const { TableView } = tableMod;
  const { AnimationManager } = animMod;
  const { SocketClient } = socketMod;

  const testConfig = JSON.parse(JSON.stringify(config));
  testConfig.server.port = 0;

  const appInstance = createAppServer(testConfig);
  const { httpServer, gameStateManager, mockService } = appInstance;

  // Stop background schedulers so test progression is 100% deterministic
  gameStateManager.stopCheersScheduler();
  gameStateManager.stopWifeScheduler();

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const backendUrl = `http://127.0.0.1:${address.port}`;

  const mockScene = createMockScene();
  const tableView = new TableView(mockScene);
  const seatViews = new Map();
  SEAT_LAYOUTS.forEach((layout) => {
    seatViews.set(layout.seatId, new SeatView(mockScene, layout));
  });
  const animManager = new AnimationManager(mockScene, seatViews, tableView, {
    maxQueueSize: 20,
    fxDurationMs: 120,
    holdFxDurationMs: 180,
    chatBubbleDurationMs: 250
  });
  animManager.stopDrunkSwayLoop();

  // Simulated MainScene UI refs for Banner & Leaderboard verification
  const bannerGfx = mockScene.add.graphics().setDepth(LAYERS.EVENT_BANNER_AND_SYSTEM);
  const eventBannerText = mockScene.add.text(180, 52, 'Chờ sự kiện...', {});
  const leaderboardText = mockScene.add.text(180, 76, '🏆 BXH TỬU LƯỢNG: Chưa có dữ liệu xếp hạng từ Server', {});

  const receivedChatBubbles = [];
  const receivedBannerNotices = [];
  const receivedActionFx = [];

  const updateSeats = (seats = []) => {
    SEAT_LAYOUTS.forEach((layout) => {
      const sv = seatViews.get(layout.seatId);
      const entry = seats.find((s) => s.seatId === layout.seatId) || null;
      if (entry) sv.updateSeat(entry);
      else sv.clearSeat();
    });
    tableView.updateMugStates(seats);
  };

  const updateLeaderboardDisplay = (leaderboardData) => {
    if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
      const summary = leaderboardData
        .slice(0, 3)
        .map((item, idx) => {
          const rank = item.rank || idx + 1;
          const nick = formatNickname(
            item.nickname || item.displayNickname || item.userId,
            PLACEHOLDER_SIZES.MAX_LEADERBOARD_NAME_LENGTH
          );
          const drunkSuffix = typeof item.drunkLevel === 'number' ? ` (${item.drunkLevel}%)` : '';
          return `#${rank} ${nick}${drunkSuffix}`;
        })
        .join(' | ');
      leaderboardText.setText(truncateTextSafe(`🏆 ${summary}`, 48));
    } else {
      leaderboardText.setText('🏆 BXH TỬU LƯỢNG: Chưa có dữ liệu xếp hạng từ Server');
    }
  };

  const applyBannerNotice = (notice) => {
    const levelColorMap = {
      info: PALETTE.NEON_BLUE,
      success: PALETTE.GAUGE_SOBER,
      warning: PALETTE.WARM_STREETLIGHT,
      danger: PALETTE.PLASTIC_RED
    };
    const borderColor = levelColorMap[notice.level] || PALETTE.PLASTIC_RED;
    const bannerZone = LAYOUT_ZONES.EVENT_BANNER;
    bannerGfx.clear();
    bannerGfx.fillStyle(0x2a1d3d, 0.95);
    bannerGfx.fillRoundedRect(bannerZone.x, bannerZone.y, bannerZone.width, bannerZone.height, 4);
    bannerGfx.lineStyle(1.5, borderColor, 0.95);
    bannerGfx.strokeRoundedRect(bannerZone.x, bannerZone.y, bannerZone.width, bannerZone.height, 4);
    eventBannerText.setText(truncateTextSafe(notice.message || notice.title || '', 48));
  };

  const socketClient = new SocketClient({
    backendUrl,
    socketOptions: { reconnection: false }
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout initial snapshot')), 3000);
      socketClient.subscribe(
        {
          onStateSync: (viewData, syncSource) => {
            updateSeats(viewData.seats);
            animManager.syncWithViewData(viewData, syncSource);
            updateLeaderboardDisplay(viewData.leaderboard);
            if (syncSource === 'SNAPSHOT') {
              clearTimeout(timeout);
              resolve();
            }
          },
          onActionFx: (fx) => {
            receivedActionFx.push(fx);
            animManager.enqueueFx(fx);
          },
          onChatBubble: (bubble) => {
            receivedChatBubbles.push(bubble);
            animManager.enqueueChatBubble(bubble);
          },
          onBannerNotice: (notice) => {
            receivedBannerNotices.push(notice);
            applyBannerNotice(notice);
          }
        },
        'Test34Subscriber'
      );
      socketClient.connect();
    });

    const waitMs = (ms = 60) => new Promise((r) => setTimeout(r, ms));

    // =========================================================================
    // TEST 1: Verify empty table state (Leaderboard placeholder & no chat bubble for non-seated user)
    // =========================================================================
    assert.strictEqual(
      leaderboardText.text,
      '🏆 BXH TỬU LƯỢNG: Chưa có dữ liệu xếp hạng từ Server',
      'Empty table should show honest leaderboard placeholder'
    );

    const chatBeforeJoin = mockService.simulateChat(
      'unseated_viewer',
      'Khách Xem Live',
      'Cho mình xin 1 ghế!'
    );
    await waitMs();
    assert.strictEqual(chatBeforeJoin.stateResult.stateChanged, false);
    assert.strictEqual(chatBeforeJoin.stateResult.chatEmitted, false);
    assert.strictEqual(receivedChatBubbles.length, 0, 'Unseated viewer must not emit chat bubble');

    record(
      '3.4.1',
      'Không phát bong bóng chat khi người bình luận chưa ngồi vào ghế SEATED & hiển thị placeholder BXH khi bàn trống',
      true,
      `chatBubbles=${receivedChatBubbles.length}`
    );

    // =========================================================================
    // TEST 2: Seat 3 players, verify Chat Bubble (`game:chat_bubble`) for SEATED player
    // =========================================================================
    mockService.simulateCommentNhau('u1', 'Anh Ba Sài Gòn');
    mockService.simulateCommentDo('u2', 'Tư Nhậu Đêm');
    mockService.simulateCommentNhau('u3', 'Út Mồi Ngon');
    await waitMs();

    const versionBeforeChat = gameStateManager.stateVersion;
    const chatRes = mockService.simulateChat(
      'u1',
      'Anh Ba Sài Gòn',
      '1, 2, 3 Dô không say không về anh em ơi! 🍻🔥🎉'
    );
    await waitMs();

    assert.strictEqual(chatRes.stateResult.stateChanged, false, 'CHAT must not mutate Game State');
    assert.strictEqual(
      gameStateManager.stateVersion,
      versionBeforeChat,
      'stateVersion must not increment on CHAT'
    );
    assert.strictEqual(chatRes.stateResult.chatEmitted, true);
    assert.strictEqual(receivedChatBubbles.length, 1);
    assert.strictEqual(receivedChatBubbles[0].seatId, 1);
    assert.strictEqual(receivedChatBubbles[0].userId, 'u1');

    const slot1 = animManager.chatBubblePool.get(1);
    assert.strictEqual(slot1.bubbleGfx.visible, true, 'Seat #1 chat bubble graphics must be visible');
    assert.strictEqual(slot1.bubbleText.visible, true, 'Seat #1 chat bubble text must be visible');
    assert.ok(slot1.bubbleText.text.startsWith('💬 '), 'Chat bubble text must have speech icon');

    record(
      '3.4.2',
      'Phát và hiển thị bong bóng chat (`game:chat_bubble`) đúng ghế SEATED mà không làm tăng stateVersion',
      true,
      `seat=#${receivedChatBubbles[0].seatId}, text="${slot1.bubbleText.text}"`
    );

    // =========================================================================
    // TEST 3: Verify Phase 3 items (3.1 Auto CHEERS, Like Milestone, Gift Drunk Scoring) + Banner Notices + Leaderboard sorting
    // =========================================================================
    // Give u2 +30 drunk (MOCK_GIFT_VIP), u3 +10 drunk (MOCK_GIFT_SMALL) -> u2 (30%) > u3 (10%) > u1 (0%)
    mockService.simulateGift('donor1', 'Đại Gia 1', 'MOCK_GIFT_VIP', 1, 1); // seatIndex 1 -> seatId 2 (u2: 30%)
    mockService.simulateGift('donor2', 'Đại Gia 2', 'MOCK_GIFT_SMALL', 1, 2); // seatIndex 2 -> seatId 3 (u3: 10%)
    await waitMs();

    // Trigger Auto CHEERS (+5 to all seated -> u2: 35%, u3: 15%, u1: 5%)
    mockService.simulateCheers();
    // Trigger 100 Likes (+1 to all seated -> u2: 36%, u3: 16%, u1: 6%)
    mockService.simulateLike('liker1', 'Fan Cứng', 100);
    await waitMs();

    const snapAfterScoring = gameStateManager.getSnapshot();
    assert.strictEqual(snapAfterScoring.leaderboard.length, 3);
    assert.strictEqual(snapAfterScoring.leaderboard[0].userId, 'u2');
    assert.strictEqual(snapAfterScoring.leaderboard[0].drunkLevel, 31);
    assert.strictEqual(snapAfterScoring.leaderboard[1].userId, 'u3');
    assert.strictEqual(snapAfterScoring.leaderboard[1].drunkLevel, 16);
    assert.strictEqual(snapAfterScoring.leaderboard[2].userId, 'u1');
    assert.strictEqual(snapAfterScoring.leaderboard[2].drunkLevel, 6);

    assert.ok(
      leaderboardText.text.includes('#1') &&
        leaderboardText.text.includes('(31%)') &&
        leaderboardText.text.includes('#2') &&
        leaderboardText.text.includes('(16%)'),
      `Leaderboard HUD must reflect sorted top drunk players, got: ${leaderboardText.text}`
    );

    assert.ok(
      receivedBannerNotices.some((b) => b.actionCategory === 'DRUNK_INCREASE'),
      'Must emit banner notice for DRUNK_INCREASE'
    );
    assert.ok(
      receivedBannerNotices.some((b) => b.actionType === 'CHEERS'),
      'Must emit banner notice for CHEERS'
    );
    assert.ok(
      receivedBannerNotices.some((b) => b.actionType === 'LIKE_MILESTONE'),
      'Must emit banner notice for LIKE_MILESTONE'
    );

    record(
      '3.4.3',
      'Đồng bộ BXH Tửu Lượng (`leaderboard`) Top 3 độ say giảm dần & phát `game:banner_notice` cho Gift/CHEERS/Like',
      true,
      `HUD="${leaderboardText.text}", banners=${receivedBannerNotices.length}`
    );

    // =========================================================================
    // TEST 4: Verify Chat Bubble auto-cancellation & block when player becomes KO or LEAVING (Wife event)
    // =========================================================================
    // Show a fresh chat bubble on seat #1 (u1)
    mockService.simulateChat('u1', 'Anh Ba Sài Gòn', 'Còn tỉnh lắm nha!');
    await waitMs();
    assert.strictEqual(animManager.chatBubblePool.get(1).bubbleGfx.visible, true);

    // Trigger Wife Gift on seat #1 (seatIndex 0) -> u1 becomes LEAVING
    mockService.simulateGift('wife_sender', 'Nóc Nhà', 'MOCK_GIFT_WIFE', 1, 0);
    await waitMs();

    // Seat #1 chat bubble must be immediately cancelled upon entering LEAVING status
    assert.strictEqual(
      animManager.chatBubblePool.get(1).bubbleGfx.visible,
      false,
      'Chat bubble on Seat #1 must be cancelled immediately when occupant becomes LEAVING'
    );

    // Attempt to chat while u1 is LEAVING -> must NOT emit chat bubble
    const countBeforeLeavingChat = receivedChatBubbles.length;
    const leavingChatRes = mockService.simulateChat('u1', 'Anh Ba Sài Gòn', 'Khoan về vợ ơi!');
    await waitMs();
    assert.strictEqual(leavingChatRes.stateResult.chatEmitted, false);
    assert.strictEqual(receivedChatBubbles.length, countBeforeLeavingChat);

    assert.ok(
      receivedBannerNotices.some((b) => b.actionType === 'WIFE_DRAG' && b.level === 'danger'),
      'Must emit danger banner notice for WIFE_DRAG'
    );

    record(
      '3.4.4',
      'Hủy ngay bong bóng chat khi ghế chuyển sang KO/LEAVING và chặn chat từ người không ở trạng thái SEATED',
      true,
      `bubbleVisibleAfterLeaving=${animManager.chatBubblePool.get(1).bubbleGfx.visible}`
    );
  } finally {
    socketClient.disconnect();
    animManager.shutdown();
    gameStateManager.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n=== SUMMARY PHASE 3 (TASK 3.4): ${results.length - failed.length}/${results.length} PASSED ===`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test 3.4 failed with error:', err);
  process.exit(1);
});
