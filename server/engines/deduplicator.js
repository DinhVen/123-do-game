'use strict';

class BoundedDeduplicator {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 5000;
    this.maxStreakEntries = options.maxStreakEntries || this.maxEntries;
    this.maxLikeBaselineEntries = options.maxLikeBaselineEntries || 1000;
    this.ttlMs = options.ttlMs || 120000;
    this.streakTtlMs = options.streakTtlMs || this.ttlMs;
    this.fallbackStreakTtlMs =
      options.fallbackStreakTtlMs || Math.min(15000, this.streakTtlMs);
    this.likeBaselineTtlMs = options.likeBaselineTtlMs || 3600000;
    this.staleLikeThresholdMs = options.staleLikeThresholdMs || 5000;
    this.cache = new Map();
    this.streakCache = new Map();
    this.likeBaselineCache = new Map();
  }

  _evictExpiredLikeBaselines(now = Date.now()) {
    for (const [key, entry] of this.likeBaselineCache.entries()) {
      if (entry.expiresAt <= now) {
        this.likeBaselineCache.delete(key);
      }
    }
  }

  _evictExpiredStreaks(now = Date.now()) {
    for (const [key, entry] of this.streakCache.entries()) {
      if (entry.expiresAt <= now) {
        this.streakCache.delete(key);
      }
    }
  }

  _evictExpired(now = Date.now()) {
    for (const [key, expiresAt] of this.cache.entries()) {
      if (expiresAt <= now) {
        this.cache.delete(key);
      } else {
        // Map preserves insertion order; since TTL is uniform, we can stop early
        break;
      }
    }
  }

  hasSeen(key, now = Date.now()) {
    if (!key || typeof key !== 'string') {
      return false;
    }
    this._evictExpired(now);
    if (!this.cache.has(key)) {
      return false;
    }
    const expiresAt = this.cache.get(key);
    if (expiresAt <= now) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  markSeen(key, now = Date.now()) {
    if (!key || typeof key !== 'string') {
      return false;
    }
    this._evictExpired(now);
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, now + this.ttlMs);
    return true;
  }

  checkAndMark(key, now = Date.now()) {
    if (this.hasSeen(key, now)) {
      return true; // is duplicate
    }
    this.markSeen(key, now);
    return false; // not duplicate
  }

  resolveStreakDelta(
    streakKey,
    repeatCount,
    repeatEnd = false,
    now = Date.now(),
    options = {}
  ) {
    const rawNum = Number(repeatCount);
    if (!Number.isFinite(rawNum) || rawNum <= 0) {
      return {
        isDuplicateStreak: true,
        deltaRepeat: 0,
        lastRepeatCount: 0
      };
    }

    const normalizedRepeat = Math.floor(rawNum);
    if (!streakKey || typeof streakKey !== 'string') {
      return {
        isDuplicateStreak: false,
        deltaRepeat: normalizedRepeat,
        lastRepeatCount: normalizedRepeat
      };
    }

    this._evictExpiredStreaks(now);
    const isFallbackNoGroup = Boolean(options && options.isFallbackNoGroup);
    const hasExplicitRepeatEnd = Boolean(options && options.hasExplicitRepeatEnd);
    const entryTtl = isFallbackNoGroup ? this.fallbackStreakTtlMs : this.streakTtlMs;
    const existing = this.streakCache.get(streakKey);

    if (!existing) {
      if (this.streakCache.size >= this.maxStreakEntries) {
        const oldestKey = this.streakCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.streakCache.delete(oldestKey);
        }
      }
      this.streakCache.set(streakKey, {
        lastRepeatCount: normalizedRepeat,
        completed: Boolean(repeatEnd),
        hasExplicitRepeatEnd,
        expiresAt: now + entryTtl
      });
      return {
        isDuplicateStreak: false,
        deltaRepeat: normalizedRepeat,
        lastRepeatCount: normalizedRepeat
      };
    }

    // Fallback combo without groupId: if the previous combo already completed (repeatEnd=true),
    // or if both packets were standalone 1-gift sends without repeatEnd, start a new combo
    // instead of merging two independent combos from the same user.
    if (isFallbackNoGroup) {
      const isDuplicateEndOfCompletedFallback =
        existing.completed &&
        Boolean(repeatEnd) &&
        normalizedRepeat === existing.lastRepeatCount;
      const isNewComboAfterCompleted =
        existing.completed && !isDuplicateEndOfCompletedFallback;
      const isNewStandaloneSingleGift =
        !existing.completed &&
        !existing.hasExplicitRepeatEnd &&
        !hasExplicitRepeatEnd &&
        normalizedRepeat === 1 &&
        existing.lastRepeatCount >= 1;

      if (isNewComboAfterCompleted || isNewStandaloneSingleGift) {
        this.streakCache.delete(streakKey);
        this.streakCache.set(streakKey, {
          lastRepeatCount: normalizedRepeat,
          completed: Boolean(repeatEnd),
          hasExplicitRepeatEnd,
          expiresAt: now + entryTtl
        });
        return {
          isDuplicateStreak: false,
          deltaRepeat: normalizedRepeat,
          lastRepeatCount: normalizedRepeat
        };
      }
    }

    const deltaRepeat = Math.max(0, normalizedRepeat - existing.lastRepeatCount);
    if (deltaRepeat <= 0) {
      this.streakCache.delete(streakKey);
      this.streakCache.set(streakKey, {
        lastRepeatCount: existing.lastRepeatCount,
        completed: existing.completed || Boolean(repeatEnd),
        hasExplicitRepeatEnd: existing.hasExplicitRepeatEnd || hasExplicitRepeatEnd,
        expiresAt: now + entryTtl
      });
      return {
        isDuplicateStreak: true,
        deltaRepeat: 0,
        lastRepeatCount: existing.lastRepeatCount
      };
    }

    this.streakCache.delete(streakKey);
    this.streakCache.set(streakKey, {
      lastRepeatCount: normalizedRepeat,
      completed: existing.completed || Boolean(repeatEnd),
      hasExplicitRepeatEnd: existing.hasExplicitRepeatEnd || hasExplicitRepeatEnd,
      expiresAt: now + entryTtl
    });

    return {
      isDuplicateStreak: false,
      deltaRepeat,
      lastRepeatCount: normalizedRepeat
    };
  }

  _setLikeBaselineEntry(roomKey, entry, now = Date.now()) {
    this._evictExpiredLikeBaselines(now);
    if (this.likeBaselineCache.has(roomKey)) {
      this.likeBaselineCache.delete(roomKey);
    } else if (this.likeBaselineCache.size >= this.maxLikeBaselineEntries) {
      const oldestKey = this.likeBaselineCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.likeBaselineCache.delete(oldestKey);
      }
    }
    this.likeBaselineCache.set(roomKey, entry);
  }

  getLikeBaseline(roomKey, now = Date.now()) {
    if (!roomKey || typeof roomKey !== 'string') {
      return null;
    }
    this._evictExpiredLikeBaselines(now);
    const existing = this.likeBaselineCache.get(roomKey);
    if (!existing || existing.expiresAt <= now) {
      if (existing) {
        this.likeBaselineCache.delete(roomKey);
      }
      return null;
    }
    return existing;
  }

  clearLikeBaseline(roomKey = null) {
    if (roomKey && typeof roomKey === 'string') {
      return this.likeBaselineCache.delete(roomKey.trim());
    }
    this.likeBaselineCache.clear();
    return true;
  }

  resolveLikeDelta(roomKey, payload = {}, now = Date.now(), options = {}) {
    const maxLikeDelta = (options && options.maxLikeDelta) || 10000;
    const rawDeltaVal = payload && payload.likeDelta;
    const rawTotalVal = payload && payload.totalLikeCount;
    const rawCreateTimeVal = payload && payload.createTime;

    const hasExplicitDelta =
      rawDeltaVal !== undefined && rawDeltaVal !== null && rawDeltaVal !== '';
    const hasTotal =
      rawTotalVal !== undefined && rawTotalVal !== null && rawTotalVal !== '';
    const createTime =
      rawCreateTimeVal !== undefined &&
      rawCreateTimeVal !== null &&
      rawCreateTimeVal !== '' &&
      Number.isFinite(Number(rawCreateTimeVal))
        ? Number(rawCreateTimeVal)
        : null;

    if (hasExplicitDelta) {
      const parsedDelta = Number(rawDeltaVal);
      if (!Number.isInteger(parsedDelta) || parsedDelta <= 0 || parsedDelta > maxLikeDelta) {
        return {
          valid: false,
          noop: true,
          reason: 'INVALID_LIKE_DELTA',
          effectiveLikeDelta: 0
        };
      }
    }

    if (hasTotal) {
      const parsedTotal = Number(rawTotalVal);
      if (!Number.isInteger(parsedTotal) || parsedTotal < 0) {
        return {
          valid: false,
          noop: true,
          reason: 'INVALID_TOTAL_LIKE_COUNT',
          effectiveLikeDelta: 0
        };
      }
    }

    if (!hasExplicitDelta && !hasTotal) {
      return {
        valid: false,
        noop: true,
        reason: 'MISSING_LIKE_FIELDS',
        effectiveLikeDelta: 0
      };
    }

    const normalizedRoomKey =
      typeof roomKey === 'string' && roomKey.trim() !== '' ? roomKey.trim() : null;

    // 1. Only likeDelta (count / likeCount) is provided
    if (hasExplicitDelta && !hasTotal) {
      const explicitDelta = Number(rawDeltaVal);
      if (normalizedRoomKey) {
        const existing = this.getLikeBaseline(normalizedRoomKey, now);
        if (
          existing &&
          createTime !== null &&
          existing.lastCreateTime !== null &&
          existing.lastCreateTime - createTime > this.staleLikeThresholdMs
        ) {
          return {
            valid: true,
            noop: true,
            reason: 'STALE_LIKE_PACKET',
            effectiveLikeDelta: 0
          };
        }
      }
      return {
        valid: true,
        noop: false,
        reason: 'EXPLICIT_LIKE_DELTA',
        effectiveLikeDelta: explicitDelta
      };
    }

    // 2. Only totalLikeCount (total) is provided (no count / likeCount / likeDelta)
    if (!hasExplicitDelta && hasTotal) {
      const totalLikes = Number(rawTotalVal);
      if (!normalizedRoomKey) {
        return {
          valid: true,
          noop: true,
          reason: 'MISSING_LIKE_ROOM_SCOPE',
          effectiveLikeDelta: 0
        };
      }

      const existing = this.getLikeBaseline(normalizedRoomKey, now);
      if (!existing) {
        // First packet with only totalLikeCount -> initialize room baseline, NEVER treat as new likes
        this._setLikeBaselineEntry(
          normalizedRoomKey,
          {
            lastTotalLikeCount: totalLikes,
            coveredUpToTotal: totalLikes,
            unfilledGap: 0,
            lastCreateTime: createTime,
            expiresAt: now + this.likeBaselineTtlMs
          },
          now
        );
        return {
          valid: true,
          noop: true,
          reason: 'LIKE_BASELINE_INITIALIZED',
          effectiveLikeDelta: 0
        };
      }

      if (
        createTime !== null &&
        existing.lastCreateTime !== null &&
        existing.lastCreateTime - createTime > this.staleLikeThresholdMs
      ) {
        this._setLikeBaselineEntry(
          normalizedRoomKey,
          {
            ...existing,
            expiresAt: now + this.likeBaselineTtlMs
          },
          now
        );
        return {
          valid: true,
          noop: true,
          reason: 'STALE_LIKE_PACKET',
          effectiveLikeDelta: 0
        };
      }

      if (totalLikes <= existing.lastTotalLikeCount) {
        this._setLikeBaselineEntry(
          normalizedRoomKey,
          {
            ...existing,
            expiresAt: now + this.likeBaselineTtlMs
          },
          now
        );
        return {
          valid: true,
          noop: true,
          reason: 'STALE_OR_DECREASED_LIKE_TOTAL',
          effectiveLikeDelta: 0
        };
      }

      const derivedDelta = totalLikes - existing.lastTotalLikeCount;
      if (derivedDelta > maxLikeDelta) {
        return {
          valid: false,
          noop: true,
          reason: 'LIKE_DELTA_EXCEEDS_MAX',
          effectiveLikeDelta: derivedDelta
        };
      }

      this._setLikeBaselineEntry(
        normalizedRoomKey,
        {
          lastTotalLikeCount: totalLikes,
          coveredUpToTotal: totalLikes,
          unfilledGap: 0,
          lastCreateTime:
            createTime !== null
              ? Math.max(existing.lastCreateTime || 0, createTime)
              : existing.lastCreateTime,
          expiresAt: now + this.likeBaselineTtlMs
        },
        now
      );
      return {
        valid: true,
        noop: false,
        reason: 'DERIVED_FROM_TOTAL_BASELINE',
        effectiveLikeDelta: derivedDelta
      };
    }

    // 3. Both likeDelta (count / likeCount) and totalLikeCount (total) are provided
    const explicitDelta = Number(rawDeltaVal);
    const totalLikes = Number(rawTotalVal);

    if (!normalizedRoomKey) {
      return {
        valid: true,
        noop: false,
        reason: 'EXPLICIT_LIKE_DELTA',
        effectiveLikeDelta: explicitDelta
      };
    }

    const existing = this.getLikeBaseline(normalizedRoomKey, now);
    if (!existing) {
      this._setLikeBaselineEntry(
        normalizedRoomKey,
        {
          lastTotalLikeCount: totalLikes,
          coveredUpToTotal: totalLikes,
          unfilledGap: 0,
          lastCreateTime: createTime,
          expiresAt: now + this.likeBaselineTtlMs
        },
        now
      );
      return {
        valid: true,
        noop: false,
        reason: 'EXPLICIT_LIKE_DELTA_WITH_BASELINE_INIT',
        effectiveLikeDelta: explicitDelta
      };
    }

    if (
      createTime !== null &&
      existing.lastCreateTime !== null &&
      existing.lastCreateTime - createTime > this.staleLikeThresholdMs
    ) {
      this._setLikeBaselineEntry(
        normalizedRoomKey,
        {
          ...existing,
          expiresAt: now + this.likeBaselineTtlMs
        },
        now
      );
      return {
        valid: true,
        noop: true,
        reason: 'STALE_LIKE_PACKET',
        effectiveLikeDelta: 0
      };
    }

    if (totalLikes > existing.lastTotalLikeCount) {
      const totalJump = totalLikes - existing.lastTotalLikeCount;
      const newGap = totalJump > explicitDelta ? totalJump - explicitDelta : 0;
      const nextUnfilledGap = existing.unfilledGap + newGap;
      const nextCoveredUpTo = nextUnfilledGap === 0 ? totalLikes : existing.coveredUpToTotal;

      this._setLikeBaselineEntry(
        normalizedRoomKey,
        {
          lastTotalLikeCount: totalLikes,
          coveredUpToTotal: nextCoveredUpTo,
          unfilledGap: nextUnfilledGap,
          lastCreateTime:
            createTime !== null
              ? Math.max(existing.lastCreateTime || 0, createTime)
              : existing.lastCreateTime,
          expiresAt: now + this.likeBaselineTtlMs
        },
        now
      );
      return {
        valid: true,
        noop: false,
        reason: 'EXPLICIT_LIKE_DELTA_WITH_TOTAL_ADVANCE',
        effectiveLikeDelta: explicitDelta
      };
    }

    // totalLikes <= existing.lastTotalLikeCount: check if this out-of-order packet fills an open gap
    if (
      totalLikes > existing.coveredUpToTotal &&
      totalLikes < existing.lastTotalLikeCount &&
      existing.unfilledGap > 0
    ) {
      const appliedDelta = Math.min(explicitDelta, existing.unfilledGap);
      const remainingGap = existing.unfilledGap - appliedDelta;
      const nextCoveredUpTo =
        remainingGap === 0
          ? existing.lastTotalLikeCount
          : Math.max(existing.coveredUpToTotal, totalLikes);

      this._setLikeBaselineEntry(
        normalizedRoomKey,
        {
          lastTotalLikeCount: existing.lastTotalLikeCount,
          coveredUpToTotal: nextCoveredUpTo,
          unfilledGap: remainingGap,
          lastCreateTime:
            createTime !== null
              ? Math.max(existing.lastCreateTime || 0, createTime)
              : existing.lastCreateTime,
          expiresAt: now + this.likeBaselineTtlMs
        },
        now
      );
      return {
        valid: true,
        noop: false,
        reason: 'OUT_OF_ORDER_GAP_FILLED',
        effectiveLikeDelta: appliedDelta
      };
    }

    this._setLikeBaselineEntry(
      normalizedRoomKey,
      {
        ...existing,
        expiresAt: now + this.likeBaselineTtlMs
      },
      now
    );
    return {
      valid: true,
      noop: true,
      reason: 'STALE_OR_DECREASED_LIKE_TOTAL',
      effectiveLikeDelta: 0
    };
  }

  cleanup(now = Date.now()) {
    this._evictExpired(now);
    this._evictExpiredStreaks(now);
    this._evictExpiredLikeBaselines(now);
  }

  clear() {
    this.cache.clear();
    this.streakCache.clear();
    this.likeBaselineCache.clear();
  }

  getSize() {
    return this.cache.size;
  }

  getStreakSize(now = Date.now()) {
    this._evictExpiredStreaks(now);
    return this.streakCache.size;
  }

  getLikeBaselineSize(now = Date.now()) {
    this._evictExpiredLikeBaselines(now);
    return this.likeBaselineCache.size;
  }
}

module.exports = {
  BoundedDeduplicator
};
