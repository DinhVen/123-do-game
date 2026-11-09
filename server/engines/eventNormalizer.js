'use strict';

const crypto = require('crypto');
const defaultConfig = require('../config');

function isJoinKeyword(comment, joinKeywords) {
  const normalized = String(comment).trim().toLowerCase();
  return joinKeywords.some((kw) => kw.toLowerCase() === normalized);
}

function parseTableCommand(comment) {
  const normalized = String(comment || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (normalized === 'vip' || normalized === 'ban vip' || normalized === 'bàn vip' || normalized === 'banvip' || normalized === 'bànvip') {
    return {
      chatCommand: 'SWITCH_TABLE',
      targetTableId: 'TABLE_VIP',
      tableLabel: 'BÀN VIP'
    };
  }
  const match = normalized.match(/^(?:ban|bàn)\s*([1-6])$/i);
  if (match) {
    const num = Number(match[1]);
    return {
      chatCommand: 'SWITCH_TABLE',
      targetTableId: `TABLE_${num}`,
      tableLabel: `BÀN ${num}`
    };
  }
  return null;
}

function parseV2ChatCommand(comment, config = defaultConfig) {
  const tableCmd = parseTableCommand(comment);
  if (tableCmd) {
    return tableCmd;
  }
  const normalized = String(comment || '').trim().toLowerCase();
  const gp = (config && config.gameplayV1) || {};
  const drinkKeywords = gp.drinkKeywords || ['bia', 'beer', 'uong', 'uống', '100%'];
  const cheerKeywords = gp.cheerKeywords || ['dzo', 'dô', 'do', 'zo', 'cạn', 'can'];

  if (drinkKeywords.some((kw) => kw.toLowerCase() === normalized)) {
    return { chatCommand: 'DRINK_BEER', targetTableId: null };
  }
  if (cheerKeywords.some((kw) => kw.toLowerCase() === normalized)) {
    return { chatCommand: 'CHEER_TOAST', targetTableId: null };
  }
  return null;
}

function normalizeEvent(sanitizedEvent, config = defaultConfig) {
  const eventId = sanitizedEvent.eventId || `evt_${crypto.randomUUID()}`;
  const timestamp = Date.now();
  const source = sanitizedEvent.source || 'MOCK';
  const isMock = source === 'MOCK';
  const joinKeywords = config.gameplayV1.joinKeywords || ['nhậu', 'dô'];
  const isV2 = Boolean(
    config &&
      config.gameplayV1 &&
      (config.gameplayV1.layoutVersion === 2 || Number(config.gameplayV1.maxSeats) >= 28)
  );

  let eventType = sanitizedEvent.inputType;
  let normalizedPayload = {
    isMock
  };

  if (
    sanitizedEvent.inputType === 'COMMENT' ||
    sanitizedEvent.inputType === 'CHAT' ||
    sanitizedEvent.inputType === 'JOIN_CMD'
  ) {
    const comment = sanitizedEvent.payload.comment;
    const matchedJoin = isJoinKeyword(comment, joinKeywords);
    const v2Cmd = isV2 ? parseV2ChatCommand(comment, config) : null;
    eventType = matchedJoin ? 'JOIN_CMD' : 'CHAT';
    normalizedPayload = {
      isMock,
      comment,
      matchedKeyword: matchedJoin ? comment.trim().toLowerCase() : null,
      chatCommand: v2Cmd ? v2Cmd.chatCommand : null,
      targetTableId: v2Cmd ? v2Cmd.targetTableId : null
    };
  } else if (sanitizedEvent.inputType === 'LIKE') {
    eventType = 'LIKE';
    normalizedPayload = {
      isMock,
      likeDelta:
        sanitizedEvent.payload.likeDelta !== undefined
          ? sanitizedEvent.payload.likeDelta
          : null,
      totalLikeCount:
        sanitizedEvent.payload.totalLikeCount !== undefined
          ? sanitizedEvent.payload.totalLikeCount
          : null,
      roomId:
        sanitizedEvent.payload.roomId !== undefined
          ? sanitizedEvent.payload.roomId
          : null,
      createTime:
        sanitizedEvent.payload.createTime !== undefined
          ? sanitizedEvent.payload.createTime
          : null
    };
  } else if (sanitizedEvent.inputType === 'GIFT') {
    eventType = 'GIFT';
    const mockGiftMeta =
      isMock &&
      config.mockSimulator &&
      config.mockSimulator.mockGifts &&
      sanitizedEvent.payload.mockGiftKey
        ? config.mockSimulator.mockGifts[sanitizedEvent.payload.mockGiftKey] || null
        : null;
    const liveGiftMeta =
      !isMock &&
      config.gameplayV1 &&
      config.gameplayV1.liveGiftMappings &&
      sanitizedEvent.payload.giftId !== undefined &&
      sanitizedEvent.payload.giftId !== null
        ? config.gameplayV1.liveGiftMappings[String(sanitizedEvent.payload.giftId)] || null
        : null;
    const giftMeta = isMock ? mockGiftMeta : liveGiftMeta;

    const repeatEnd =
      sanitizedEvent.payload.repeatEnd !== undefined ? sanitizedEvent.payload.repeatEnd : null;
    const streakId = sanitizedEvent.payload.streakId || sanitizedEvent.payload.groupId || null;
    const effectiveGiftType =
      sanitizedEvent.payload.giftType !== undefined && sanitizedEvent.payload.giftType !== null
        ? sanitizedEvent.payload.giftType
        : giftMeta && giftMeta.giftType !== undefined && giftMeta.giftType !== null
          ? giftMeta.giftType
          : null;
    const effectiveCombo =
      typeof sanitizedEvent.payload.combo === 'boolean'
        ? sanitizedEvent.payload.combo
        : giftMeta && typeof giftMeta.combo === 'boolean'
          ? giftMeta.combo
          : null;
    const isNonStreakable =
      (effectiveGiftType !== null && Number(effectiveGiftType) !== 1) || effectiveCombo === false;
    const isStreak =
      !isNonStreakable &&
      (Boolean(streakId) ||
        typeof repeatEnd === 'boolean' ||
        effectiveGiftType === 1 ||
        effectiveCombo === true);
    normalizedPayload = {
      isMock,
      mockGiftKey: sanitizedEvent.payload.mockGiftKey,
      giftId: sanitizedEvent.payload.giftId ?? null,
      giftName: sanitizedEvent.payload.giftName ?? null,
      giftType: effectiveGiftType,
      combo: effectiveCombo,
      diamondCount:
        sanitizedEvent.payload.diamondCount !== undefined
          ? sanitizedEvent.payload.diamondCount
          : null,
      giftLabel: giftMeta
        ? giftMeta.label
        : sanitizedEvent.payload.giftName ||
          sanitizedEvent.payload.mockGiftKey ||
          (sanitizedEvent.payload.giftId ? `Gift #${sanitizedEvent.payload.giftId}` : 'UNKNOWN_GIFT'),
      actionCategory: giftMeta ? giftMeta.actionCategory : 'UNMAPPED',
      mappedActionType: giftMeta
        ? giftMeta.actionType
        : isMock
          ? 'UNMAPPED_MOCK_GIFT'
          : 'UNMAPPED_LIVE_GIFT',
      repeatCount: sanitizedEvent.payload.repeatCount,
      repeatEnd,
      streakId,
      groupId: streakId,
      isStreak,
      isNonStreakable,
      targetSeatIndex: sanitizedEvent.payload.targetSeatIndex,
      targetUserId: sanitizedEvent.payload.targetUserId || null
    };
  } else if (sanitizedEvent.inputType === 'VIP_JOIN') {
    eventType = 'VIP_JOIN';
    normalizedPayload = {
      isMock,
      isVIP: true
    };
  } else if (sanitizedEvent.inputType === 'MOCK_RELEASE_SEAT') {
    eventType = 'MOCK_RELEASE_SEAT';
    normalizedPayload = {
      isMock,
      seatId: sanitizedEvent.payload.seatId
    };
  } else if (sanitizedEvent.inputType === 'MOCK_CHEERS') {
    eventType = 'SYSTEM_CHEERS';
    normalizedPayload = {
      isMock,
      triggerSource: 'MOCK_MANUAL'
    };
  } else if (sanitizedEvent.inputType === 'MOCK_RANDOM_WIFE_CHECK') {
    eventType = 'SYSTEM_WIFE_CHECK';
    normalizedPayload = {
      isMock,
      triggerSource: 'MOCK_MANUAL'
    };
  }

  return Object.freeze({
    eventId,
    source,
    eventType,
    type: eventType,
    userId: sanitizedEvent.userId,
    nickname: sanitizedEvent.nickname,
    timestamp,
    user: Object.freeze({
      userId: sanitizedEvent.userId,
      nickname: sanitizedEvent.nickname,
      displayNickname: sanitizedEvent.displayNickname,
      avatarUrl: sanitizedEvent.avatarUrl
    }),
    payload: Object.freeze(normalizedPayload)
  });
}

module.exports = {
  normalizeEvent,
  isJoinKeyword,
  parseTableCommand,
  parseV2ChatCommand
};
