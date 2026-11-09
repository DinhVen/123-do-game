'use strict';

/**
 * TEST SUITE — PHASE 3 (TASK 3.5): SOUND MANAGER
 * Kiểm tra đầy đủ 14 kịch bản đơn vị & tích hợp E2E với Backend Socket.io thật:
 *  1. Sound Manager khởi tạo đúng
 *  2. Mute/unmute hoạt động
 *  3. Volume được giới hạn hợp lệ [0.0, 1.0]
 *  4. CHEERS phát đúng SFX
 *  5. KO phát đúng SFX
 *  6. WIFE_DRAG phát đúng SFX
 *  7. Gift / VIP / DRINK phát đúng SFX
 *  8. Không phát trùng khi nhận event trùng (eventId dedup, cooldown, state_patch)
 *  9. Không phát lại sau reconnect / snapshot
 * 10. Không crash & không văng UnhandledRejection khi audio bị khóa hoặc không hỗ trợ
 * 11. Không rò rỉ AudioContext hoặc audio instance khi burst sự kiện
 * 12. Cleanup đúng khi shutdown()
 * 13. Không thay đổi Game State
 * 14. Không ảnh hưởng AnimationManager (chạy song song E2E với Backend thật)
 */

const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');
const { createAppServer } = require('../server/index');
const config = require('../server/config');

function createMockAudioScene(options = {}) {
  const createdObjects = [];
  const addedSounds = [];
  let audioLocked = Boolean(options.locked);
  let audioCtxState = options.contextState || 'running';
  let resumeCalls = 0;

  const mockAudioContext = options.noAudioContext
    ? null
    : {
        get state() {
          if (audioLocked) return 'suspended';
          return audioCtxState;
        },
        currentTime: 0,
        destination: {},
        resume() {
          resumeCalls += 1;
          if (options.rejectResume) {
            return Promise.reject(new Error('Autoplay blocked by browser policy'));
          }
          audioCtxState = 'running';
          return Promise.resolve();
        },
        createOscillator() {
          return {
            type: 'sine',
            frequency: {
              setValueAtTime() {},
              exponentialRampToValueAtTime() {}
            },
            connect() {},
            disconnect() {},
            start() {},
            stop() {}
          };
        },
        createGain() {
          return {
            gain: {
              setValueAtTime() {},
              exponentialRampToValueAtTime() {}
            },
            connect() {},
            disconnect() {}
          };
        }
      };

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
      fillStyle() {
        return this;
      },
      lineStyle() {
        return this;
      },
      fillRect() {
        return this;
      },
      strokeRect() {
        return this;
      },
      fillRoundedRect() {
        return this;
      },
      strokeRoundedRect() {
        return this;
      },
      fillCircle() {
        return this;
      },
      strokeCircle() {
        return this;
      },
      fillEllipse() {
        return this;
      },
      strokeEllipse() {
        return this;
      },
      fillTriangle() {
        return this;
      },
      lineBetween() {
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
      setText(next) {
        this.text = String(next ?? '');
        return this;
      },
      setPosition(nx, ny) {
        this.x = nx;
        this.y = ny;
        return this;
      },
      setOrigin() {
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
      setAlpha() {
        return this;
      }
    };
    createdObjects.push(txt);
    return txt;
  };

  const listeners = new Map();

  return {
    createdObjects,
    addedSounds,
    getResumeCalls: () => resumeCalls,
    setAudioLocked(val) {
      audioLocked = Boolean(val);
    },
    setContextState(state) {
      audioCtxState = state;
    },
    cache: {
      audio: {
        exists(key) {
          return Boolean(options.loadedAssetKeys && options.loadedAssetKeys.includes(key));
        }
      }
    },
    sound: options.noPhaserSound
      ? null
      : {
          get locked() {
            return audioLocked;
          },
          mute: false,
          volume: 0.5,
          context: mockAudioContext,
          on(evt, cb) {
            listeners.set(evt, cb);
          },
          off(evt, cb) {
            if (listeners.get(evt) === cb) {
              listeners.delete(evt);
            }
          },
          emitUnlocked() {
            audioLocked = false;
            const cb = listeners.get('unlocked');
            if (cb) cb();
          },
          add(key, cfg = {}) {
            const inst = {
              key,
              volume: cfg.volume ?? 0.5,
              isPlaying: false,
              destroyed: false,
              playCount: 0,
              play(playCfg = {}) {
                if (playCfg.volume !== undefined) this.volume = playCfg.volume;
                this.isPlaying = true;
                this.playCount += 1;
              },
              stop() {
                this.isPlaying = false;
              },
              setVolume(v) {
                this.volume = v;
              },
              destroy() {
                this.destroyed = true;
                this.isPlaying = false;
              }
            };
            addedSounds.push(inst);
            return inst;
          }
        },
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

  let unhandledRejectionDetected = false;
  const onUnhandledRejection = (err) => {
    unhandledRejectionDetected = true;
    console.error('UnhandledRejection detected:', err);
  };
  process.on('unhandledRejection', onUnhandledRejection);

  const soundMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/audio/soundManager.js')).href
  );
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

  const { SoundManager, SFX_KEYS, SFX_CATALOG, clampVolume } = soundMod;
  const { SEAT_LAYOUTS } = layoutMod;
  const { SeatView } = seatMod;
  const { TableView } = tableMod;
  const { AnimationManager } = animMod;
  const { SocketClient } = socketMod;

  let fakeNow = 10000;
  const scene1 = createMockAudioScene();
  const sm = new SoundManager(scene1, {
    nowFn: () => fakeNow
  });

  // 1. Sound Manager khởi tạo đúng
  const assetStatus = sm.getAssetStatus();
  assert.strictEqual(sm.isMuted(), false);
  assert.strictEqual(sm.getVolume(), 0.5);
  assert.strictEqual(assetStatus.mode, 'PLACEHOLDER_SYNTH');
  assert.deepStrictEqual(
    Object.keys(SFX_CATALOG).sort(),
    ['CHEERS', 'DRINK', 'GIFT', 'KO', 'VIP', 'WIFE_DRAG']
  );
  record(
    '3.5.1',
    'Sound Manager khởi tạo đúng (volume mặc định 0.5, muted=false, đủ 6 SFX chuẩn)',
    true,
    `mode=${assetStatus.mode}, volume=${sm.getVolume()}`
  );

  // 2. Mute / unmute hoạt động
  sm.mute();
  assert.strictEqual(sm.isMuted(), true);
  assert.strictEqual(sm.playSfx(SFX_KEYS.CHEERS), false, 'Must not play while muted');
  assert.strictEqual(sm.stats.suppressedMuted, 1);
  sm.unmute();
  assert.strictEqual(sm.isMuted(), false);
  sm.toggleMute();
  assert.strictEqual(sm.isMuted(), true);
  sm.toggleMute();
  assert.strictEqual(sm.isMuted(), false);
  record('3.5.2', 'Mute / Unmute / ToggleMute hoạt động chính xác', true);

  // 3. Volume được giới hạn hợp lệ [0.0, 1.0]
  assert.strictEqual(sm.setVolume(-0.8), 0);
  assert.strictEqual(sm.playSfx(SFX_KEYS.CHEERS), false, 'Must not play when volume is 0');
  assert.strictEqual(sm.stats.suppressedZeroVolume, 1);
  assert.strictEqual(sm.setVolume(2.5), 1);
  assert.strictEqual(clampVolume(NaN), 0.5);
  assert.strictEqual(sm.setVolume(0.65), 0.65);
  record('3.5.3', 'Volume được giới hạn hợp lệ trong đoạn [0.0, 1.0]', true, `vol=${sm.getVolume()}`);

  // 4. CHEERS phát đúng SFX
  fakeNow += 500;
  const emptyCheersPlayed = sm.handleActionFx({
    eventId: 'evt_cheers_empty',
    actionType: 'CHEERS',
    stateVersion: 1,
    affectedSeats: []
  });
  assert.strictEqual(emptyCheersPlayed, false, 'Empty table CHEERS must not play SFX');

  const validCheersPlayed = sm.handleActionFx({
    eventId: 'evt_cheers_1',
    actionType: 'CHEERS',
    stateVersion: 2,
    affectedSeats: [{ seatId: 1, userId: 'u1', status: 'SEATED' }]
  });
  assert.strictEqual(validCheersPlayed, true);
  assert.strictEqual(sm.stats.playedByKey[SFX_KEYS.CHEERS], 1);
  record('3.5.4', 'Sự kiện CHEERS hợp lệ phát đúng SFX CHEERS', true);

  // 5. KO phát đúng SFX (đúng 1 lần cho mỗi người chơi gục trên ghế)
  fakeNow += 500;
  sm.stopAllActiveSounds();
  const koPlayed = sm.handleActionFx({
    eventId: 'evt_ko_1',
    actionType: 'KO',
    seatId: 1,
    userId: 'u1',
    koToken: 'ko_1',
    stateVersion: 3
  });
  assert.strictEqual(koPlayed, true);
  assert.strictEqual(sm.stats.playedByKey[SFX_KEYS.KO], 1);

  fakeNow += 500;
  const duplicateKoSameUser = sm.handleActionFx({
    eventId: 'evt_ko_2',
    actionType: 'KO',
    seatId: 1,
    userId: 'u1',
    koToken: 'ko_1',
    stateVersion: 3
  });
  assert.strictEqual(duplicateKoSameUser, false, 'Must not play KO twice for same occupant');
  record('3.5.5', 'Sự kiện KO phát đúng SFX KO duy nhất 1 lần cho mỗi lượt gục', true);

  // 6. WIFE_DRAG phát đúng SFX
  fakeNow += 500;
  sm.stopAllActiveSounds();
  const invalidWifePlayed = sm.handleActionFx({
    eventId: 'evt_wife_invalid',
    actionType: 'WIFE_DRAG',
    seatId: 2,
    userId: 'u2',
    targetValid: false,
    stateChanged: false,
    stateVersion: 3
  });
  assert.strictEqual(invalidWifePlayed, false, 'Invalid WIFE_DRAG target must not play SFX');

  const validWifePlayed = sm.handleActionFx({
    eventId: 'evt_wife_1',
    actionType: 'WIFE_DRAG',
    seatId: 2,
    userId: 'u2',
    targetValid: true,
    stateChanged: true,
    stateVersion: 4
  });
  assert.strictEqual(validWifePlayed, true);
  assert.strictEqual(sm.stats.playedByKey[SFX_KEYS.WIFE_DRAG], 1);
  record('3.5.6', 'Sự kiện WIFE_DRAG hợp lệ phát đúng SFX WIFE_DRAG', true);

  // 7. Gift / VIP / DRINK phát đúng SFX
  fakeNow += 500;
  sm.stopAllActiveSounds();
  const giftPlayed = sm.handleActionFx({
    eventId: 'evt_gift_1',
    actionType: 'DRINK_SMALL',
    actionCategory: 'DRUNK_INCREASE',
    targetValid: true,
    stateChanged: true,
    affectedSeats: [{ seatId: 3, userId: 'u3', status: 'SEATED' }],
    stateVersion: 5
  });
  assert.strictEqual(giftPlayed, true);
  assert.strictEqual(sm.stats.playedByKey[SFX_KEYS.GIFT], 1);

  fakeNow += 500;
  const vipPlayed = sm.handleActionFx({
    eventId: 'evt_vip_1',
    actionType: 'VIP_PASS',
    actionCategory: 'VIP_ACCESS',
    stateChanged: true,
    stateVersion: 6
  });
  assert.strictEqual(vipPlayed, true);
  assert.strictEqual(sm.stats.playedByKey[SFX_KEYS.VIP], 1);

  fakeNow += 500;
  const drinkPlayed = sm.handleActionFx({
    eventId: 'evt_like_1',
    actionType: 'LIKE_MILESTONE',
    stateChanged: true,
    affectedSeats: [{ seatId: 3, userId: 'u3', status: 'SEATED' }],
    stateVersion: 7
  });
  assert.strictEqual(drinkPlayed, true);
  assert.strictEqual(sm.stats.playedByKey[SFX_KEYS.DRINK], 1);
  record('3.5.7', 'Sự kiện Gift, VIP và Like/Drink phát đúng SFX tương ứng', true);

  // 8. Không phát trùng khi nhận event trùng hoặc trong thời gian cooldown chống chói
  fakeNow += 500;
  sm.stopAllActiveSounds();
  const firstGift = sm.handleActionFx({
    eventId: 'evt_dup_99',
    actionType: 'DRINK_SMALL',
    actionCategory: 'DRUNK_INCREASE',
    targetValid: true,
    stateChanged: true,
    stateVersion: 8
  });
  const secondSameEventId = sm.handleActionFx({
    eventId: 'evt_dup_99',
    actionType: 'DRINK_SMALL',
    actionCategory: 'DRUNK_INCREASE',
    targetValid: true,
    stateChanged: true,
    stateVersion: 8
  });
  assert.strictEqual(firstGift, true);
  assert.strictEqual(secondSameEventId, false, 'Duplicate eventId must be suppressed');

  // Cooldown check (attempt another GIFT 10ms later -> suppressed by minIntervalMs=90ms)
  fakeNow += 10;
  const burstCooldownBlocked = sm.handleActionFx({
    eventId: 'evt_dup_100',
    actionType: 'DRINK_SMALL',
    actionCategory: 'DRUNK_INCREASE',
    targetValid: true,
    stateChanged: true,
    stateVersion: 9
  });
  assert.strictEqual(burstCooldownBlocked, false, 'Burst within minIntervalMs must be suppressed');
  record(
    '3.5.8',
    'Chống phát trùng theo eventId và chặn chồng âm thanh gây chói bằng cooldown',
    true,
    `suppressedDup=${sm.stats.suppressedDuplicateEvent}, suppressedCooldown=${sm.stats.suppressedCooldown}`
  );

  // 9. Không phát lại sau reconnect / snapshot
  fakeNow += 500;
  const playedTotalBeforeReconnect = sm.stats.playedTotal;
  sm.syncWithViewData(
    {
      stateVersion: 20,
      seats: [
        { seatId: 1, userId: 'u_ko_snap', status: 'KO', drunkLevel: 100 },
        { seatId: 2, userId: 'u_leave_snap', status: 'LEAVING', drunkLevel: 40 }
      ]
    },
    'SNAPSHOT'
  );
  assert.strictEqual(
    sm.stats.playedTotal,
    playedTotalBeforeReconnect,
    'syncWithViewData(SNAPSHOT) must never trigger SFX'
  );

  // Stale event from before snapshot version 20 must be ignored
  const staleFxAfterReconnect = sm.handleActionFx({
    eventId: 'evt_stale_15',
    actionType: 'CHEERS',
    stateVersion: 15,
    affectedSeats: [{ seatId: 3, userId: 'u3', status: 'SEATED' }]
  });
  assert.strictEqual(staleFxAfterReconnect, false, 'Stale stateVersion FX must be ignored');

  // Replayed KO FX for player already KO in snapshot must be ignored
  const replayKoFromSnap = sm.handleActionFx({
    eventId: 'evt_ko_snap_replay',
    actionType: 'KO',
    seatId: 1,
    userId: 'u_ko_snap',
    stateVersion: 20
  });
  assert.strictEqual(replayKoFromSnap, false, 'Already-KO player in snapshot must not replay KO SFX');
  record('3.5.9', 'Không phát lại âm thanh cũ sau khi reconnect / nhận Snapshot', true);

  // 10. Không crash khi audio bị khóa (Autoplay blocked) hoặc thiết bị không có âm thanh
  const lockedScene = createMockAudioScene({
    locked: false,
    contextState: 'suspended',
    rejectResume: true
  });
  const lockedSm = new SoundManager(lockedScene, { nowFn: () => fakeNow });
  const lockedResult = lockedSm.playSfx(SFX_KEYS.CHEERS);
  assert.strictEqual(lockedResult, false);
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(
    unhandledRejectionDetected,
    false,
    'Rejected AudioContext.resume() must be caught safely without UnhandledRejection'
  );

  const noAudioScene = createMockAudioScene({ noPhaserSound: true, noAudioContext: true });
  const noAudioSm = new SoundManager(noAudioScene, { nowFn: () => fakeNow });
  assert.strictEqual(noAudioSm.playSfx(SFX_KEYS.CHEERS), false);
  lockedSm.shutdown();
  noAudioSm.shutdown();
  record(
    '3.5.10',
    'Không crash và không lỗi UnhandledRejection khi trình duyệt khóa Autoplay hoặc thiếu thiết bị audio',
    true
  );

  // 11. Không rò rỉ AudioContext hoặc Phaser sound instance khi burst 60 sự kiện
  const pooledScene = createMockAudioScene({
    loadedAssetKeys: [
      'sfx_cheers',
      'sfx_drink',
      'sfx_ko',
      'sfx_wife_drag',
      'sfx_gift',
      'sfx_vip'
    ]
  });
  const pooledSm = new SoundManager(pooledScene, {
    nowFn: () => fakeNow,
    maxConcurrentSounds: 4
  });

  const allKeys = Object.values(SFX_KEYS);
  for (let i = 0; i < 60; i += 1) {
    fakeNow += 300;
    pooledSm.stopAllActiveSounds();
    pooledSm.playSfx(allKeys[i % allKeys.length]);
  }
  const diagBeforeShutdown = pooledSm.getDiagnostics();
  assert.ok(
    pooledScene.addedSounds.length <= 6,
    `Phaser sound instances must be pooled (<= 6), got ${pooledScene.addedSounds.length}`
  );
  assert.strictEqual(diagBeforeShutdown.stats.audioContextCreatedCount, 0);
  record(
    '3.5.11',
    'Không rò rỉ audio instance khi phát lặp 60 lần (tái sử dụng đúng 6 Phaser Sound trong pool)',
    true,
    `pooledInstances=${pooledScene.addedSounds.length}`
  );

  // 12. Cleanup đúng khi shutdown()
  pooledSm.shutdown();
  const diagAfterShutdown = pooledSm.getDiagnostics();
  assert.strictEqual(diagAfterShutdown.activeVoicesCount, 0);
  assert.strictEqual(diagAfterShutdown.activeTimersCount, 0);
  assert.strictEqual(diagAfterShutdown.pooledPhaserSoundsCount, 0);
  assert.ok(
    pooledScene.addedSounds.every((inst) => inst.destroyed === true),
    'All pooled Phaser sound instances must be destroyed on shutdown'
  );
  assert.strictEqual(pooledSm.playSfx(SFX_KEYS.CHEERS), false, 'Must not play after shutdown');
  sm.shutdown();
  record('3.5.12', 'Cleanup sạch sẽ toàn bộ timer, activeVoices và sound pool khi shutdown()', true);

  // 13 & 14. Không thay đổi Game State & Không ảnh hưởng AnimationManager (Tích hợp Backend thật)
  const testConfig = JSON.parse(JSON.stringify(config));
  testConfig.server.port = 0;
  const appInstance = createAppServer(testConfig);
  const { httpServer, gameStateManager, mockService } = appInstance;
  gameStateManager.stopCheersScheduler();
  gameStateManager.stopWifeScheduler();

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const backendUrl = `http://127.0.0.1:${address.port}`;

  const e2eScene = createMockAudioScene();
  const tableView = new TableView(e2eScene);
  const seatViews = new Map();
  SEAT_LAYOUTS.forEach((layout) => {
    seatViews.set(layout.seatId, new SeatView(e2eScene, layout));
  });
  const animManager = new AnimationManager(e2eScene, seatViews, tableView, {
    fxDurationMs: 80,
    holdFxDurationMs: 120
  });
  animManager.stopDrunkSwayLoop();

  let e2eClock = 50000;
  const e2eSound = new SoundManager(e2eScene, {
    nowFn: () => {
      e2eClock += 300;
      return e2eClock;
    }
  });

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
            const snapshotBefore = JSON.stringify(viewData);
            SEAT_LAYOUTS.forEach((layout) => {
              const sv = seatViews.get(layout.seatId);
              const entry = (viewData.seats || []).find((s) => s.seatId === layout.seatId) || null;
              if (entry) sv.updateSeat(entry);
              else sv.clearSeat();
            });
            tableView.updateMugStates(viewData.seats || []);
            animManager.syncWithViewData(viewData, syncSource);
            e2eSound.syncWithViewData(viewData, syncSource);
            const snapshotAfter = JSON.stringify(viewData);
            assert.strictEqual(
              snapshotBefore,
              snapshotAfter,
              'SoundManager.syncWithViewData must NEVER mutate viewData'
            );
            if (syncSource === 'SNAPSHOT') {
              clearTimeout(timeout);
              resolve();
            }
          },
          onActionFx: (fx) => {
            const fxBefore = JSON.stringify(fx);
            animManager.enqueueFx(fx);
            e2eSound.handleActionFx(fx);
            const fxAfter = JSON.stringify(fx);
            assert.strictEqual(fxBefore, fxAfter, 'SoundManager.handleActionFx must NEVER mutate fx');
          }
        },
        'Test35E2E'
      );
      socketClient.connect();
    });

    const waitMs = (ms = 60) => new Promise((r) => setTimeout(r, ms));

    mockService.simulateCommentNhau('u1', 'Khách 1');
    mockService.simulateCommentDo('u2', 'Khách 2');
    await waitMs();

    const stateBeforeFx = JSON.stringify(gameStateManager.getSnapshot());
    mockService.simulateCheers();
    await waitMs();
    mockService.simulateGift('vip_1', 'Đại Gia', 'MOCK_GIFT_VIP_PASS', 1, null);
    await waitMs();
    mockService.simulateGift('donor_1', 'Bạn Nhậu', 'MOCK_GIFT_SMALL', 1, 0);
    await waitMs();
    mockService.simulateGift('wife_1', 'Nóc Nhà', 'MOCK_GIFT_WIFE', 1, 1);
    await waitMs();

    assert.strictEqual(e2eSound.stats.playedByKey[SFX_KEYS.CHEERS], 1);
    assert.strictEqual(e2eSound.stats.playedByKey[SFX_KEYS.VIP], 1);
    assert.strictEqual(e2eSound.stats.playedByKey[SFX_KEYS.GIFT], 1);
    assert.strictEqual(e2eSound.stats.playedByKey[SFX_KEYS.WIFE_DRAG], 1);
    assert.ok(animManager.stats.cheersPlayed >= 1, 'AnimationManager must still play CHEERS FX');
    assert.ok(animManager.stats.giftPlayed >= 1, 'AnimationManager must still play GIFT FX');
    assert.ok(animManager.stats.leavingPlayed >= 1, 'AnimationManager must still play WIFE_DRAG FX');

    // Verify SoundManager alone does not mutate Backend Game State
    const snapBeforeDirectCall = JSON.stringify(gameStateManager.getSnapshot());
    e2eSound.playSfx(SFX_KEYS.KO);
    const snapAfterDirectCall = JSON.stringify(gameStateManager.getSnapshot());
    assert.strictEqual(snapBeforeDirectCall, snapAfterDirectCall);

    record('3.5.13', 'SoundManager hoàn toàn chỉ đọc, tuyệt đối không làm thay đổi Game State', true);
    record(
      '3.5.14',
      'Tích hợp E2E Backend Socket.io -> SocketClient -> AnimationManager + SoundManager hoạt động đồng bộ, không xung đột',
      true,
      `soundPlayed=${e2eSound.stats.playedTotal}, animPlayed=${animManager.stats.played}`
    );
  } finally {
    socketClient.disconnect();
    e2eSound.shutdown();
    animManager.shutdown();
    gameStateManager.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
    process.off('unhandledRejection', onUnhandledRejection);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n=== SUMMARY PHASE 3 (TASK 3.5 — SOUND MANAGER): ${results.length - failed.length}/${results.length} PASSED ===`
  );
  if (failed.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test 3.5 failed with error:', err);
  process.exit(1);
});
