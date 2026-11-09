'use strict';

const defaultConfig = require('../config');
const logger = require('../logger');
const { validateRawEvent } = require('../engines/inputValidator');
const { normalizeEvent } = require('../engines/eventNormalizer');
const { BoundedRateLimiter } = require('../engines/rateLimiter');

class MockService {
  constructor(config = defaultConfig, io = null, eventQueue = null, gameStateManager = null) {
    this.config = config;
    this.io = io;
    this.eventQueue = eventQueue;
    this.gameStateManager = gameStateManager;
    this.recentEvents = [];
    this.maxRecentEvents =
      (config.mockSimulator && config.mockSimulator.maxRecentEvents) || 50;
    this.rateLimiter = new BoundedRateLimiter({
      maxEntries: (config.security && config.security.rateLimitMaxEntries) || 5000,
      windowsMs: config.security && config.security.rateLimitWindowsMs
    });
  }

  setSocketServer(io) {
    this.io = io;
  }

  setEventQueue(eventQueue) {
    this.eventQueue = eventQueue;
  }

  processMockEvent(rawEvent) {
    const isLive =
      (this.gameStateManager && this.gameStateManager.mode === 'LIVE') ||
      (this.config.app && this.config.app.defaultMode === 'LIVE');
    if (isLive) {
      logger.warn('Blocked Mock Event while server is in LIVE mode');
      return {
        ok: false,
        error: 'Mock Simulator is disabled in LIVE mode.'
      };
    }

    const payloadWithMockSource =
      rawEvent && typeof rawEvent === 'object' && !Array.isArray(rawEvent)
        ? { ...rawEvent, source: 'MOCK' }
        : rawEvent;

    const validation = validateRawEvent(payloadWithMockSource, this.config);
    if (!validation.valid) {
      logger.warn('Rejected invalid Mock Event', { reason: validation.error });
      return {
        ok: false,
        error: validation.error
      };
    }

    const normalizedEvent = normalizeEvent(validation.sanitized, this.config);

    const enforceRateLimit =
      Boolean(rawEvent && rawEvent.enforceRateLimit) ||
      (this.config.security && this.config.security.rateLimitBypassInMock === false);
    if (enforceRateLimit) {
      const rateCheck = this.rateLimiter.checkAndRecord(
        normalizedEvent.userId,
        normalizedEvent.eventType
      );
      if (!rateCheck.allowed) {
        logger.warn('Rate limited Mock Event', {
          userId: normalizedEvent.userId,
          eventType: normalizedEvent.eventType,
          retryAfterMs: rateCheck.retryAfterMs
        });
        return {
          ok: false,
          error: 'Rate limit exceeded.',
          retryAfterMs: rateCheck.retryAfterMs
        };
      }
    }

    this.recentEvents.push(normalizedEvent);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    let stateResult = null;
    if (this.eventQueue) {
      stateResult = this.eventQueue.enqueue(normalizedEvent);
    }

    logger.info('Processed Mock Event', {
      eventId: normalizedEvent.eventId,
      source: normalizedEvent.source,
      eventType: normalizedEvent.eventType,
      userId: normalizedEvent.userId,
      stateChanged: stateResult ? stateResult.stateChanged : false,
      stateVersion: stateResult ? stateResult.stateVersion : undefined
    });

    if (this.io) {
      this.io.emit('mock:event_normalized', normalizedEvent);
    }

    return {
      ok: true,
      event: normalizedEvent,
      stateResult
    };
  }

  simulateCommentNhau(userId = 'mock_user_01', nickname = 'Khách Nhậu 01') {
    return this.processMockEvent({
      eventType: 'COMMENT',
      userId,
      nickname,
      payload: { comment: 'nhậu' }
    });
  }

  simulateCommentDo(userId = 'mock_user_02', nickname = 'Khách Nhậu 02') {
    return this.processMockEvent({
      eventType: 'COMMENT',
      userId,
      nickname,
      payload: { comment: 'dô' }
    });
  }

  simulateChat(
    userId = 'mock_user_01',
    nickname = 'Khách Nhậu 01',
    comment = 'Dô 100% anh em ơi!'
  ) {
    return this.processMockEvent({
      eventType: 'COMMENT',
      userId,
      nickname,
      payload: { comment }
    });
  }

  simulateLike(userId = 'mock_user_03', nickname = 'Khách Thả Like', likeDelta = 100) {
    return this.processMockEvent({
      eventType: 'LIKE',
      userId,
      nickname,
      payload: { likeDelta }
    });
  }

  simulateGift(
    userId = 'mock_user_04',
    nickname = 'Khách Tặng Quà',
    mockGiftKey = 'MOCK_GIFT_SMALL',
    repeatCount = 1,
    targetSeatIndex = null,
    options = {}
  ) {
    return this.processMockEvent({
      ...(options.eventId ? { eventId: options.eventId } : {}),
      eventType: 'GIFT',
      userId,
      nickname,
      payload: {
        mockGiftKey,
        repeatCount,
        targetSeatIndex,
        ...(options.targetSeatId !== undefined ? { targetSeatId: options.targetSeatId } : {}),
        ...(options.targetUserId !== undefined ? { targetUserId: options.targetUserId } : {}),
        ...(options.repeatEnd !== undefined ? { repeatEnd: options.repeatEnd } : {}),
        ...(options.streakId !== undefined ? { streakId: options.streakId } : {})
      }
    });
  }

  simulateVipJoin(userId = 'mock_vip_01', nickname = 'Khách VIP 01') {
    return this.processMockEvent({
      eventType: 'VIP_JOIN',
      userId,
      nickname
    });
  }

  simulateReleaseSeat(seatId = 1) {
    return this.processMockEvent({
      eventType: 'MOCK_RELEASE_SEAT',
      userId: 'mock_system',
      nickname: 'System Mock',
      payload: { seatId }
    });
  }

  simulateCheers() {
    return this.processMockEvent({
      eventType: 'MOCK_CHEERS',
      userId: 'mock_system',
      nickname: 'System Mock'
    });
  }

  simulateRandomWifeCheck() {
    return this.processMockEvent({
      eventType: 'MOCK_RANDOM_WIFE_CHECK',
      userId: 'mock_system',
      nickname: 'System Mock'
    });
  }

  getRecentEvents() {
    return [...this.recentEvents];
  }
}

module.exports = {
  MockService
};
