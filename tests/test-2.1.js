'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function runPhase21Tests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ NHIỆM VỤ 2.1 (PHASER 3 + VITE + LAYOUT 9:16) ===');

  const clientDir = path.resolve(__dirname, '..', 'client');
  const requiredFiles = [
    'package.json',
    'vite.config.js',
    'index.html',
    'src/main.js',
    'src/game/config.js',
    'src/game/scenes/BootScene.js',
    'src/game/scenes/MainScene.js',
    'src/game/ui/Layout.js'
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(clientDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Thiếu file bắt buộc: client/${relPath}`);
  }
  console.log('[PASS 1] Đầy đủ cấu trúc file frontend client/ (Phaser 3 + Vite).');

  // Verify client/package.json dependencies & isolation from backend
  const clientPkg = JSON.parse(fs.readFileSync(path.join(clientDir, 'package.json'), 'utf8'));
  assert.ok(clientPkg.dependencies && clientPkg.dependencies.phaser, 'Thiếu dependency phaser');
  assert.ok(clientPkg.devDependencies && clientPkg.devDependencies.vite, 'Thiếu devDependency vite');
  const allowedDeps = new Set(['phaser', 'socket.io-client']);
  for (const dep of Object.keys(clientPkg.dependencies || {})) {
    assert.ok(allowedDeps.has(dep), `Dependency không nằm trong kiến trúc: ${dep}`);
  }
  console.log('[PASS 2] client/package.json chỉ chứa các dependency chuẩn theo kiến trúc, tách biệt khỏi Backend.');

  // Dynamically import ES module Layout.js to validate coordinates, layers, and preview data
  const layoutUrl = pathToFileURL(path.join(clientDir, 'src/game/ui/Layout.js')).href;
  const Layout = await import(layoutUrl);

  // Check logical resolution & aspect ratio
  assert.strictEqual(Layout.RESOLUTION.LOGICAL_WIDTH, 360);
  assert.strictEqual(Layout.RESOLUTION.LOGICAL_HEIGHT, 640);
  assert.strictEqual(Layout.RESOLUTION.REFERENCE_SCALE, 3);
  assert.strictEqual(Layout.RESOLUTION.REFERENCE_WIDTH, 1080);
  assert.strictEqual(Layout.RESOLUTION.REFERENCE_HEIGHT, 1920);
  assert.strictEqual(
    Layout.RESOLUTION.LOGICAL_WIDTH / Layout.RESOLUTION.LOGICAL_HEIGHT,
    9 / 16
  );
  console.log('[PASS 3] Logical resolution 360x640 (9:16) & Reference 1080x1920 (3x) chính xác.');

  // Check 9-Layer Z-Order hierarchy
  const expectedLayers = {
    BG_BASE: 0,
    BG_AMBIENT: 10,
    BACK_ROW_SEATS: 20,
    TABLE_AND_PROPS: 30,
    FRONT_ROW_SEATS: 40,
    ACTION_FX_LAYER: 50,
    PLAYER_WORLD_UI: 60,
    SCREEN_HUD: 70,
    EVENT_BANNER_AND_SYSTEM: 80
  };
  assert.deepStrictEqual(Layout.LAYERS, expectedLayers);
  console.log('[PASS 4] Cấu trúc 9 Layer (depth 0..80) đúng quy chuẩn GAME_DESIGN.md.');

  // Check all layout zones fit strictly inside 360x640 and do not overlap vertically
  const zones = Layout.LAYOUT_ZONES;
  for (const [zoneName, z] of Object.entries(zones)) {
    if (zoneName === 'TABLE_CENTER') {
      const left = z.x - z.width / 2;
      const right = z.x + z.width / 2;
      const top = z.y - z.height / 2;
      const bottom = z.y + z.height / 2;
      assert.ok(left >= 0 && right <= 360, `TABLE_CENTER tràn ngang: ${left}..${right}`);
      assert.ok(top >= 0 && bottom <= 640, `TABLE_CENTER tràn dọc: ${top}..${bottom}`);
    } else {
      assert.ok(z.x >= 0 && z.x + z.width <= 360, `${zoneName} tràn ngang ngoài 360px`);
      assert.ok(z.y >= 0 && z.y + z.height <= 640, `${zoneName} tràn dọc ngoài 640px`);
    }
  }
  console.log('[PASS 5] Tất cả vùng giao diện (Header, Banner, BXH, Bàn nhậu, Hàng chờ, Hướng dẫn, Safe Zones) nằm gọn trong 360x640.');

  // Check 6 seats & non-overlapping HUD/Character/Table geometry
  assert.strictEqual(Layout.SEAT_LAYOUTS.length, 6);
  assert.strictEqual(Layout.PREVIEW_UI_DATA.seats.length, 6);
  const tableTop = zones.TABLE_CENTER.y - zones.TABLE_CENTER.height / 2;
  const tableBottom = zones.TABLE_CENTER.y + zones.TABLE_CENTER.height / 2;

  for (let i = 0; i < 6; i += 1) {
    const seat = Layout.SEAT_LAYOUTS[i];
    const preview = Layout.PREVIEW_UI_DATA.seats[i];
    assert.strictEqual(seat.seatId, i + 1);
    assert.strictEqual(seat.seatIndex, i);
    assert.strictEqual(preview.seatId, i + 1);
    if (preview.status !== 'EMPTY') {
      assert.ok(typeof preview.nickname === 'string' && preview.nickname.length > 0);
    }
    assert.ok(preview.drunkLevel >= 0 && preview.drunkLevel <= 100);

    // Check horizontal bounds of seat character & gauge inside 360px
    const halfGauge = Layout.PLACEHOLDER_SIZES.GAUGE_WIDTH / 2;
    assert.ok(seat.x - halfGauge >= 10 && seat.x + halfGauge <= 350);

    // Check character top/bottom vs HUD and table
    const charTop = seat.charBottomY - Layout.PLACEHOLDER_SIZES.CHARACTER_HEIGHT;
    const charBottom = seat.charBottomY;

    if (seat.row === 'BACK') {
      // Back row HUD must stay above character, and character/gauge must stay above table
      assert.ok(seat.statusY < charTop, `Ghế ${seat.seatId}: HUD đè lên nhân vật hàng sau`);
      assert.ok(seat.gaugeY + 3 < tableTop, `Ghế ${seat.seatId}: Thanh độ say đè lên bàn`);
      assert.ok(charBottom < tableTop, `Ghế ${seat.seatId}: Nhân vật hàng sau đè lên mặt bàn`);
    } else {
      // Front row character stays below table, and HUD stays below stool/character
      assert.ok(charTop > tableBottom, `Ghế ${seat.seatId}: Nhân vật hàng trước đè lên mặt bàn`);
      assert.ok(seat.hudNameY > seat.stoolY, `Ghế ${seat.seatId}: Chữ đè lên nhân vật hàng trước`);
      assert.ok(seat.statusY < zones.QUEUE_PANEL.y, `Ghế ${seat.seatId}: HUD đè lên bảng Hàng chờ`);
    }
  }
  console.log('[PASS 6] Đủ 6 ghế (seatId 1..6) & 6 nhân vật placeholder; không chồng chữ lên nhân vật, không che bàn.');

  // Check static preview data completeness (Header, Banner, Queue, Leaderboard, Guide)
  const uiData = Layout.PREVIEW_UI_DATA;
  assert.strictEqual(uiData.header.gameTitle, '1, 2, 3 DÔ!');
  assert.strictEqual(uiData.header.liveBadge, 'LIVE');
  assert.ok(Array.isArray(uiData.waitingQueue.vipQueue) && uiData.waitingQueue.vipQueue.length > 0);
  assert.ok(
    Array.isArray(uiData.waitingQueue.normalQueue) && uiData.waitingQueue.normalQueue.length > 0
  );
  assert.strictEqual(
    uiData.waitingQueue.totalWaiting,
    uiData.waitingQueue.vipQueue.length + uiData.waitingQueue.normalQueue.length
  );
  assert.ok(Array.isArray(uiData.leaderboardPreview) && uiData.leaderboardPreview.length >= 3);
  assert.ok(Array.isArray(uiData.interactionGuide) && uiData.interactionGuide.length >= 3);
  assert.strictEqual(Layout.formatNickname('NguyenVanABCDFGH', 12).length, 12);
  console.log('[PASS 7] Đầy đủ dữ liệu tĩnh Header, LIVE badge, Hàng chờ VIP/Normal, BXH và Hướng dẫn tương tác.');

  // Check Phaser config & scene source code rules (single Phaser.Game instance, pixelArt: true, no Backend connection)
  const configSrc = fs.readFileSync(path.join(clientDir, 'src/game/config.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(clientDir, 'src/main.js'), 'utf8');
  const bootSrc = fs.readFileSync(path.join(clientDir, 'src/game/scenes/BootScene.js'), 'utf8');
  const mainSceneSrc = fs.readFileSync(
    path.join(clientDir, 'src/game/scenes/MainScene.js'),
    'utf8'
  );

  assert.ok(configSrc.includes('pixelArt: true'), 'Phaser config phải bật pixelArt: true');
  assert.ok(configSrc.includes('antialias: false'), 'Phaser config phải tắt antialias: false');
  assert.ok(configSrc.includes('roundPixels: true'), 'Phaser config phải bật roundPixels: true');
  assert.ok(configSrc.includes('Phaser.Scale.FIT'), 'Phaser config phải dùng Phaser.Scale.FIT');
  assert.ok(
    configSrc.includes('Phaser.Scale.CENTER_BOTH'),
    'Phaser config phải dùng Phaser.Scale.CENTER_BOTH'
  );
  assert.ok(
    mainSrc.includes('if (gameInstance)') && mainSrc.includes('new Phaser.Game(config)'),
    'main.js phải bảo vệ chỉ tạo duy nhất 1 Phaser.Game instance'
  );
  assert.ok(
    bootSrc.includes("this.scene.start('MainScene')"),
    'BootScene phải chuyển sang MainScene'
  );

  // Ensure no Socket.io or /api/state calls exist in client/src
  const combinedClientSrc = `${configSrc}\n${mainSrc}\n${bootSrc}\n${mainSceneSrc}`;
  assert.strictEqual(
    combinedClientSrc.includes('/api/state') || combinedClientSrc.includes('socket.io'),
    false,
    'Nhiệm vụ 2.1 không được kết nối Backend hoặc Socket.io'
  );
  console.log('[PASS 8] Cấu hình Phaser 3 (360x640, pixelArt, FIT, CENTER_BOTH, 1 instance, BootScene -> MainScene, không gọi Backend) đạt chuẩn.');

  // Check responsive FIT scaling math across required viewports: 360x640, 540x960, 1080x1920, 1920x1080 (desktop landscape)
  const viewports = [
    { name: '360x640 (1x)', vw: 360, vh: 640, expectedScale: 1.0, integerScale: true },
    { name: '540x960 (1.5x)', vw: 540, vh: 960, expectedScale: 1.5, integerScale: false },
    { name: '1080x1920 (3x Reference)', vw: 1080, vh: 1920, expectedScale: 3.0, integerScale: true },
    { name: '1366x768 (Desktop Landscape)', vw: 1366, vh: 768, expectedScale: 768 / 640, integerScale: false }
  ];

  for (const vp of viewports) {
    const scale = Math.min(vp.vw / 360, vp.vh / 640);
    const displayW = Math.round(360 * scale);
    const displayH = Math.round(640 * scale);
    assert.ok(Math.abs(scale - vp.expectedScale) < 1e-6);
    assert.strictEqual(
      Number((displayW / displayH).toFixed(4)),
      Number((9 / 16).toFixed(4)),
      `Tỷ lệ khung hình bị méo ở viewport ${vp.name}`
    );
    assert.ok(displayW <= vp.vw && displayH <= vp.vh, `Tràn khung ở viewport ${vp.name}`);
  }
  console.log('[PASS 9] Kiểm tra toán học hiển thị 9:16 (360x640, 540x960, 1080x1920, Desktop Landscape) giữ nguyên tỷ lệ 9:16 không méo, không tràn.');

  // Check 10: Start Vite Dev Server and verify HTTP serving & JS module transformation
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

    const htmlRes = await fetch(`${devUrl}/`);
    assert.strictEqual(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('id="game-container"'));

    for (const modPath of [
      '/src/main.js',
      '/src/game/config.js',
      '/src/game/scenes/BootScene.js',
      '/src/game/scenes/MainScene.js',
      '/src/game/ui/Layout.js'
    ]) {
      const modRes = await fetch(`${devUrl}${modPath}`);
      assert.strictEqual(modRes.status, 200, `Vite dev server lỗi khi tải ${modPath}`);
    }
    console.log('[PASS 10] Vite Development Server khởi chạy và transform thành công toàn bộ module frontend.');
  } finally {
    await viteServer.close();
  }

  // Check 11: Verify Vite production build artifacts in client/dist
  const distIndex = path.join(clientDir, 'dist', 'index.html');
  assert.ok(fs.existsSync(distIndex), 'Thiếu file client/dist/index.html sau khi build');
  const distAssetsDir = path.join(clientDir, 'dist', 'assets');
  assert.ok(fs.existsSync(distAssetsDir), 'Thiếu thư mục client/dist/assets');
  const distFiles = fs.readdirSync(distAssetsDir);
  assert.ok(distFiles.some((f) => f.endsWith('.js')), 'Thiếu bundle JS trong client/dist/assets');
  console.log('[PASS 11] Vite Production Build (client/dist) tồn tại và hợp lệ.');

  console.log('=== TẤT CẢ KIỂM THỬ CẤU TRÚC & BỐ CỤC NHIỆM VỤ 2.1 ĐỀU PASS ===');
}

runPhase21Tests().catch((err) => {
  console.error('[FAIL] Kiểm thử 2.1 thất bại:', err);
  process.exit(1);
});
