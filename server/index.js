'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');

const defaultConfig = require('./config');
const logger = require('./logger');
const { MockService } = require('./services/mockService');
const { TikTokService } = require('./services/tiktokService');
const { GameStateManager } = require('./services/gameStateManager');
const { SnapshotStore, DEFAULT_V2_SNAPSHOT_PATH } = require('./services/snapshotStore');
const { SequentialEventQueue } = require('./engines/eventQueue');
const { registerSocketHandlers, isLocalAddress } = require('./socket/socketHandler');

function createOriginValidator(allowedOrigins, env) {
  const allowedSet = new Set(allowedOrigins);
  return function validateOrigin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedSet.has(origin)) {
      return callback(null, true);
    }
    if (env === 'development' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS policy'));
  };
}

function createMockAuthMiddleware(config) {
  return function mockAuthGuard(req, res, next) {
    const remoteIp = req.ip || (req.socket && req.socket.remoteAddress) || '';
    const headerToken = req.headers['x-admin-token'] || '';

    if (config.adminToken && config.adminToken.length > 0) {
      if (headerToken === config.adminToken) {
        return next();
      }
      return res.status(403).json({ ok: false, error: 'Forbidden: Invalid admin token.' });
    }

    if (isLocalAddress(remoteIp)) {
      return next();
    }

    return res.status(403).json({
      ok: false,
      error: 'Forbidden: Mock Simulator is restricted to localhost.'
    });
  };
}

function createAppServer(config = defaultConfig, options = {}) {
  const app = express();
  const originValidator = createOriginValidator(config.server.corsOrigins, config.env);

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: originValidator,
      methods: ['GET', 'POST']
    })
  );
  app.use(express.json({ limit: '5mb' }));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: originValidator,
      methods: ['GET', 'POST']
    }
  });

  function buildBannerNoticeFromGameplayEvent(gameplayEvent) {
    if (!gameplayEvent || (!gameplayEvent.actionType && !gameplayEvent.actionCategory)) return null;
    const actionType = gameplayEvent.actionType || gameplayEvent.actionCategory;
    const category = gameplayEvent.actionCategory || actionType;
    const firstSeat =
      Array.isArray(gameplayEvent.affectedSeats) && gameplayEvent.affectedSeats.length > 0
        ? gameplayEvent.affectedSeats[0]
        : null;
    const targetSeatId =
      gameplayEvent.targetSeatId ||
      gameplayEvent.seatId ||
      (firstSeat && firstSeat.seatId) ||
      null;

    const base = {
      eventId: gameplayEvent.eventId
        ? `banner_${gameplayEvent.eventId}_${actionType}_${targetSeatId || 'all'}`
        : `banner_${Date.now()}`,
      sourceEventId: gameplayEvent.eventId || null,
      stateVersion: gameplayEvent.stateVersion || 0,
      actionType,
      actionCategory: category,
      timestamp: gameplayEvent.timestamp || Date.now()
    };

    if (actionType === 'CHEERS') {
      const count = Array.isArray(gameplayEvent.affectedSeats) ? gameplayEvent.affectedSeats.length : 0;
      return {
        ...base,
        level: 'info',
        title: '1, 2, 3 DÔ!',
        message: `1, 2, 3 DÔ! Cả bàn nâng ly (+${gameplayEvent.drunkDelta || 5}% độ say cho ${count} ghế)`
      };
    }
    if (actionType === 'LIKE_MILESTONE') {
      return {
        ...base,
        level: 'info',
        title: 'BÃO LIKE!',
        message: `Mốc ${gameplayEvent.milestonesReached || 1}x100 Like! Cả bàn +${gameplayEvent.drunkDelta || 1}% độ say`
      };
    }
    if (category === 'DRUNK_INCREASE' || actionType.startsWith('DRINK_')) {
      if (gameplayEvent.targetValid === false) {
        return {
          ...base,
          level: 'info',
          title: 'GIFT KHÔNG HỢP LỆ',
          message: '🎁 Gift mời rượu: Mục tiêu không hợp lệ (giữ nguyên độ say)'
        };
      }
      const delta = gameplayEvent.drunkDeltaApplied ?? gameplayEvent.appliedDrunkDelta ?? 0;
      const senderNick =
        (gameplayEvent.sender && gameplayEvent.sender.displayNickname) ||
        gameplayEvent.senderNickname ||
        null;
      const seatLabel =
        actionType === 'DRINK_ALL' ? 'Cả bàn' : `Ghế #${targetSeatId || '?'}`;
      return {
        ...base,
        level: 'warning',
        title: actionType === 'DRINK_ALL' ? 'ĐẠI GIA BAO BÀN!' : 'TẶNG RƯỢU!',
        message:
          actionType === 'DRINK_ALL'
            ? `🍻 ${senderNick ? `${senderNick} bao cả bàn` : 'Cả bàn nhận quà rượu'} (+${delta}% độ say)!`
            : `🍺 ${senderNick ? `${senderNick} ép bia ` : ''}${seatLabel} (+${delta}% độ say)`
      };
    }
    if (category === 'DRUNK_DECREASE' || actionType === 'SOBER_UP') {
      if (gameplayEvent.targetValid === false) {
        return {
          ...base,
          level: 'info',
          title: 'GIFT KHÔNG HỢP LỆ',
          message: '🍋 Gift giải say: Mục tiêu không hợp lệ (không hồi sinh KO)'
        };
      }
      const delta = gameplayEvent.drunkDeltaApplied ?? gameplayEvent.appliedDrunkDelta ?? 0;
      const senderNick =
        (gameplayEvent.sender && gameplayEvent.sender.displayNickname) ||
        gameplayEvent.senderNickname ||
        null;
      return {
        ...base,
        level: 'success',
        title: 'GỌI THÊM MỒI GIẢI SAY!',
        message: `🦑 ${senderNick ? `${senderNick} gọi thêm Mồi Nhậu cho ` : ''}Ghế #${targetSeatId || '?'} (${delta}% độ say)`
      };
    }
    if (category === 'VIP_ACCESS' || actionType === 'VIP_PASS') {
      const nick =
        (gameplayEvent.sender && gameplayEvent.sender.displayNickname) ||
        gameplayEvent.senderNickname ||
        'Khách VIP';
      const soberDelta = gameplayEvent.drunkDeltaApplied ? ` (${gameplayEvent.drunkDeltaApplied}% độ say)` : '';
      return {
        ...base,
        level: 'success',
        title: 'VIP NHẬP TIỆC!',
        message: `👑 ${nick} kích hoạt Thẻ VIP Đại Gia ★${soberDelta}!`
      };
    }
    if (actionType === 'KO') {
      return {
        ...base,
        level: 'danger',
        title: 'GỤC TẠI BÀN!',
        message: `💥 Ghế #${targetSeatId || '?'} đã gục tại bàn (100% độ say)!`
      };
    }
    if (actionType === 'KO_RELEASED') {
      return {
        ...base,
        level: 'info',
        title: 'ĐỔI KHÁCH!',
        message: `🔄 Ghế #${targetSeatId || '?'} đã giải phóng chỗ ngồi`
      };
    }
    if (actionType === 'WIFE_DRAG') {
      return {
        ...base,
        level: 'danger',
        title: 'NÓC NHÀ GỌI!',
        message: `🧹 Biến căng! Nóc nhà xuất hiện xách tai ghế #${targetSeatId || '?'} về!`
      };
    }
    if (actionType === 'WIFE_RELEASED') {
      return {
        ...base,
        level: 'info',
        title: 'RỜI BÀN!',
        message: `🔄 Ghế #${targetSeatId || '?'} đã về nhà cùng Nóc Nhà`
      };
    }
    if (actionType === 'SWITCH_TABLE') {
      return {
        ...base,
        level: 'info',
        title: 'CHUYỂN BÀN!',
        message: `🚶 ${gameplayEvent.displayNickname || 'Khách nhậu'} chuyển sang ${gameplayEvent.tableLabel || gameplayEvent.tableId} (Ghế #${targetSeatId || '?'})`
      };
    }
    if (actionType === 'SWITCH_TABLE_REJECTED') {
      const reasonMsg =
        gameplayEvent.reason === 'VIP_REQUIRED'
          ? 'Cần tặng quà >= 10 xu hoặc thuộc Top 3 BXH để ngồi BÀN VIP!'
          : `${gameplayEvent.targetTableId === 'TABLE_VIP' ? 'BÀN VIP' : 'Bàn đích'} đã đủ 4/4 người!`;
      return {
        ...base,
        level: 'warning',
        title: 'KHÔNG THỂ ĐỔI BÀN',
        message: `⚠️ ${gameplayEvent.displayNickname || 'Khách'}: ${reasonMsg}`
      };
    }
    if (actionType === 'DRINK_BEER' || actionType === 'TABLE_CHEERS') {
      return {
        ...base,
        level: 'info',
        title: actionType === 'TABLE_CHEERS' ? 'NÂNG LY DÔ!' : 'THƯỞNG THỨC BIA!',
        message: `🍻 ${gameplayEvent.displayNickname || 'Khách'} (Ghế #${targetSeatId || '?'}) nâng ly #${gameplayEvent.beerCount || 1}!`
      };
    }
    if (category === 'MENU_SNACK') {
      const senderNick =
        (gameplayEvent.sender && gameplayEvent.sender.displayNickname) || 'Đại gia';
      const dishLabel = gameplayEvent.dishLabel || 'Mồi ngon';
      return {
        ...base,
        level: 'success',
        title: actionType === 'ORDER_SNACK_ALL' ? 'MỜI CẢ QUÁN!' : 'GỌI MỒI THỰC ĐƠN!',
        message:
          actionType === 'ORDER_SNACK_ALL'
            ? `🍲 ${senderNick} chiêu đãi CẢ QUÁN mỗi bàn 1 đĩa Bò nướng (+${gameplayEvent.snackPointsAdded || 25} món)!`
            : `${gameplayEvent.dishIcon || '🦑'} ${senderNick} gọi ${dishLabel} (+${gameplayEvent.snackPointsAdded || 1} món)!`
      };
    }

    return {
      ...base,
      level: 'info',
      title: 'SỰ KIỆN BÀN NHẬU',
      message: `✨ Sự kiện ${actionType}`
    };
  }

  const snapshotOpts = (options && options.snapshotOptions) || {};
  const persistenceEnabled = Boolean(
    options.snapshotStore ||
      options.enableSnapshotPersistence ||
      snapshotOpts.enabled
  );
  const snapshotStore =
    options.snapshotStore ||
    new SnapshotStore({
      ...(snapshotOpts || {})
    });

  const gameStateManager = new GameStateManager(
    config,
    (snapshot, eventId) => {
      if (persistenceEnabled) {
        snapshotStore.scheduleSave(snapshot);
      }
      io.emit('game:state_patch', {
        eventId,
        layoutVersion: snapshot.layoutVersion,
        maxSeats: snapshot.maxSeats,
        stateVersion: snapshot.stateVersion,
        updatedAt: snapshot.updatedAt,
        tables: snapshot.tables,
        seats: snapshot.seats,
        seatedPlayers: snapshot.seatedPlayers,
        leaderboard: snapshot.leaderboard,
        leaderboards: snapshot.leaderboards,
        leaderboardStats: snapshot.leaderboardStats,
        hostConfig: snapshot.hostConfig,
        vipQueue: snapshot.vipQueue,
        normalQueue: snapshot.normalQueue,
        totalWaiting: snapshot.totalWaiting,
        waitingQueue: snapshot.waitingQueue,
        likeMetrics: snapshot.likeMetrics,
        cheersConfig: snapshot.cheersConfig,
        wifeConfig: snapshot.wifeConfig
      });
      io.emit('game:state_snapshot', {
        stateVersion: snapshot.stateVersion,
        state: snapshot
      });
    },
    (gameplayEvent) => {
      io.emit('game:action_fx', gameplayEvent);
      const bannerNotice = buildBannerNoticeFromGameplayEvent(gameplayEvent);
      if (bannerNotice) {
        io.emit('game:banner_notice', bannerNotice);
      }
    },
    (chatBubble) => {
      io.emit('game:chat_bubble', chatBubble);
    }
  );

  let initialRecoveryResult = null;
  if (persistenceEnabled && snapshotOpts.autoRestore !== false) {
    initialRecoveryResult = snapshotStore.loadAndRestore(gameStateManager);
  }

  const eventQueue = new SequentialEventQueue((normalizedEvent) =>
    gameStateManager.processEvent(normalizedEvent)
  );
  gameStateManager.setEventDispatcher((internalEvent) => eventQueue.enqueue(internalEvent));
  gameStateManager.startCheersScheduler();
  gameStateManager.startWifeScheduler();

  const mockService = new MockService(config, io, eventQueue, gameStateManager);
  const tiktokService = new TikTokService(
    config,
    io,
    eventQueue,
    gameStateManager,
    options.tiktokOptions || {}
  );
  registerSocketHandlers(io, mockService, config, gameStateManager);

  const mockAuthGuard = createMockAuthMiddleware(config);

  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: '1-2-3-do-backend',
      masterPlanVersion: config.app.masterPlanVersion,
      phase: config.app.phase,
      mode: config.app.defaultMode,
      stateVersion: gameStateManager.stateVersion,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: Date.now()
    });
  });

  app.get('/api/state', (req, res) => {
    const snapshot = gameStateManager.getSnapshot();
    res.status(200).json({
      ok: true,
      stateVersion: snapshot.stateVersion,
      state: snapshot
    });
  });

  const mockDashboardIndex = path.resolve(__dirname, '..', 'mock-dashboard', 'index.html');
  app.get(['/mock', '/control', '/live/control.html'], mockAuthGuard, (req, res) => {
    res.sendFile(mockDashboardIndex);
  });

  app.get('/api/control/status', mockAuthGuard, (req, res) => {
    res.status(200).json({
      ok: true,
      mode: gameStateManager.mode || config.app.defaultMode,
      tiktok: tiktokService.getStatus(),
      state: gameStateManager.getSnapshot()
    });
  });

  app.post('/api/control/tiktok/connect', mockAuthGuard, async (req, res) => {
    try {
      const rawUniqueId = req.body && typeof req.body.uniqueId === 'string' ? req.body.uniqueId : '';
      const cleanUniqueId = rawUniqueId.trim().replace(/^@+/, '');
      if (!cleanUniqueId) {
        return res.status(400).json({
          ok: false,
          error: 'Vui lòng nhập Username kênh đang live (ví dụ: @tenkenhcuaban).'
        });
      }

      await tiktokService.disconnect();
      gameStateManager.autoResolveTikTokGifts = true;
      gameStateManager.mode = 'LIVE';
      gameStateManager._bumpStateVersion('evt_switch_live');

      const connectResult = await tiktokService.connect(cleanUniqueId);
      const currentStatus = tiktokService.getStatus();
      io.emit('tiktok:status', currentStatus);

      return res.status(200).json({
        ok: Boolean(connectResult && connectResult.ok),
        connectResult,
        tiktok: currentStatus,
        state: gameStateManager.getSnapshot()
      });
    } catch (err) {
      logger.error('Failed to handle /api/control/tiktok/connect', {
        error: err ? err.message : 'Unknown error'
      });
      return res.status(500).json({
        ok: false,
        error: err ? err.message : 'Lỗi kết nối TikTok Live.'
      });
    }
  });

  app.post('/api/control/tiktok/disconnect', mockAuthGuard, async (req, res) => {
    try {
      await tiktokService.disconnect();
      gameStateManager.mode = 'MOCK';
      gameStateManager.connectionStatus = 'CONNECTED';
      gameStateManager._bumpStateVersion('evt_switch_mock');

      const currentStatus = tiktokService.getStatus();
      io.emit('tiktok:status', currentStatus);

      return res.status(200).json({
        ok: true,
        tiktok: currentStatus,
        state: gameStateManager.getSnapshot()
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err ? err.message : 'Lỗi ngắt kết nối TikTok Live.'
      });
    }
  });

  app.post('/api/control/reset-table', mockAuthGuard, (req, res) => {
    for (let seatId = 1; seatId <= gameStateManager.maxSeats; seatId += 1) {
      gameStateManager.releaseSeatBySeatId(seatId, `evt_reset_seat_${seatId}_${Date.now()}`);
    }
    gameStateManager.vipQueue = [];
    gameStateManager.normalQueue = [];
    if (gameStateManager.tableSnacks && typeof gameStateManager.tableSnacks.clear === 'function') {
      gameStateManager.tableSnacks.clear();
    }
    const snapshot = gameStateManager._bumpStateVersion(`evt_reset_table_${Date.now()}`);
    return res.status(200).json({
      ok: true,
      stateVersion: snapshot.stateVersion,
      state: snapshot
    });
  });

  app.post('/api/control/host-config', mockAuthGuard, (req, res) => {
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const hostConfig = gameStateManager.setHostConfig(patch);
    const snapshot = gameStateManager.getSnapshot();
    return res.status(200).json({
      ok: true,
      hostConfig,
      stateVersion: snapshot.stateVersion,
      state: snapshot
    });
  });

  app.get('/api/mock/events', mockAuthGuard, (req, res) => {
    res.status(200).json({
      ok: true,
      events: mockService.getRecentEvents(),
      mockGifts: config.mockSimulator.mockGifts,
      state: gameStateManager.getSnapshot()
    });
  });

  app.post('/api/mock/events', mockAuthGuard, (req, res) => {
    const result = mockService.processMockEvent(req.body);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  });

  // Serve Frontend Production Build (client/dist) when available so Streamer/OBS can open http://127.0.0.1:3000/ directly
  const clientDistDir =
    (options && options.clientDistDir) || path.resolve(__dirname, '..', 'client', 'dist');
  const clientDistIndex = path.join(clientDistDir, 'index.html');
  app.use(express.static(clientDistDir, { index: false }));
  app.get(['/', '/index.html', '/overlay', '/live/overlay.html'], (req, res, next) => {
    if (fs.existsSync(clientDistIndex)) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.sendFile(clientDistIndex);
    }
    return next();
  });

  app.use((err, req, res, next) => {
    if (err && err.message === 'Origin not allowed by CORS policy') {
      return res.status(403).json({ ok: false, error: err.message });
    }
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ ok: false, error: 'Malformed JSON body.' });
    }
    logger.error('HTTP request error', { error: err ? err.message : 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Internal server error.' });
  });

  let isShuttingDown = false;
  let isEmergencyShuttingDown = false;
  let emergencyShutdownResult = null;
  const defaultExitFn =
    options && typeof options.exitFn === 'function'
      ? options.exitFn
      : (code) => process.exit(code);

  function emergencyShutdown(fatalType = 'uncaughtException', errOrReason = null, execOptions = {}) {
    if (isEmergencyShuttingDown) {
      return emergencyShutdownResult;
    }
    isEmergencyShuttingDown = true;
    isShuttingDown = true;

    const rawMsg =
      errOrReason instanceof Error
        ? errOrReason.message
        : typeof errOrReason === 'string'
          ? errOrReason
          : String(errOrReason || 'Unknown fatal error');
    const safeMessage = logger.redactString ? logger.redactString(rawMsg) : rawMsg;
    const rawStack =
      errOrReason instanceof Error && typeof errOrReason.stack === 'string'
        ? errOrReason.stack
        : undefined;
    const safeStack = rawStack && logger.redactString ? logger.redactString(rawStack) : rawStack;

    // 1. Log redacted fatal cause
    logger.error(`Fatal ${fatalType} - initiating emergency shutdown`, {
      fatalType,
      error: safeMessage,
      ...(safeStack ? { stack: safeStack } : {})
    });

    // 2. Stop accepting new TikTok events, stop event queue & gameplay timers synchronously
    try {
      eventQueue.stop();
    } catch (_) {}
    try {
      gameStateManager.shutdown();
    } catch (_) {}
    try {
      tiktokService.shutdown().catch(() => {});
    } catch (_) {}

    // 3. Synchronously & atomically save emergency snapshot if state is valid
    let snapshotResult = null;
    if (persistenceEnabled || execOptions.forceSnapshot) {
      try {
        snapshotResult = snapshotStore.saveEmergencySnapshotSync(gameStateManager);
        if (!snapshotResult.ok && !snapshotResult.skippedCorruptedState) {
          logger.error('Emergency snapshot write failed during fatal shutdown', {
            fatalType,
            error: logger.redactString
              ? logger.redactString(snapshotResult.error || 'Unknown write error')
              : snapshotResult.error
          });
        }
      } catch (snapErr) {
        logger.error('Unexpected error during emergency snapshot save', {
          fatalType,
          error: logger.redactString ? logger.redactString(snapErr.message) : snapErr.message
        });
        snapshotResult = { ok: false, error: snapErr.message };
      }
    } else {
      snapshotStore.cancelPendingTimer();
    }

    // 4. Release network resources without hanging and exit with code 1
    try {
      io.close();
    } catch (_) {}
    try {
      if (httpServer.listening) {
        httpServer.close();
      }
    } catch (_) {}

    const exitToCall =
      typeof execOptions.exitFn === 'function' ? execOptions.exitFn : defaultExitFn;

    emergencyShutdownResult = {
      ok: true,
      fatalType,
      error: safeMessage,
      snapshotResult,
      exitCode: 1
    };

    exitToCall(1);
    return emergencyShutdownResult;
  }

  function shutdown() {
    if (isShuttingDown) {
      return Promise.resolve();
    }
    isShuttingDown = true;
    logger.info('Shutting down backend server...');
    eventQueue.stop();
    gameStateManager.shutdown();
    if (persistenceEnabled) {
      snapshotStore.shutdown();
    } else {
      snapshotStore.cancelPendingTimer();
    }
    return tiktokService
      .shutdown()
      .catch(() => {})
      .then(
        () =>
          new Promise((resolve) => {
            io.close(() => {
              if (!httpServer.listening) {
                logger.info('Backend server stopped.');
                return resolve();
              }
              httpServer.close(() => {
                logger.info('Backend server stopped.');
                resolve();
              });
            });
          })
      );
  }

  const instance = {
    app,
    httpServer,
    io,
    mockService,
    tiktokService,
    gameStateManager,
    snapshotStore,
    initialRecoveryResult,
    eventQueue,
    config,
    shutdown,
    emergencyShutdown
  };

  if (options && options.registerProcessErrorHandlers) {
    registerGlobalErrorHandlers({
      processObj: options.processObj || process,
      instance,
      exitFn: defaultExitFn
    });
  }

  return instance;
}

const globalHandlerRegistry = new WeakMap();

function registerGlobalErrorHandlers(options = {}) {
  const proc = options.processObj || process;
  let entry = globalHandlerRegistry.get(proc);

  if (entry) {
    if (options.getInstance !== undefined) entry.getInstance = options.getInstance;
    if (options.instance !== undefined) entry.instance = options.instance;
    if (options.exitFn !== undefined) entry.exitFn = options.exitFn;
    return entry.handle;
  }

  entry = {
    proc,
    getInstance: typeof options.getInstance === 'function' ? options.getInstance : null,
    instance: options.instance || null,
    exitFn: typeof options.exitFn === 'function' ? options.exitFn : null,
    isHandlingFatal: false,
    handledFatalCount: 0,
    lastResult: null,
    onUncaughtException: null,
    onUnhandledRejection: null,
    handle: null
  };

  const handleFatal = (fatalType, errOrReason) => {
    if (entry.isHandlingFatal) {
      return entry.lastResult;
    }
    entry.isHandlingFatal = true;
    entry.handledFatalCount += 1;

    const targetInstance =
      (typeof entry.getInstance === 'function' ? entry.getInstance() : null) ||
      entry.instance ||
      null;
    const effectiveExitFn =
      typeof entry.exitFn === 'function'
        ? entry.exitFn
        : (code) => {
            if (typeof proc.exit === 'function') {
              proc.exit(code);
            }
          };

    if (targetInstance && typeof targetInstance.emergencyShutdown === 'function') {
      entry.lastResult = targetInstance.emergencyShutdown(fatalType, errOrReason, {
        exitFn: effectiveExitFn
      });
      return entry.lastResult;
    }

    const rawMsg =
      errOrReason instanceof Error ? errOrReason.message : String(errOrReason || 'Unknown fatal error');
    const safeMsg = logger.redactString ? logger.redactString(rawMsg) : rawMsg;
    logger.error(`Fatal ${fatalType} - exiting safely`, {
      fatalType,
      error: safeMsg
    });
    effectiveExitFn(1);
    entry.lastResult = { ok: true, fatalType, error: safeMsg, snapshotResult: null, exitCode: 1 };
    return entry.lastResult;
  };

  entry.onUncaughtException = (err) => handleFatal('uncaughtException', err);
  entry.onUnhandledRejection = (reason) => handleFatal('unhandledRejection', reason);

  proc.on('uncaughtException', entry.onUncaughtException);
  proc.on('unhandledRejection', entry.onUnhandledRejection);

  entry.handle = {
    unregister: () => unregisterGlobalErrorHandlers(proc),
    resetState: () => {
      entry.isHandlingFatal = false;
      entry.lastResult = null;
    },
    getStats: () => ({
      registered: globalHandlerRegistry.has(proc),
      isHandlingFatal: entry.isHandlingFatal,
      handledFatalCount: entry.handledFatalCount,
      lastResult: entry.lastResult
    })
  };

  globalHandlerRegistry.set(proc, entry);
  return entry.handle;
}

function unregisterGlobalErrorHandlers(processObj = process) {
  const entry = globalHandlerRegistry.get(processObj);
  if (!entry) {
    return false;
  }
  if (typeof processObj.removeListener === 'function') {
    processObj.removeListener('uncaughtException', entry.onUncaughtException);
    processObj.removeListener('unhandledRejection', entry.onUnhandledRejection);
  } else if (typeof processObj.off === 'function') {
    processObj.off('uncaughtException', entry.onUncaughtException);
    processObj.off('unhandledRejection', entry.onUnhandledRejection);
  }
  globalHandlerRegistry.delete(processObj);
  return true;
}

function startServer(config = defaultConfig, options = {}) {
  const instance = createAppServer(config, options);
  const { httpServer, tiktokService } = instance;

  return new Promise((resolve, reject) => {
    const onError = (err) => {
      logger.error('Failed to start HTTP server', {
        code: err.code,
        message: err.message
      });
      reject(err);
    };

    httpServer.once('error', onError);
    httpServer.listen(config.server.port, config.server.host, () => {
      httpServer.removeListener('error', onError);
      const addr = httpServer.address();
      const boundPort = addr && typeof addr === 'object' ? addr.port : config.server.port;
      logger.info('Backend server started', {
        host: config.server.host,
        port: boundPort,
        env: config.env,
        phase: config.app.phase
      });

      if (
        config.app &&
        config.app.defaultMode === 'LIVE' &&
        config.tiktok &&
        config.tiktok.autoConnect !== false &&
        config.tiktok.uniqueId
      ) {
        tiktokService.connect().catch(() => {});
      }

      resolve({ ...instance, port: boundPort });
    });
  });
}

if (require.main === module) {
  let activeInstance = null;

  const runtimeConfig =
    defaultConfig && typeof defaultConfig.buildV2Config === 'function'
      ? defaultConfig.buildV2Config()
      : defaultConfig;

  registerGlobalErrorHandlers({
    getInstance: () => activeInstance
  });

  startServer(runtimeConfig, {
    enableSnapshotPersistence: true,
    snapshotOptions: {
      filePath: DEFAULT_V2_SNAPSHOT_PATH
    }
  })
    .then((inst) => {
      activeInstance = inst;
    })
    .catch(() => {
      process.exit(1);
    });

  const handleSignal = (signal) => {
    logger.info(`Received ${signal}`);
    if (activeInstance) {
      activeInstance.shutdown().finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

module.exports = {
  createAppServer,
  startServer,
  registerGlobalErrorHandlers,
  unregisterGlobalErrorHandlers
};
