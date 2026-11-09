'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/**
 * Lightweight Mock Phaser Scene to instantiate SeatView, PlayerPlaceholder, and TableView
 * directly in Node.js and inspect all Graphics & Text operations deterministically.
 */
function createMockScene() {
  const createdGraphics = [];
  const createdTexts = [];

  return {
    createdGraphics,
    createdTexts,
    add: {
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
    }
  };
}

async function runPhase22Tests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ NHIỆM VỤ 2.2 (BÀN NHẬU, 6 SEATVIEW & NHÂN VẬT PLACEHOLDER) ===');

  const clientDir = path.resolve(__dirname, '..', 'client');
  const layoutUrl = pathToFileURL(path.join(clientDir, 'src/game/ui/Layout.js')).href;
  const seatViewUrl = pathToFileURL(path.join(clientDir, 'src/game/entities/SeatView.js')).href;
  const playerPlaceholderUrl = pathToFileURL(
    path.join(clientDir, 'src/game/entities/PlayerPlaceholder.js')
  ).href;
  const tableViewUrl = pathToFileURL(path.join(clientDir, 'src/game/entities/TableView.js')).href;

  const Layout = await import(layoutUrl);
  const { SeatView } = await import(seatViewUrl);
  const { PlayerPlaceholder } = await import(playerPlaceholderUrl);
  const { TableView } = await import(tableViewUrl);

  const mockScene = createMockScene();

  // 1 & 2: Instantiate 6 SeatViews and verify unique seatIds 1..6
  const seatViews = Layout.SEAT_LAYOUTS.map((seatLayout) => new SeatView(mockScene, seatLayout));
  assert.strictEqual(seatViews.length, 6, 'Phải có đúng 6 SeatView');

  const seenSeatIds = new Set(seatViews.map((sv) => sv.seatId));
  assert.strictEqual(seenSeatIds.size, 6, 'seatId của 6 SeatView không được trùng');
  assert.deepStrictEqual([...seenSeatIds], [1, 2, 3, 4, 5, 6]);
  console.log('[PASS 1 & 2] Có đúng 6 SeatView với seatId cố định 1..6 không trùng.');

  // 3: Verify coordinates match Layout.js and readability improvements (gap from Leaderboard, non-overlapping)
  const leaderboardBottom =
    Layout.LAYOUT_ZONES.LEADERBOARD_BAR.y + Layout.LAYOUT_ZONES.LEADERBOARD_BAR.height;
  const tableTop =
    Layout.LAYOUT_ZONES.TABLE_CENTER.y - Layout.LAYOUT_ZONES.TABLE_CENTER.height / 2;
  const tableBottom =
    Layout.LAYOUT_ZONES.TABLE_CENTER.y + Layout.LAYOUT_ZONES.TABLE_CENTER.height / 2;

  for (let i = 0; i < 6; i += 1) {
    const sv = seatViews[i];
    const layout = Layout.SEAT_LAYOUTS[i];
    assert.strictEqual(sv.nicknameText.x, layout.x);
    assert.strictEqual(sv.nicknameText.y, layout.hudNameY);
    assert.strictEqual(sv.statusText.x, layout.x);
    assert.strictEqual(sv.statusText.y, layout.statusY);
    assert.strictEqual(sv.nicknameText.style.fontSize, '10px');
    assert.strictEqual(sv.statusText.style.fontSize, '9px');
    assert.ok(sv.playerPlaceholder instanceof PlayerPlaceholder);

    // Check separated visual components in PlayerPlaceholder (stool, torso, head)
    assert.ok(sv.playerPlaceholder.stoolGfx, 'Thiếu stoolGfx tách riêng');
    assert.ok(sv.playerPlaceholder.torsoGfx, 'Thiếu torsoGfx tách riêng');
    assert.ok(sv.playerPlaceholder.headGfx, 'Thiếu headGfx tách riêng');

    if (layout.row === 'BACK') {
      assert.ok(
        layout.hudNameY - leaderboardBottom >= 14,
        `HUD ghế hàng sau (#${sv.seatId}) quá sát bảng xếp hạng`
      );
      const charTop = layout.charBottomY - Layout.PLACEHOLDER_SIZES.CHARACTER_HEIGHT;
      assert.ok(layout.statusY < charTop, `HUD ghế #${sv.seatId} đè lên nhân vật`);
      assert.ok(layout.charBottomY < tableTop, `Nhân vật ghế #${sv.seatId} đè lên bàn`);
    } else {
      const charTop = layout.charBottomY - Layout.PLACEHOLDER_SIZES.CHARACTER_HEIGHT;
      assert.ok(charTop > tableBottom, `Nhân vật ghế #${sv.seatId} đè lên bàn`);
      assert.ok(layout.hudNameY > layout.stoolY, `HUD ghế #${sv.seatId} đè lên ghế/nhân vật`);
      assert.ok(
        layout.statusY < Layout.LAYOUT_ZONES.QUEUE_PANEL.y,
        `HUD ghế #${sv.seatId} đè lên bảng hàng chờ`
      );
    }
  }
  console.log('[PASS 3] Tọa độ 6 SeatView khớp Layout.js, tách riêng Đầu/Thân/Ghế, khoảng cách đọc thoáng và không đè lấp.');

  // 4: Verify EMPTY seat hides character and never displays old nickname
  const seat1 = seatViews[0];
  seat1.updateSeat({
    seatId: 1,
    status: 'SEATED',
    nickname: 'Anh Tư Cũ',
    drunkLevel: 45
  });
  assert.ok(seat1.nicknameText.text.includes('Anh Tư Cũ'));
  assert.strictEqual(seat1.getDisplayState().isCharacterVisible, true);
  assert.strictEqual(seat1.playerPlaceholder.torsoGfx.visible, true);
  assert.strictEqual(seat1.playerPlaceholder.headGfx.visible, true);

  seat1.clearSeat();
  const emptyState = seat1.getDisplayState();
  assert.strictEqual(emptyState.status, 'EMPTY');
  assert.strictEqual(emptyState.rawNickname, null);
  assert.strictEqual(emptyState.displayNickname, '');
  assert.strictEqual(emptyState.drunkLevel, 0);
  assert.strictEqual(emptyState.isCharacterVisible, false);
  assert.strictEqual(seat1.playerPlaceholder.torsoGfx.visible, false);
  assert.strictEqual(seat1.playerPlaceholder.headGfx.visible, false);
  assert.strictEqual(
    seat1.nicknameText.text.includes('Anh Tư Cũ'),
    false,
    'Ghế trống không được hiển thị nickname cũ'
  );
  console.log('[PASS 4] Ghế trống (EMPTY / clearSeat) xóa sạch nickname cũ và ẩn nhân vật, chỉ giữ ghế.');

  // 5: Verify drunk gauge bar accurately represents 0..100 and clamps out-of-range values
  const spec0 = Layout.computeDrunkBarSpec(0, 'SEATED');
  assert.strictEqual(spec0.drunkLevel, 0);
  assert.strictEqual(spec0.fillWidth, 0);
  assert.strictEqual(spec0.visualTier, 'SOBER');
  assert.strictEqual(spec0.fillColor, Layout.PALETTE.GAUGE_SOBER);

  const spec50 = Layout.computeDrunkBarSpec(50, 'SEATED');
  assert.strictEqual(spec50.drunkLevel, 50);
  assert.strictEqual(spec50.fillWidth, Math.round(spec50.maxInnerWidth * 0.5));
  assert.strictEqual(spec50.visualTier, 'TIPSY');
  assert.strictEqual(spec50.fillColor, Layout.PALETTE.GAUGE_TIPSY);

  const spec85 = Layout.computeDrunkBarSpec(85, 'SEATED');
  assert.strictEqual(spec85.drunkLevel, 85);
  assert.strictEqual(spec85.visualTier, 'DRUNK');
  assert.strictEqual(spec85.fillColor, Layout.PALETTE.GAUGE_DRUNK);

  const spec100 = Layout.computeDrunkBarSpec(100, 'KO');
  assert.strictEqual(spec100.drunkLevel, 100);
  assert.strictEqual(spec100.fillWidth, spec100.maxInnerWidth);
  assert.strictEqual(spec100.visualTier, 'KO');
  assert.strictEqual(spec100.fillColor, Layout.PALETTE.GAUGE_KO);

  // Clamp check
  assert.strictEqual(Layout.computeDrunkBarSpec(-20, 'SEATED').drunkLevel, 0);
  assert.strictEqual(Layout.computeDrunkBarSpec(150, 'SEATED').drunkLevel, 100);
  console.log('[PASS 5] Thanh độ say biểu diễn chính xác 0–100 (SOBER, TIPSY, DRUNK, KO) và kẹp biên an toàn.');

  // 6: Verify KO and LEAVING only change visual presentation (no timers or auto-eviction)
  const seat5 = seatViews[4];
  const koView = seat5.updateSeat({
    seatId: 5,
    status: 'KO',
    nickname: 'Chú Tám',
    drunkLevel: 100
  });
  assert.strictEqual(koView.status, 'KO');
  assert.strictEqual(koView.visualTier, 'KO');
  assert.ok(seat5.statusText.text.includes('KO'));
  assert.strictEqual(seat5.getDisplayState().isCharacterVisible, true);

  const seat6 = seatViews[5];
  const leavingView = seat6.updateSeat({
    seatId: 6,
    status: 'LEAVING',
    nickname: 'Anh Ba',
    drunkLevel: 65
  });
  assert.strictEqual(leavingView.status, 'LEAVING');
  assert.strictEqual(leavingView.visualTier, 'LEAVING');
  assert.ok(seat6.statusText.text.includes('VỢ BẮT'));
  assert.strictEqual(seat6.getDisplayState().isCharacterVisible, true);

  // Also verify TableView updates 6 beer mug positions visually according to seat states
  const tableView = new TableView(mockScene);
  tableView.updateMugStates(Layout.PREVIEW_UI_DATA.seats);
  assert.strictEqual(tableView.mugStates.size, 6);
  assert.strictEqual(tableView.mugStates.get(3).status, 'EMPTY');
  assert.strictEqual(tableView.mugStates.get(5).status, 'KO');
  assert.strictEqual(tableView.mugStates.get(6).status, 'LEAVING');
  console.log('[PASS 6] Trạng thái KO / LEAVING và TableView (6 vị trí ly bia + đĩa mồi) chỉ cập nhật hiển thị thuần túy.');

  // 7: Verify long nickname truncation does not overflow HUD bounds
  const seat4 = seatViews[3];
  const longView = seat4.updateSeat({
    seatId: 4,
    status: 'SEATED',
    nickname: 'Hoàng Tử Bia Hơi Vỉa Hè Sài Gòn Quận 4',
    drunkLevel: 80
  });
  assert.ok(
    longView.displayNickname.length <= Layout.PLACEHOLDER_SIZES.MAX_NICKNAME_LENGTH,
    `Nickname hiển thị vượt quá ${Layout.PLACEHOLDER_SIZES.MAX_NICKNAME_LENGTH} ký tự`
  );
  assert.ok(longView.displayNickname.endsWith('…'));
  assert.ok(seat4.nicknameText.text.length <= 16); // "#4 " + 12 chars = 15 chars max
  console.log('[PASS 7] Nickname dài tự động rút gọn kèm dấu "…", không tràn vùng HUD.');

  // 8, 9, 10: Verify no gameplay logic / timers in SeatView/PlayerPlaceholder/TableView, single Phaser.Game, no Socket.io
  const seatViewSrc = fs.readFileSync(
    path.join(clientDir, 'src/game/entities/SeatView.js'),
    'utf8'
  );
  const playerPlaceholderSrc = fs.readFileSync(
    path.join(clientDir, 'src/game/entities/PlayerPlaceholder.js'),
    'utf8'
  );
  const tableViewSrc = fs.readFileSync(
    path.join(clientDir, 'src/game/entities/TableView.js'),
    'utf8'
  );
  const mainSceneSrc = fs.readFileSync(
    path.join(clientDir, 'src/game/scenes/MainScene.js'),
    'utf8'
  );
  const mainSrc = fs.readFileSync(path.join(clientDir, 'src/main.js'), 'utf8');

  const entitySources = `${seatViewSrc}\n${playerPlaceholderSrc}\n${tableViewSrc}`;
  assert.strictEqual(
    entitySources.includes('setTimeout') || entitySources.includes('setInterval'),
    false,
    'SeatView/PlayerPlaceholder/TableView không được chứa timer gameplay'
  );
  assert.strictEqual(
    `${entitySources}\n${mainSceneSrc}`.includes('socket.io') ||
      `${entitySources}\n${mainSceneSrc}`.includes('/api/state'),
    false,
    'Nhiệm vụ 2.2 không được kết nối Socket.io hoặc gọi Backend'
  );
  assert.ok(
    mainSrc.includes('if (gameInstance)') && mainSrc.includes('new Phaser.Game(config)'),
    'Chỉ khởi tạo duy nhất 1 Phaser.Game instance'
  );

  // Verify static preview dataset contains EMPTY, SEATED, KO, LEAVING, long nickname, and varied drunk levels
  const previewSeats = Layout.PREVIEW_UI_DATA.seats;
  const previewStatuses = new Set(previewSeats.map((s) => s.status));
  assert.ok(previewStatuses.has('EMPTY'), 'Preview thiếu ghế EMPTY');
  assert.ok(previewStatuses.has('SEATED'), 'Preview thiếu ghế SEATED');
  assert.ok(previewStatuses.has('KO'), 'Preview thiếu ghế KO');
  assert.ok(previewStatuses.has('LEAVING'), 'Preview thiếu ghế LEAVING');
  assert.ok(
    previewSeats.some((s) => s.nickname && s.nickname.length > 12),
    'Preview thiếu trường hợp nickname dài'
  );
  console.log('[PASS 8, 9 & 10] Không chứa logic gameplay/timer ở view, chỉ 1 Phaser.Game instance, không kết nối Socket.io, đủ bộ dữ liệu preview.');

  // 11: Verify Vite Dev Server transforms new entity modules & Production Build exists
  const viteModuleUrl = pathToFileURL(
    path.join(clientDir, 'node_modules/vite/dist/node/index.js')
  ).href;
  const { createServer } = await import(viteModuleUrl);
  const viteServer = await createServer({
    root: clientDir,
    configFile: path.join(clientDir, 'vite.config.js'),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 }
  });
  await viteServer.listen();
  try {
    const address = viteServer.httpServer.address();
    const devUrl = `http://127.0.0.1:${address.port}`;
    for (const modPath of [
      '/src/game/entities/SeatView.js',
      '/src/game/entities/PlayerPlaceholder.js',
      '/src/game/entities/TableView.js',
      '/src/game/scenes/MainScene.js'
    ]) {
      const res = await fetch(`${devUrl}${modPath}`);
      assert.strictEqual(res.status, 200, `Vite dev server lỗi khi tải ${modPath}`);
    }
  } finally {
    await viteServer.close();
  }

  const distIndex = path.join(clientDir, 'dist', 'index.html');
  assert.ok(fs.existsSync(distIndex), 'Thiếu client/dist/index.html');
  console.log('[PASS 11] Vite Dev Server transform & Production Build (client/dist) thành công.');

  console.log('=== TẤT CẢ KIỂM THỬ NHIỆM VỤ 2.2 ĐỀU PASS ===');
}

runPhase22Tests().catch((err) => {
  console.error('[FAIL] Kiểm thử 2.2 thất bại:', err);
  process.exit(1);
});
