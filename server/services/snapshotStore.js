'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const DEFAULT_SNAPSHOT_PATH = path.resolve(__dirname, '..', '..', 'data', 'state-snapshot.json');
const DEFAULT_V2_SNAPSHOT_PATH = path.resolve(__dirname, '..', '..', 'data', 'snapshot.v2.json');
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_THROTTLE_MS = 3000; // 3 seconds throttled save interval (Master Plan 3-5s)

class SnapshotStore {
  constructor(options = {}) {
    this.filePath = options.filePath || DEFAULT_SNAPSHOT_PATH;
    this.maxAgeMs = options.maxAgeMs || DEFAULT_MAX_AGE_MS;
    this.throttleMs =
      options.throttleMs !== undefined && Number(options.throttleMs) >= 0
        ? Number(options.throttleMs)
        : DEFAULT_THROTTLE_MS;
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    this._setTimeout =
      typeof options.setTimeoutFn === 'function'
        ? options.setTimeoutFn
        : (fn, ms) => setTimeout(fn, ms);
    this._clearTimeout =
      typeof options.clearTimeoutFn === 'function'
        ? options.clearTimeoutFn
        : (id) => clearTimeout(id);

    this.pendingSnapshot = null;
    this.throttleTimer = null;
    this.lastSavedAt = 0;
    this.lastSavedVersion = -1;
    this._writeChain = Promise.resolve();
    this._tempSeq = 0;

    this.stats = {
      syncSaves: 0,
      asyncSaves: 0,
      throttledSchedules: 0,
      skippedUnchangedSchedules: 0,
      emergencySaves: 0,
      emergencySavesRejected: 0,
      restoresSucceeded: 0,
      restoresRejected: 0
    };
  }

  setClock(nowFn) {
    if (typeof nowFn === 'function') {
      this.nowFn = nowFn;
    }
  }

  _buildPayload(snapshot, now = this.nowFn()) {
    return {
      savedAt: now,
      layoutVersion: snapshot.layoutVersion || 1,
      stateVersion: snapshot.stateVersion,
      roomId: snapshot.roomId || '123do_main_table',
      mode: snapshot.mode || 'MOCK',
      seats: snapshot.seats,
      vipQueue: snapshot.vipQueue || [],
      normalQueue: snapshot.normalQueue || [],
      leaderboardStats: Array.isArray(snapshot.leaderboardStats) ? snapshot.leaderboardStats : [],
      hostConfig: snapshot.hostConfig ? { ...snapshot.hostConfig } : null,
      likeMetrics: snapshot.likeMetrics || {
        totalLikes: 0,
        unconsumedLikes: 0,
        milestoneStep: 100,
        drunkDeltaPerMilestone: 1
      },
      timers: {
        randomWifeCooldownUntil:
          snapshot.wifeConfig && Number.isFinite(Number(snapshot.wifeConfig.cooldownUntil))
            ? Number(snapshot.wifeConfig.cooldownUntil)
            : 0
      }
    };
  }

  saveSnapshotSync(snapshot, now = this.nowFn()) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { ok: false, error: 'Invalid snapshot object.' };
    }

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload = this._buildPayload(snapshot, now);
    this._tempSeq += 1;
    const tempPath = `${this.filePath}.tmp.${process.pid}.${now}.${this._tempSeq}`;
    try {
      const serialized = JSON.stringify(payload, null, 2);
      fs.writeFileSync(tempPath, serialized, 'utf8');
      fs.renameSync(tempPath, this.filePath);
      this.lastSavedAt = now;
      this.lastSavedVersion = payload.stateVersion;
      this.stats.syncSaves += 1;
      return { ok: true, filePath: this.filePath, stateVersion: payload.stateVersion };
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (_) {
        // Ignore cleanup error
      }
      logger.error('Failed to save state snapshot atomically', { error: err.message });
      return { ok: false, error: err.message };
    }
  }

  saveSnapshotAsync(snapshot, now = this.nowFn()) {
    if (!snapshot || typeof snapshot !== 'object') {
      return Promise.resolve({ ok: false, error: 'Invalid snapshot object.' });
    }

    const payload = this._buildPayload(snapshot, now);
    this._tempSeq += 1;
    const tempPath = `${this.filePath}.tmp.${process.pid}.${now}.${this._tempSeq}`;
    const dir = path.dirname(this.filePath);

    const writeTask = async () => {
      try {
        await fs.promises.mkdir(dir, { recursive: true });
        const serialized = JSON.stringify(payload, null, 2);
        await fs.promises.writeFile(tempPath, serialized, 'utf8');
        await fs.promises.rename(tempPath, this.filePath);
        this.lastSavedAt = now;
        this.lastSavedVersion = payload.stateVersion;
        this.stats.asyncSaves += 1;
        return { ok: true, filePath: this.filePath, stateVersion: payload.stateVersion };
      } catch (err) {
        try {
          if (fs.existsSync(tempPath)) {
            await fs.promises.unlink(tempPath);
          }
        } catch (_) {}
        logger.error('Failed to save state snapshot asynchronously', { error: err.message });
        return { ok: false, error: err.message };
      }
    };

    this._writeChain = this._writeChain.then(writeTask, writeTask);
    return this._writeChain;
  }

  /**
   * Schedule a throttled snapshot write (every 3-5s per TECHNICAL_ARCHITECTURE.md 8.2).
   * Coalesces rapid state mutations so only the latest GameState is written when the timer fires.
   */
  scheduleSave(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { scheduled: false, reason: 'INVALID_SNAPSHOT' };
    }

    if (
      this.throttleTimer === null &&
      Number.isInteger(snapshot.stateVersion) &&
      snapshot.stateVersion >= 0 &&
      snapshot.stateVersion === this.lastSavedVersion
    ) {
      this.stats.skippedUnchangedSchedules += 1;
      return {
        scheduled: false,
        skippedUnchanged: true,
        stateVersion: snapshot.stateVersion
      };
    }

    this.pendingSnapshot = snapshot;
    this.stats.throttledSchedules += 1;

    if (this.throttleTimer !== null) {
      return { scheduled: true, coalesced: true, stateVersion: snapshot.stateVersion };
    }

    const delayMs = Math.max(0, this.throttleMs);
    this.throttleTimer = this._setTimeout(() => {
      this.throttleTimer = null;
      const toSave = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (toSave) {
        this.saveSnapshotAsync(toSave, this.nowFn()).catch(() => {});
      }
    }, delayMs);

    return {
      scheduled: true,
      coalesced: false,
      delayMs,
      stateVersion: snapshot.stateVersion
    };
  }

  cancelPendingTimer() {
    if (this.throttleTimer !== null) {
      try {
        this._clearTimeout(this.throttleTimer);
      } catch (_) {}
      this.throttleTimer = null;
    }
  }

  flushSync(now = this.nowFn()) {
    this.cancelPendingTimer();
    if (this.pendingSnapshot) {
      const toFlush = this.pendingSnapshot;
      this.pendingSnapshot = null;
      return this.saveSnapshotSync(toFlush, now);
    }
    return { ok: true, flushed: false, stateVersion: this.lastSavedVersion };
  }

  shutdown(now = this.nowFn()) {
    return this.flushSync(now);
  }

  /**
   * Emergency synchronous snapshot save for fatal error handling (Task 5.2).
   * Validates GameState invariants before writing so a corrupted in-memory state
   * never overwrites a previously valid state-snapshot.json on disk.
   */
  saveEmergencySnapshotSync(gameStateManager, now = this.nowFn()) {
    this.cancelPendingTimer();
    this.pendingSnapshot = null;

    if (!gameStateManager || typeof gameStateManager.getSnapshot !== 'function') {
      this.stats.emergencySavesRejected += 1;
      logger.warn('Emergency snapshot skipped: invalid GameStateManager reference');
      return { ok: false, skippedCorruptedState: true, reason: 'INVALID_GAME_STATE_MANAGER' };
    }

    let snapshot = null;
    try {
      snapshot = gameStateManager.getSnapshot();
    } catch (err) {
      this.stats.emergencySavesRejected += 1;
      logger.warn('Emergency snapshot skipped: failed to extract GameState snapshot', {
        error: logger.redactString ? logger.redactString(err.message) : err.message
      });
      return { ok: false, skippedCorruptedState: true, reason: 'SNAPSHOT_EXTRACT_ERROR' };
    }

    const candidatePayload = this._buildPayload(snapshot, now);
    const validation = this.validateSnapshotData(
      candidatePayload,
      gameStateManager.maxSeats || 6,
      gameStateManager.maxQueueSize || 30,
      now
    );

    if (!validation.valid) {
      this.stats.emergencySavesRejected += 1;
      logger.warn(
        'Emergency snapshot skipped: corrupted in-memory GameState; preserving previous valid snapshot on disk',
        { reason: validation.reason }
      );
      return { ok: false, skippedCorruptedState: true, reason: validation.reason };
    }

    const saveRes = this.saveSnapshotSync(snapshot, now);
    if (saveRes.ok) {
      this.stats.emergencySaves += 1;
    }
    return saveRes;
  }

  validateSnapshotData(data, maxSeats = 6, maxQueueSize = 30, now = Date.now()) {
    if (!data || typeof data !== 'object') {
      return { valid: false, reason: 'Snapshot is not a valid object.' };
    }
    if (!Number.isInteger(data.savedAt) || now - data.savedAt > this.maxAgeMs) {
      return { valid: false, reason: 'Snapshot expired or missing savedAt.' };
    }
    if (!Number.isInteger(data.stateVersion) || data.stateVersion < 0) {
      return { valid: false, reason: 'Invalid stateVersion in snapshot.' };
    }
    if (!Array.isArray(data.seats) || data.seats.length !== maxSeats) {
      return { valid: false, reason: `Snapshot seats length must be ${maxSeats}.` };
    }
    if (!Array.isArray(data.vipQueue) || !Array.isArray(data.normalQueue)) {
      return { valid: false, reason: 'Snapshot queues must be arrays.' };
    }
    if (data.vipQueue.length + data.normalQueue.length > maxQueueSize) {
      return { valid: false, reason: 'Snapshot waiting queue exceeds maxQueueSize.' };
    }

    const seenUserIds = new Set();
    for (let i = 0; i < maxSeats; i += 1) {
      const seat = data.seats[i];
      if (!seat || seat.seatId !== i + 1 || seat.seatIndex !== i) {
        return { valid: false, reason: `Invalid seat metadata at index ${i}.` };
      }
      if (seat.player !== null) {
        const p = seat.player;
        if (!p || typeof p.userId !== 'string' || p.userId.trim().length === 0) {
          return { valid: false, reason: `Invalid player userId on seat ${seat.seatId}.` };
        }
        if (seenUserIds.has(p.userId)) {
          return { valid: false, reason: `Duplicate userId in snapshot: ${p.userId}.` };
        }
        seenUserIds.add(p.userId);
        if (
          typeof p.drunkLevel !== 'number' ||
          !Number.isInteger(p.drunkLevel) ||
          p.drunkLevel < 0 ||
          p.drunkLevel > 100
        ) {
          return { valid: false, reason: `Invalid drunkLevel for user ${p.userId}.` };
        }
        if (!['SEATED', 'KO', 'LEAVING'].includes(p.status)) {
          return { valid: false, reason: `Invalid player status for user ${p.userId}.` };
        }
      }
    }

    for (const item of data.vipQueue) {
      if (!item || typeof item.userId !== 'string' || !item.userId.trim()) {
        return { valid: false, reason: 'Invalid userId in vipQueue.' };
      }
      if (seenUserIds.has(item.userId)) {
        return { valid: false, reason: `Duplicate userId in snapshot vipQueue: ${item.userId}.` };
      }
      seenUserIds.add(item.userId);
    }

    for (const item of data.normalQueue) {
      if (!item || typeof item.userId !== 'string' || !item.userId.trim()) {
        return { valid: false, reason: 'Invalid userId in normalQueue.' };
      }
      if (seenUserIds.has(item.userId)) {
        return {
          valid: false,
          reason: `Duplicate userId in snapshot normalQueue: ${item.userId}.`
        };
      }
      seenUserIds.add(item.userId);
    }

    return { valid: true };
  }

  loadAndRestore(gameStateManager, now = this.nowFn()) {
    if (!fs.existsSync(this.filePath)) {
      return { ok: false, reason: 'SNAPSHOT_NOT_FOUND' };
    }

    let rawData = null;
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      rawData = JSON.parse(content);
    } catch (err) {
      this.stats.restoresRejected += 1;
      logger.warn('Rejected corrupted state-snapshot.json', { error: err.message });
      return { ok: false, reason: 'CORRUPTED_SNAPSHOT_JSON', error: err.message };
    }

    const validation = this.validateSnapshotData(
      rawData,
      gameStateManager.maxSeats,
      gameStateManager.maxQueueSize,
      now
    );
    if (!validation.valid) {
      this.stats.restoresRejected += 1;
      logger.warn('Rejected invalid state-snapshot.json', { reason: validation.reason });
      return { ok: false, reason: 'INVALID_SNAPSHOT_DATA', detail: validation.reason };
    }

    // Cancel any existing KO/LEAVING timers so stale timers never fire
    for (const timer of gameStateManager.koTimers.values()) {
      clearTimeout(timer);
    }
    gameStateManager.koTimers.clear();

    if (typeof rawData.roomId === 'string' && rawData.roomId.trim()) {
      gameStateManager.roomId = rawData.roomId.trim();
    }

    if (gameStateManager.leaderboardStats && typeof gameStateManager.leaderboardStats.clear === 'function') {
      gameStateManager.leaderboardStats.clear();
      if (Array.isArray(rawData.leaderboardStats)) {
        for (const item of rawData.leaderboardStats) {
          if (item && typeof item.userId === 'string' && item.userId.trim()) {
            gameStateManager.leaderboardStats.set(item.userId.trim(), {
              userId: item.userId.trim(),
              nickname: item.nickname || item.userId.trim(),
              displayNickname: item.displayNickname || item.nickname || item.userId.trim(),
              avatarUrl: item.avatarUrl || '',
              beerCount: Number(item.beerCount) || 0,
              snackCount: Number(item.snackCount) || 0,
              totalCoins: Number(item.totalCoins) || 0,
              isVIP: Boolean(item.isVIP),
              updatedAt: Number(item.updatedAt) || now
            });
          }
        }
      }
    }

    if (rawData.hostConfig && typeof rawData.hostConfig === 'object' && gameStateManager.hostConfig) {
      if (typeof rawData.hostConfig.avatarUrl === 'string') {
        gameStateManager.hostConfig.avatarUrl = rawData.hostConfig.avatarUrl;
      }
      if (typeof rawData.hostConfig.title === 'string' && rawData.hostConfig.title.trim()) {
        gameStateManager.hostConfig.title = rawData.hostConfig.title;
      }
      if (typeof rawData.hostConfig.subtitle === 'string' && rawData.hostConfig.subtitle.trim()) {
        gameStateManager.hostConfig.subtitle = rawData.hostConfig.subtitle;
      }
    }

    gameStateManager.vipQueue = rawData.vipQueue.map((item) => ({
      ...item,
      status: 'QUEUED_VIP',
      isVIP: true,
      drunkLevel: 0,
      visualTier: 'SOBER',
      seatId: null,
      seatIndex: null,
      koToken: null,
      koAt: null
    }));

    gameStateManager.normalQueue = rawData.normalQueue.map((item) => ({
      ...item,
      status: 'QUEUED_NORMAL',
      isVIP: false,
      drunkLevel: 0,
      visualTier: 'SOBER',
      seatId: null,
      seatIndex: null,
      koToken: null,
      koAt: null
    }));

    let evictedDuringRecovery = false;

    for (let i = 0; i < gameStateManager.maxSeats; i += 1) {
      const savedSeat = rawData.seats[i];
      const targetSeat = gameStateManager.seats[i];
      if (!savedSeat.player) {
        targetSeat.player = null;
        continue;
      }

      // Only restore SEATED players directly; if a player was mid-KO/LEAVING when saved,
      // finalize their eviction and assign next from queue so no orphan KO/LEAVING state sticks without a timer
      if (savedSeat.player.status === 'SEATED' && savedSeat.player.drunkLevel < 100) {
        targetSeat.player = {
          ...savedSeat.player,
          seatId: targetSeat.seatId,
          seatIndex: targetSeat.seatIndex,
          tableId: targetSeat.tableId || savedSeat.player.tableId || 'TABLE_MAIN',
          localSeatNo: targetSeat.localSeatNo || savedSeat.player.localSeatNo || targetSeat.seatId,
          status: 'SEATED',
          visualTier: gameStateManager._computeVisualTier(
            savedSeat.player.drunkLevel,
            'SEATED'
          ),
          moveFromSeatId: null,
          koToken: null,
          koAt: null,
          leavingAt: null
        };
      } else {
        evictedDuringRecovery = true;
        targetSeat.player = null;
        gameStateManager._assignNextFromQueueToSeat(targetSeat);
      }
    }

    if (rawData.likeMetrics && typeof rawData.likeMetrics === 'object') {
      gameStateManager.likeMetrics.totalLikes = Number(rawData.likeMetrics.totalLikes) || 0;
      gameStateManager.likeMetrics.unconsumedLikes =
        gameStateManager.getActiveSeatedPlayers().length > 0
          ? Number(rawData.likeMetrics.unconsumedLikes) || 0
          : 0;
    }

    if (
      rawData.timers &&
      Number.isFinite(Number(rawData.timers.randomWifeCooldownUntil)) &&
      Number(rawData.timers.randomWifeCooldownUntil) > now
    ) {
      gameStateManager.timers.randomWifeCooldownUntil = Number(
        rawData.timers.randomWifeCooldownUntil
      );
    }

    gameStateManager.stateVersion = evictedDuringRecovery
      ? rawData.stateVersion + 1
      : rawData.stateVersion;
    gameStateManager.updatedAt = now;
    this.stats.restoresSucceeded += 1;

    const currentSnapshot = gameStateManager.getSnapshot();
    if (evictedDuringRecovery) {
      this.saveSnapshotSync(currentSnapshot, now);
    }

    logger.info('Restored GameState from state-snapshot.json', {
      stateVersion: gameStateManager.stateVersion,
      evictedDuringRecovery,
      seatedCount: currentSnapshot.seatedPlayers.length,
      totalWaiting: currentSnapshot.totalWaiting
    });

    return {
      ok: true,
      evictedDuringRecovery,
      stateVersion: gameStateManager.stateVersion,
      snapshot: currentSnapshot
    };
  }
}

module.exports = {
  SnapshotStore,
  DEFAULT_SNAPSHOT_PATH,
  DEFAULT_V2_SNAPSHOT_PATH,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_THROTTLE_MS
};
