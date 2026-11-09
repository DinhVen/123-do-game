'use strict';

const defaultConfig = require('../config');
const logger = require('../logger');
const { validateRawEvent } = require('../engines/inputValidator');
const { normalizeEvent } = require('../engines/eventNormalizer');
const { BoundedRateLimiter } = require('../engines/rateLimiter');

const TIKTOK_CONNECTION_STATE = Object.freeze({
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  STOPPED: 'STOPPED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR'
});

// Verified event names from tiktok-live-connector@2.5.0 (ControlEvent & WebcastEvent enums)
const DEFAULT_CONTROL_EVENTS = Object.freeze({
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
});

const DEFAULT_WEBCAST_EVENTS = Object.freeze({
  CHAT: 'chat',
  LIKE: 'like',
  GIFT: 'gift',
  STREAM_END: 'streamEnd'
});

let cachedConnectorModulePromise = null;

async function loadTikTokConnectorModule() {
  if (!cachedConnectorModulePromise) {
    cachedConnectorModulePromise = import('tiktok-live-connector');
  }
  return cachedConnectorModulePromise;
}

/**
 * Extract stable userId from tiktok-live-connector v2.5.0 protobuf User object (`user.id`)
 * or legacy fields (`user.userId`, `user.uniqueId`, `user.displayId`).
 * NEVER uses `nickname` as `userId` (Master Plan v1.0 Invariant).
 */
function extractStableUserId(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return '';
  }
  const u = rawData.user && typeof rawData.user === 'object' ? rawData.user : null;
  const candidates = [
    u && u.id,
    u && u.userId,
    u && u.uniqueId,
    u && u.displayId,
    rawData.userId,
    rawData.uniqueId
  ];
  for (const item of candidates) {
    if (
      item !== undefined &&
      item !== null &&
      (typeof item === 'string' || typeof item === 'number' || typeof item === 'bigint')
    ) {
      const trimmed = String(item).trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return '';
}

function extractUserNickname(rawData, fallbackUserId) {
  if (!rawData || typeof rawData !== 'object') {
    return fallbackUserId || '';
  }
  const u = rawData.user && typeof rawData.user === 'object' ? rawData.user : null;
  const candidates = [
    u && u.nickname,
    rawData.nickname,
    u && u.displayId,
    u && u.uniqueId,
    fallbackUserId
  ];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim().length > 0) {
      return item.trim();
    }
  }
  return fallbackUserId || '';
}

function extractAvatarUrl(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return '';
  }
  const u = rawData.user && typeof rawData.user === 'object' ? rawData.user : null;
  if (u && u.avatarThumb && Array.isArray(u.avatarThumb.urlList) && u.avatarThumb.urlList[0]) {
    return String(u.avatarThumb.urlList[0]);
  }
  if (u && u.avatarThumb && Array.isArray(u.avatarThumb.urls) && u.avatarThumb.urls[0]) {
    return String(u.avatarThumb.urls[0]);
  }
  if (u && u.avatarMedium && Array.isArray(u.avatarMedium.urlList) && u.avatarMedium.urlList[0]) {
    return String(u.avatarMedium.urlList[0]);
  }
  if (u && typeof u.profilePictureUrl === 'string') {
    return u.profilePictureUrl;
  }
  if (typeof rawData.avatarUrl === 'string') {
    return rawData.avatarUrl;
  }
  return '';
}

function extractMessageId(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return null;
  }
  const msgId =
    (rawData.common && rawData.common.msgId) ??
    rawData.msgId ??
    rawData.eventId ??
    null;
  if (
    msgId === null ||
    msgId === undefined ||
    (typeof msgId !== 'string' && typeof msgId !== 'number' && typeof msgId !== 'bigint')
  ) {
    return null;
  }
  const rawStr = String(msgId).trim();
  if (!rawStr) {
    return null;
  }
  return rawStr.startsWith('tt_') || rawStr.startsWith('evt_') ? rawStr : `tt_${rawStr}`;
}

/**
 * Transform raw tiktok-live-connector@2.5.0 WebcastChatMessage / WebcastLikeMessage / WebcastGiftMessage
 * into a structured candidate event for `validateRawEvent` -> `normalizeEvent`.
 */
function normalizeTikTokRawPayload(rawType, rawData) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return null;
  }

  const userId = extractStableUserId(rawData);
  const nickname = extractUserNickname(rawData, userId);
  const avatarUrl = extractAvatarUrl(rawData);
  const eventId = extractMessageId(rawData);
  const upperType = String(rawType || '').toUpperCase().trim();

  if (upperType === 'CHAT' || upperType === 'COMMENT') {
    const comment =
      typeof rawData.content === 'string'
        ? rawData.content
        : typeof rawData.comment === 'string'
          ? rawData.comment
          : '';
    return {
      ...(eventId ? { eventId } : {}),
      source: 'LIVE',
      eventType: 'COMMENT',
      userId,
      nickname,
      avatarUrl,
      payload: {
        comment
      }
    };
  }

  if (upperType === 'LIKE') {
    const rawLikeDelta = rawData.count ?? rawData.likeCount ?? rawData.likeDelta;
    const rawTotalLikes = rawData.total ?? rawData.totalLikeCount;
    const rawRoomCandidate =
      (rawData.common && rawData.common.roomId !== undefined ? rawData.common.roomId : undefined) ??
      rawData.roomId;
    const roomId =
      rawRoomCandidate !== undefined &&
      rawRoomCandidate !== null &&
      String(rawRoomCandidate).trim() !== '' &&
      String(rawRoomCandidate).trim() !== '0'
        ? String(rawRoomCandidate).trim()
        : null;
    const rawCreateTime =
      (rawData.common && rawData.common.createTime !== undefined
        ? rawData.common.createTime
        : undefined) ?? rawData.createTime;

    return {
      ...(eventId ? { eventId } : {}),
      source: 'LIVE',
      eventType: 'LIKE',
      userId,
      nickname,
      avatarUrl,
      payload: {
        ...(rawLikeDelta !== undefined && rawLikeDelta !== null && rawLikeDelta !== ''
          ? { likeDelta: rawLikeDelta }
          : {}),
        ...(rawTotalLikes !== undefined && rawTotalLikes !== null && rawTotalLikes !== ''
          ? { totalLikeCount: rawTotalLikes }
          : {}),
        ...(roomId ? { roomId } : {}),
        ...(rawCreateTime !== undefined && rawCreateTime !== null && rawCreateTime !== ''
          ? { createTime: rawCreateTime }
          : {})
      }
    };
  }

  if (upperType === 'GIFT') {
    const rawGiftObj = rawData.gift && typeof rawData.gift === 'object' ? rawData.gift : null;
    const rawGiftDetails =
      rawData.giftDetails && typeof rawData.giftDetails === 'object' ? rawData.giftDetails : null;

    const rawGiftId =
      rawData.giftId ??
      (rawGiftObj && rawGiftObj.id) ??
      (rawGiftDetails && rawGiftDetails.giftId);
    const giftId =
      rawGiftId !== undefined && rawGiftId !== null && String(rawGiftId).trim() !== ''
        ? String(rawGiftId).trim()
        : '';

    const giftName =
      (rawGiftObj && typeof rawGiftObj.name === 'string' && rawGiftObj.name) ||
      (rawGiftDetails && typeof rawGiftDetails.giftName === 'string' && rawGiftDetails.giftName) ||
      (typeof rawData.giftName === 'string' && rawData.giftName) ||
      null;

    const rawGiftType =
      (rawGiftObj && rawGiftObj.type !== undefined ? rawGiftObj.type : undefined) ??
      (rawGiftDetails && rawGiftDetails.giftType !== undefined ? rawGiftDetails.giftType : undefined) ??
      rawData.giftType;

    const rawGiftCombo =
      rawGiftObj && typeof rawGiftObj.combo === 'boolean'
        ? rawGiftObj.combo
        : rawGiftDetails && typeof rawGiftDetails.combo === 'boolean'
          ? rawGiftDetails.combo
          : typeof rawData.combo === 'boolean'
            ? rawData.combo
            : undefined;

    const rawDiamondCount =
      (rawGiftObj && rawGiftObj.diamondCount !== undefined ? rawGiftObj.diamondCount : undefined) ??
      (rawGiftDetails && rawGiftDetails.diamondCount !== undefined
        ? rawGiftDetails.diamondCount
        : undefined) ??
      rawData.diamondCount;

    const repeatCount = rawData.repeatCount ?? rawData.comboCount ?? 1;
    let repeatEnd = null;
    if (rawData.repeatEnd !== undefined && rawData.repeatEnd !== null) {
      if (typeof rawData.repeatEnd === 'boolean') {
        repeatEnd = rawData.repeatEnd;
      } else if (rawData.repeatEnd === 1 || rawData.repeatEnd === '1') {
        repeatEnd = true;
      } else if (rawData.repeatEnd === 0 || rawData.repeatEnd === '0') {
        repeatEnd = false;
      } else {
        repeatEnd = rawData.repeatEnd;
      }
    }

    const rawGroupCandidate =
      rawData.groupId !== undefined && rawData.groupId !== null && String(rawData.groupId).trim() !== ''
        ? String(rawData.groupId).trim()
        : rawData.streakId !== undefined && rawData.streakId !== null && String(rawData.streakId).trim() !== ''
          ? String(rawData.streakId).trim()
          : '';
    // In TikTok Protobuf v3, uint64 groupId defaults to "0" or "" when unset
    const streakId =
      rawGroupCandidate !== '' && rawGroupCandidate !== '0' ? rawGroupCandidate : null;

    const toUserObj = rawData.toUser && typeof rawData.toUser === 'object' ? rawData.toUser : null;
    const targetUserId =
      rawData.targetUserId ??
      (toUserObj && (toUserObj.id || toUserObj.userId || toUserObj.uniqueId || toUserObj.displayId)) ??
      undefined;

    return {
      ...(eventId ? { eventId } : {}),
      source: 'LIVE',
      eventType: 'GIFT',
      userId,
      nickname,
      avatarUrl,
      payload: {
        giftId,
        repeatCount,
        ...(giftName ? { giftName } : {}),
        ...(rawGiftType !== undefined && rawGiftType !== null ? { giftType: rawGiftType } : {}),
        ...(rawGiftCombo !== undefined ? { combo: rawGiftCombo } : {}),
        ...(rawDiamondCount !== undefined && rawDiamondCount !== null
          ? { diamondCount: rawDiamondCount }
          : {}),
        ...(repeatEnd !== null ? { repeatEnd } : {}),
        ...(streakId ? { streakId, groupId: streakId } : {}),
        ...(rawData.targetSeatIndex !== undefined ? { targetSeatIndex: rawData.targetSeatIndex } : {}),
        ...(rawData.targetSeatId !== undefined ? { targetSeatId: rawData.targetSeatId } : {}),
        ...(targetUserId !== undefined && targetUserId !== null && String(targetUserId).trim() !== ''
          ? { targetUserId: String(targetUserId).trim() }
          : {})
      }
    };
  }

  return null;
}

/**
 * Classify TikTok connection/disconnect error into STREAM_OFFLINE, UNRECOVERABLE_ERROR, or TRANSIENT_ERROR.
 */
function classifyTikTokError(errOrInfo) {
  if (!errOrInfo) {
    return {
      category: 'TRANSIENT_ERROR',
      recoverable: true,
      reason: 'UNKNOWN_TRANSIENT_ERROR',
      message: 'TikTok connection interrupted',
      retryAfterMs: 0
    };
  }

  const errorName =
    errOrInfo && typeof errOrInfo.name === 'string' && errOrInfo.name !== 'Error'
      ? errOrInfo.name.trim()
      : '';
  const errorReason =
    errOrInfo && typeof errOrInfo.reason === 'string' ? errOrInfo.reason.trim() : '';
  const closeCode =
    errOrInfo && Number.isInteger(Number(errOrInfo.code)) ? Number(errOrInfo.code) : null;
  const rawMessage =
    errOrInfo && typeof errOrInfo.message === 'string'
      ? errOrInfo.message
      : typeof errOrInfo === 'string'
        ? errOrInfo
        : errorReason || 'TikTok connection error';
  const safeMessage = logger.redactString(String(rawMessage).slice(0, 240));

  let retryAfterMs = 0;
  if (errOrInfo && Number.isFinite(Number(errOrInfo.retryAfter)) && Number(errOrInfo.retryAfter) > 0) {
    const rawRetry = Number(errOrInfo.retryAfter);
    retryAfterMs = rawRetry < 1000 ? Math.round(rawRetry * 1000) : Math.round(rawRetry);
  }

  // 1. Explicit non-recoverable flag
  if (errOrInfo && errOrInfo.recoverable === false) {
    const isOffline =
      errorName === 'UserOfflineError' ||
      /offline|not live|stream ended|room ended/i.test(safeMessage);
    return {
      category: isOffline ? 'STREAM_OFFLINE' : 'UNRECOVERABLE_ERROR',
      recoverable: false,
      reason: errorName || (isOffline ? 'STREAM_OFFLINE' : 'UNRECOVERABLE_ERROR'),
      message: safeMessage,
      retryAfterMs: 0
    };
  }

  // 2. Stream offline / room ended / not started yet (Master Plan policy: do not spam auto-reconnect)
  if (
    errorName === 'UserOfflineError' ||
    closeCode === 4004 ||
    /useroffline|streamer is offline|currently offline|is not live|room has ended|live has ended|stream has ended/i.test(
      `${errorName} ${safeMessage} ${errorReason}`
    )
  ) {
    return {
      category: 'STREAM_OFFLINE',
      recoverable: false,
      reason: errorName || 'UserOfflineError',
      message: safeMessage,
      retryAfterMs: 0
    };
  }

  // 3. Unrecoverable configuration, uniqueId, schema, or auth/token errors
  const unrecoverableErrorNames = new Set([
    'InvalidUniqueIdError',
    'SignatureMissingTokensError',
    'PremiumFeatureError',
    'AuthenticatedWebSocketConnectionError',
    'InvalidSchemaNameError'
  ]);
  const unrecoverableErrorReasons = new Set([
    'Empty Cookies',
    'Premium Feature',
    'Authenticated WS'
  ]);
  if (
    unrecoverableErrorNames.has(errorName) ||
    unrecoverableErrorReasons.has(errorReason) ||
    closeCode === 4001 ||
    closeCode === 4003 ||
    /invalid uniqueid|missing tokens|premium feature|authenticated ws|invalid api key|unauthorized|forbidden/i.test(
      `${errorName} ${safeMessage} ${errorReason}`
    )
  ) {
    return {
      category: 'UNRECOVERABLE_ERROR',
      recoverable: false,
      reason: errorName || errorReason || 'UNRECOVERABLE_ERROR',
      message: safeMessage,
      retryAfterMs: 0
    };
  }

  // 4. Default: Transient / recoverable network, rate-limit, timeout, or WebSocket closure
  return {
    category: 'TRANSIENT_ERROR',
    recoverable: true,
    reason: errorName || errorReason || (closeCode ? `WS_CLOSE_${closeCode}` : 'TRANSIENT_ERROR'),
    message: safeMessage,
    retryAfterMs
  };
}

class TikTokService {
  constructor(
    config = defaultConfig,
    io = null,
    eventQueue = null,
    gameStateManager = null,
    options = {}
  ) {
    this.config = config;
    this.io = io;
    this.eventQueue = eventQueue;
    this.gameStateManager = gameStateManager;

    this.connectionFactory =
      typeof options.connectionFactory === 'function' ? options.connectionFactory : null;
    this.rateLimiter =
      options.rateLimiter ||
      new BoundedRateLimiter((config && config.security && config.security.rateLimits) || {});

    const tiktokCfg = (config && config.tiktok) || {};
    this.uniqueId = String(options.uniqueId ?? tiktokCfg.uniqueId ?? '').trim();
    this.connectionState = TIKTOK_CONNECTION_STATE.IDLE;
    this.roomId = null;
    this.lastKnownRoomId = null;
    this.lastError = null;
    this.stopReason = null;

    // Auto-reconnect & Exponential Backoff + Jitter configuration
    this.autoReconnect =
      options.autoReconnect !== undefined
        ? Boolean(options.autoReconnect)
        : tiktokCfg.autoReconnect !== undefined
          ? Boolean(tiktokCfg.autoReconnect)
          : tiktokCfg.autoConnect !== undefined
            ? Boolean(tiktokCfg.autoConnect)
            : true;

    this.baseReconnectDelayMs = Math.max(
      100,
      Number(options.baseReconnectDelayMs ?? tiktokCfg.baseReconnectDelayMs ?? 1000) || 1000
    );
    this.maxReconnectDelayMs = Math.max(
      this.baseReconnectDelayMs,
      Number(options.maxReconnectDelayMs ?? tiktokCfg.maxReconnectDelayMs ?? 60000) || 60000
    );
    this.reconnectBackoffFactor = Math.max(
      1.1,
      Number(options.reconnectBackoffFactor ?? tiktokCfg.reconnectBackoffFactor ?? 2) || 2
    );
    const rawJitter = Number(
      options.reconnectJitterRatio ?? tiktokCfg.reconnectJitterRatio ?? 0.2
    );
    this.reconnectJitterRatio = Number.isFinite(rawJitter)
      ? Math.max(0, Math.min(0.5, rawJitter))
      : 0.2;
    const rawMaxAttempts =
      options.maxReconnectAttempts ?? tiktokCfg.maxReconnectAttempts ?? 10;
    this.maxReconnectAttempts =
      rawMaxAttempts === Infinity ||
      (Number.isInteger(Number(rawMaxAttempts)) && Number(rawMaxAttempts) > 0)
        ? Number(rawMaxAttempts)
        : 10;
    this.connectTimeoutMs = Math.max(
      200,
      Number(options.connectTimeoutMs ?? tiktokCfg.connectTimeoutMs ?? 15000) || 15000
    );

    this.reconnectAttempts = 0;
    this.nextReconnectDelayMs = null;
    this._reconnectTimer = null;
    this._connectTimeoutTimer = null;
    this._connectionGeneration = 0;
    this._manualStopRequested = false;
    this._isShuttingDown = false;
    this._streamEnded = false;

    this._random = typeof options.randomFn === 'function' ? options.randomFn : () => Math.random();
    this._setTimeout =
      options.scheduler && typeof options.scheduler.setTimeout === 'function'
        ? options.scheduler.setTimeout
        : (fn, ms) => setTimeout(fn, ms);
    this._clearTimeout =
      options.scheduler && typeof options.scheduler.clearTimeout === 'function'
        ? options.scheduler.clearTimeout
        : (id) => clearTimeout(id);

    this.connector = null;
    this._boundListeners = [];
    this._connectPromise = null;

    this.stats = {
      connectAttempts: 0,
      connectedCount: 0,
      disconnectedCount: 0,
      reconnectScheduledCount: 0,
      reconnectAttempts: 0,
      streamEndCount: 0,
      roomSessionChanges: 0,
      errorCount: 0,
      unrecoverableErrorCount: 0,
      eventsReceived: 0,
      eventsEnqueued: 0,
      eventsRejectedValidation: 0,
      eventsRateLimited: 0,
      eventsBlockedByMode: 0
    };
  }

  setRandom(fn) {
    if (typeof fn === 'function') {
      this._random = fn;
    }
  }

  setScheduler(scheduler = {}) {
    if (scheduler && typeof scheduler.setTimeout === 'function') {
      this._setTimeout = scheduler.setTimeout;
    }
    if (scheduler && typeof scheduler.clearTimeout === 'function') {
      this._clearTimeout = scheduler.clearTimeout;
    }
  }

  hasReconnectTimer() {
    return this._reconnectTimer !== null;
  }

  /**
   * Calculate Exponential Backoff with symmetric Jitter for a 1-based attempt number.
   * Attempt 1: ~1s, Attempt 2: ~2s, Attempt 3: ~4s, Attempt 4: ~8s ... capped at maxReconnectDelayMs.
   */
  calculateReconnectDelay(attempt = 1, minRetryAfterMs = 0) {
    const normalizedAttempt = Math.max(1, Math.floor(Number(attempt) || 1));
    const exponentialDelay = Math.min(
      this.maxReconnectDelayMs,
      this.baseReconnectDelayMs * Math.pow(this.reconnectBackoffFactor, normalizedAttempt - 1)
    );
    const rand = Math.max(0, Math.min(1, Number(this._random())));
    const jitterMultiplier = 1 + (rand * 2 - 1) * this.reconnectJitterRatio;
    const jitteredDelay = Math.round(exponentialDelay * jitterMultiplier);
    const minBound = Math.max(
      50,
      Math.round(this.baseReconnectDelayMs * (1 - this.reconnectJitterRatio))
    );
    const effectiveDelay = Math.max(minBound, Number(minRetryAfterMs) || 0, jitteredDelay);
    return Math.min(this.maxReconnectDelayMs, effectiveDelay);
  }

  /**
   * Check whether Backend is currently operating in LIVE mode.
   */
  isLiveMode() {
    if (this.gameStateManager && this.gameStateManager.mode) {
      return this.gameStateManager.mode === 'LIVE';
    }
    return Boolean(this.config && this.config.app && this.config.app.defaultMode === 'LIVE');
  }

  getStatus() {
    return {
      mode: this.isLiveMode() ? 'LIVE' : 'MOCK',
      connectionState: this.connectionState,
      uniqueId: this.uniqueId || null,
      roomId: this.roomId,
      lastKnownRoomId: this.lastKnownRoomId,
      lastError: this.lastError,
      stopReason: this.stopReason,
      autoReconnect: this.autoReconnect,
      reconnectAttempts: this.reconnectAttempts,
      nextReconnectDelayMs: this.nextReconnectDelayMs,
      hasReconnectTimer: this.hasReconnectTimer(),
      listenerCount: this._boundListeners.length,
      stats: { ...this.stats }
    };
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer !== null) {
      try {
        this._clearTimeout(this._reconnectTimer);
      } catch (_) {}
      this._reconnectTimer = null;
    }
    this.nextReconnectDelayMs = null;
  }

  _clearConnectTimeoutTimer() {
    if (this._connectTimeoutTimer !== null) {
      try {
        this._clearTimeout(this._connectTimeoutTimer);
      } catch (_) {}
      this._connectTimeoutTimer = null;
    }
  }

  _handleConnectedRoomSession(newRoomId) {
    const normalizedNewRoom =
      newRoomId !== undefined && newRoomId !== null && String(newRoomId).trim() !== ''
        ? String(newRoomId).trim()
        : null;

    if (
      normalizedNewRoom &&
      this.lastKnownRoomId &&
      normalizedNewRoom !== this.lastKnownRoomId
    ) {
      this.stats.roomSessionChanges += 1;
      if (this.gameStateManager && this.gameStateManager.deduplicator) {
        this.gameStateManager.deduplicator.clearLikeBaseline(`room:${this.lastKnownRoomId}`);
        this.gameStateManager.deduplicator.clearLikeBaseline('room:unknown');
      }
      logger.info('Detected new TikTok Live room session; isolated Like baseline for new roomId', {
        uniqueId: this.uniqueId,
        previousRoomId: this.lastKnownRoomId,
        newRoomId: normalizedNewRoom
      });
    }

    this.roomId = normalizedNewRoom;
    if (normalizedNewRoom) {
      this.lastKnownRoomId = normalizedNewRoom;
      if (this.gameStateManager && typeof this.gameStateManager === 'object') {
        this.gameStateManager.roomId = normalizedNewRoom;
      }
    }
  }

  _scheduleReconnect(reason = 'Unexpected disconnect', minRetryAfterMs = 0) {
    if (!this.isLiveMode()) {
      this._clearReconnectTimer();
      return { scheduled: false, reason: 'NOT_IN_LIVE_MODE' };
    }
    if (!this.autoReconnect) {
      this._clearReconnectTimer();
      return { scheduled: false, reason: 'AUTO_RECONNECT_DISABLED' };
    }
    if (this._manualStopRequested || this._isShuttingDown || this._streamEnded) {
      this._clearReconnectTimer();
      return {
        scheduled: false,
        reason: this.stopReason || 'STOPPED'
      };
    }
    if (
      this.connectionState === TIKTOK_CONNECTION_STATE.CONNECTING ||
      (this.connectionState === TIKTOK_CONNECTION_STATE.CONNECTED && this.connector !== null)
    ) {
      return { scheduled: false, reason: 'ALREADY_CONNECTED_OR_CONNECTING' };
    }
    if (this._reconnectTimer !== null) {
      return {
        scheduled: true,
        alreadyScheduled: true,
        attempt: this.reconnectAttempts,
        delayMs: this.nextReconnectDelayMs
      };
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.stopReason = 'MAX_RETRIES_EXCEEDED';
      this._setConnectionState(TIKTOK_CONNECTION_STATE.STOPPED, 'Max reconnect attempts reached');
      logger.error('TikTok Live max reconnect attempts reached; stopping auto-reconnect', {
        uniqueId: this.uniqueId,
        reconnectAttempts: this.reconnectAttempts,
        maxReconnectAttempts: this.maxReconnectAttempts
      });
      return { scheduled: false, reason: 'MAX_RETRIES_EXCEEDED' };
    }

    this.reconnectAttempts += 1;
    this.stats.reconnectScheduledCount += 1;
    const delayMs = this.calculateReconnectDelay(this.reconnectAttempts, minRetryAfterMs);
    this.nextReconnectDelayMs = delayMs;
    this._setConnectionState(TIKTOK_CONNECTION_STATE.RECONNECTING, reason);

    const scheduledGeneration = this._connectionGeneration;
    logger.info('Scheduled TikTok Live auto-reconnect', {
      uniqueId: this.uniqueId,
      attempt: this.reconnectAttempts,
      delayMs,
      reason
    });

    this._reconnectTimer = this._setTimeout(async () => {
      this._reconnectTimer = null;
      this.nextReconnectDelayMs = null;

      if (
        scheduledGeneration !== this._connectionGeneration ||
        this._manualStopRequested ||
        this._isShuttingDown ||
        this._streamEnded ||
        !this.isLiveMode()
      ) {
        return;
      }

      this.stats.reconnectAttempts += 1;
      await this.connect(null, { isReconnect: true });
    }, delayMs);

    return {
      scheduled: true,
      alreadyScheduled: false,
      attempt: this.reconnectAttempts,
      delayMs
    };
  }

  /**
   * Establish connection to TikTok Live stream via tiktok-live-connector@2.5.0.
   * Refuses to connect when server is in MOCK mode.
   */
  async connect(overrideUniqueId = null, internalOptions = {}) {
    const isReconnect = Boolean(internalOptions && internalOptions.isReconnect);

    if (!this.isLiveMode()) {
      this._clearReconnectTimer();
      logger.warn('Blocked TikTok Live connection attempt while server is in MOCK mode');
      return {
        ok: false,
        reason: 'NOT_IN_LIVE_MODE',
        error: 'TikTok Live connector is disabled in MOCK mode.'
      };
    }

    if (this._isShuttingDown) {
      this._clearReconnectTimer();
      return {
        ok: false,
        reason: 'SHUTTING_DOWN',
        error: 'TikTokService is shutting down.'
      };
    }

    const targetUniqueId =
      overrideUniqueId !== null && overrideUniqueId !== undefined
        ? String(overrideUniqueId).trim()
        : this.uniqueId;

    if (!targetUniqueId) {
      this._clearReconnectTimer();
      logger.warn('TikTok uniqueId is not configured; skipping LIVE connection');
      return {
        ok: false,
        reason: 'MISSING_UNIQUE_ID',
        error: 'TikTok uniqueId is required to connect in LIVE mode.'
      };
    }

    if (
      this.connectionState === TIKTOK_CONNECTION_STATE.CONNECTING ||
      this.connectionState === TIKTOK_CONNECTION_STATE.CONNECTED
    ) {
      return {
        ok: false,
        reason: 'ALREADY_CONNECTED_OR_CONNECTING',
        connectionState: this.connectionState,
        roomId: this.roomId
      };
    }

    // Manual connect() clears any pending reconnect timer and resets stop flags
    this._clearReconnectTimer();
    if (!isReconnect) {
      this._manualStopRequested = false;
      this._streamEnded = false;
      this.stopReason = null;
      this.reconnectAttempts = 0;
    }

    this.uniqueId = targetUniqueId;
    this.stats.connectAttempts += 1;
    this._connectionGeneration += 1;
    const myGeneration = this._connectionGeneration;

    this._setConnectionState(TIKTOK_CONNECTION_STATE.CONNECTING);

    // Ensure any previous connector instance and its listeners are cleaned up before creating a new one
    await this._teardownConnectorInstance();

    if (
      myGeneration !== this._connectionGeneration ||
      this._manualStopRequested ||
      this._isShuttingDown ||
      !this.isLiveMode()
    ) {
      await this._teardownConnectorInstance();
      return {
        ok: false,
        reason: 'ABORTED_BY_STOP',
        connectionState: this.connectionState
      };
    }

    let connectorInstance = null;
    try {
      let controlEvents = DEFAULT_CONTROL_EVENTS;
      let webcastEvents = DEFAULT_WEBCAST_EVENTS;

      const tiktokCfg = (this.config && this.config.tiktok) || {};
      const connectorOptions = {
        processInitialData: Boolean(tiktokCfg.processInitialData),
        fetchRoomInfoOnConnect:
          tiktokCfg.fetchRoomInfoOnConnect !== undefined
            ? Boolean(tiktokCfg.fetchRoomInfoOnConnect)
            : true,
        enableExtendedGiftInfo: Boolean(tiktokCfg.enableExtendedGiftInfo)
      };

      if (this.connectionFactory) {
        connectorInstance = await this.connectionFactory(targetUniqueId, connectorOptions);
      } else {
        const mod = await loadTikTokConnectorModule();
        const { TikTokLiveConnection, ControlEvent, WebcastEvent } = mod;
        if (ControlEvent) controlEvents = ControlEvent;
        if (WebcastEvent) webcastEvents = WebcastEvent;
        connectorInstance = new TikTokLiveConnection(targetUniqueId, connectorOptions);
      }

      if (
        myGeneration !== this._connectionGeneration ||
        this._manualStopRequested ||
        this._isShuttingDown ||
        !this.isLiveMode()
      ) {
        if (connectorInstance && typeof connectorInstance.disconnect === 'function') {
          try {
            await connectorInstance.disconnect();
          } catch (_) {}
        }
        return {
          ok: false,
          reason: 'ABORTED_BY_STOP',
          connectionState: this.connectionState
        };
      }

      this.connector = connectorInstance;
      this._bindConnectorListeners(connectorInstance, controlEvents, webcastEvents, myGeneration);

      const state = await new Promise((resolve, reject) => {
        this._clearConnectTimeoutTimer();
        this._connectTimeoutTimer = this._setTimeout(() => {
          this._connectTimeoutTimer = null;
          const timeoutErr = new Error(
            `TikTok connect timed out after ${this.connectTimeoutMs}ms`
          );
          timeoutErr.name = 'ConnectTimeoutError';
          reject(timeoutErr);
        }, this.connectTimeoutMs);

        Promise.resolve(connectorInstance.connect()).then(
          (res) => {
            this._clearConnectTimeoutTimer();
            resolve(res);
          },
          (err) => {
            this._clearConnectTimeoutTimer();
            reject(err);
          }
        );
      });

      if (
        myGeneration !== this._connectionGeneration ||
        this._manualStopRequested ||
        this._isShuttingDown ||
        !this.isLiveMode()
      ) {
        await this._teardownConnectorInstance();
        return {
          ok: false,
          reason: 'ABORTED_BY_STOP',
          connectionState: this.connectionState
        };
      }

      const resolvedRoomId = (state && state.roomId) || connectorInstance.roomId || null;
      this._handleConnectedRoomSession(resolvedRoomId);
      this.lastError = null;
      this.stopReason = null;
      this.reconnectAttempts = 0;
      this.nextReconnectDelayMs = null;
      this._setConnectionState(TIKTOK_CONNECTION_STATE.CONNECTED);

      logger.info('Connected to TikTok Live stream', {
        uniqueId: this.uniqueId,
        roomId: this.roomId
      });

      return {
        ok: true,
        connectionState: this.connectionState,
        uniqueId: this.uniqueId,
        roomId: this.roomId
      };
    } catch (err) {
      this._clearConnectTimeoutTimer();
      await this._teardownConnectorInstance();

      if (
        myGeneration !== this._connectionGeneration ||
        this._manualStopRequested ||
        this._isShuttingDown
      ) {
        return {
          ok: false,
          reason: 'ABORTED_BY_STOP',
          connectionState: this.connectionState
        };
      }

      const classification = classifyTikTokError(err);
      const safeErrorMsg = classification.message || 'TikTok connection failed';
      this.lastError = safeErrorMsg;
      this.stats.errorCount += 1;
      this._setConnectionState(TIKTOK_CONNECTION_STATE.ERROR, safeErrorMsg);

      logger.error('Failed to connect to TikTok Live stream', {
        uniqueId: this.uniqueId,
        errorName: err && err.name ? String(err.name) : 'Error',
        category: classification.category,
        recoverable: classification.recoverable,
        errorMessage: safeErrorMsg
      });

      if (!classification.recoverable) {
        this.stats.unrecoverableErrorCount += 1;
        this.stopReason = classification.category;
        this._clearReconnectTimer();
        this._setConnectionState(
          this.autoReconnect ? TIKTOK_CONNECTION_STATE.STOPPED : TIKTOK_CONNECTION_STATE.ERROR,
          safeErrorMsg
        );
        return {
          ok: false,
          reason: 'CONNECTION_FAILED',
          errorCategory: classification.category,
          recoverable: false,
          error: safeErrorMsg
        };
      }

      if (this.autoReconnect && this.isLiveMode() && !this._manualStopRequested) {
        const scheduleRes = this._scheduleReconnect(safeErrorMsg, classification.retryAfterMs);
        return {
          ok: false,
          reason: 'CONNECTION_FAILED',
          errorCategory: classification.category,
          recoverable: true,
          reconnecting: Boolean(scheduleRes.scheduled),
          nextReconnectDelayMs: scheduleRes.delayMs || null,
          error: safeErrorMsg
        };
      }

      this._setConnectionState(TIKTOK_CONNECTION_STATE.ERROR, safeErrorMsg);
      return {
        ok: false,
        reason: 'CONNECTION_FAILED',
        errorCategory: classification.category,
        recoverable: classification.recoverable,
        error: safeErrorMsg
      };
    }
  }

  async disconnect() {
    this._manualStopRequested = true;
    this.stopReason = 'MANUAL_DISCONNECT';
    this._connectionGeneration += 1;
    this._clearReconnectTimer();
    this._clearConnectTimeoutTimer();
    this.reconnectAttempts = 0;

    await this._teardownConnectorInstance();
    if (this.connectionState !== TIKTOK_CONNECTION_STATE.IDLE) {
      this._setConnectionState(
        this.autoReconnect ? TIKTOK_CONNECTION_STATE.STOPPED : TIKTOK_CONNECTION_STATE.DISCONNECTED
      );
    }
    this.roomId = null;
    logger.info('TikTok Live connector disconnected', {
      uniqueId: this.uniqueId || null
    });
    return {
      ok: true,
      connectionState: this.connectionState
    };
  }

  async shutdown() {
    this._isShuttingDown = true;
    this._manualStopRequested = true;
    this.stopReason = 'SHUTDOWN';
    this._connectionGeneration += 1;
    this._clearReconnectTimer();
    this._clearConnectTimeoutTimer();
    this.reconnectAttempts = 0;

    await this._teardownConnectorInstance();
    this._setConnectionState(
      this.autoReconnect ? TIKTOK_CONNECTION_STATE.STOPPED : TIKTOK_CONNECTION_STATE.DISCONNECTED
    );
    this.roomId = null;
  }

  _setConnectionState(nextState, errorMsg = null) {
    this.connectionState = nextState;
    if (errorMsg !== null) {
      this.lastError = logger.redactString(String(errorMsg));
    }
    if (this.gameStateManager && this.isLiveMode()) {
      if (nextState === TIKTOK_CONNECTION_STATE.CONNECTED) {
        this.gameStateManager.connectionStatus = 'CONNECTED';
      } else if (
        nextState === TIKTOK_CONNECTION_STATE.CONNECTING ||
        nextState === TIKTOK_CONNECTION_STATE.RECONNECTING
      ) {
        this.gameStateManager.connectionStatus = 'RECONNECTING';
      } else if (
        nextState === TIKTOK_CONNECTION_STATE.STOPPED ||
        nextState === TIKTOK_CONNECTION_STATE.DISCONNECTED ||
        nextState === TIKTOK_CONNECTION_STATE.ERROR ||
        nextState === TIKTOK_CONNECTION_STATE.IDLE
      ) {
        this.gameStateManager.connectionStatus = 'DISCONNECTED';
      }
    }
    if (this.io && typeof this.io.emit === 'function') {
      try {
        this.io.emit('tiktok:status', this.getStatus());
      } catch (_) {}
    }
  }

  _bindConnectorListeners(connector, controlEvents, webcastEvents, generation = this._connectionGeneration) {
    this._cleanupConnectorListeners();
    if (!connector || typeof connector.on !== 'function') {
      return;
    }

    const addListener = (eventName, handler) => {
      connector.on(eventName, handler);
      this._boundListeners.push({ connector, eventName, handler });
    };

    addListener(controlEvents.CONNECTED, (state) => {
      if (this.connector !== connector || generation !== this._connectionGeneration) return;
      this.stats.connectedCount += 1;
      if (state && state.roomId) {
        this._handleConnectedRoomSession(String(state.roomId));
      }
      this.reconnectAttempts = 0;
      this._setConnectionState(TIKTOK_CONNECTION_STATE.CONNECTED);
    });

    addListener(controlEvents.DISCONNECTED, (info) => {
      if (this.connector !== connector || generation !== this._connectionGeneration) return;
      this.stats.disconnectedCount += 1;
      const rawReason = info && info.reason ? String(info.reason) : 'WebSocket disconnected';
      const reason = logger.redactString(rawReason.slice(0, 240));
      logger.warn('TikTok Live WebSocket disconnected', {
        uniqueId: this.uniqueId,
        code: info && info.code !== undefined ? info.code : null,
        reason
      });

      this._teardownConnectorInstance().catch(() => {});
      this._setConnectionState(TIKTOK_CONNECTION_STATE.DISCONNECTED, reason);

      if (this._manualStopRequested || this._isShuttingDown || this._streamEnded) {
        this._setConnectionState(
          this.autoReconnect ? TIKTOK_CONNECTION_STATE.STOPPED : TIKTOK_CONNECTION_STATE.DISCONNECTED,
          reason
        );
        return;
      }

      const classification = classifyTikTokError(info);
      if (!classification.recoverable) {
        this.stats.unrecoverableErrorCount += 1;
        this.stopReason = classification.category;
        this._clearReconnectTimer();
        this._setConnectionState(
          this.autoReconnect ? TIKTOK_CONNECTION_STATE.STOPPED : TIKTOK_CONNECTION_STATE.DISCONNECTED,
          reason
        );
        return;
      }

      if (this.autoReconnect && this.isLiveMode()) {
        this._scheduleReconnect(reason, classification.retryAfterMs);
      } else {
        this._setConnectionState(TIKTOK_CONNECTION_STATE.DISCONNECTED, reason);
      }
    });

    addListener(controlEvents.ERROR, (err) => {
      if (this.connector !== connector || generation !== this._connectionGeneration) return;
      this.stats.errorCount += 1;
      const rawMsg =
        err && err.message
          ? String(err.message)
          : typeof err === 'string'
            ? err
            : 'TikTok connector error';
      const msg = logger.redactString(rawMsg.slice(0, 240));
      this.lastError = msg;
      logger.error('TikTok Live connector error event', {
        uniqueId: this.uniqueId,
        errorName: err && err.name ? String(err.name) : 'Error',
        errorMessage: msg
      });
    });

    addListener(webcastEvents.STREAM_END, (event) => {
      if (this.connector !== connector || generation !== this._connectionGeneration) return;
      this.stats.streamEndCount += 1;
      this._streamEnded = true;
      this.stopReason = 'STREAM_ENDED';
      this._connectionGeneration += 1;
      this._clearReconnectTimer();
      this._clearConnectTimeoutTimer();
      this.reconnectAttempts = 0;

      logger.info('TikTok Live stream ended', {
        uniqueId: this.uniqueId,
        roomId: this.roomId,
        action: event && event.action !== undefined ? event.action : null
      });

      this.roomId = null;
      this._setConnectionState(
        this.autoReconnect ? TIKTOK_CONNECTION_STATE.STOPPED : TIKTOK_CONNECTION_STATE.DISCONNECTED,
        'TikTok Live stream ended'
      );
      this._teardownConnectorInstance().catch(() => {});
    });

    addListener(webcastEvents.CHAT, (data) => {
      if (this.connector !== connector || generation !== this._connectionGeneration) return;
      this.handleRawWebcastEvent('CHAT', data);
    });

    addListener(webcastEvents.LIKE, (data) => {
      if (this.connector !== connector || generation !== this._connectionGeneration) return;
      this.handleRawWebcastEvent('LIKE', data);
    });

    addListener(webcastEvents.GIFT, (data) => {
      if (this.connector !== connector || generation !== this._connectionGeneration) return;
      this.handleRawWebcastEvent('GIFT', data);
    });
  }

  _cleanupConnectorListeners() {
    for (const item of this._boundListeners) {
      try {
        if (item.connector && typeof item.connector.off === 'function') {
          item.connector.off(item.eventName, item.handler);
        } else if (item.connector && typeof item.connector.removeListener === 'function') {
          item.connector.removeListener(item.eventName, item.handler);
        }
      } catch (_) {}
    }
    this._boundListeners = [];
  }

  async _teardownConnectorInstance() {
    this._cleanupConnectorListeners();
    const current = this.connector;
    this.connector = null;
    if (current) {
      try {
        if (typeof current.disconnect === 'function') {
          await current.disconnect();
        }
      } catch (_) {}
      try {
        if (typeof current.removeAllListeners === 'function') {
          current.removeAllListeners();
        }
      } catch (_) {}
    }
  }

  /**
   * Convert a raw webcast event from tiktok-live-connector@2.5.0 into a validated
   * NormalizedGameEvent (`source: 'LIVE'`) and enqueue it into SequentialEventQueue.
   */
  handleRawWebcastEvent(rawType, rawData) {
    this.stats.eventsReceived += 1;

    if (this._isShuttingDown || this._manualStopRequested) {
      return {
        ok: false,
        reason: 'SERVICE_STOPPED'
      };
    }

    if (!this.isLiveMode()) {
      this.stats.eventsBlockedByMode += 1;
      logger.warn('Ignored TikTok Live event because server is not in LIVE mode', {
        rawType
      });
      return {
        ok: false,
        reason: 'LIVE_DISABLED_IN_MOCK_MODE'
      };
    }

    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      this.stats.eventsRejectedValidation += 1;
      return {
        ok: false,
        reason: 'INVALID_RAW_PAYLOAD'
      };
    }

    const upperType = String(rawType || '').toUpperCase().trim();
    const candidateRawEvent = normalizeTikTokRawPayload(upperType, rawData);
    if (!candidateRawEvent) {
      this.stats.eventsRejectedValidation += 1;
      return {
        ok: false,
        reason: 'UNSUPPORTED_WEBCAST_EVENT'
      };
    }

    if (upperType === 'LIKE' && candidateRawEvent.payload) {
      if (!candidateRawEvent.payload.roomId && this.roomId) {
        candidateRawEvent.payload.roomId = String(this.roomId);
      }
      if (
        candidateRawEvent.payload.likeDelta === undefined &&
        candidateRawEvent.payload.totalLikeCount !== undefined &&
        this.gameStateManager &&
        this.gameStateManager.deduplicator
      ) {
        const roomKey = candidateRawEvent.payload.roomId
          ? `room:${candidateRawEvent.payload.roomId}`
          : null;
        const baseline = roomKey
          ? this.gameStateManager.deduplicator.getLikeBaseline(
              roomKey,
              this.gameStateManager._now ? this.gameStateManager._now() : Date.now()
            )
          : null;
        if (baseline) {
          const derived = Number(candidateRawEvent.payload.totalLikeCount) - baseline.lastTotalLikeCount;
          if (Number.isFinite(derived) && derived > 10000) {
            candidateRawEvent.payload.likeDelta = derived;
          }
        }
      }
    }

    const validation = validateRawEvent(candidateRawEvent, this.config);
    if (!validation.valid) {
      this.stats.eventsRejectedValidation += 1;
      logger.warn('Rejected invalid TikTok Live event', {
        rawType: upperType,
        reason: validation.error
      });
      return {
        ok: false,
        reason: 'VALIDATION_FAILED',
        error: validation.error
      };
    }

    const normalizedEvent = normalizeEvent(validation.sanitized, this.config);
    const alreadySeenMsgId = Boolean(
      normalizedEvent.eventId &&
        this.gameStateManager &&
        this.gameStateManager.deduplicator &&
        this.gameStateManager.deduplicator.hasSeen(
          normalizedEvent.eventId,
          this.gameStateManager._now ? this.gameStateManager._now() : Date.now()
        )
    );

    if (
      this.rateLimiter &&
      !alreadySeenMsgId &&
      normalizedEvent.eventType !== 'GIFT' &&
      normalizedEvent.eventType !== 'LIKE'
    ) {
      const rateCheck = this.rateLimiter.checkAndRecord(
        normalizedEvent.userId,
        normalizedEvent.eventType
      );
      if (!rateCheck.allowed) {
        this.stats.eventsRateLimited += 1;
        return {
          ok: false,
          reason: 'RATE_LIMITED',
          retryAfterMs: rateCheck.retryAfterMs
        };
      }
    }

    let stateResult = null;
    if (this.eventQueue) {
      stateResult = this.eventQueue.enqueue(normalizedEvent);
    }

    this.stats.eventsEnqueued += 1;
    logger.info('Processed TikTok Live Event', {
      eventId: normalizedEvent.eventId,
      source: normalizedEvent.source,
      eventType: normalizedEvent.eventType,
      userId: normalizedEvent.userId,
      stateChanged: stateResult ? stateResult.stateChanged : false,
      stateVersion: stateResult ? stateResult.stateVersion : undefined
    });

    return {
      ok: true,
      event: normalizedEvent,
      stateResult
    };
  }
}

module.exports = {
  TikTokService,
  TIKTOK_CONNECTION_STATE,
  classifyTikTokError,
  loadTikTokConnectorModule,
  extractStableUserId,
  extractUserNickname,
  extractAvatarUrl,
  extractMessageId,
  normalizeTikTokRawPayload
};
