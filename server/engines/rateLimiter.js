'use strict';

class BoundedRateLimiter {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 5000;
    this.windowsMs = {
      JOIN_CMD: 3000,
      COMMENT: 1000,
      CHAT: 1000,
      VIP_JOIN: 1000,
      LIKE: 200,
      GIFT: 200,
      ...(options.windowsMs || {})
    };
    this.buckets = new Map();
  }

  _evictExpired(now = Date.now()) {
    for (const [key, expiresAt] of this.buckets.entries()) {
      if (expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  checkAndRecord(userId, eventType, now = Date.now()) {
    if (!userId || typeof userId !== 'string' || !eventType || typeof eventType !== 'string') {
      return { allowed: true, retryAfterMs: 0 };
    }

    const windowMs = this.windowsMs[eventType] || 0;
    if (windowMs <= 0) {
      return { allowed: true, retryAfterMs: 0 };
    }

    if (this.buckets.size >= this.maxEntries) {
      this._evictExpired(now);
      if (this.buckets.size >= this.maxEntries) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey !== undefined) {
          this.buckets.delete(oldestKey);
        }
      }
    }

    const bucketKey = `${userId}:${eventType}`;
    const existingExpiresAt = this.buckets.get(bucketKey);

    if (existingExpiresAt !== undefined && existingExpiresAt > now) {
      return {
        allowed: false,
        retryAfterMs: existingExpiresAt - now
      };
    }

    this.buckets.delete(bucketKey);
    this.buckets.set(bucketKey, now + windowMs);

    return {
      allowed: true,
      retryAfterMs: 0
    };
  }

  clear() {
    this.buckets.clear();
  }

  getSize() {
    return this.buckets.size;
  }
}

module.exports = {
  BoundedRateLimiter
};
