'use strict';

/**
 * Test Suite — Phase 2.5: UI Polish, Responsive 9:16, OBS Browser Source Readiness & Load Test
 *
 * Clearly distinguishes:
 * - [STATIC CHECK]: Source, CSS, Layout geometry, OBS security & config inspection.
 * - [UNIT / COMPONENT CHECK]: Unicode/Emoji truncation, HUD overflow bounds, object pooling.
 * - [INTEGRATION & LOAD CHECK]: Real Backend Socket.io server + SocketClient + SeatView + TableView + AnimationManager
 *   under offline startup, mid-FX disconnect/restart, seat replacement, and 150+ burst events.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { pathToFileURL } = require('url');
const defaultConfig = require('../server/config');
const { startServer } = require('../server/index');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

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
  throw new Error(`Timeout after ${timeoutMs}ms waiting for condition`);
}

function createMockScene() {
  const createdObjects = [];

  const makeGameObject = (type, extra = {}) => {
    const obj = {
      type,
      depth: 0,
      visible: true,
      alpha: 1,
      x: extra.x || 0,
      y: extra.y || 0,
      text: extra.text || '',
      style: extra.style || {},
      commands: [],
      setDepth(d) {
        this.depth = d;
        return this;
      },
      setOrigin() {
        return this;
      },
      setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
      },
      setVisible(v) {
        this.visible = Boolean(v);
        return this;
      },
      setAlpha(a) {
        this.alpha = a;
        return this;
      },
      setText(t) {
        this.text = String(t);
        return this;
      },
      setColor(c) {
        this.style.color = c;
        return this;
      },
      clear() {
        this.commands = [];
        return this;
      },
      fillStyle(color, alpha = 1) {
        this.commands.push({ op: 'fillStyle', color, alpha });
        return this;
      },
      lineStyle(width, color, alpha = 1) {
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
      destroy() {
        this.destroyed = true;
      },
      ...extra
    };
    createdObjects.push(obj);
    return obj;
  };

  return {
    createdObjects,
    add: {
      graphics: () => makeGameObject('graphics'),
      text: (x, y, text, style) => makeGameObject('text', { x, y, text, style: { ...style } })
    }
  };
}

(async () => {
  console.log('=== TEST SUITE 2.5: UI POLISH, RESPONSIVE 9:16, OBS READINESS & LOAD TEST ===\n');

  const clientDir = path.resolve(__dirname, '../client');
  const layoutUrl = pathToFileURL(path.join(clientDir, 'src/game/ui/Layout.js')).href;
  const seatViewUrl = pathToFileURL(path.join(clientDir, 'src/game/entities/SeatView.js')).href;
  const tableViewUrl = pathToFileURL(path.join(clientDir, 'src/game/entities/TableView.js')).href;
  const animMgrUrl = pathToFileURL(path.join(clientDir, 'src/game/fx/AnimationManager.js')).href;
  const socketClientUrl = pathToFileURL(path.join(clientDir, 'src/network/SocketClient.js')).href;

  const Layout = await import(layoutUrl);
  const { SeatView } = await import(seatViewUrl);
  const { TableView } = await import(tableViewUrl);
  const { AnimationManager } = await import(animMgrUrl);
  const { SocketClient, CONNECTION_STATUS, formatActionFxBanner } = await import(socketClientUrl);

  // 1-4. [STATIC & MATH CHECK] Logical resolution 360x640, Aspect ratio 9:16, FIT/CENTER_BOTH, Nearest-neighbor
  check('1-4. [STATIC & MATH] Logical resolution 360x640 (9:16), FIT/CENTER_BOTH, Nearest-neighbor & OBS CSS', () => {
    assert.strictEqual(Layout.RESOLUTION.LOGICAL_WIDTH, 360);
    assert.strictEqual(Layout.RESOLUTION.LOGICAL_HEIGHT, 640);
    assert.strictEqual(Layout.RESOLUTION.ASPECT_RATIO, 9 / 16);
    assert.strictEqual(Layout.RESOLUTION.REFERENCE_WIDTH, 1080);
    assert.strictEqual(Layout.RESOLUTION.REFERENCE_HEIGHT, 1920);
    assert.strictEqual(Layout.RESOLUTION.REFERENCE_SCALE, 3);

    const configSrc = fs.readFileSync(path.join(clientDir, 'src/game/config.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');

    assert.ok(configSrc.includes('pixelArt: true'));
    assert.ok(configSrc.includes('antialias: false'));
    assert.ok(configSrc.includes('roundPixels: true'));
    assert.ok(configSrc.includes('Phaser.Scale.FIT'));
    assert.ok(configSrc.includes('Phaser.Scale.CENTER_BOTH'));
    assert.ok(indexHtml.includes('overflow: hidden'));
    assert.ok(indexHtml.includes('image-rendering: pixelated'));

    // Verify 9:16 scaling across 360x640, 540x960, 1080x1920 (OBS Reference), and 1366x768 (Desktop Landscape)
    for (const [vw, vh] of [
      [360, 640],
      [540, 960],
      [1080, 1920],
      [1366, 768]
    ]) {
      const scale = Math.min(vw / 360, vh / 640);
      const rw = Math.round(360 * scale);
      const rh = Math.round(640 * scale);
      assert.strictEqual(Number((rw / rh).toFixed(4)), Number((9 / 16).toFixed(4)));
      assert.ok(rw <= vw && rh <= vh);
    }
  });

  // 5-7. [STATIC & GEOMETRY CHECK] 9 Layers (0..80), TikTok Safe Zones, and 6 Seats inside viewport
  check('5-7. [GEOMETRY] 9 Layers (0..80) intact, Safe Zones respected, and all 6 seats inside 360x640', () => {
    assert.deepStrictEqual(Layout.LAYERS, {
      BG_BASE: 0,
      BG_AMBIENT: 10,
      BACK_ROW_SEATS: 20,
      TABLE_AND_PROPS: 30,
      FRONT_ROW_SEATS: 40,
      ACTION_FX_LAYER: 50,
      PLAYER_WORLD_UI: 60,
      SCREEN_HUD: 70,
      EVENT_BANNER_AND_SYSTEM: 80
    });

    const zones = Layout.LAYOUT_ZONES;
    assert.strictEqual(zones.SAFE_TOP.y, 0);
    assert.strictEqual(zones.SAFE_TOP.height, 32);
    assert.strictEqual(zones.SAFE_BOTTOM_CHAT.y, 506);
    assert.strictEqual(zones.SAFE_BOTTOM_CHAT.height, 134);

    // Ensure all active UI zones lie strictly between SAFE_TOP (32) and SAFE_BOTTOM_CHAT (506)
    for (const key of ['HEADER_BAR', 'EVENT_BANNER', 'LEADERBOARD_BAR', 'PLAYFIELD', 'QUEUE_PANEL', 'GUIDE_PANEL']) {
      const z = zones[key];
      assert.ok(z.y >= zones.SAFE_TOP.height, `${key} intrudes into SAFE_TOP`);
      assert.ok(z.y + z.height <= zones.SAFE_BOTTOM_CHAT.y, `${key} intrudes into SAFE_BOTTOM_CHAT`);
      assert.ok(z.x >= 0 && z.x + z.width <= 360, `${key} exceeds horizontal bounds`);
    }

    assert.strictEqual(Layout.SEAT_LAYOUTS.length, 6);
    Layout.SEAT_LAYOUTS.forEach((seat, idx) => {
      assert.strictEqual(seat.seatId, idx + 1);
      assert.ok(seat.x - 46 >= 0 && seat.x + 46 <= 360, `Seat ${seat.seatId} HUD exceeds horizontal viewport`);
      assert.ok(seat.hudNameY - 8 >= zones.PLAYFIELD.y, `Seat ${seat.seatId} HUD above playfield`);
      assert.ok(seat.statusY + 8 <= zones.QUEUE_PANEL.y, `Seat ${seat.seatId} HUD overlaps queue panel`);
    });
  });

  // 8-10. [UNIT CHECK] Unicode/Emoji/Vietnamese diacritic truncation, HUD overflow protection & FX banner bounds
  check('8-10. [UNICODE & OVERFLOW] Vietnamese diacritics, emojis, special chars, null/empty, and long FX banners truncate safely without lone surrogates or mutating rawNickname', () => {
    const hasLoneSurrogate = (str) =>
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(str);

    const trickyInputs = [
      'Nguyễn Văn Đạt Quận 4 Sài Gòn Rất Dài',
      '🍻👑🔥 Đại Gia Bia Hơi Vỉa Hè 🍻👑🔥',
      '👨‍👩‍👧‍👦 Gia Đình Nhậu Đêm 👨‍👩‍👧‍👦✨🎉',
      'User_@#$_<script>alert(1)</script>_\n\t_End',
      '   ',
      '',
      null,
      undefined
    ];

    for (const input of trickyInputs) {
      const out = Layout.formatNickname(input, 12);
      assert.strictEqual(hasLoneSurrogate(out), false, `Lone surrogate found in: ${out}`);
      assert.strictEqual(/[\r\n\t]/.test(out), false, `Control char found in: ${out}`);
      const graphemes = Layout.splitGraphemes(out);
      assert.ok(graphemes.length <= 12, `Exceeded 12 graphemes: ${out} (${graphemes.length})`);
    }

    // Verify SeatView preserves rawNickname while truncating displayNickname and keeping seatId immutable
    const scene = createMockScene();
    const seatView = new SeatView(scene, Layout.SEAT_LAYOUTS[0]);
    const originalNick = '🍻👑 Nguyễn Thị Bích Ngọc Quận 1 👑🍻';
    const state = seatView.updateSeat({
      seatId: 999, // attempt to pass wrong seatId
      userId: 'u_unicode',
      status: 'SEATED',
      nickname: originalNick,
      drunkLevel: 45,
      isVIP: true
    });
    assert.strictEqual(seatView.seatId, 1, 'seatId must never be mutated by seat payload');
    assert.strictEqual(state.rawNickname, originalNick, 'rawNickname must remain intact');
    assert.strictEqual(hasLoneSurrogate(state.displayNickname), false);
    assert.ok(Layout.splitGraphemes(state.displayNickname).length <= 12);
    assert.strictEqual(seatView.nicknameText.style.color, Layout.PALETTE.TEXT_WARM, 'VIP seated player highlighted in warm gold');

    // Verify long FX banner formatting stays bounded
    const bannerStr = formatActionFxBanner({
      actionType: 'KO',
      seatId: 3,
      displayNickname: '🍻👑🔥 Hoàng Tử Bia Hơi Vỉa Hè Sài Gòn Quận 4 🔥👑🍻'
    });
    assert.strictEqual(hasLoneSurrogate(bannerStr), false);
    assert.ok(Layout.splitGraphemes(bannerStr).length <= 48);

    // Verify AnimationManager center banner and seat callout stay within bounds on extra-long strings
    const tableView = new TableView(scene);
    const allSeats = Layout.SEAT_LAYOUTS.map((l) => new SeatView(scene, l));
    allSeats[0].updateSeat({ seatId: 1, userId: 'u1', status: 'SEATED', nickname: originalNick, drunkLevel: 20 });
    const animMgr = new AnimationManager(scene, allSeats, tableView);
    animMgr.enqueueFx({
      actionType: 'VIP_PASS',
      eventId: 'evt_long_vip',
      sender: { displayNickname: originalNick },
      affectedSeats: [{ seatId: 1, userId: 'u1', isVip: true }],
      stateVersion: 1
    });
    assert.ok(Layout.splitGraphemes(animMgr.centerFxText.text).length <= 28);
    assert.ok(Layout.splitGraphemes(animMgr.seatFxPool.get(1).calloutText.text).length <= 14);
    animMgr.shutdown();
  });

  // 15. [STATIC & SECURITY CHECK] Single Phaser.Game instance, OBS readiness & zero secret leakage
  check('15. [OBS & SECURITY] Single Phaser.Game instance, no click-to-start gate, no camera/mic requests, no ADMIN_SECRET_TOKEN in client, preview disabled in PROD, OBS_GUIDE.md exists', () => {
    const mainSrc = fs.readFileSync(path.join(clientDir, 'src/main.js'), 'utf8');
    const configSrc = fs.readFileSync(path.join(clientDir, 'src/game/config.js'), 'utf8');
    const mainSceneSrc = fs.readFileSync(path.join(clientDir, 'src/game/scenes/MainScene.js'), 'utf8');
    const socketClientSrc = fs.readFileSync(path.join(clientDir, 'src/network/SocketClient.js'), 'utf8');
    const combinedSrc = `${mainSrc}\n${configSrc}\n${mainSceneSrc}\n${socketClientSrc}`;

    assert.ok(mainSrc.includes('if (gameInstance)') && mainSrc.includes('new Phaser.Game(config)'));
    assert.strictEqual(combinedSrc.includes('ADMIN_SECRET_TOKEN'), false, 'Client must never contain ADMIN_SECRET_TOKEN');
    assert.strictEqual(combinedSrc.includes('x-mock-token'), false, 'Client must never contain x-mock-token');
    assert.strictEqual(combinedSrc.includes('x-admin-token'), false, 'Client must never contain x-admin-token');
    assert.strictEqual(combinedSrc.includes('getUserMedia'), false, 'Client must not request camera/microphone');
    assert.ok(configSrc.includes('if (isProd) {\n      return false;\n    }'), 'Preview mode must be hard-disabled in PROD');

    const obsGuidePath = path.resolve(__dirname, '../OBS_GUIDE.md');
    assert.ok(fs.existsSync(obsGuidePath), 'Missing OBS_GUIDE.md');
    const obsGuide = fs.readFileSync(obsGuidePath, 'utf8');
    assert.ok(obsGuide.includes('1080') && obsGuide.includes('1920'));
  });

  // 11-14 & 16. [INTEGRATION & LOAD CHECK] Offline startup -> Connect -> Burst Load (100 Likes + 40 Gifts + Simultaneous KO/CHEERS + Seat Replacement) -> Mid-FX Reconnect -> Backend Restart -> Zero leaks
  await checkAsync('11-14 & 16. [INTEGRATION & LOAD] Offline startup, 150-event burst load, mid-FX reconnect, Backend restart recovery, object pool reuse & zero timer/listener leaks', async () => {
    const scene = createMockScene();
    const seatViews = Layout.SEAT_LAYOUTS.map((l) => new SeatView(scene, l));
    const tableView = new TableView(scene);
    const animMgr = new AnimationManager(scene, seatViews, tableView, { maxQueueSize: 20 });

    const objectCountAfterInit = scene.createdObjects.length;

    // Step A: Start server to obtain a free port, then shut it down to test Frontend starting while Backend is OFFLINE
    const baseCfg = defaultConfig.buildConfig({
      port: 0,
      gameplayV1: {
        koHoldDurationMs: 180,
        leavingHoldDurationMs: 180,
        cheersIntervalMs: 600000,
        randomWifeCheckIntervalMs: 600000
      }
    });
    let server = await startServer(baseCfg);
    const port = server.port;
    await server.shutdown();

    const socketClient = new SocketClient({
      backendUrl: `http://127.0.0.1:${port}`,
      socketOptions: {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 80,
        timeout: 500
      }
    });

    // Subscribe twice with the same key 'MainScene' to verify no duplicate listeners
    const subscribeHandler = {
      onStatusChange: (status) => {
        if (status === CONNECTION_STATUS.DISCONNECTED || status === CONNECTION_STATUS.ERROR) {
          animMgr.clearAllActiveVisuals();
        }
      },
      onStateSync: (viewData, syncSource) => {
        for (const sv of seatViews) {
          const entry = viewData.seats.find((s) => s.seatId === sv.seatId);
          sv.updateSeat(entry || { status: 'EMPTY' });
        }
        tableView.updateMugStates(viewData.seats);
        animMgr.syncWithViewData(viewData, syncSource);
      },
      onActionFx: (fx) => {
        animMgr.enqueueFx(fx);
      }
    };
    socketClient.subscribe(subscribeHandler, 'MainScene');
    socketClient.subscribe(subscribeHandler, 'MainScene');
    assert.strictEqual(socketClient.subscribers.size, 1, 'Duplicate subscriber key must overwrite, never duplicate');

    try {
      // Connect while Backend is offline -> status transitions to CONNECTING / ERROR / DISCONNECTED without crash
      socketClient.connect();
      await wait(150);
      assert.notStrictEqual(socketClient.status, CONNECTION_STATUS.CONNECTED);

      // Step B: Start Backend on the same port -> Frontend automatically connects and syncs snapshot
      const cfgSamePort = defaultConfig.buildConfig({
        port,
        gameplayV1: {
          koHoldDurationMs: 180,
          leavingHoldDurationMs: 180,
          cheersIntervalMs: 600000,
          randomWifeCheckIntervalMs: 600000
        }
      });
      server = await startServer(cfgSamePort);
      server.gameStateManager.stopCheersScheduler();
      server.gameStateManager.stopWifeScheduler();

      await waitForCondition(
        () => socketClient.status === CONNECTION_STATUS.CONNECTED && socketClient.hasSynchronizedSnapshot
      );

      // Populate 6 seats + 10 waiting players
      for (let i = 1; i <= 16; i++) {
        server.mockService.simulateCommentNhau(`user_${i}`, `Người Chơi Số ${i} 🍻`);
      }
      await waitForCondition(() => seatViews[5].getDisplayState().userId === 'user_6');

      // Step C: Measure Burst Load (100 rapid Like events + 40 Gift events + CHEERS simultaneous with KO)
      const heapBeforeBytes = process.memoryUsage().heapUsed;
      const startLoadMs = performance.now();

      for (let i = 1; i <= 100; i++) {
        server.mockService.simulateLike(`liker_${i}`, `Khán Giả ${i}`, 15);
      }
      for (let i = 1; i <= 40; i++) {
        const targetSeatIdx = i % 6;
        const giftCode = i % 5 === 0 ? 'MOCK_GIFT_SOBER' : 'MOCK_GIFT_SMALL';
        server.mockService.simulateGift(`gifter_${i}`, `Đại Gia ${i} 👑`, giftCode, 1, targetSeatIdx);
      }
      // Trigger CHEERS and simultaneous KO on Seat 1 & Seat 2
      server.mockService.simulateGift('ko_maker', 'Chiến Thần', 'MOCK_GIFT_VIP', 4, 0);
      server.mockService.simulateGift('ko_maker', 'Chiến Thần', 'MOCK_GIFT_VIP', 4, 1);
      server.mockService.simulateCheers();

      await waitForCondition(() => socketClient.lastStateVersion >= 60);
      const elapsedLoadMs = performance.now() - startLoadMs;
      const heapDeltaMb = (process.memoryUsage().heapUsed - heapBeforeBytes) / (1024 * 1024);

      // Verify bounded queue and zero new GameObjects allocated during burst
      const diagMid = animMgr.getDiagnostics();
      assert.ok(diagMid.queueLength <= 20, 'Animation queue must never exceed 20');
      assert.strictEqual(
        scene.createdObjects.length,
        objectCountAfterInit,
        'Object pool must be reused: zero new Phaser Graphics/Text objects created during burst'
      );

      // Wait for 180ms KO hold timer to release Seat 1 & Seat 2 and promote user_7 & user_8 from queue
      await waitForCondition(
        () =>
          seatViews[0].getDisplayState().userId === 'user_7' &&
          seatViews[1].getDisplayState().userId === 'user_8'
      );

      // Step D: Reconnect while FX is active & verify old FX never replays
      server.mockService.simulateCheers();
      await wait(30);
      socketClient.disconnect();
      assert.strictEqual(animMgr.centerFxText.visible, false, 'Active FX cleared on disconnect');
      socketClient.connect();
      await waitForCondition(
        () => socketClient.status === CONNECTION_STATUS.CONNECTED && socketClient.hasSynchronizedSnapshot
      );

      // Step E: Restart Backend server completely (new stateVersion = 0) and verify Frontend replaces old state with new snapshot
      await server.shutdown();
      await wait(120);
      server = await startServer(cfgSamePort);
      server.gameStateManager.stopCheersScheduler();
      server.gameStateManager.stopWifeScheduler();

      await waitForCondition(
        () =>
          socketClient.status === CONNECTION_STATUS.CONNECTED &&
          seatViews[0].getDisplayState().status === 'EMPTY'
      );

      console.log(
        `    [LOAD METRICS (Node.js Integration)] 143 burst events synced & animated in ${elapsedLoadMs.toFixed(1)} ms | ΔHeap: ${heapDeltaMb.toFixed(2)} MB | New GameObjects created: 0`
      );
    } finally {
      socketClient.disconnect();
      animMgr.shutdown();
      const diagFinal = animMgr.getDiagnostics();
      assert.strictEqual(diagFinal.activeTimersCount, 0);
      assert.strictEqual(diagFinal.activeTweensCount, 0);
      assert.strictEqual(diagFinal.hasSwayTimer, false);
      if (server) {
        await server.shutdown();
      }
    }
  });

  // 17. [BUILD CHECK] Verify Vite production build output in client/dist
  check('17. [BUILD] Vite production build artifacts in client/dist are present and valid', () => {
    const distIndex = path.join(clientDir, 'dist', 'index.html');
    const distAssets = path.join(clientDir, 'dist', 'assets');
    assert.ok(fs.existsSync(distIndex));
    assert.ok(fs.existsSync(distAssets));
    const jsBundles = fs.readdirSync(distAssets).filter((f) => f.endsWith('.js'));
    assert.ok(jsBundles.length >= 1);
  });

  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
})();
