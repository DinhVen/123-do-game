'use strict';

const defaultConfig = require('../config');
const logger = require('../logger');
const { BoundedDeduplicator } = require('../engines/deduplicator');

const V2_TABLE_DEFINITIONS = Object.freeze([
  { tableId: 'TABLE_1', tableNumber: 1, label: 'BÀN 1', type: 'NORMAL', seatIds: [1, 2, 3, 4] },
  { tableId: 'TABLE_2', tableNumber: 2, label: 'BÀN 2', type: 'NORMAL', seatIds: [5, 6, 7, 8] },
  { tableId: 'TABLE_3', tableNumber: 3, label: 'BÀN 3', type: 'NORMAL', seatIds: [9, 10, 11, 12] },
  { tableId: 'TABLE_VIP', tableNumber: 0, label: 'BÀN VIP', type: 'VIP', seatIds: [13, 14, 15, 16] },
  { tableId: 'TABLE_4', tableNumber: 4, label: 'BÀN 4', type: 'NORMAL', seatIds: [17, 18, 19, 20] },
  { tableId: 'TABLE_5', tableNumber: 5, label: 'BÀN 5', type: 'NORMAL', seatIds: [21, 22, 23, 24] },
  { tableId: 'TABLE_6', tableNumber: 6, label: 'BÀN 6', type: 'NORMAL', seatIds: [25, 26, 27, 28] }
]);

const V2_NORMAL_TABLE_PRIORITY = Object.freeze([
  'TABLE_2',
  'TABLE_1',
  'TABLE_4',
  'TABLE_6',
  'TABLE_3',
  'TABLE_5'
]);

function computeAppearanceSeed(userId) {
  const str = String(userId || 'guest');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100000;
}

class GameStateManager {
  constructor(
    config = defaultConfig,
    onStateChanged = null,
    onGameplayEvent = null,
    onChatBubble = null
  ) {
    this.config = config;
    this.onStateChanged = onStateChanged;
    this.onGameplayEvent = onGameplayEvent;
    this.onChatBubble = onChatBubble;
    this.eventDispatcher = null;

    const gp = config.gameplayV1 || {};
    const gpV2 = config.gameplayV2 || {};
    this.maxSeats = gp.maxSeats || 6;
    this.isV2 = Boolean(gp.layoutVersion === 2 || this.maxSeats >= 28);
    this.layoutVersion = this.isV2 ? 2 : 1;
    this.tableCount = this.isV2 ? gp.tableCount || 7 : 1;
    this.seatsPerTable = this.isV2 ? gp.seatsPerTable || 4 : this.maxSeats;
    this.maxQueueSize = gp.maxQueueSize || 30;
    this.minDrunk = gp.drunkMin !== undefined ? gp.drunkMin : 0;
    this.maxDrunk = gp.drunkMax !== undefined ? gp.drunkMax : 100;
    this.cheersIntervalMs = gp.cheersIntervalMs || 30000;
    this.cheersDrunkDelta = gp.cheersDrunkDelta || 5;
    this.likeMilestoneStep = gp.likeMilestoneStep || 100;
    this.likeDrunkDelta = gp.likeDrunkDelta || 1;
    this.koHoldDurationMs = gp.koHoldDurationMs || 3000;
    this.leavingHoldDurationMs = gp.leavingHoldDurationMs || this.koHoldDurationMs || 3000;
    this.randomWifeCheckSec = gp.randomWifeCheckSec || 60;
    this.randomWifeCheckIntervalMs =
      gp.randomWifeCheckIntervalMs || this.randomWifeCheckSec * 1000;
    this.randomWifeProbability =
      gp.randomWifeProbability !== undefined ? gp.randomWifeProbability : 0.10;
    this.randomWifeCooldownSec = gp.randomWifeCooldownSec || 180;
    this.randomWifeCooldownMs =
      gp.randomWifeCooldownMs || this.randomWifeCooldownSec * 1000;

    this.drinkChatCooldownMs =
      gp.drinkChatCooldownMs !== undefined
        ? Number(gp.drinkChatCooldownMs)
        : gpV2.drinkChatCooldownMs !== undefined
          ? Number(gpV2.drinkChatCooldownMs)
          : 3000;
    this.drinkChatDrunkDelta =
      gp.drinkChatDrunkDelta !== undefined
        ? Number(gp.drinkChatDrunkDelta)
        : gpV2.drinkChatDrunkDelta !== undefined
          ? Number(gpV2.drinkChatDrunkDelta)
          : 3;
    this.tableSwitchCooldownMs =
      gp.tableSwitchCooldownMs !== undefined
        ? Number(gp.tableSwitchCooldownMs)
        : gpV2.tableSwitchCooldownMs !== undefined
          ? Number(gpV2.tableSwitchCooldownMs)
          : 10000;
    this.vipTableMinCoins =
      gp.vipTableMinCoins !== undefined
        ? Number(gp.vipTableMinCoins)
        : gpV2.vipTableMinCoins !== undefined
          ? Number(gpV2.vipTableMinCoins)
          : 10;
    this.snackDisplayDurationMs =
      gp.snackDisplayDurationMs !== undefined
        ? Number(gp.snackDisplayDurationMs)
        : gpV2.snackDisplayDurationMs !== undefined
          ? Number(gpV2.snackDisplayDurationMs)
          : 8000;
    this.menuCatalog = gp.menuCatalog || gpV2.menuCatalog || {};

    this.nowFn = () => Date.now();
    this.randomFn = () => Math.random();

    this.roomId = '123do_main_table';
    this.mode = (config.app && config.app.defaultMode) || 'MOCK';
    this.connectionStatus = 'CONNECTED';

    this.stateVersion = 0;
    this.updatedAt = Date.now();
    this.seats = this._createInitialSeats();
    this.tableSnacks = new Map(); // tableId -> Array<{ dishKey, label, icon, addedAt, expiresAt }>
    this.leaderboardStats = new Map(); // userId -> { userId, nickname, displayNickname, avatarUrl, beerCount, snackCount, totalCoins, isVIP, updatedAt }
    this.userDrinkCooldowns = new Map(); // userId -> timestamp
    this.userSwitchCooldowns = new Map(); // userId -> timestamp
    this.hostConfig = {
      avatarUrl: '',
      title: 'QUÁN NHẬU VỈA HÈ',
      subtitle: 'CMT "VAO" ĐỂ GHÉ QUÁN'
    };

    this.vipQueue = [];
    this.normalQueue = [];

    this.likeMetrics = {
      totalLikes: 0,
      unconsumedLikes: 0,
      milestoneStep: this.likeMilestoneStep,
      drunkDeltaPerMilestone: this.likeDrunkDelta
    };

    const dedupMax =
      (config.security && config.security.dedupMaxEntries) || 5000;
    const dedupTtl =
      (config.security && config.security.dedupTtlMs) || 300000;
    this.deduplicator = new BoundedDeduplicator({
      maxEntries: dedupMax,
      ttlMs: dedupTtl
    });

    this.cheersTimer = null;
    this.cheersSequence = 0;
    this.wifeTimer = null;
    this.wifeSequence = 0;
    this.koTimers = new Map();
    this.koSequence = 0;
    this.userTargetSeats = new Map();
    this.autoResolveTikTokGifts = Boolean(gp.autoResolveTikTokGifts);

    this.timers = {
      lastCheersAt: 0,
      lastRandomWifeCheckAt: 0,
      randomWifeCooldownUntil: 0
    };
  }

  setClock(nowFn) {
    if (typeof nowFn === 'function') {
      this.nowFn = nowFn;
    }
  }

  setRandom(randomFn) {
    if (typeof randomFn === 'function') {
      this.randomFn = randomFn;
    }
  }

  _now() {
    return this.nowFn();
  }

  _random() {
    return this.randomFn();
  }

  _resolveSeatTableMeta(seatId) {
    if (!this.isV2) {
      return {
        tableId: 'TABLE_MAIN',
        tableLabel: 'BÀN CHÍNH',
        tableType: 'NORMAL',
        localSeatNo: seatId
      };
    }
    for (const def of V2_TABLE_DEFINITIONS) {
      const idx = def.seatIds.indexOf(seatId);
      if (idx !== -1) {
        return {
          tableId: def.tableId,
          tableLabel: def.label,
          tableType: def.type,
          localSeatNo: idx + 1
        };
      }
    }
    const fallbackTableNum = Math.min(6, Math.floor((seatId - 1) / 4) + 1);
    return {
      tableId: `TABLE_${fallbackTableNum}`,
      tableLabel: `BÀN ${fallbackTableNum}`,
      tableType: 'NORMAL',
      localSeatNo: ((seatId - 1) % 4) + 1
    };
  }

  _createInitialSeats() {
    const seats = [];
    for (let i = 0; i < this.maxSeats; i += 1) {
      const seatId = i + 1;
      const meta = this._resolveSeatTableMeta(seatId);
      seats.push({
        seatId,
        seatIndex: i,
        tableId: meta.tableId,
        tableLabel: meta.tableLabel,
        tableType: meta.tableType,
        localSeatNo: meta.localSeatNo,
        player: null
      });
    }
    return seats;
  }

  setHostConfig(patch = {}) {
    if (!patch || typeof patch !== 'object') return this.hostConfig;
    if (typeof patch.avatarUrl === 'string') {
      this.hostConfig.avatarUrl = patch.avatarUrl.trim();
    }
    if (typeof patch.title === 'string' && patch.title.trim()) {
      this.hostConfig.title = patch.title.trim().slice(0, 48);
    }
    if (typeof patch.subtitle === 'string' && patch.subtitle.trim()) {
      this.hostConfig.subtitle = patch.subtitle.trim().slice(0, 80);
    }
    this._bumpStateVersion('evt_host_config');
    return { ...this.hostConfig };
  }

  _getOrCreateUserStats(user, isVIP = false) {
    const userId = String((user && user.userId) || 'guest');
    const displayNickname =
      (user && user.displayNickname) ||
      (user && user.nickname && user.nickname.length > this.config.security.displayNicknameLength
        ? `${user.nickname.slice(0, this.config.security.displayNicknameLength)}…`
        : (user && user.nickname) || userId);
    const existing = this.leaderboardStats.get(userId);
    if (existing) {
      if (user && user.nickname) existing.nickname = user.nickname;
      if (displayNickname) existing.displayNickname = displayNickname;
      if (user && user.avatarUrl) existing.avatarUrl = user.avatarUrl;
      if (isVIP) existing.isVIP = true;
      return existing;
    }
    const created = {
      userId,
      nickname: (user && user.nickname) || userId,
      displayNickname,
      avatarUrl: (user && user.avatarUrl) || '',
      beerCount: 0,
      snackCount: 0,
      totalCoins: 0,
      isVIP: Boolean(isVIP),
      updatedAt: this._now()
    };
    this.leaderboardStats.set(userId, created);
    return created;
  }

  _computeDualLeaderboards() {
    const entries = Array.from(this.leaderboardStats.values());
    const topDrinkers = entries
      .filter((e) => (Number(e.beerCount) || 0) > 0)
      .sort((a, b) => {
        const diff = (Number(b.beerCount) || 0) - (Number(a.beerCount) || 0);
        if (diff !== 0) return diff;
        return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
      })
      .slice(0, 3)
      .map((e, idx) => ({
        rank: idx + 1,
        userId: e.userId,
        nickname: e.nickname,
        displayNickname: e.displayNickname,
        beerCount: Number(e.beerCount) || 0,
        isVIP: Boolean(e.isVIP)
      }));

    const topEaters = entries
      .filter((e) => (Number(e.snackCount) || 0) > 0)
      .sort((a, b) => {
        const diff = (Number(b.snackCount) || 0) - (Number(a.snackCount) || 0);
        if (diff !== 0) return diff;
        return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
      })
      .slice(0, 3)
      .map((e, idx) => ({
        rank: idx + 1,
        userId: e.userId,
        nickname: e.nickname,
        displayNickname: e.displayNickname,
        snackCount: Number(e.snackCount) || 0,
        isVIP: Boolean(e.isVIP)
      }));

    return { topDrinkers, topEaters };
  }

  isUserVipEligible(userId) {
    if (!userId) return false;
    const key = String(userId);
    const seated = this.findSeatedPlayerByUserId(key);
    if (seated && seated.player && seated.player.isVIP) {
      return true;
    }
    const stats = this.leaderboardStats.get(key);
    if (stats && (stats.isVIP || (Number(stats.totalCoins) || 0) >= this.vipTableMinCoins)) {
      return true;
    }
    const dual = this._computeDualLeaderboards();
    if (dual.topDrinkers.some((item) => item.userId === key)) {
      return true;
    }
    if (dual.topEaters.some((item) => item.userId === key)) {
      return true;
    }
    return false;
  }

  setOnStateChanged(callback) {
    this.onStateChanged = callback;
  }

  setOnGameplayEvent(callback) {
    this.onGameplayEvent = callback;
  }

  setOnChatBubble(callback) {
    this.onChatBubble = callback;
  }

  setEventDispatcher(dispatcherFn) {
    this.eventDispatcher = dispatcherFn;
  }

  _dispatchInternalEvent(internalEvent) {
    try {
      if (typeof this.eventDispatcher === 'function') {
        return Promise.resolve(this.eventDispatcher(internalEvent));
      }
      return Promise.resolve(this.processEvent(internalEvent));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  _emitGameplayEvent(payload) {
    if (typeof this.onGameplayEvent === 'function') {
      this.onGameplayEvent({
        ...payload,
        stateVersion: this.stateVersion,
        timestamp: Date.now()
      });
    }
  }

  _emitChatBubble(payload) {
    if (typeof this.onChatBubble === 'function') {
      this.onChatBubble({
        ...payload,
        stateVersion: this.stateVersion,
        timestamp: Date.now()
      });
    }
  }

  _computeVisualTier(drunkLevel, status) {
    if (status === 'LEAVING') {
      return 'LEAVING';
    }
    if (status === 'KO' || drunkLevel >= this.maxDrunk) {
      return 'KO';
    }
    if (drunkLevel >= 70) {
      return 'DRUNK';
    }
    if (drunkLevel >= 30) {
      return 'TIPSY';
    }
    return 'SOBER';
  }

  _clampDrunkLevel(value) {
    const num = Math.round(Number(value) || 0);
    return Math.max(this.minDrunk, Math.min(this.maxDrunk, num));
  }

  _bumpStateVersion(eventId = null) {
    this.stateVersion += 1;
    this.updatedAt = Date.now();
    const snapshot = this.getSnapshot();
    if (typeof this.onStateChanged === 'function') {
      this.onStateChanged(snapshot, eventId);
    }
    return snapshot;
  }

  findSeatedPlayerByUserId(userId) {
    for (const seat of this.seats) {
      if (seat.player && seat.player.userId === userId) {
        return { seat, player: seat.player };
      }
    }
    return null;
  }

  getActiveSeatedPlayers() {
    const active = [];
    for (const seat of this.seats) {
      if (seat.player && seat.player.status === 'SEATED') {
        active.push({ seat, player: seat.player });
      }
    }
    return active;
  }

  findQueueIndexByUserId(queueList, userId) {
    return queueList.findIndex((item) => item.userId === userId);
  }

  getSeatsByTableId(tableId) {
    return this.seats.filter((seat) => seat.tableId === tableId);
  }

  findEmptySeatInTable(tableId) {
    for (const seat of this.seats) {
      if (seat.tableId === tableId && seat.player === null) {
        return seat;
      }
    }
    return null;
  }

  findFirstEmptySeat(options = {}) {
    if (!this.isV2) {
      for (const seat of this.seats) {
        if (seat.player === null) {
          return seat;
        }
      }
      return null;
    }

    if (options && options.targetTableId) {
      return this.findEmptySeatInTable(options.targetTableId);
    }

    if (options && options.preferVipTable) {
      const vipSeat = this.findEmptySeatInTable('TABLE_VIP');
      if (vipSeat) {
        return vipSeat;
      }
    }

    // Pass 1: Group friends at an already-active normal table (1..3 occupied seats) in priority order
    for (const tableId of V2_NORMAL_TABLE_PRIORITY) {
      const tableSeats = this.getSeatsByTableId(tableId);
      const occupied = tableSeats.filter((s) => s.player !== null).length;
      if (occupied > 0 && occupied < tableSeats.length) {
        const emptySeat = tableSeats.find((s) => s.player === null);
        if (emptySeat) {
          return emptySeat;
        }
      }
    }

    // Pass 2: Open a fresh normal table in priority order
    for (const tableId of V2_NORMAL_TABLE_PRIORITY) {
      const emptySeat = this.findEmptySeatInTable(tableId);
      if (emptySeat) {
        return emptySeat;
      }
    }

    // Pass 3: If all 6 normal tables are full (24/24), check if VIP table has space for VIP-eligible user
    if (options && options.allowVipFallback) {
      const vipFallback = this.findEmptySeatInTable('TABLE_VIP');
      if (vipFallback) {
        return vipFallback;
      }
    }

    for (const seat of this.seats) {
      if (seat.player === null && (seat.tableId !== 'TABLE_VIP' || (options && options.allowVipFallback))) {
        return seat;
      }
    }
    return null;
  }

  getTotalWaiting() {
    return this.vipQueue.length + this.normalQueue.length;
  }

  _buildPlayerRecord(user, options = {}) {
    const now = options.joinedAt || Date.now();
    const displayNickname =
      user.displayNickname ||
      (user.nickname && user.nickname.length > this.config.security.displayNicknameLength
        ? `${user.nickname.slice(0, this.config.security.displayNicknameLength)}…`
        : user.nickname || user.userId);

    const status = options.status || 'SEATED';
    const drunkLevel = status === 'SEATED' ? this._clampDrunkLevel(options.drunkLevel || 0) : 0;
    const isVIP = Boolean(options.isVIP || this.isUserVipEligible(user.userId));
    const stats = this._getOrCreateUserStats(
      {
        userId: user.userId,
        nickname: user.nickname || user.userId,
        displayNickname,
        avatarUrl: user.avatarUrl || ''
      },
      isVIP
    );

    const seatMeta =
      options.seatId !== undefined && options.seatId !== null
        ? this._resolveSeatTableMeta(options.seatId)
        : { tableId: null, tableLabel: null, localSeatNo: null };

    return {
      userId: user.userId,
      nickname: user.nickname || user.userId,
      displayNickname,
      avatarUrl: user.avatarUrl || '',
      appearanceSeed: computeAppearanceSeed(user.userId),
      seatId: options.seatId ?? null,
      seatIndex: options.seatIndex ?? null,
      tableId: options.tableId ?? seatMeta.tableId,
      localSeatNo: options.localSeatNo ?? seatMeta.localSeatNo,
      status,
      drunkLevel,
      beerCount: Number(stats.beerCount) || 0,
      snackCount: Number(stats.snackCount) || 0,
      visualTier: this._computeVisualTier(drunkLevel, status),
      isVIP,
      joinedAt: now,
      moveFromSeatId: options.moveFromSeatId ?? null,
      movedAt: options.movedAt ?? now,
      koToken: null,
      koAt: null
    };
  }

  _assignNextFromQueueToSeat(seat) {
    let nextPlayer = null;
    if (this.vipQueue.length > 0) {
      const nextFromVip = this.vipQueue.shift();
      const stats = this._getOrCreateUserStats(nextFromVip, true);
      nextPlayer = {
        ...nextFromVip,
        seatId: seat.seatId,
        seatIndex: seat.seatIndex,
        tableId: seat.tableId || 'TABLE_MAIN',
        localSeatNo: seat.localSeatNo || seat.seatId,
        status: 'SEATED',
        drunkLevel: 0,
        beerCount: Number(stats.beerCount) || 0,
        snackCount: Number(stats.snackCount) || 0,
        visualTier: 'SOBER',
        isVIP: true,
        moveFromSeatId: null,
        movedAt: this._now(),
        koToken: null,
        koAt: null
      };
      seat.player = nextPlayer;
    } else if (this.normalQueue.length > 0) {
      if (this.isV2 && seat.tableId === 'TABLE_VIP') {
        // Only assign normal queue player to TABLE_VIP if they are VIP-eligible, otherwise leave VIP seat for VIPs or find eligible in normalQueue
        const eligibleIdx = this.normalQueue.findIndex((item) => this.isUserVipEligible(item.userId));
        if (eligibleIdx === -1) {
          return null;
        }
        const [eligibleFromNormal] = this.normalQueue.splice(eligibleIdx, 1);
        const stats = this._getOrCreateUserStats(eligibleFromNormal, true);
        nextPlayer = {
          ...eligibleFromNormal,
          seatId: seat.seatId,
          seatIndex: seat.seatIndex,
          tableId: seat.tableId,
          localSeatNo: seat.localSeatNo,
          status: 'SEATED',
          drunkLevel: 0,
          beerCount: Number(stats.beerCount) || 0,
          snackCount: Number(stats.snackCount) || 0,
          visualTier: 'SOBER',
          isVIP: true,
          moveFromSeatId: null,
          movedAt: this._now(),
          koToken: null,
          koAt: null
        };
        seat.player = nextPlayer;
        return nextPlayer;
      }
      const nextFromNormal = this.normalQueue.shift();
      const stats = this._getOrCreateUserStats(nextFromNormal, false);
      nextPlayer = {
        ...nextFromNormal,
        seatId: seat.seatId,
        seatIndex: seat.seatIndex,
        tableId: seat.tableId || 'TABLE_MAIN',
        localSeatNo: seat.localSeatNo || seat.seatId,
        status: 'SEATED',
        drunkLevel: 0,
        beerCount: Number(stats.beerCount) || 0,
        snackCount: Number(stats.snackCount) || 0,
        visualTier: 'SOBER',
        isVIP: Boolean(stats.isVIP),
        moveFromSeatId: null,
        movedAt: this._now(),
        koToken: null,
        koAt: null
      };
      seat.player = nextPlayer;
    }
    return nextPlayer;
  }

  _cancelKoTimer(seatId) {
    const existingTimer = this.koTimers.get(seatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.koTimers.delete(seatId);
    }
  }

  _scheduleKoReleaseTimer(seatId, userId, koToken) {
    this._cancelKoTimer(seatId);
    const timer = setTimeout(() => {
      this.koTimers.delete(seatId);
      const internalEvent = {
        eventId: `evt_ko_rel_${koToken}_${Date.now()}`,
        source: 'SYSTEM',
        eventType: 'SYSTEM_KO_RELEASE',
        timestamp: Date.now(),
        payload: {
          seatId,
          userId,
          koToken
        }
      };
      this._dispatchInternalEvent(internalEvent).catch((err) => {
        logger.error('Failed to dispatch SYSTEM_KO_RELEASE event', {
          seatId,
          userId,
          koToken,
          message: err.message
        });
      });
    }, this.koHoldDurationMs);

    this.koTimers.set(seatId, timer);
  }

  _applyDrunkDeltaToSeatedPlayers(delta, triggerSource, eventId = null) {
    const affectedSeats = [];
    const newlyKoPlayers = [];

    for (const seat of this.seats) {
      const player = seat.player;
      if (!player || player.status !== 'SEATED') {
        continue;
      }

      const previousDrunk = player.drunkLevel;
      const nextDrunk = this._clampDrunkLevel(previousDrunk + delta);
      player.drunkLevel = nextDrunk;

      if (nextDrunk >= this.maxDrunk) {
        player.drunkLevel = this.maxDrunk;
        player.status = 'KO';
        player.visualTier = 'KO';
        this.koSequence += 1;
        player.koToken = `ko_${this.koSequence}`;
        player.koAt = Date.now();

        this._scheduleKoReleaseTimer(seat.seatId, player.userId, player.koToken);
        newlyKoPlayers.push({
          seatId: seat.seatId,
          seatIndex: seat.seatIndex,
          userId: player.userId,
          displayNickname: player.displayNickname,
          drunkLevel: player.drunkLevel,
          status: player.status,
          koToken: player.koToken,
          holdDurationMs: this.koHoldDurationMs
        });
      } else {
        player.visualTier = this._computeVisualTier(nextDrunk, player.status);
      }

      affectedSeats.push({
        seatId: seat.seatId,
        seatIndex: seat.seatIndex,
        userId: player.userId,
        displayNickname: player.displayNickname,
        previousDrunk,
        drunkLevel: player.drunkLevel,
        status: player.status,
        visualTier: player.visualTier
      });
    }

    if (this.getActiveSeatedPlayers().length === 0) {
      this.likeMetrics.unconsumedLikes = 0;
    }

    return {
      affectedSeats,
      newlyKoPlayers,
      triggerSource,
      eventId
    };
  }

  handleJoin(user, requestVip = false, eventId = null, options = {}) {
    const userId = user && user.userId;
    if (!userId || typeof userId !== 'string') {
      return {
        stateChanged: false,
        reason: 'INVALID_USER_ID',
        stateVersion: this.stateVersion
      };
    }

    const isVIP = Boolean(requestVip || (this.isV2 && this.isUserVipEligible(userId)));

    // 1. Check if already seated
    const seatedMatch = this.findSeatedPlayerByUserId(userId);
    if (seatedMatch) {
      return {
        stateChanged: false,
        reason: 'ALREADY_SEATED',
        seatId: seatedMatch.seat.seatId,
        tableId: seatedMatch.seat.tableId,
        player: { ...seatedMatch.player },
        stateVersion: this.stateVersion
      };
    }

    // 2. Check if already in VIP Queue
    const vipIdx = this.findQueueIndexByUserId(this.vipQueue, userId);
    if (vipIdx !== -1) {
      return {
        stateChanged: false,
        reason: 'ALREADY_IN_VIP_QUEUE',
        player: { ...this.vipQueue[vipIdx] },
        stateVersion: this.stateVersion
      };
    }

    // 3. Check if already in Normal Queue
    const normalIdx = this.findQueueIndexByUserId(this.normalQueue, userId);
    if (normalIdx !== -1) {
      if (!isVIP) {
        return {
          stateChanged: false,
          reason: 'ALREADY_IN_NORMAL_QUEUE',
          player: { ...this.normalQueue[normalIdx] },
          stateVersion: this.stateVersion
        };
      }
      // Upgrade from Normal Queue to end of VIP Queue (FIFO) without taking an extra slot
      const [existingNormal] = this.normalQueue.splice(normalIdx, 1);
      const promotedPlayer = {
        ...existingNormal,
        status: 'QUEUED_VIP',
        isVIP: true,
        drunkLevel: 0,
        visualTier: 'SOBER',
        seatId: null,
        seatIndex: null
      };
      this.vipQueue.push(promotedPlayer);
      this._bumpStateVersion(eventId);

      logger.info('Player promoted from Normal Queue to VIP Queue', {
        userId,
        totalWaiting: this.getTotalWaiting(),
        stateVersion: this.stateVersion
      });

      return {
        stateChanged: true,
        action: 'PROMOTED_TO_VIP_QUEUE',
        player: { ...promotedPlayer },
        stateVersion: this.stateVersion
      };
    }

    // 4. Not seated and not in any queue: check if there is an empty seat
    const emptySeat = this.findFirstEmptySeat({
      targetTableId: options && options.targetTableId ? options.targetTableId : null,
      preferVipTable: Boolean(requestVip),
      allowVipFallback: isVIP
    });
    if (emptySeat) {
      const seatedPlayer = this._buildPlayerRecord(user, {
        seatId: emptySeat.seatId,
        seatIndex: emptySeat.seatIndex,
        tableId: emptySeat.tableId,
        localSeatNo: emptySeat.localSeatNo,
        status: 'SEATED',
        drunkLevel: 0,
        isVIP: Boolean(isVIP || emptySeat.tableId === 'TABLE_VIP')
      });
      emptySeat.player = seatedPlayer;
      this._bumpStateVersion(eventId);

      if (!requestVip) {
        this._emitGameplayEvent({
          actionType: 'DRINK',
          actionCategory: 'JOIN_SEAT',
          eventId,
          seatId: emptySeat.seatId,
          tableId: emptySeat.tableId,
          localSeatNo: emptySeat.localSeatNo,
          userId,
          displayNickname: seatedPlayer.displayNickname,
          isVIP: seatedPlayer.isVIP
        });
      }

      logger.info('Player assigned to empty seat', {
        userId,
        seatId: emptySeat.seatId,
        tableId: emptySeat.tableId,
        isVIP: seatedPlayer.isVIP,
        drunkLevel: seatedPlayer.drunkLevel,
        stateVersion: this.stateVersion
      });

      return {
        stateChanged: true,
        action: 'ASSIGNED_SEAT',
        seatId: emptySeat.seatId,
        tableId: emptySeat.tableId,
        player: { ...seatedPlayer },
        stateVersion: this.stateVersion
      };
    }

    // 5. All 6 seats are occupied -> handle waiting queue (max 30)
    const totalWaiting = this.getTotalWaiting();

    if (!isVIP) {
      if (totalWaiting >= this.maxQueueSize) {
        return {
          stateChanged: false,
          reason: 'QUEUE_FULL',
          stateVersion: this.stateVersion
        };
      }
      const queuedNormalPlayer = this._buildPlayerRecord(user, {
        seatId: null,
        seatIndex: null,
        status: 'QUEUED_NORMAL',
        isVIP: false
      });
      this.normalQueue.push(queuedNormalPlayer);
      this._bumpStateVersion(eventId);

      logger.info('Player added to Normal Queue', {
        userId,
        normalQueueLength: this.normalQueue.length,
        totalWaiting: this.getTotalWaiting(),
        stateVersion: this.stateVersion
      });

      return {
        stateChanged: true,
        action: 'ENQUEUED_NORMAL',
        player: { ...queuedNormalPlayer },
        stateVersion: this.stateVersion
      };
    }

    // 6. New VIP player when all 6 seats are occupied
    if (totalWaiting < this.maxQueueSize) {
      const queuedVipPlayer = this._buildPlayerRecord(user, {
        seatId: null,
        seatIndex: null,
        status: 'QUEUED_VIP',
        isVIP: true
      });
      this.vipQueue.push(queuedVipPlayer);
      this._bumpStateVersion(eventId);

      logger.info('Player added to VIP Queue', {
        userId,
        vipQueueLength: this.vipQueue.length,
        totalWaiting: this.getTotalWaiting(),
        stateVersion: this.stateVersion
      });

      return {
        stateChanged: true,
        action: 'ENQUEUED_VIP',
        player: { ...queuedVipPlayer },
        stateVersion: this.stateVersion
      };
    }

    // Waiting queue is full (30/30) and a new VIP arrives:
    // If Normal Queue has people, evict the last person in Normal Queue
    if (this.normalQueue.length > 0) {
      const evictedNormal = this.normalQueue.pop();
      const queuedVipPlayer = this._buildPlayerRecord(user, {
        seatId: null,
        seatIndex: null,
        status: 'QUEUED_VIP',
        isVIP: true
      });
      this.vipQueue.push(queuedVipPlayer);
      this._bumpStateVersion(eventId);

      logger.info('New VIP replaced last player in Normal Queue (queue at max capacity)', {
        vipUserId: userId,
        replacedUserId: evictedNormal.userId,
        totalWaiting: this.getTotalWaiting(),
        stateVersion: this.stateVersion
      });

      return {
        stateChanged: true,
        action: 'ENQUEUED_VIP_REPLACED_NORMAL',
        player: { ...queuedVipPlayer },
        replacedPlayer: { ...evictedNormal },
        stateVersion: this.stateVersion
      };
    }

    // All 30 waiting players are already VIP -> reject new VIP
    return {
      stateChanged: false,
      reason: 'VIP_QUEUE_FULL',
      stateVersion: this.stateVersion
    };
  }

  handleLike(payload, eventId = null, source = 'MOCK') {
    let likeDelta = null;
    let likeResolutionReason = 'EXPLICIT_LIKE_DELTA';

    const hasTotalField =
      payload &&
      payload.totalLikeCount !== undefined &&
      payload.totalLikeCount !== null &&
      payload.totalLikeCount !== '';
    const hasCreateTimeField =
      payload &&
      payload.createTime !== undefined &&
      payload.createTime !== null &&
      payload.createTime !== '';

    if (source === 'LIVE' || hasTotalField || hasCreateTimeField) {
      const rawRoomId =
        (payload && payload.roomId) || (source === 'LIVE' ? this.roomId : null);
      const roomKey = rawRoomId ? `room:${String(rawRoomId)}` : null;
      const resolved = this.deduplicator.resolveLikeDelta(
        roomKey,
        payload || {},
        this._now()
      );
      if (!resolved.valid) {
        return {
          stateChanged: false,
          reason: resolved.reason || 'INVALID_LIKE_DELTA',
          stateVersion: this.stateVersion
        };
      }
      if (resolved.noop || resolved.effectiveLikeDelta <= 0) {
        return {
          stateChanged: false,
          reason: resolved.reason || 'NO_NEW_LIKES',
          likeDelta: 0,
          unconsumedLikes: this.likeMetrics.unconsumedLikes,
          milestonesTriggered: 0,
          stateVersion: this.stateVersion
        };
      }
      likeDelta = resolved.effectiveLikeDelta;
      likeResolutionReason = resolved.reason;
    } else {
      const rawDelta = payload && payload.likeDelta;
      likeDelta = Number(rawDelta);
      if (!Number.isInteger(likeDelta) || likeDelta <= 0) {
        return {
          stateChanged: false,
          reason: 'INVALID_LIKE_DELTA',
          stateVersion: this.stateVersion
        };
      }
    }

    const activeSeated = this.getActiveSeatedPlayers();
    if (activeSeated.length === 0) {
      // Do not keep or accumulate likes when no SEATED players are on the table
      this.likeMetrics.unconsumedLikes = 0;
      return {
        stateChanged: false,
        reason: 'NO_SEATED_PLAYERS',
        likeDelta,
        likeResolutionReason,
        unconsumedLikes: 0,
        milestonesTriggered: 0,
        stateVersion: this.stateVersion
      };
    }

    this.likeMetrics.totalLikes += likeDelta;
    const accumulated = this.likeMetrics.unconsumedLikes + likeDelta;
    const milestonesTriggered = Math.floor(accumulated / this.likeMilestoneStep);
    this.likeMetrics.unconsumedLikes = accumulated % this.likeMilestoneStep;

    let drunkResult = { affectedSeats: [], newlyKoPlayers: [] };
    const totalDrunkAdded = milestonesTriggered * this.likeDrunkDelta;

    if (milestonesTriggered > 0) {
      drunkResult = this._applyDrunkDeltaToSeatedPlayers(
        totalDrunkAdded,
        'LIKE_MILESTONE',
        eventId
      );
    }

    this._bumpStateVersion(eventId);

    if (milestonesTriggered > 0) {
      this._emitGameplayEvent({
        actionType: 'LIKE_MILESTONE',
        eventId,
        milestonesTriggered,
        drunkDelta: totalDrunkAdded,
        unconsumedLikes: this.likeMetrics.unconsumedLikes,
        affectedSeats: drunkResult.affectedSeats
      });

      for (const koPlayer of drunkResult.newlyKoPlayers) {
        this._emitGameplayEvent({
          actionType: 'KO',
          eventId,
          triggerSource: 'LIKE_MILESTONE',
          ...koPlayer
        });
      }
    }

    return {
      stateChanged: true,
      action: milestonesTriggered > 0 ? 'LIKE_MILESTONE_APPLIED' : 'LIKE_ACCUMULATED',
      likeDelta,
      likeResolutionReason,
      milestonesTriggered,
      drunkDeltaApplied: totalDrunkAdded,
      unconsumedLikes: this.likeMetrics.unconsumedLikes,
      affectedSeats: drunkResult.affectedSeats,
      newlyKoPlayers: drunkResult.newlyKoPlayers,
      stateVersion: this.stateVersion
    };
  }

  handleCheers(eventId = null, triggerSource = 'SCHEDULER') {
    const activeSeated = this.getActiveSeatedPlayers();
    if (activeSeated.length === 0) {
      return {
        stateChanged: false,
        reason: 'NO_SEATED_PLAYERS',
        stateVersion: this.stateVersion
      };
    }

    const now = this._now();
    for (const { player } of activeSeated) {
      const stats = this._getOrCreateUserStats(player, player.isVIP);
      stats.beerCount = (Number(stats.beerCount) || 0) + 1;
      stats.updatedAt = now;
      player.beerCount = stats.beerCount;
    }

    const drunkResult = this._applyDrunkDeltaToSeatedPlayers(
      this.cheersDrunkDelta,
      'CHEERS',
      eventId
    );

    this._bumpStateVersion(eventId);

    this._emitGameplayEvent({
      actionType: 'CHEERS',
      eventId,
      triggerSource,
      drunkDelta: this.cheersDrunkDelta,
      affectedSeats: drunkResult.affectedSeats
    });

    for (const koPlayer of drunkResult.newlyKoPlayers) {
      this._emitGameplayEvent({
        actionType: 'KO',
        eventId,
        triggerSource: 'CHEERS',
        ...koPlayer
      });
    }

    logger.info('1, 2, 3 DÔ! cycle executed', {
      triggerSource,
      affectedCount: drunkResult.affectedSeats.length,
      newlyKoCount: drunkResult.newlyKoPlayers.length,
      stateVersion: this.stateVersion
    });

    return {
      stateChanged: true,
      action: 'CHEERS_APPLIED',
      drunkDelta: this.cheersDrunkDelta,
      affectedSeats: drunkResult.affectedSeats,
      newlyKoPlayers: drunkResult.newlyKoPlayers,
      stateVersion: this.stateVersion
    };
  }

  handleTableSwitch(user, targetTableId, eventId = null) {
    if (!user || !user.userId || !targetTableId) {
      return {
        stateChanged: false,
        reason: 'INVALID_SWITCH_REQUEST',
        stateVersion: this.stateVersion
      };
    }

    const validTable = V2_TABLE_DEFINITIONS.find((t) => t.tableId === targetTableId);
    if (!validTable) {
      return {
        stateChanged: false,
        reason: 'INVALID_TARGET_TABLE',
        targetTableId,
        stateVersion: this.stateVersion
      };
    }

    const userId = String(user.userId);
    const now = this._now();
    const isTargetVip = targetTableId === 'TABLE_VIP';
    const userEligibleForVip = this.isUserVipEligible(userId);

    // 1. Check if player is currently seated
    const seatedMatch = this.findSeatedPlayerByUserId(userId);

    if (!seatedMatch) {
      // Viewer is not seated yet and typed "BAN X" or "VIP" directly to enter that table
      if (isTargetVip && !userEligibleForVip) {
        this._emitGameplayEvent({
          actionType: 'SWITCH_TABLE_REJECTED',
          actionCategory: 'TABLE_SWITCH',
          eventId,
          userId,
          displayNickname: user.displayNickname || user.nickname || userId,
          targetTableId,
          reason: 'VIP_REQUIRED'
        });
        return {
          stateChanged: false,
          reason: 'VIP_REQUIRED',
          targetTableId,
          stateVersion: this.stateVersion
        };
      }

      const targetEmptySeat = this.findEmptySeatInTable(targetTableId);
      if (!targetEmptySeat) {
        this._emitGameplayEvent({
          actionType: 'SWITCH_TABLE_REJECTED',
          actionCategory: 'TABLE_SWITCH',
          eventId,
          userId,
          displayNickname: user.displayNickname || user.nickname || userId,
          targetTableId,
          reason: 'TARGET_TABLE_FULL'
        });
        return {
          stateChanged: false,
          reason: 'TARGET_TABLE_FULL',
          targetTableId,
          stateVersion: this.stateVersion
        };
      }

      return this.handleJoin(user, isTargetVip || userEligibleForVip, eventId, {
        targetTableId
      });
    }

    const { seat: oldSeat, player } = seatedMatch;
    if (player.status !== 'SEATED') {
      return {
        stateChanged: false,
        reason: 'PLAYER_NOT_ACTIVE_SEATED',
        seatId: oldSeat.seatId,
        stateVersion: this.stateVersion
      };
    }

    if (oldSeat.tableId === targetTableId) {
      return {
        stateChanged: false,
        reason: 'ALREADY_AT_TARGET_TABLE',
        seatId: oldSeat.seatId,
        tableId: targetTableId,
        stateVersion: this.stateVersion
      };
    }

    const lastSwitchAt = this.userSwitchCooldowns.get(userId) || 0;
    if (this.tableSwitchCooldownMs > 0 && now - lastSwitchAt < this.tableSwitchCooldownMs) {
      return {
        stateChanged: false,
        reason: 'SWITCH_TABLE_COOLDOWN',
        remainingMs: this.tableSwitchCooldownMs - (now - lastSwitchAt),
        seatId: oldSeat.seatId,
        tableId: oldSeat.tableId,
        stateVersion: this.stateVersion
      };
    }

    if (isTargetVip && !player.isVIP && !userEligibleForVip) {
      this._emitGameplayEvent({
        actionType: 'SWITCH_TABLE_REJECTED',
        actionCategory: 'TABLE_SWITCH',
        eventId,
        seatId: oldSeat.seatId,
        fromTableId: oldSeat.tableId,
        targetTableId,
        userId,
        displayNickname: player.displayNickname,
        reason: 'VIP_REQUIRED'
      });
      return {
        stateChanged: false,
        reason: 'VIP_REQUIRED',
        seatId: oldSeat.seatId,
        targetTableId,
        stateVersion: this.stateVersion
      };
    }

    const newSeat = this.findEmptySeatInTable(targetTableId);
    if (!newSeat) {
      this._emitGameplayEvent({
        actionType: 'SWITCH_TABLE_REJECTED',
        actionCategory: 'TABLE_SWITCH',
        eventId,
        seatId: oldSeat.seatId,
        fromTableId: oldSeat.tableId,
        targetTableId,
        userId,
        displayNickname: player.displayNickname,
        reason: 'TARGET_TABLE_FULL'
      });
      return {
        stateChanged: false,
        reason: 'TARGET_TABLE_FULL',
        seatId: oldSeat.seatId,
        targetTableId,
        stateVersion: this.stateVersion
      };
    }

    this._cancelKoTimer(oldSeat.seatId);
    oldSeat.player = null;

    const movedPlayer = {
      ...player,
      seatId: newSeat.seatId,
      seatIndex: newSeat.seatIndex,
      tableId: newSeat.tableId,
      localSeatNo: newSeat.localSeatNo,
      isVIP: Boolean(player.isVIP || isTargetVip || userEligibleForVip),
      moveFromSeatId: oldSeat.seatId,
      movedAt: now
    };
    newSeat.player = movedPlayer;
    this.userSwitchCooldowns.set(userId, now);

    this._bumpStateVersion(eventId);

    this._emitGameplayEvent({
      actionType: 'SWITCH_TABLE',
      actionCategory: 'TABLE_SWITCH',
      eventId,
      fromSeatId: oldSeat.seatId,
      fromTableId: oldSeat.tableId,
      seatId: newSeat.seatId,
      tableId: newSeat.tableId,
      tableLabel: validTable.label,
      localSeatNo: newSeat.localSeatNo,
      userId: movedPlayer.userId,
      displayNickname: movedPlayer.displayNickname,
      isVIP: movedPlayer.isVIP
    });

    logger.info('Player switched table', {
      userId,
      fromSeatId: oldSeat.seatId,
      fromTableId: oldSeat.tableId,
      toSeatId: newSeat.seatId,
      toTableId: newSeat.tableId,
      stateVersion: this.stateVersion
    });

    return {
      stateChanged: true,
      action: 'SWITCHED_TABLE',
      fromSeatId: oldSeat.seatId,
      fromTableId: oldSeat.tableId,
      seatId: newSeat.seatId,
      tableId: newSeat.tableId,
      player: { ...movedPlayer },
      stateVersion: this.stateVersion
    };
  }

  handleDrinkCommand(user, commandType = 'DRINK_BEER', eventId = null) {
    if (!user || !user.userId) {
      return {
        stateChanged: false,
        reason: 'INVALID_USER_ID',
        stateVersion: this.stateVersion
      };
    }

    const userId = String(user.userId);
    const seatedMatch = this.findSeatedPlayerByUserId(userId);

    // If user is not seated yet and comments "DZO" / "BIA", let them join an empty seat automatically!
    if (!seatedMatch) {
      return this.handleJoin(user, false, eventId);
    }

    const { seat, player } = seatedMatch;
    if (player.status !== 'SEATED') {
      return {
        stateChanged: false,
        reason: 'PLAYER_NOT_ACTIVE_SEATED',
        seatId: seat.seatId,
        stateVersion: this.stateVersion
      };
    }

    const now = this._now();
    const lastDrinkAt = this.userDrinkCooldowns.get(userId) || 0;
    if (this.drinkChatCooldownMs > 0 && now - lastDrinkAt < this.drinkChatCooldownMs) {
      return {
        stateChanged: false,
        reason: 'DRINK_CHAT_COOLDOWN',
        remainingMs: this.drinkChatCooldownMs - (now - lastDrinkAt),
        seatId: seat.seatId,
        stateVersion: this.stateVersion
      };
    }

    this.userDrinkCooldowns.set(userId, now);

    const stats = this._getOrCreateUserStats(player, player.isVIP);
    stats.beerCount = (Number(stats.beerCount) || 0) + 1;
    stats.updatedAt = now;
    player.beerCount = stats.beerCount;

    const previousDrunk = player.drunkLevel;
    const nextDrunk = this._clampDrunkLevel(previousDrunk + this.drinkChatDrunkDelta);
    player.drunkLevel = nextDrunk;

    let newlyKo = null;
    if (nextDrunk >= this.maxDrunk) {
      player.drunkLevel = this.maxDrunk;
      player.status = 'KO';
      player.visualTier = 'KO';
      this.koSequence += 1;
      player.koToken = `ko_${this.koSequence}`;
      player.koAt = now;
      this._scheduleKoReleaseTimer(seat.seatId, player.userId, player.koToken);
      newlyKo = {
        seatId: seat.seatId,
        seatIndex: seat.seatIndex,
        tableId: seat.tableId,
        userId: player.userId,
        displayNickname: player.displayNickname,
        drunkLevel: player.drunkLevel,
        status: player.status,
        koToken: player.koToken,
        holdDurationMs: this.koHoldDurationMs
      };
    } else {
      player.visualTier = this._computeVisualTier(nextDrunk, player.status);
    }

    this._bumpStateVersion(eventId);

    const fxActionType = commandType === 'CHEER_TOAST' ? 'TABLE_CHEERS' : 'DRINK_BEER';
    this._emitGameplayEvent({
      actionType: fxActionType,
      actionCategory: 'DRINK_ACTION',
      eventId,
      seatId: seat.seatId,
      seatIndex: seat.seatIndex,
      tableId: seat.tableId,
      userId: player.userId,
      displayNickname: player.displayNickname,
      beerCount: player.beerCount,
      drunkDelta: player.drunkLevel - previousDrunk,
      drunkLevel: player.drunkLevel
    });

    if (newlyKo) {
      this._emitGameplayEvent({
        actionType: 'KO',
        eventId,
        triggerSource: fxActionType,
        ...newlyKo
      });
    }

    return {
      stateChanged: true,
      action: fxActionType,
      seatId: seat.seatId,
      tableId: seat.tableId,
      beerCount: player.beerCount,
      drunkLevel: player.drunkLevel,
      drunkDeltaApplied: player.drunkLevel - previousDrunk,
      newlyKo,
      stateVersion: this.stateVersion
    };
  }

  handleKoRelease(payload, eventId = null) {
    const seatId = Number(payload && payload.seatId);
    const userId = payload && payload.userId;
    const koToken = payload && payload.koToken;

    if (!Number.isInteger(seatId) || seatId < 1 || seatId > this.maxSeats) {
      return {
        stateChanged: false,
        reason: 'INVALID_SEAT_ID',
        stateVersion: this.stateVersion
      };
    }

    const seat = this.seats[seatId - 1];
    if (
      !seat ||
      !seat.player ||
      seat.player.userId !== userId ||
      seat.player.status !== 'KO' ||
      seat.player.koToken !== koToken
    ) {
      return {
        stateChanged: false,
        reason: 'STALE_OR_INVALID_KO_RELEASE',
        seatId,
        stateVersion: this.stateVersion
      };
    }

    this._cancelKoTimer(seatId);

    const removedPlayer = {
      ...seat.player,
      status: 'EVICTED',
      seatId: null,
      seatIndex: null
    };
    seat.player = null;

    const nextPlayer = this._assignNextFromQueueToSeat(seat);
    if (this.getActiveSeatedPlayers().length === 0) {
      this.likeMetrics.unconsumedLikes = 0;
    }

    this._bumpStateVersion(eventId);

    this._emitGameplayEvent({
      actionType: 'KO_RELEASED',
      eventId,
      seatId,
      removedPlayer,
      nextPlayer: nextPlayer ? { ...nextPlayer } : null
    });

    logger.info('KO hold completed, seat released and next queued player assigned', {
      seatId,
      removedUserId: removedPlayer.userId,
      nextUserId: nextPlayer ? nextPlayer.userId : null,
      stateVersion: this.stateVersion
    });

    return {
      stateChanged: true,
      action: 'KO_SEAT_RELEASED',
      seatId,
      removedPlayer,
      nextPlayer: nextPlayer ? { ...nextPlayer } : null,
      stateVersion: this.stateVersion
    };
  }

  _scheduleLeavingReleaseTimer(seatId, userId, koToken) {
    this._cancelKoTimer(seatId);
    const timer = setTimeout(() => {
      this.koTimers.delete(seatId);
      const internalEvent = {
        eventId: `evt_leave_rel_${koToken}_${this._now()}`,
        source: 'SYSTEM',
        eventType: 'SYSTEM_LEAVING_RELEASE',
        timestamp: this._now(),
        payload: {
          seatId,
          userId,
          koToken
        }
      };
      this._dispatchInternalEvent(internalEvent).catch((err) => {
        logger.error('Failed to dispatch SYSTEM_LEAVING_RELEASE event', {
          seatId,
          userId,
          koToken,
          message: err.message
        });
      });
    }, this.leavingHoldDurationMs);

    this.koTimers.set(seatId, timer);
  }

  _transitionSeatedPlayerToLeaving(seat) {
    const player = seat.player;
    player.status = 'LEAVING';
    player.visualTier = 'LEAVING';
    this.koSequence += 1;
    player.koToken = `leave_${this.koSequence}`;
    player.leavingAt = this._now();

    this._scheduleLeavingReleaseTimer(seat.seatId, player.userId, player.koToken);
    if (this.getActiveSeatedPlayers().length === 0) {
      this.likeMetrics.unconsumedLikes = 0;
    }

    return {
      seatId: seat.seatId,
      seatIndex: seat.seatIndex,
      userId: player.userId,
      displayNickname: player.displayNickname,
      drunkLevel: player.drunkLevel,
      status: player.status,
      koToken: player.koToken,
      holdDurationMs: this.leavingHoldDurationMs
    };
  }

  handleLeavingRelease(payload, eventId = null) {
    const seatId = Number(payload && payload.seatId);
    const userId = payload && payload.userId;
    const koToken = payload && payload.koToken;

    if (!Number.isInteger(seatId) || seatId < 1 || seatId > this.maxSeats) {
      return {
        stateChanged: false,
        reason: 'INVALID_SEAT_ID',
        stateVersion: this.stateVersion
      };
    }

    const seat = this.seats[seatId - 1];
    if (
      !seat ||
      !seat.player ||
      seat.player.userId !== userId ||
      seat.player.status !== 'LEAVING' ||
      seat.player.koToken !== koToken
    ) {
      return {
        stateChanged: false,
        reason: 'STALE_OR_INVALID_LEAVING_RELEASE',
        seatId,
        stateVersion: this.stateVersion
      };
    }

    this._cancelKoTimer(seatId);

    const removedPlayer = {
      ...seat.player,
      status: 'EVICTED',
      seatId: null,
      seatIndex: null
    };
    seat.player = null;

    const nextPlayer = this._assignNextFromQueueToSeat(seat);
    if (this.getActiveSeatedPlayers().length === 0) {
      this.likeMetrics.unconsumedLikes = 0;
    }

    this._bumpStateVersion(eventId);

    this._emitGameplayEvent({
      actionType: 'WIFE_RELEASED',
      eventId,
      seatId,
      removedPlayer,
      nextPlayer: nextPlayer ? { ...nextPlayer } : null
    });

    logger.info('LEAVING hold completed, seat released and next queued player assigned', {
      seatId,
      removedUserId: removedPlayer.userId,
      nextUserId: nextPlayer ? nextPlayer.userId : null,
      stateVersion: this.stateVersion
    });

    return {
      stateChanged: true,
      action: 'LEAVING_SEAT_RELEASED',
      seatId,
      removedPlayer,
      nextPlayer: nextPlayer ? { ...nextPlayer } : null,
      stateVersion: this.stateVersion
    };
  }

  _addSnackToTable(tableId, dishSpec, now = this._now()) {
    if (!tableId || !dishSpec) return;
    const current = (this.tableSnacks.get(tableId) || []).filter((item) => item.expiresAt > now);
    current.push({
      dishKey: dishSpec.dishKey || 'SNACK',
      label: dishSpec.label || 'Mồi nhậu',
      icon: dishSpec.icon || '🦑',
      addedAt: now,
      expiresAt: now + this.snackDisplayDurationMs
    });
    if (current.length > 4) {
      current.splice(0, current.length - 4);
    }
    this.tableSnacks.set(tableId, current);
  }

  _resolveV2MenuDishByDiamonds(diamonds) {
    const coins = Math.max(1, Number(diamonds) || 1);
    if (coins > 100) {
      return {
        dishKey: 'MOI_CA_QUAN',
        mockGiftKey: 'MENU_MOI_CA_QUAN',
        label: '🍲 Mời cả quán (Mỗi bàn 1 Bò nướng)',
        icon: '🍲',
        actionCategory: 'MENU_SNACK',
        actionType: 'ORDER_SNACK_ALL',
        diamondCount: coins,
        snackPoints: 25,
        beerPoints: 10,
        drunkDelta: -25,
        targetMode: 'ALL_TABLES',
        isVipEligible: true
      };
    }
    if (coins >= 99) {
      return {
        dishKey: 'BO_NUONG',
        mockGiftKey: 'MENU_BO_NUONG',
        label: '🥩 Bò nướng (99 xu)',
        icon: '🥩',
        actionCategory: 'MENU_SNACK',
        actionType: 'ORDER_SNACK',
        diamondCount: coins,
        snackPoints: 15,
        beerPoints: 5,
        drunkDelta: -30,
        targetMode: 'TABLE',
        isVipEligible: true
      };
    }
    if (coins >= 30) {
      return {
        dishKey: 'CANH_GA',
        mockGiftKey: 'MENU_CANH_GA',
        label: '🍖 Cánh gà chiên (30 xu)',
        icon: '🍖',
        actionCategory: 'MENU_SNACK',
        actionType: 'ORDER_SNACK',
        diamondCount: coins,
        snackPoints: 8,
        beerPoints: 3,
        drunkDelta: -20,
        targetMode: 'TABLE',
        isVipEligible: true
      };
    }
    if (coins >= 20) {
      return {
        dishKey: 'CHAN_GA',
        mockGiftKey: 'MENU_CHAN_GA',
        label: '🍗 Chân gà sả tắc (20 xu)',
        icon: '🍗',
        actionCategory: 'MENU_SNACK',
        actionType: 'ORDER_SNACK',
        diamondCount: coins,
        snackPoints: 5,
        beerPoints: 2,
        drunkDelta: -15,
        targetMode: 'TABLE',
        isVipEligible: true
      };
    }
    if (coins >= 10) {
      return {
        dishKey: 'MUC_NUONG',
        mockGiftKey: 'MENU_MUC_NUONG',
        label: '🦑 Mực nướng (10 xu)',
        icon: '🦑',
        actionCategory: 'MENU_SNACK',
        actionType: 'ORDER_SNACK',
        diamondCount: coins,
        snackPoints: 3,
        beerPoints: 1,
        drunkDelta: -12,
        targetMode: 'TABLE',
        isVipEligible: true
      };
    }
    if (coins >= 5) {
      return {
        dishKey: 'NEM_CHUA',
        mockGiftKey: 'MENU_NEM_CHUA',
        label: '🥩 Nem chua (5 xu)',
        icon: '🥩',
        actionCategory: 'MENU_SNACK',
        actionType: 'ORDER_SNACK',
        diamondCount: coins,
        snackPoints: 2,
        beerPoints: 1,
        drunkDelta: -8,
        targetMode: 'TABLE',
        isVipEligible: false
      };
    }
    return {
      dishKey: 'LAC_RANG',
      mockGiftKey: 'MENU_LAC_RANG',
      label: '🥜 Lạc rang (1 xu)',
      icon: '🥜',
      actionCategory: 'MENU_SNACK',
      actionType: 'ORDER_SNACK',
      diamondCount: coins,
      snackPoints: 1,
      beerPoints: 0,
      drunkDelta: -5,
      targetMode: 'TABLE',
      isVipEligible: false
    };
  }

  _resolveTikTokAutoGiftSpec(payload) {
    const rawId = payload && payload.giftId !== undefined && payload.giftId !== null ? String(payload.giftId).trim() : '';
    const rawName = payload && typeof payload.giftName === 'string' ? payload.giftName.toLowerCase().trim() : '';
    const diamonds = Math.max(0, Number(payload && payload.diamondCount) || 0);

    if (this.isV2) {
      if (
        rawName.includes('wife') ||
        rawName.includes('vợ') ||
        rawName.includes('broom') ||
        rawName.includes('chổi')
      ) {
        return {
          label: '🦢 Triệu Hồi Nóc Nhà Xách Tai Về',
          actionCategory: 'WIFE_EVENT',
          actionType: 'WIFE_SUMMON',
          drunkDelta: 0,
          targetMode: 'SINGLE',
          isVipEligible: true
        };
      }
      return this._resolveV2MenuDishByDiamonds(diamonds || 1);
    }

    // 1. Check popular TikTok Gift IDs & Vietnamese/English Gift Names
    if (
      rawId === '5655' ||
      rawId === '5269' ||
      rawId === '6064' ||
      rawName.includes('rose') ||
      rawName.includes('hoa hồng') ||
      rawName.includes('tiktok') ||
      rawName === 'gg'
    ) {
      return {
        label: '🌹 Hoa Hồng • Gọi Mồi Nhỏ Giải Say (-5% say)',
        actionCategory: 'DRUNK_DECREASE',
        actionType: 'SOBER_UP',
        drunkDelta: -5,
        targetMode: 'SINGLE',
        isVipEligible: false,
        snackBonus: true
      };
    }

    if (
      rawId === '5827' ||
      rawId === '5487' ||
      rawName.includes('ice cream') ||
      rawName.includes('kem') ||
      rawName.includes('trà sữa') ||
      rawName.includes('tea') ||
      rawName.includes('finger heart') ||
      rawName.includes('tim tay') ||
      rawName.includes('mồi') ||
      rawName.includes('mực')
    ) {
      return {
        label: '🍺 Kem / Tim Tay • Ép Uống Bia (+20% say)',
        actionCategory: 'DRUNK_INCREASE',
        actionType: 'DRINK_MEDIUM',
        drunkDelta: 20,
        targetMode: 'SINGLE',
        isVipEligible: false
      };
    }

    if (
      rawName.includes('crown') ||
      rawName.includes('vương miện') ||
      rawName.includes('sunglasses') ||
      rawName.includes('kính') ||
      rawName.includes('vip')
    ) {
      return {
        label: '👑 Thẻ VIP Đại Gia + Mâm Mồi Giải Rượu (-25% say)',
        actionCategory: 'VIP_ACCESS',
        actionType: 'VIP_PASS',
        drunkDelta: -25,
        targetMode: 'SENDER',
        isVipEligible: true,
        soberSeatedSenderDelta: 25
      };
    }

    if (
      rawId === '5879' ||
      rawName.includes('doughnut') ||
      rawName.includes('donut') ||
      rawName.includes('cheers') ||
      rawName.includes('beer') ||
      rawName.includes('bia')
    ) {
      return {
        label: '🍩 Đại Gia Bao Cả Bàn (+25% say)',
        actionCategory: 'DRUNK_INCREASE',
        actionType: 'DRINK_ALL',
        drunkDelta: 25,
        targetMode: 'ALL_SEATED',
        isVipEligible: true
      };
    }

    if (
      rawId === '5659' ||
      rawName.includes('crane') ||
      rawName.includes('hạc') ||
      rawName.includes('wife') ||
      rawName.includes('vợ') ||
      rawName.includes('broom') ||
      rawName.includes('chổi')
    ) {
      return {
        label: '🦢 Triệu Hồi Nóc Nhà Xách Tai Về',
        actionCategory: 'WIFE_EVENT',
        actionType: 'WIFE_SUMMON',
        drunkDelta: 0,
        targetMode: 'SINGLE',
        isVipEligible: true
      };
    }

    // 2. Automatic fallback by TikTok Coin / Diamond Tier so 100% of TikTok gifts trigger rewards
    if (diamonds >= 99) {
      return {
        label: '🦢 Quà Khủng • Triệu Hồi Nóc Nhà Xách Tai Về',
        actionCategory: 'WIFE_EVENT',
        actionType: 'WIFE_SUMMON',
        drunkDelta: 0,
        targetMode: 'SINGLE',
        isVipEligible: true
      };
    }
    if (diamonds >= 30) {
      return {
        label: '🍻 Đại Gia Bao Cả Bàn (+25% say)',
        actionCategory: 'DRUNK_INCREASE',
        actionType: 'DRINK_ALL',
        drunkDelta: 25,
        targetMode: 'ALL_SEATED',
        isVipEligible: true
      };
    }
    if (diamonds >= 10) {
      return {
        label: '👑 Thẻ VIP Đại Gia + Mâm Mồi Giải Rượu (-25% say)',
        actionCategory: 'VIP_ACCESS',
        actionType: 'VIP_PASS',
        drunkDelta: -25,
        targetMode: 'SENDER',
        isVipEligible: true,
        soberSeatedSenderDelta: 25
      };
    }
    if (diamonds >= 2) {
      return {
        label: '🍺 Quà Tầm Trung • Ép Uống Bia (+20% say)',
        actionCategory: 'DRUNK_INCREASE',
        actionType: 'DRINK_MEDIUM',
        drunkDelta: 20,
        targetMode: 'SINGLE',
        isVipEligible: false
      };
    }
    return {
      label: '🌹 Hoa Hồng 1 Xu • Gọi Mồi Nhỏ Giải Say (-5% say)',
      actionCategory: 'DRUNK_DECREASE',
      actionType: 'SOBER_UP',
      drunkDelta: -5,
      targetMode: 'SINGLE',
      isVipEligible: false,
      snackBonus: true
    };
  }

  _resolveGiftConfig(payload, source) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (source === 'MOCK') {
      const mockGiftKey = payload.mockGiftKey;
      const mockGifts =
        (this.config.mockSimulator && this.config.mockSimulator.mockGifts) || {};
      const found = mockGiftKey ? mockGifts[mockGiftKey] : null;
      if (!found || !found.actionCategory) {
        logger.warn('Ignored unmapped Mock Gift event', { mockGiftKey });
        return null;
      }
      return found;
    }

    if (source === 'LIVE') {
      const giftIdKey = payload.giftId !== undefined && payload.giftId !== null ? String(payload.giftId) : '';
      const liveMappings =
        (this.config.gameplayV1 && this.config.gameplayV1.liveGiftMappings) || {};
      let found = giftIdKey ? liveMappings[giftIdKey] : null;
      if (
        (!found || !found.actionCategory) &&
        (this.autoResolveTikTokGifts ||
          (this.config.gameplayV1 && this.config.gameplayV1.autoResolveTikTokGifts))
      ) {
        found = this._resolveTikTokAutoGiftSpec(payload);
      }
      if (!found || !found.actionCategory) {
        logger.warn('Ignored unmapped Live Gift event (liveGiftMappings not configured for giftId)', {
          giftId: giftIdKey || 'unknown'
        });
        return null;
      }
      if (found.actionCategory === 'VIP_ACCESS' && typeof found.isVipEligible !== 'boolean') {
        const threshold =
          this.config.gameplayV1 && this.config.gameplayV1.vipGiftThreshold !== undefined
            ? this.config.gameplayV1.vipGiftThreshold
            : null;
        if (typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0) {
          const diamonds = Number(found.diamondCount ?? payload.diamondCount ?? 0);
          return {
            ...found,
            isVipEligible: diamonds >= threshold
          };
        }
      }
      return found;
    }

    return null;
  }

  _autoSelectLiveGiftTarget(user, giftConfig) {
    const senderId = user && user.userId ? String(user.userId) : null;
    const category = giftConfig && giftConfig.actionCategory;

    // 1. If sender recently typed a seat number (1..6) in chat within the last 60s, honor that seat
    if (senderId && this.userTargetSeats.has(senderId)) {
      const pref = this.userTargetSeats.get(senderId);
      if (pref && this._now() - pref.updatedAt <= 60000) {
        const prefSeat = this.seats[pref.seatIndex];
        if (prefSeat && prefSeat.player && prefSeat.player.status === 'SEATED') {
          return { valid: true, seat: prefSeat, player: prefSeat.player };
        }
      }
    }

    // 2. For DRUNK_DECREASE or MENU_SNACK (Gọi thêm mồi giải say): prioritize sender's own seat if seated
    if ((category === 'DRUNK_DECREASE' || category === 'MENU_SNACK') && senderId) {
      const ownMatch = this.findSeatedPlayerByUserId(senderId);
      if (ownMatch && ownMatch.player && ownMatch.player.status === 'SEATED') {
        return { valid: true, seat: ownMatch.seat, player: ownMatch.player };
      }
    }

    // 3. Pick active SEATED player (for attacks, prefer opponents over sender; pick highest drunkLevel)
    const activeSeats = this.seats.filter((s) => s && s.player && s.player.status === 'SEATED');
    if (activeSeats.length === 0) {
      return { valid: false, reason: 'NO_SEATED_PLAYERS', seat: null, player: null };
    }

    let candidates = activeSeats;
    if ((category === 'DRUNK_INCREASE' || category === 'WIFE_EVENT') && senderId && activeSeats.length > 1) {
      const opponents = activeSeats.filter((s) => s.player.userId !== senderId);
      if (opponents.length > 0) {
        candidates = opponents;
      }
    }

    const sorted = [...candidates].sort((a, b) => {
      const diff = (Number(b.player.drunkLevel) || 0) - (Number(a.player.drunkLevel) || 0);
      if (diff !== 0) return diff;
      return a.seatIndex - b.seatIndex;
    });

    const chosen = sorted[0];
    return { valid: true, seat: chosen, player: chosen.player };
  }

  _resolveGiftTarget(payload, user = null, giftConfig = null) {
    const targetUserId = payload && payload.targetUserId ? String(payload.targetUserId) : null;
    const hasSeatIndex =
      payload &&
      payload.targetSeatIndex !== undefined &&
      payload.targetSeatIndex !== null &&
      payload.targetSeatIndex !== '';
    const hasSeatId =
      payload &&
      payload.targetSeatId !== undefined &&
      payload.targetSeatId !== null &&
      payload.targetSeatId !== '';

    let resolvedSeatIndex = null;
    if (hasSeatIndex) {
      resolvedSeatIndex = Number(payload.targetSeatIndex);
    } else if (hasSeatId) {
      resolvedSeatIndex = Number(payload.targetSeatId) - 1;
    }

    if (resolvedSeatIndex !== null) {
      if (
        !Number.isInteger(resolvedSeatIndex) ||
        resolvedSeatIndex < 0 ||
        resolvedSeatIndex >= this.maxSeats
      ) {
        return { valid: false, reason: 'INVALID_TARGET_SEAT', seat: null, player: null };
      }
      const seat = this.seats[resolvedSeatIndex];
      if (!seat || !seat.player) {
        return { valid: false, reason: 'TARGET_ALREADY_LEFT', seat: seat || null, player: null };
      }
      if (targetUserId && seat.player.userId !== targetUserId) {
        // Target player already left and seat now belongs to someone else; NEVER redirect effect!
        return { valid: false, reason: 'TARGET_ALREADY_LEFT', seat, player: null };
      }
      if (seat.player.status === 'KO') {
        return { valid: false, reason: 'TARGET_ALREADY_KO', seat, player: seat.player };
      }
      if (seat.player.status === 'LEAVING') {
        return { valid: false, reason: 'TARGET_ALREADY_LEAVING', seat, player: seat.player };
      }
      return { valid: true, seat, player: seat.player };
    }

    if (targetUserId) {
      const match = this.findSeatedPlayerByUserId(targetUserId);
      if (!match || !match.player) {
        return { valid: false, reason: 'TARGET_ALREADY_LEFT', seat: null, player: null };
      }
      if (match.player.status === 'KO') {
        return { valid: false, reason: 'TARGET_ALREADY_KO', seat: match.seat, player: match.player };
      }
      if (match.player.status === 'LEAVING') {
        return {
          valid: false,
          reason: 'TARGET_ALREADY_LEAVING',
          seat: match.seat,
          player: match.player
        };
      }
      return { valid: true, seat: match.seat, player: match.player };
    }

    if (
      this.autoResolveTikTokGifts ||
      (this.config.gameplayV1 && this.config.gameplayV1.autoResolveTikTokGifts)
    ) {
      return this._autoSelectLiveGiftTarget(user, giftConfig);
    }

    return { valid: false, reason: 'MISSING_GIFT_TARGET', seat: null, player: null };
  }

  handleGift(normalizedEvent) {
    const { user, payload, eventId, source } = normalizedEvent;
    const giftConfig = this._resolveGiftConfig(payload, source);

    if (!giftConfig) {
      return {
        stateChanged: false,
        reason: 'UNMAPPED_GIFT',
        stateVersion: this.stateVersion
      };
    }

    const giftKey =
      (payload && (payload.mockGiftKey || (payload.giftId && String(payload.giftId)))) ||
      giftConfig.mockGiftKey ||
      'UNKNOWN_GIFT';

    // Handle Gift Streak & Deduplication
    const isNonStreakable =
      Boolean(payload && payload.isNonStreakable) ||
      (payload && payload.combo === false) ||
      (payload && payload.giftType !== undefined && payload.giftType !== null && Number(payload.giftType) !== 1) ||
      (giftConfig && giftConfig.combo === false) ||
      (giftConfig &&
        giftConfig.giftType !== undefined &&
        giftConfig.giftType !== null &&
        Number(giftConfig.giftType) !== 1);
    const isStreak =
      !isNonStreakable &&
      (Boolean(payload && payload.isStreak) ||
        Boolean(payload && (payload.streakId || payload.groupId)) ||
        (payload && typeof payload.repeatEnd === 'boolean'));
    let deltaRepeat = Math.max(1, Math.floor(Number(payload && payload.repeatCount) || 1));

    if (isStreak) {
      const senderId = (user && user.userId) || normalizedEvent.userId || 'unknown_sender';
      const explicitStreakId = (payload && (payload.streakId || payload.groupId)) || null;
      const isFallbackNoGroup = !explicitStreakId;
      const targetScope =
        (payload && payload.targetUserId) ||
        (payload && payload.targetSeatIndex !== null && payload.targetSeatIndex !== undefined
          ? `seat_${payload.targetSeatIndex}`
          : 'table');
      const streakKey = explicitStreakId
        ? `streak:${senderId}:${giftKey}:grp:${explicitStreakId}`
        : `streak:${senderId}:${giftKey}:nogrp:${targetScope}`;
      const streakResult = this.deduplicator.resolveStreakDelta(
        streakKey,
        deltaRepeat,
        Boolean(payload && payload.repeatEnd),
        this._now(),
        {
          isFallbackNoGroup,
          hasExplicitRepeatEnd: Boolean(payload && typeof payload.repeatEnd === 'boolean')
        }
      );
      if (streakResult.isDuplicateStreak || streakResult.deltaRepeat <= 0) {
        return {
          stateChanged: false,
          reason: 'STREAK_ALREADY_PROCESSED',
          giftKey,
          deltaRepeat: 0,
          stateVersion: this.stateVersion
        };
      }
      deltaRepeat = streakResult.deltaRepeat;
    }

    const category = giftConfig.actionCategory;
    const actionType = giftConfig.actionType || category;

    // 1. VIP_ACCESS Gift
    if (category === 'VIP_ACCESS') {
      if (!giftConfig.isVipEligible) {
        return {
          stateChanged: false,
          reason: 'GIFT_NOT_VIP_ELIGIBLE',
          stateVersion: this.stateVersion
        };
      }
      const joinResult = this.handleJoin(user, true, eventId);
      const affectedSeats = [];
      let stateChanged = joinResult.stateChanged;

      // If sender is already seated and gift has soberSeatedSenderDelta (Canh Giải Rượu VIP), upgrade VIP + reduce drunk
      if (
        !stateChanged &&
        joinResult.reason === 'ALREADY_SEATED' &&
        user &&
        user.userId &&
        Number(giftConfig.soberSeatedSenderDelta) > 0
      ) {
        const seatedMatch = this.findSeatedPlayerByUserId(user.userId);
        if (seatedMatch && seatedMatch.player && seatedMatch.player.status === 'SEATED') {
          const p = seatedMatch.player;
          const prevDrunk = p.drunkLevel;
          const nextDrunk = this._clampDrunkLevel(
            prevDrunk - Math.abs(Number(giftConfig.soberSeatedSenderDelta)) * deltaRepeat
          );
          p.isVIP = true;
          p.drunkLevel = nextDrunk;
          p.visualTier = this._computeVisualTier(nextDrunk, p.status);
          this._bumpStateVersion(eventId);
          stateChanged = true;
          affectedSeats.push({
            seatId: seatedMatch.seat.seatId,
            seatIndex: seatedMatch.seat.seatIndex,
            userId: p.userId,
            displayNickname: p.displayNickname,
            previousDrunk: prevDrunk,
            drunkLevel: p.drunkLevel,
            status: p.status,
            visualTier: p.visualTier
          });
        }
      } else if (joinResult.seatId && user && user.userId) {
        affectedSeats.push({
          seatId: joinResult.seatId,
          userId: user.userId,
          displayNickname: user.displayNickname
        });
      }

      this._emitGameplayEvent({
        actionType,
        actionCategory: 'VIP_ACCESS',
        eventId,
        giftKey,
        sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
        affectedSeats,
        stateChanged,
        joinAction: joinResult.action || joinResult.reason
      });
      return {
        ...joinResult,
        stateChanged,
        giftKey,
        actionCategory: 'VIP_ACCESS',
        deltaRepeat
      };
    }

    // 2. DRUNK_INCREASE Gift
    if (category === 'DRUNK_INCREASE') {
      const baseDelta = Math.abs(Number(giftConfig.drunkDelta) || 0);
      const totalDrunkAdded = baseDelta * deltaRepeat;

      if (giftConfig.targetMode === 'ALL_SEATED') {
        const activeSeated = this.getActiveSeatedPlayers();
        if (activeSeated.length === 0) {
          this._emitGameplayEvent({
            actionType,
            actionCategory: 'DRUNK_INCREASE',
            eventId,
            giftKey,
            sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
            targetValid: false,
            invalidReason: 'NO_SEATED_PLAYERS',
            stateChanged: false
          });
          return {
            stateChanged: false,
            reason: 'NO_SEATED_PLAYERS',
            targetValid: false,
            stateVersion: this.stateVersion
          };
        }

        const drunkResult = this._applyDrunkDeltaToSeatedPlayers(
          totalDrunkAdded,
          'GIFT',
          eventId
        );
        this._bumpStateVersion(eventId);

        this._emitGameplayEvent({
          actionType,
          actionCategory: 'DRUNK_INCREASE',
          eventId,
          giftKey,
          sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
          deltaRepeat,
          drunkDeltaApplied: totalDrunkAdded,
          targetValid: true,
          affectedSeats: drunkResult.affectedSeats,
          stateChanged: true
        });

        for (const koPlayer of drunkResult.newlyKoPlayers) {
          this._emitGameplayEvent({
            actionType: 'KO',
            eventId,
            triggerSource: 'GIFT',
            ...koPlayer
          });
        }

        return {
          stateChanged: true,
          action: 'GIFT_DRUNK_INCREASE_ALL_APPLIED',
          giftKey,
          deltaRepeat,
          drunkDeltaApplied: totalDrunkAdded,
          affectedSeats: drunkResult.affectedSeats,
          newlyKoPlayers: drunkResult.newlyKoPlayers,
          stateVersion: this.stateVersion
        };
      }

      // Single target DRUNK_INCREASE
      const targetCheck = this._resolveGiftTarget(payload, user, giftConfig);
      if (!targetCheck.valid) {
        this._emitGameplayEvent({
          actionType,
          actionCategory: 'DRUNK_INCREASE',
          eventId,
          giftKey,
          sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
          targetValid: false,
          invalidReason: targetCheck.reason,
          stateChanged: false
        });
        return {
          stateChanged: false,
          reason: targetCheck.reason,
          targetValid: false,
          stateVersion: this.stateVersion
        };
      }

      const { seat, player } = targetCheck;
      const previousDrunk = player.drunkLevel;
      const nextDrunk = this._clampDrunkLevel(previousDrunk + totalDrunkAdded);
      player.drunkLevel = nextDrunk;

      const newlyKoPlayers = [];
      if (nextDrunk >= this.maxDrunk) {
        player.drunkLevel = this.maxDrunk;
        player.status = 'KO';
        player.visualTier = 'KO';
        this.koSequence += 1;
        player.koToken = `ko_${this.koSequence}`;
        player.koAt = this._now();

        this._scheduleKoReleaseTimer(seat.seatId, player.userId, player.koToken);
        newlyKoPlayers.push({
          seatId: seat.seatId,
          seatIndex: seat.seatIndex,
          userId: player.userId,
          displayNickname: player.displayNickname,
          drunkLevel: player.drunkLevel,
          status: player.status,
          koToken: player.koToken,
          holdDurationMs: this.koHoldDurationMs
        });
      } else {
        player.visualTier = this._computeVisualTier(nextDrunk, player.status);
      }

      if (this.getActiveSeatedPlayers().length === 0) {
        this.likeMetrics.unconsumedLikes = 0;
      }

      this._bumpStateVersion(eventId);

      const affectedSeats = [
        {
          seatId: seat.seatId,
          seatIndex: seat.seatIndex,
          userId: player.userId,
          displayNickname: player.displayNickname,
          previousDrunk,
          drunkLevel: player.drunkLevel,
          status: player.status,
          visualTier: player.visualTier
        }
      ];

      this._emitGameplayEvent({
        actionType,
        actionCategory: 'DRUNK_INCREASE',
        eventId,
        giftKey,
        sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
        deltaRepeat,
        drunkDeltaApplied: player.drunkLevel - previousDrunk,
        targetValid: true,
        affectedSeats,
        stateChanged: true
      });

      for (const koPlayer of newlyKoPlayers) {
        this._emitGameplayEvent({
          actionType: 'KO',
          eventId,
          triggerSource: 'GIFT',
          ...koPlayer
        });
      }

      return {
        stateChanged: true,
        action: 'GIFT_DRUNK_INCREASE_APPLIED',
        giftKey,
        deltaRepeat,
        drunkDeltaApplied: player.drunkLevel - previousDrunk,
        affectedSeats,
        newlyKoPlayers,
        stateVersion: this.stateVersion
      };
    }

    // 3. DRUNK_DECREASE Gift
    if (category === 'DRUNK_DECREASE') {
      const targetCheck = this._resolveGiftTarget(payload, user, giftConfig);
      if (!targetCheck.valid) {
        this._emitGameplayEvent({
          actionType,
          actionCategory: 'DRUNK_DECREASE',
          eventId,
          giftKey,
          sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
          targetValid: false,
          invalidReason: targetCheck.reason,
          stateChanged: false
        });
        return {
          stateChanged: false,
          reason: targetCheck.reason,
          targetValid: false,
          stateVersion: this.stateVersion
        };
      }

      const { seat, player } = targetCheck;
      const baseReduction = Math.abs(Number(giftConfig.drunkDelta) || 0);
      const totalReduction = baseReduction * deltaRepeat;
      const previousDrunk = player.drunkLevel;
      const nextDrunk = this._clampDrunkLevel(previousDrunk - totalReduction);

      player.drunkLevel = nextDrunk;
      player.visualTier = this._computeVisualTier(nextDrunk, player.status);

      this._bumpStateVersion(eventId);

      const affectedSeats = [
        {
          seatId: seat.seatId,
          seatIndex: seat.seatIndex,
          userId: player.userId,
          displayNickname: player.displayNickname,
          previousDrunk,
          drunkLevel: player.drunkLevel,
          status: player.status,
          visualTier: player.visualTier
        }
      ];

      this._emitGameplayEvent({
        actionType,
        actionCategory: 'DRUNK_DECREASE',
        eventId,
        giftKey,
        sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
        snackBonus: Boolean(giftConfig.snackBonus),
        deltaRepeat,
        drunkDeltaApplied: player.drunkLevel - previousDrunk,
        targetValid: true,
        affectedSeats,
        stateChanged: true
      });

      return {
        stateChanged: true,
        action: 'GIFT_DRUNK_DECREASE_APPLIED',
        giftKey,
        deltaRepeat,
        drunkDeltaApplied: player.drunkLevel - previousDrunk,
        affectedSeats,
        stateVersion: this.stateVersion
      };
    }

    // 4. WIFE_EVENT Gift (WIFE_SUMMON)
    if (category === 'WIFE_EVENT') {
      const targetCheck = this._resolveGiftTarget(payload, user, giftConfig);
      if (!targetCheck.valid) {
        this._emitGameplayEvent({
          actionType: 'WIFE_DRAG',
          actionCategory: 'WIFE_EVENT',
          triggerSource: 'GIFT',
          eventId,
          giftKey,
          sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
          targetValid: false,
          invalidReason: targetCheck.reason,
          stateChanged: false
        });
        return {
          stateChanged: false,
          reason: targetCheck.reason,
          targetValid: false,
          stateVersion: this.stateVersion
        };
      }

      const leavingInfo = this._transitionSeatedPlayerToLeaving(targetCheck.seat);
      this._bumpStateVersion(eventId);

      this._emitGameplayEvent({
        actionType: 'WIFE_DRAG',
        actionCategory: 'WIFE_EVENT',
        triggerSource: 'GIFT',
        eventId,
        giftKey,
        sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
        targetValid: true,
        stateChanged: true,
        ...leavingInfo
      });

      return {
        stateChanged: true,
        action: 'GIFT_WIFE_SUMMON_APPLIED',
        giftKey,
        ...leavingInfo,
        stateVersion: this.stateVersion
      };
    }

    // 5. MENU_SNACK Gift (7-Dish Menu in v2.0: Lạc rang, Nem chua, Mực nướng, Chân gà, Cánh gà, Bò nướng, Mời cả quán)
    if (category === 'MENU_SNACK') {
      const now = this._now();
      const baseCoins = Math.max(1, Number(giftConfig.diamondCount || payload.diamondCount || 1));
      const baseSnacks = Math.max(1, Number(giftConfig.snackPoints) || 1);
      const baseBeers = Math.max(0, Number(giftConfig.beerPoints) || 0);
      const totalCoinsAdded = baseCoins * deltaRepeat;
      const totalSnacksAdded = baseSnacks * deltaRepeat;
      const totalBeersAdded = baseBeers * deltaRepeat;
      const baseSoberReduction = Math.abs(Number(giftConfig.drunkDelta) || 5);
      const totalReduction = baseSoberReduction * deltaRepeat;

      // Credit sender in session leaderboardStats
      let senderStats = null;
      if (user && user.userId) {
        senderStats = this._getOrCreateUserStats(user, Boolean(giftConfig.isVipEligible));
        senderStats.totalCoins = (Number(senderStats.totalCoins) || 0) + totalCoinsAdded;
        senderStats.snackCount = (Number(senderStats.snackCount) || 0) + totalSnacksAdded;
        senderStats.beerCount = (Number(senderStats.beerCount) || 0) + totalBeersAdded;
        if (senderStats.totalCoins >= this.vipTableMinCoins || giftConfig.isVipEligible) {
          senderStats.isVIP = true;
        }
        senderStats.updatedAt = now;

        const seatedSender = this.findSeatedPlayerByUserId(user.userId);
        if (seatedSender && seatedSender.player) {
          seatedSender.player.snackCount = senderStats.snackCount;
          seatedSender.player.beerCount = senderStats.beerCount;
          if (senderStats.isVIP) {
            seatedSender.player.isVIP = true;
          }
        }
      }

      const affectedSeats = [];
      let targetTableId = null;

      if (giftConfig.targetMode === 'ALL_TABLES') {
        for (const def of V2_TABLE_DEFINITIONS) {
          this._addSnackToTable(
            def.tableId,
            {
              dishKey: 'BO_NUONG',
              label: 'Bò nướng',
              icon: '🥩'
            },
            now
          );
        }
        for (const seat of this.seats) {
          const p = seat.player;
          if (p && p.status === 'SEATED') {
            const prevDrunk = p.drunkLevel;
            p.drunkLevel = this._clampDrunkLevel(prevDrunk - totalReduction);
            p.visualTier = this._computeVisualTier(p.drunkLevel, p.status);
            affectedSeats.push({
              seatId: seat.seatId,
              seatIndex: seat.seatIndex,
              tableId: seat.tableId,
              userId: p.userId,
              displayNickname: p.displayNickname,
              previousDrunk: prevDrunk,
              drunkLevel: p.drunkLevel,
              status: p.status,
              visualTier: p.visualTier
            });
          }
        }
      } else {
        const targetCheck = this._resolveGiftTarget(payload, user, giftConfig);
        if (targetCheck.valid && targetCheck.seat) {
          targetTableId = targetCheck.seat.tableId || 'TABLE_1';
          this._addSnackToTable(targetTableId, giftConfig, now);
          const tableSeats = this.getSeatsByTableId(targetTableId);
          for (const s of tableSeats) {
            if (s.player && s.player.status === 'SEATED') {
              const prevDrunk = s.player.drunkLevel;
              s.player.drunkLevel = this._clampDrunkLevel(prevDrunk - totalReduction);
              s.player.visualTier = this._computeVisualTier(s.player.drunkLevel, s.player.status);
              affectedSeats.push({
                seatId: s.seatId,
                seatIndex: s.seatIndex,
                tableId: s.tableId,
                userId: s.player.userId,
                displayNickname: s.player.displayNickname,
                previousDrunk: prevDrunk,
                drunkLevel: s.player.drunkLevel,
                status: s.player.status,
                visualTier: s.player.visualTier
              });
            }
          }
        } else {
          // Even if no specific player is seated yet, place the dish on TABLE_1 or sender's preferred table and record leaderboard stats
          targetTableId = 'TABLE_1';
          this._addSnackToTable(targetTableId, giftConfig, now);
        }
      }

      this._bumpStateVersion(eventId);

      this._emitGameplayEvent({
        actionType: giftConfig.actionType || 'ORDER_SNACK',
        actionCategory: 'MENU_SNACK',
        eventId,
        giftKey,
        dishKey: giftConfig.dishKey || 'SNACK',
        dishLabel: giftConfig.label,
        snackName: giftConfig.label || 'Mồi nhậu',
        dishIcon: giftConfig.icon || '🦑',
        snackBonus: true,
        snackPointsAdded: totalSnacksAdded,
        beerPointsAdded: totalBeersAdded,
        tableId: targetTableId,
        affectedTables:
          giftConfig.targetMode === 'ALL_TABLES'
            ? V2_TABLE_DEFINITIONS.map((d) => d.tableId)
            : [targetTableId || 'TABLE_1'],
        targetMode: giftConfig.targetMode || 'TABLE',
        sender: user ? { userId: user.userId, displayNickname: user.displayNickname } : null,
        deltaRepeat,
        drunkDeltaApplied: -totalReduction,
        targetValid: true,
        affectedSeats,
        stateChanged: true
      });

      return {
        stateChanged: true,
        action:
          giftConfig.targetMode === 'ALL_TABLES'
            ? 'GIFT_MENU_SNACK_ALL_APPLIED'
            : 'GIFT_MENU_SNACK_APPLIED',
        giftKey,
        dishKey: giftConfig.dishKey || 'SNACK',
        tableId: targetTableId,
        deltaRepeat,
        snackPointsAdded: totalSnacksAdded,
        beerPointsAdded: totalBeersAdded,
        drunkDeltaApplied: -totalReduction,
        affectedSeats,
        stateVersion: this.stateVersion
      };
    }

    return {
      stateChanged: false,
      reason: 'UNSUPPORTED_GIFT_CATEGORY',
      stateVersion: this.stateVersion
    };
  }

  handleRandomWifeCheck(eventId = null, triggerSource = 'SCHEDULER') {
    const now = this._now();
    this.timers.lastRandomWifeCheckAt = now;

    const activeSeated = this.getActiveSeatedPlayers();
    if (activeSeated.length === 0) {
      return {
        stateChanged: false,
        reason: 'NO_SEATED_PLAYERS',
        stateVersion: this.stateVersion
      };
    }

    if (now < this.timers.randomWifeCooldownUntil) {
      return {
        stateChanged: false,
        reason: 'WIFE_COOLDOWN_ACTIVE',
        cooldownUntil: this.timers.randomWifeCooldownUntil,
        stateVersion: this.stateVersion
      };
    }

    const roll = this._random();
    if (roll >= this.randomWifeProbability) {
      return {
        stateChanged: false,
        reason: 'PROBABILITY_MISS',
        roll,
        probability: this.randomWifeProbability,
        stateVersion: this.stateVersion
      };
    }

    const randomPickRatio = this._random();
    const targetIdx = Math.min(
      activeSeated.length - 1,
      Math.max(0, Math.floor(randomPickRatio * activeSeated.length))
    );
    const chosen = activeSeated[targetIdx];

    this.timers.randomWifeCooldownUntil = now + this.randomWifeCooldownMs;
    const leavingInfo = this._transitionSeatedPlayerToLeaving(chosen.seat);

    this._bumpStateVersion(eventId);

    this._emitGameplayEvent({
      actionType: 'WIFE_DRAG',
      actionCategory: 'WIFE_EVENT',
      triggerSource: 'RANDOM_EVENT',
      eventId,
      targetValid: true,
      stateChanged: true,
      cooldownUntil: this.timers.randomWifeCooldownUntil,
      ...leavingInfo
    });

    logger.info('Random Wife Aggro event triggered', {
      triggerSource,
      seatId: leavingInfo.seatId,
      userId: leavingInfo.userId,
      cooldownUntil: this.timers.randomWifeCooldownUntil,
      stateVersion: this.stateVersion
    });

    return {
      stateChanged: true,
      action: 'RANDOM_WIFE_TRIGGERED',
      cooldownUntil: this.timers.randomWifeCooldownUntil,
      ...leavingInfo,
      stateVersion: this.stateVersion
    };
  }

  releaseSeatBySeatId(seatId, eventId = null) {
    const parsedSeatId = Number(seatId);
    if (!Number.isInteger(parsedSeatId) || parsedSeatId < 1 || parsedSeatId > this.maxSeats) {
      return {
        stateChanged: false,
        reason: 'INVALID_SEAT_ID',
        stateVersion: this.stateVersion
      };
    }

    const seat = this.seats[parsedSeatId - 1];
    if (!seat || seat.player === null) {
      return {
        stateChanged: false,
        reason: 'SEAT_ALREADY_EMPTY',
        seatId: parsedSeatId,
        stateVersion: this.stateVersion
      };
    }

    this._cancelKoTimer(parsedSeatId);

    const removedPlayer = {
      ...seat.player,
      status: 'EVICTED',
      seatId: null,
      seatIndex: null
    };
    seat.player = null;

    // Immediately assign seat to the next player in queue (VIP FIFO first, Normal FIFO second)
    const nextPlayer = this._assignNextFromQueueToSeat(seat);
    if (this.getActiveSeatedPlayers().length === 0) {
      this.likeMetrics.unconsumedLikes = 0;
    }

    this._bumpStateVersion(eventId);

    logger.info('Seat released and next player assigned if available', {
      seatId: parsedSeatId,
      removedUserId: removedPlayer.userId,
      nextUserId: nextPlayer ? nextPlayer.userId : null,
      stateVersion: this.stateVersion
    });

    return {
      stateChanged: true,
      action: 'SEAT_RELEASED',
      seatId: parsedSeatId,
      removedPlayer,
      nextPlayer: nextPlayer ? { ...nextPlayer } : null,
      stateVersion: this.stateVersion
    };
  }

  startCheersScheduler() {
    if (this.cheersTimer !== null) {
      return false;
    }
    this.cheersTimer = setInterval(() => {
      this.cheersSequence += 1;
      const internalEvent = {
        eventId: `evt_cheers_${this.cheersSequence}_${Date.now()}`,
        source: 'SYSTEM',
        eventType: 'SYSTEM_CHEERS',
        timestamp: Date.now(),
        payload: {
          triggerSource: 'SCHEDULER'
        }
      };
      this._dispatchInternalEvent(internalEvent).catch((err) => {
        logger.error('Failed to dispatch SYSTEM_CHEERS event', {
          message: err.message
        });
      });
    }, this.cheersIntervalMs);

    return true;
  }

  stopCheersScheduler() {
    if (this.cheersTimer !== null) {
      clearInterval(this.cheersTimer);
      this.cheersTimer = null;
      return true;
    }
    return false;
  }

  startWifeScheduler() {
    if (this.wifeTimer !== null) {
      return false;
    }
    this.wifeTimer = setInterval(() => {
      this.wifeSequence += 1;
      const internalEvent = {
        eventId: `evt_wife_chk_${this.wifeSequence}_${this._now()}`,
        source: 'SYSTEM',
        eventType: 'SYSTEM_WIFE_CHECK',
        timestamp: this._now(),
        payload: {
          triggerSource: 'SCHEDULER'
        }
      };
      this._dispatchInternalEvent(internalEvent).catch((err) => {
        logger.error('Failed to dispatch SYSTEM_WIFE_CHECK event', {
          message: err.message
        });
      });
    }, this.randomWifeCheckIntervalMs);

    return true;
  }

  stopWifeScheduler() {
    if (this.wifeTimer !== null) {
      clearInterval(this.wifeTimer);
      this.wifeTimer = null;
      return true;
    }
    return false;
  }

  shutdown() {
    this.stopCheersScheduler();
    this.stopWifeScheduler();
    for (const timer of this.koTimers.values()) {
      clearTimeout(timer);
    }
    this.koTimers.clear();
  }

  processEvent(normalizedEvent) {
    if (!normalizedEvent || typeof normalizedEvent !== 'object') {
      return {
        stateChanged: false,
        reason: 'INVALID_EVENT',
        stateVersion: this.stateVersion
      };
    }

    const { eventType, user, payload, eventId, source } = normalizedEvent;

    if (this.mode === 'LIVE' && source === 'MOCK') {
      return {
        stateChanged: false,
        reason: 'MOCK_DISABLED_IN_LIVE_MODE',
        stateVersion: this.stateVersion
      };
    }

    if (eventId && this.deduplicator.checkAndMark(eventId)) {
      return {
        stateChanged: false,
        reason: 'DUPLICATE_EVENT_ID',
        eventId,
        stateVersion: this.stateVersion
      };
    }

    if (eventType === 'JOIN_CMD') {
      if (this.isV2 && payload && payload.chatCommand === 'CHEER_TOAST') {
        const seatedMatch = user && user.userId ? this.findSeatedPlayerByUserId(user.userId) : null;
        if (seatedMatch && seatedMatch.player && seatedMatch.player.status === 'SEATED') {
          return this.handleDrinkCommand(user, 'CHEER_TOAST', eventId);
        }
      }
      return this.handleJoin(user, false, eventId);
    }

    if (eventType === 'VIP_JOIN') {
      if (source !== 'MOCK') {
        return {
          stateChanged: false,
          reason: 'VIP_JOIN_MOCK_ONLY',
          stateVersion: this.stateVersion
        };
      }
      return this.handleJoin(user, true, eventId);
    }

    if (eventType === 'MOCK_RELEASE_SEAT') {
      if (source !== 'MOCK') {
        return {
          stateChanged: false,
          reason: 'MOCK_RELEASE_SEAT_MOCK_ONLY',
          stateVersion: this.stateVersion
        };
      }
      return this.releaseSeatBySeatId(payload && payload.seatId, eventId);
    }

    if (eventType === 'LIKE') {
      return this.handleLike(payload, eventId, source);
    }

    if (eventType === 'SYSTEM_CHEERS') {
      if (source !== 'SYSTEM' && source !== 'MOCK') {
        return {
          stateChanged: false,
          reason: 'SYSTEM_CHEERS_RESTRICTED',
          stateVersion: this.stateVersion
        };
      }
      return this.handleCheers(
        eventId,
        (payload && payload.triggerSource) || 'SCHEDULER'
      );
    }

    if (eventType === 'SYSTEM_KO_RELEASE') {
      if (source !== 'SYSTEM') {
        return {
          stateChanged: false,
          reason: 'SYSTEM_KO_RELEASE_RESTRICTED',
          stateVersion: this.stateVersion
        };
      }
      return this.handleKoRelease(payload, eventId);
    }

    if (eventType === 'SYSTEM_LEAVING_RELEASE') {
      if (source !== 'SYSTEM') {
        return {
          stateChanged: false,
          reason: 'SYSTEM_LEAVING_RELEASE_RESTRICTED',
          stateVersion: this.stateVersion
        };
      }
      return this.handleLeavingRelease(payload, eventId);
    }

    if (eventType === 'GIFT') {
      return this.handleGift(normalizedEvent);
    }

    if (eventType === 'SYSTEM_WIFE_CHECK') {
      if (source !== 'SYSTEM' && source !== 'MOCK') {
        return {
          stateChanged: false,
          reason: 'SYSTEM_WIFE_CHECK_RESTRICTED',
          stateVersion: this.stateVersion
        };
      }
      return this.handleRandomWifeCheck(
        eventId,
        (payload && payload.triggerSource) || 'SCHEDULER'
      );
    }

    if (eventType === 'CHAT') {
      return this.handleChat(normalizedEvent);
    }

    // Other events do not mutate Game State
    return {
      stateChanged: false,
      reason: 'NO_STATE_MUTATION',
      stateVersion: this.stateVersion
    };
  }

  handleChat(normalizedEvent) {
    const user = normalizedEvent && normalizedEvent.user;
    const payload = (normalizedEvent && normalizedEvent.payload) || {};
    const eventId = normalizedEvent ? normalizedEvent.eventId : null;

    if (!user || !user.userId) {
      return {
        stateChanged: false,
        reason: 'NO_STATE_MUTATION',
        chatEmitted: false,
        stateVersion: this.stateVersion
      };
    }

    // Handle v2.0 chat commands (SWITCH_TABLE, DRINK_BEER, CHEER_TOAST)
    if (this.isV2 && payload.chatCommand) {
      if (payload.chatCommand === 'SWITCH_TABLE' && payload.targetTableId) {
        return this.handleTableSwitch(user, payload.targetTableId, eventId);
      }
      if (payload.chatCommand === 'DRINK_BEER' || payload.chatCommand === 'CHEER_TOAST') {
        return this.handleDrinkCommand(user, payload.chatCommand, eventId);
      }
    }

    // Record seat target preference (1..28) if viewer comments a seat number (e.g., "1", "ghế 2", "ép 15", "cứu 4")
    const rawTextForTarget = typeof payload.comment === 'string' ? payload.comment.trim() : '';
    const seatMatch = rawTextForTarget.match(/(?:^|\b|ghế\s*|ép\s*|cứu\s*|vợ\s*)(\d{1,2})(?:\b|$)/i);
    if (seatMatch) {
      const parsedSeatId = Number(seatMatch[1]);
      if (parsedSeatId >= 1 && parsedSeatId <= this.maxSeats) {
        this.userTargetSeats.set(String(user.userId), {
          seatIndex: parsedSeatId - 1,
          updatedAt: this._now()
        });
        if (this.userTargetSeats.size > 300) {
          const oldestKey = this.userTargetSeats.keys().next().value;
          this.userTargetSeats.delete(oldestKey);
        }
      }
    }

    const found = this.findSeatedPlayerByUserId(user.userId);
    if (!found || !found.player || found.player.status !== 'SEATED') {
      return {
        stateChanged: false,
        reason: 'NO_STATE_MUTATION',
        chatEmitted: false,
        stateVersion: this.stateVersion
      };
    }

    const maxLen =
      (this.config && this.config.security && this.config.security.chatBubbleMaxLength) || 40;
    const rawComment = typeof payload.comment === 'string' ? payload.comment : '';
    const cleaned = rawComment.replace(/[\u0000-\u001F\u007F]/g, '').trim();
    const chars = Array.from(cleaned);
    const message =
      chars.length > maxLen ? `${chars.slice(0, maxLen).join('')}…` : cleaned;

    if (!message) {
      return {
        stateChanged: false,
        reason: 'NO_STATE_MUTATION',
        chatEmitted: false,
        stateVersion: this.stateVersion
      };
    }

    this._emitChatBubble({
      eventId,
      seatId: found.seat.seatId,
      seatIndex: found.seat.seatIndex,
      userId: found.player.userId,
      nickname: found.player.nickname,
      displayNickname: found.player.displayNickname,
      isVIP: Boolean(found.player.isVIP),
      message
    });

    return {
      stateChanged: false,
      reason: 'NO_STATE_MUTATION',
      chatEmitted: true,
      seatId: found.seat.seatId,
      seatIndex: found.seat.seatIndex,
      userId: found.player.userId,
      message,
      stateVersion: this.stateVersion
    };
  }

  _computeLeaderboard(seatedPlayers) {
    if (!Array.isArray(seatedPlayers) || seatedPlayers.length === 0) {
      return [];
    }
    return [...seatedPlayers]
      .sort((a, b) => {
        const diff = (Number(b.drunkLevel) || 0) - (Number(a.drunkLevel) || 0);
        if (diff !== 0) return diff;
        return (Number(a.seatIndex) || 0) - (Number(b.seatIndex) || 0);
      })
      .slice(0, 3)
      .map((p, idx) => ({
        rank: idx + 1,
        userId: p.userId,
        nickname: p.nickname,
        displayNickname: p.displayNickname,
        drunkLevel: p.drunkLevel,
        seatId: p.seatId,
        seatIndex: p.seatIndex,
        status: p.status,
        isVIP: Boolean(p.isVIP)
      }));
  }

  getSnapshot() {
    const now = this._now();
    const seatsCopy = this.seats.map((seat) => ({
      seatId: seat.seatId,
      seatIndex: seat.seatIndex,
      tableId: seat.tableId || 'TABLE_MAIN',
      tableLabel: seat.tableLabel || 'BÀN CHÍNH',
      tableType: seat.tableType || 'NORMAL',
      localSeatNo: seat.localSeatNo || seat.seatId,
      player: seat.player ? { ...seat.player } : null
    }));

    const seatedPlayers = seatsCopy
      .filter((seat) => seat.player !== null)
      .map((seat) => ({ ...seat.player }));

    const tables = this.isV2
      ? V2_TABLE_DEFINITIONS.map((def) => {
          const tableSeats = seatsCopy.filter((s) => s.tableId === def.tableId);
          const occupiedCount = tableSeats.filter((s) => s.player !== null).length;
          const activeSnacks = (this.tableSnacks.get(def.tableId) || []).filter(
            (item) => item.expiresAt > now
          );
          return {
            tableId: def.tableId,
            tableNumber: def.tableNumber,
            label: def.label,
            type: def.type,
            capacity: def.seatIds.length,
            occupiedCount,
            seatIds: [...def.seatIds],
            activeSnacks: activeSnacks.map((item) => ({ ...item }))
          };
        })
      : [
          {
            tableId: 'TABLE_MAIN',
            tableNumber: 1,
            label: 'BÀN CHÍNH',
            type: 'NORMAL',
            capacity: this.maxSeats,
            occupiedCount: seatedPlayers.length,
            seatIds: seatsCopy.map((s) => s.seatId),
            activeSnacks: []
          }
        ];

    const leaderboard = this._computeLeaderboard(seatedPlayers);
    const leaderboards = this._computeDualLeaderboards();
    const leaderboardStats = Array.from(this.leaderboardStats.values()).map((item) => ({
      ...item
    }));

    const vipCopy = this.vipQueue.map((item) => ({ ...item }));
    const normalCopy = this.normalQueue.map((item) => ({ ...item }));
    const totalWaiting = vipCopy.length + normalCopy.length;

    return {
      layoutVersion: this.layoutVersion,
      maxSeats: this.maxSeats,
      roomId: this.roomId,
      mode: this.mode,
      connectionStatus: this.connectionStatus,
      stateVersion: this.stateVersion,
      updatedAt: this.updatedAt,
      tables,
      seats: seatsCopy,
      seatedPlayers,
      leaderboard,
      leaderboards,
      leaderboardStats,
      hostConfig: {
        ...this.hostConfig
      },
      vipQueue: vipCopy,
      normalQueue: normalCopy,
      totalWaiting,
      waitingQueue: {
        vip: vipCopy,
        normal: normalCopy,
        totalWaiting,
        maxSize: this.maxQueueSize
      },
      likeMetrics: {
        ...this.likeMetrics
      },
      cheersConfig: {
        intervalMs: this.cheersIntervalMs,
        drunkDelta: this.cheersDrunkDelta,
        schedulerActive: this.cheersTimer !== null
      },
      wifeConfig: {
        checkIntervalMs: this.randomWifeCheckIntervalMs,
        probability: this.randomWifeProbability,
        cooldownMs: this.randomWifeCooldownMs,
        schedulerActive: this.wifeTimer !== null,
        lastCheckAt: this.timers.lastRandomWifeCheckAt,
        cooldownUntil: this.timers.randomWifeCooldownUntil
      }
    };
  }
}

module.exports = {
  GameStateManager,
  V2_TABLE_DEFINITIONS
};
