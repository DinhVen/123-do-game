'use strict';

const defaultConfig = require('../config');

const ALLOWED_EVENT_TYPES = new Set([
  'COMMENT',
  'CHAT',
  'JOIN_CMD',
  'LIKE',
  'GIFT',
  'VIP_JOIN',
  'MOCK_RELEASE_SEAT',
  'MOCK_CHEERS',
  'MOCK_RANDOM_WIFE_CHECK'
]);
const ALLOWED_SOURCES = new Set(['MOCK', 'LIVE']);

function sanitizeText(input, maxLength) {
  if (typeof input !== 'string') {
    return '';
  }
  const cleaned = input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .trim();
  const codePoints = Array.from(cleaned);
  return codePoints.length > maxLength ? codePoints.slice(0, maxLength).join('') : cleaned;
}

function validateRawEvent(rawEvent, config = defaultConfig) {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
    return { valid: false, error: 'Event payload must be a non-null JSON object.' };
  }

  const sec = config.security;
  const sourceRaw = rawEvent.source ? String(rawEvent.source).toUpperCase().trim() : 'MOCK';
  if (!ALLOWED_SOURCES.has(sourceRaw)) {
    return { valid: false, error: `Invalid event source: ${sourceRaw}. Allowed: MOCK, LIVE.` };
  }

  const rawType = rawEvent.eventType || rawEvent.type;
  if (!rawType || typeof rawType !== 'string') {
    return { valid: false, error: 'Missing or invalid eventType.' };
  }
  const normalizedInputType = rawType.toUpperCase().trim();
  if (!ALLOWED_EVENT_TYPES.has(normalizedInputType)) {
    return {
      valid: false,
      error: `Unsupported eventType: ${normalizedInputType}. Allowed: COMMENT, CHAT, JOIN_CMD, LIKE, GIFT.`
    };
  }

  const rawUserId =
    rawEvent.userId ??
    (rawEvent.user && rawEvent.user.userId) ??
    (normalizedInputType === 'MOCK_RELEASE_SEAT' ||
    normalizedInputType === 'MOCK_CHEERS' ||
    normalizedInputType === 'MOCK_RANDOM_WIFE_CHECK'
      ? 'mock_system'
      : undefined);
  if (typeof rawUserId !== 'string' || rawUserId.trim().length === 0) {
    return { valid: false, error: 'Missing or invalid userId (must be a non-empty string).' };
  }
  const userId = sanitizeText(rawUserId, sec.maxUserIdLength);
  if (!userId || !/^[a-zA-Z0-9_.\-@]+$/.test(userId)) {
    return {
      valid: false,
      error: 'Invalid userId format (only alphanumeric and _ . - @ allowed).'
    };
  }

  let eventId = null;
  if (rawEvent.eventId !== undefined && rawEvent.eventId !== null && rawEvent.eventId !== '') {
    const cleanedEventId = sanitizeText(String(rawEvent.eventId), 128);
    if (!cleanedEventId || !/^[a-zA-Z0-9_.\-:]+$/.test(cleanedEventId)) {
      return { valid: false, error: 'Invalid eventId format.' };
    }
    eventId = cleanedEventId;
  }

  const rawNickname = rawEvent.nickname ?? (rawEvent.user && rawEvent.user.nickname) ?? userId;
  const nickname = sanitizeText(String(rawNickname), sec.maxNicknameLength) || userId;
  const nicknameCodePoints = Array.from(nickname);
  const displayNickname =
    nicknameCodePoints.length > sec.displayNicknameLength
      ? `${nicknameCodePoints.slice(0, sec.displayNicknameLength).join('')}…`
      : nickname;

  const rawAvatarUrl = rawEvent.avatarUrl ?? (rawEvent.user && rawEvent.user.avatarUrl) ?? '';
  const avatarUrl =
    typeof rawAvatarUrl === 'string' && /^https?:\/\//i.test(rawAvatarUrl.trim())
      ? rawAvatarUrl.trim().slice(0, 256)
      : '';

  const payloadIn =
    rawEvent.payload && typeof rawEvent.payload === 'object' ? rawEvent.payload : rawEvent;

  if (
    normalizedInputType === 'COMMENT' ||
    normalizedInputType === 'CHAT' ||
    normalizedInputType === 'JOIN_CMD'
  ) {
    const rawComment = payloadIn.comment ?? rawEvent.comment;
    if (typeof rawComment !== 'string') {
      return { valid: false, error: 'Comment event requires a string comment field.' };
    }
    const comment = sanitizeText(rawComment, sec.maxCommentLength);
    if (comment.length === 0) {
      return { valid: false, error: 'Comment cannot be empty after sanitization.' };
    }
    return {
      valid: true,
      sanitized: {
        eventId,
        source: sourceRaw,
        inputType: normalizedInputType,
        userId,
        nickname,
        displayNickname,
        avatarUrl,
        payload: { comment }
      }
    };
  }

  if (normalizedInputType === 'LIKE') {
    const rawTotalLikeCount =
      payloadIn.totalLikeCount ??
      rawEvent.totalLikeCount ??
      payloadIn.total ??
      rawEvent.total;
    let totalLikeCount = null;
    if (rawTotalLikeCount !== undefined && rawTotalLikeCount !== null && rawTotalLikeCount !== '') {
      const parsedTotal = Number(rawTotalLikeCount);
      if (!Number.isInteger(parsedTotal) || parsedTotal < 0) {
        return {
          valid: false,
          error: 'LIKE event totalLikeCount must be a non-negative integer when provided.'
        };
      }
      totalLikeCount = parsedTotal;
    }

    const rawRoomId = payloadIn.roomId ?? rawEvent.roomId;
    let roomId = null;
    if (rawRoomId !== undefined && rawRoomId !== null && rawRoomId !== '') {
      const cleanedRoomId = sanitizeText(String(rawRoomId), 64);
      if (!cleanedRoomId || !/^[a-zA-Z0-9_.\-:]+$/.test(cleanedRoomId)) {
        return { valid: false, error: 'Invalid roomId format in LIKE event.' };
      }
      roomId = cleanedRoomId;
    }

    const rawCreateTime = payloadIn.createTime ?? rawEvent.createTime;
    let createTime = null;
    if (rawCreateTime !== undefined && rawCreateTime !== null && rawCreateTime !== '') {
      const parsedCreateTime = Number(rawCreateTime);
      if (!Number.isFinite(parsedCreateTime) || parsedCreateTime < 0) {
        return { valid: false, error: 'LIKE event createTime must be a non-negative number.' };
      }
      createTime = Math.floor(parsedCreateTime);
    }

    const rawLikeDelta =
      payloadIn.likeDelta ??
      payloadIn.likeCount ??
      rawEvent.likeCount ??
      payloadIn.count ??
      rawEvent.count;

    let likeDelta = null;
    if (rawLikeDelta !== undefined && rawLikeDelta !== null && rawLikeDelta !== '') {
      const parsedDelta = Number(rawLikeDelta);
      if (!Number.isInteger(parsedDelta) || parsedDelta <= 0 || parsedDelta > 10000) {
        return {
          valid: false,
          error: 'LIKE event requires an integer likeDelta/likeCount between 1 and 10000.'
        };
      }
      likeDelta = parsedDelta;
    } else if (sourceRaw !== 'LIVE' || totalLikeCount === null || !roomId) {
      return {
        valid: false,
        error:
          'LIKE event requires an integer likeDelta/likeCount between 1 and 10000 (or LIVE totalLikeCount with a valid roomId).'
      };
    }

    return {
      valid: true,
      sanitized: {
        eventId,
        source: sourceRaw,
        inputType: 'LIKE',
        userId,
        nickname,
        displayNickname,
        avatarUrl,
        payload: {
          likeDelta,
          totalLikeCount,
          roomId,
          createTime
        }
      }
    };
  }

  if (normalizedInputType === 'GIFT') {
    const rawMockGiftKey =
      payloadIn.mockGiftKey ?? rawEvent.mockGiftKey ?? payloadIn.giftKey ?? '';
    const mockGiftKey = sanitizeText(String(rawMockGiftKey), 64);

    const rawGiftId = payloadIn.giftId ?? rawEvent.giftId;
    let giftId = null;
    if (rawGiftId !== undefined && rawGiftId !== null && rawGiftId !== '') {
      const cleanedGiftId = sanitizeText(String(rawGiftId), 64);
      if (!cleanedGiftId || !/^[a-zA-Z0-9_.\-]+$/.test(cleanedGiftId)) {
        return { valid: false, error: 'Invalid giftId format.' };
      }
      giftId = cleanedGiftId;
    }

    if (sourceRaw === 'MOCK') {
      if (!mockGiftKey) {
        return {
          valid: false,
          error: 'GIFT event in Mock Simulator requires a non-empty mockGiftKey.'
        };
      }
      const knownMockGifts = (config.mockSimulator && config.mockSimulator.mockGifts) || {};
      if (!knownMockGifts[mockGiftKey]) {
        return {
          valid: false,
          error: `Unknown mockGiftKey: ${mockGiftKey}. Allowed keys: ${Object.keys(knownMockGifts).join(', ')}`
        };
      }
    } else if (!giftId && !mockGiftKey) {
      return {
        valid: false,
        error: 'LIVE GIFT event requires a valid giftId.'
      };
    }
    const rawRepeat = payloadIn.repeatCount ?? rawEvent.repeatCount ?? 1;
    const repeatCount = Number(rawRepeat);
    if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 1000) {
      return {
        valid: false,
        error: 'GIFT event repeatCount must be an integer between 1 and 1000.'
      };
    }
    const rawTargetSeat = payloadIn.targetSeatIndex ?? rawEvent.targetSeatIndex;
    const rawTargetSeatId = payloadIn.targetSeatId ?? rawEvent.targetSeatId;
    let targetSeatIndex = null;
    if (rawTargetSeat !== undefined && rawTargetSeat !== null && rawTargetSeat !== '') {
      const parsedSeat = Number(rawTargetSeat);
      if (!Number.isInteger(parsedSeat) || parsedSeat < 0 || parsedSeat >= config.gameplayV1.maxSeats) {
        return {
          valid: false,
          error: `targetSeatIndex must be an integer between 0 and ${config.gameplayV1.maxSeats - 1}.`
        };
      }
      targetSeatIndex = parsedSeat;
    } else if (rawTargetSeatId !== undefined && rawTargetSeatId !== null && rawTargetSeatId !== '') {
      const parsedSeatId = Number(rawTargetSeatId);
      if (!Number.isInteger(parsedSeatId) || parsedSeatId < 1 || parsedSeatId > config.gameplayV1.maxSeats) {
        return {
          valid: false,
          error: `targetSeatId must be an integer between 1 and ${config.gameplayV1.maxSeats}.`
        };
      }
      targetSeatIndex = parsedSeatId - 1;
    }

    const rawTargetUserId = payloadIn.targetUserId ?? rawEvent.targetUserId;
    let targetUserId = null;
    if (rawTargetUserId !== undefined && rawTargetUserId !== null && rawTargetUserId !== '') {
      const cleanedTargetUser = sanitizeText(String(rawTargetUserId), sec.maxUserIdLength);
      if (!cleanedTargetUser || !/^[a-zA-Z0-9_.\-@]+$/.test(cleanedTargetUser)) {
        return { valid: false, error: 'Invalid targetUserId format.' };
      }
      targetUserId = cleanedTargetUser;
    }

    const rawRepeatEnd = payloadIn.repeatEnd ?? rawEvent.repeatEnd;
    let repeatEnd = null;
    if (rawRepeatEnd !== undefined && rawRepeatEnd !== null) {
      if (typeof rawRepeatEnd === 'boolean') {
        repeatEnd = rawRepeatEnd;
      } else if (rawRepeatEnd === 1 || rawRepeatEnd === '1') {
        repeatEnd = true;
      } else if (rawRepeatEnd === 0 || rawRepeatEnd === '0') {
        repeatEnd = false;
      } else {
        return { valid: false, error: 'GIFT repeatEnd must be a boolean or 0/1 when provided.' };
      }
    }

    const rawStreakId =
      payloadIn.streakId ?? rawEvent.streakId ?? payloadIn.groupId ?? rawEvent.groupId;
    let streakId = null;
    if (rawStreakId !== undefined && rawStreakId !== null && rawStreakId !== '') {
      const cleanedStreak = sanitizeText(String(rawStreakId), 64);
      if (!cleanedStreak || !/^[a-zA-Z0-9_.\-:]+$/.test(cleanedStreak)) {
        return { valid: false, error: 'Invalid streakId format.' };
      }
      streakId = cleanedStreak !== '0' ? cleanedStreak : null;
    }

    const rawGiftType = payloadIn.giftType ?? rawEvent.giftType;
    let giftType = null;
    if (rawGiftType !== undefined && rawGiftType !== null && rawGiftType !== '') {
      const parsedGiftType = Number(rawGiftType);
      if (!Number.isInteger(parsedGiftType) || parsedGiftType < 0) {
        return { valid: false, error: 'GIFT giftType must be a non-negative integer when provided.' };
      }
      giftType = parsedGiftType;
    }

    const rawCombo = payloadIn.combo ?? rawEvent.combo;
    let combo = null;
    if (rawCombo !== undefined && rawCombo !== null) {
      if (typeof rawCombo !== 'boolean') {
        return { valid: false, error: 'GIFT combo must be a boolean when provided.' };
      }
      combo = rawCombo;
    }

    const rawDiamondCount = payloadIn.diamondCount ?? rawEvent.diamondCount;
    let diamondCount = null;
    if (rawDiamondCount !== undefined && rawDiamondCount !== null && rawDiamondCount !== '') {
      const parsedDiamonds = Number(rawDiamondCount);
      if (!Number.isInteger(parsedDiamonds) || parsedDiamonds < 0) {
        return {
          valid: false,
          error: 'GIFT diamondCount must be a non-negative integer when provided.'
        };
      }
      diamondCount = parsedDiamonds;
    }

    const rawGiftName = payloadIn.giftName ?? rawEvent.giftName;
    const giftName =
      typeof rawGiftName === 'string' && rawGiftName.trim().length > 0
        ? sanitizeText(rawGiftName, 64) || null
        : null;

    return {
      valid: true,
      sanitized: {
        eventId,
        source: sourceRaw,
        inputType: 'GIFT',
        userId,
        nickname,
        displayNickname,
        avatarUrl,
        payload: {
          mockGiftKey: mockGiftKey || null,
          giftId,
          giftName,
          giftType,
          combo,
          diamondCount,
          repeatCount,
          repeatEnd,
          streakId,
          groupId: streakId,
          targetSeatIndex,
          targetUserId
        }
      }
    };
  }

  if (normalizedInputType === 'VIP_JOIN') {
    if (sourceRaw !== 'MOCK') {
      return { valid: false, error: 'VIP_JOIN event is restricted to MOCK source.' };
    }
    return {
      valid: true,
      sanitized: {
        eventId,
        source: sourceRaw,
        inputType: 'VIP_JOIN',
        userId,
        nickname,
        displayNickname,
        avatarUrl,
        payload: { isVIP: true }
      }
    };
  }

  if (normalizedInputType === 'MOCK_RELEASE_SEAT') {
    if (sourceRaw !== 'MOCK') {
      return { valid: false, error: 'MOCK_RELEASE_SEAT event is restricted to MOCK source.' };
    }
    const rawSeatId = payloadIn.seatId ?? rawEvent.seatId;
    const seatId = Number(rawSeatId);
    if (!Number.isInteger(seatId) || seatId < 1 || seatId > config.gameplayV1.maxSeats) {
      return {
        valid: false,
        error: `MOCK_RELEASE_SEAT requires an integer seatId between 1 and ${config.gameplayV1.maxSeats}.`
      };
    }
    return {
      valid: true,
      sanitized: {
        eventId,
        source: sourceRaw,
        inputType: 'MOCK_RELEASE_SEAT',
        userId,
        nickname,
        displayNickname,
        avatarUrl,
        payload: { seatId }
      }
    };
  }

  if (normalizedInputType === 'MOCK_CHEERS') {
    if (sourceRaw !== 'MOCK') {
      return { valid: false, error: 'MOCK_CHEERS event is restricted to MOCK source.' };
    }
    return {
      valid: true,
      sanitized: {
        eventId,
        source: sourceRaw,
        inputType: 'MOCK_CHEERS',
        userId,
        nickname,
        displayNickname,
        avatarUrl,
        payload: {}
      }
    };
  }

  if (normalizedInputType === 'MOCK_RANDOM_WIFE_CHECK') {
    if (sourceRaw !== 'MOCK') {
      return { valid: false, error: 'MOCK_RANDOM_WIFE_CHECK event is restricted to MOCK source.' };
    }
    return {
      valid: true,
      sanitized: {
        eventId,
        source: sourceRaw,
        inputType: 'MOCK_RANDOM_WIFE_CHECK',
        userId,
        nickname,
        displayNickname,
        avatarUrl,
        payload: {}
      }
    };
  }

  return { valid: false, error: 'Invalid event payload.' };
}

module.exports = {
  sanitizeText,
  validateRawEvent
};
