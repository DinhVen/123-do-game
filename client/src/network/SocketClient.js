import { io } from 'socket.io-client';
import {
  SEAT_LAYOUTS,
  V2_SEAT_LAYOUTS,
  V2_TABLE_LAYOUTS,
  SEAT_SHIRT_COLORS,
  SEAT_STATUS,
  clampDrunkLevel,
  formatNickname,
  truncateTextSafe
} from '../game/ui/Layout.js';

export const CONNECTION_STATUS = Object.freeze({
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR'
});

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3000';
const MAX_SEEN_FX_KEYS = 200;
const MAX_FX_BUFFER = 20;

export function resolveBackendUrl(explicitUrl = null) {
  if (explicitUrl && typeof explicitUrl === 'string' && explicitUrl.trim()) {
    return explicitUrl.trim();
  }
  try {
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      typeof import.meta.env.VITE_BACKEND_URL === 'string' &&
      import.meta.env.VITE_BACKEND_URL.trim()
    ) {
      return import.meta.env.VITE_BACKEND_URL.trim();
    }
  } catch (_) {
    // Fallback outside Vite environment
  }
  return DEFAULT_BACKEND_URL;
}

/**
 * Pure mapper converting Backend snapshot/patch payload into Frontend View Data
 * without inventing missing fields or executing gameplay rules.
 */
export function mapBackendStateToViewData(rawState) {
  if (!rawState || typeof rawState !== 'object') {
    return null;
  }

  const rawSeats = Array.isArray(rawState.seats) ? rawState.seats : [];
  const isV2 =
    rawState.layoutVersion === 2 ||
    rawSeats.length > 6 ||
    (Array.isArray(rawState.tables) && rawState.tables.length > 0);

  const activeLayouts = isV2 ? V2_SEAT_LAYOUTS : SEAT_LAYOUTS;
  const seats = activeLayouts.map((layout) => {
    const found =
      rawSeats.find(
        (s) => s && (s.seatId === layout.seatId || s.seatIndex === layout.seatIndex)
      ) || null;
    const player = found && found.player && typeof found.player === 'object' ? found.player : null;
    const shirtColor =
      layout.shirtColor || SEAT_SHIRT_COLORS[((layout.seatId - 1) % 6) + 1];

    if (!player) {
      const emptySeat = {
        seatId: layout.seatId,
        seatIndex: layout.seatIndex,
        status: SEAT_STATUS.EMPTY,
        userId: null,
        nickname: null,
        drunkLevel: 0,
        shirtColor
      };
      if (isV2) {
        emptySeat.tableId = found?.tableId || layout.tableId;
        emptySeat.localSeatNo = found?.localSeatNo || layout.localSeatNo;
      }
      return emptySeat;
    }

    const validStatuses = new Set([SEAT_STATUS.SEATED, SEAT_STATUS.KO, SEAT_STATUS.LEAVING]);
    const status = validStatuses.has(player.status) ? player.status : SEAT_STATUS.SEATED;
    const nickname =
      player.nickname || player.displayNickname || player.userId || `Khách #${layout.seatId}`;
    const drunkLevel =
      status === SEAT_STATUS.KO ? 100 : clampDrunkLevel(player.drunkLevel ?? 0);

    const mappedSeat = {
      seatId: layout.seatId,
      seatIndex: layout.seatIndex,
      status,
      userId: player.userId || null,
      nickname,
      drunkLevel,
      isVIP: Boolean(player.isVIP),
      shirtColor
    };

    if (isV2) {
      mappedSeat.tableId = player.tableId || found?.tableId || layout.tableId;
      mappedSeat.localSeatNo = player.localSeatNo || found?.localSeatNo || layout.localSeatNo;
      mappedSeat.appearanceSeed = Number(player.appearanceSeed) || 0;
      mappedSeat.beerCount = Number(player.beerCount) || 0;
      mappedSeat.snackCount = Number(player.snackCount) || 0;
      mappedSeat.totalCoinsGifted = Number(player.totalCoinsGifted) || 0;
      mappedSeat.moveFromSeatId = player.moveFromSeatId || null;
      mappedSeat.movedAt = player.movedAt || null;
      mappedSeat.joinedAt = player.joinedAt || null;
    }

    return mappedSeat;
  });

  const rawWaiting =
    rawState.waitingQueue && typeof rawState.waitingQueue === 'object'
      ? rawState.waitingQueue
      : {};
  const rawVipList = Array.isArray(rawWaiting.vip)
    ? rawWaiting.vip
    : Array.isArray(rawState.vipQueue)
      ? rawState.vipQueue
      : [];
  const rawNormalList = Array.isArray(rawWaiting.normal)
    ? rawWaiting.normal
    : Array.isArray(rawState.normalQueue)
      ? rawState.normalQueue
      : [];

  const extractQueueName = (item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return item.nickname || item.displayNickname || item.userId || 'Khách';
  };

  const vipQueue = rawVipList.map(extractQueueName).filter(Boolean);
  const normalQueue = rawNormalList.map(extractQueueName).filter(Boolean);
  const totalWaiting = Number.isInteger(rawState.totalWaiting)
    ? rawState.totalWaiting
    : Number.isInteger(rawWaiting.totalWaiting)
      ? rawWaiting.totalWaiting
      : vipQueue.length + normalQueue.length;
  const maxSize = Number.isInteger(rawWaiting.maxSize) ? rawWaiting.maxSize : 30;

  const likeMetrics =
    rawState.likeMetrics && typeof rawState.likeMetrics === 'object'
      ? {
          totalLikes: Number(rawState.likeMetrics.totalLikes) || 0,
          unconsumedLikes: Number(rawState.likeMetrics.unconsumedLikes) || 0,
          milestoneStep: Number(rawState.likeMetrics.milestoneStep) || 100
        }
      : null;

  const leaderboard =
    Array.isArray(rawState.leaderboard) && rawState.leaderboard.length > 0
      ? rawState.leaderboard
      : null;

  const viewData = {
    stateVersion: Number.isInteger(rawState.stateVersion) ? rawState.stateVersion : 0,
    roomId: typeof rawState.roomId === 'string' ? rawState.roomId : null,
    mode: typeof rawState.mode === 'string' ? rawState.mode : null,
    updatedAt: Number.isInteger(rawState.updatedAt) ? rawState.updatedAt : null,
    seats,
    waitingQueue: {
      vipQueue,
      normalQueue,
      totalWaiting,
      maxSize
    },
    likeMetrics,
    leaderboard
  };

  if (isV2) {
    viewData.layoutVersion = 2;
    viewData.tables = Array.isArray(rawState.tables) ? rawState.tables : [];
    viewData.leaderboards =
      rawState.leaderboards && typeof rawState.leaderboards === 'object'
        ? rawState.leaderboards
        : { topDrinkers: [], topEaters: [] };
    viewData.hostConfig =
      rawState.hostConfig && typeof rawState.hostConfig === 'object'
        ? rawState.hostConfig
        : { title: 'QUÁN NHẬU GIÁ SV', avatarUrl: '' };
  }

  return viewData;
}

/**
 * Format a concise text summary for incoming game:action_fx events (Task 2.3 lightweight hook)
 */
export function formatActionFxBanner(fx) {
  if (!fx || typeof fx !== 'object') {
    return null;
  }
  const type = fx.actionType || fx.actionCategory || 'EVENT';
  const seatLabel = fx.seatId ? `Ghế #${fx.seatId}` : '';
  const rawNick = fx.displayNickname || (fx.sender && fx.sender.displayNickname) || '';
  const nick = formatNickname(rawNick, 12);
  const nextNick =
    fx.nextPlayer && fx.nextPlayer.displayNickname
      ? formatNickname(fx.nextPlayer.displayNickname, 12)
      : '';

  if (type === 'SWITCH_TABLE') {
    return truncateTextSafe(
      `🚶 ${nick || 'Khách'} di chuyển sang ${fx.toTableLabel || fx.toTableId || 'bàn mới'}!`,
      48
    );
  }
  if (type === 'SWITCH_TABLE_REJECTED') {
    return truncateTextSafe(`⚠️ ${fx.message || 'Không thể chuyển bàn lúc này'}`, 48);
  }
  if (type === 'DRINK_BEER') {
    return truncateTextSafe(
      `🍺 ${nick || seatLabel} gọi 1 ly BIA MÁT (+${fx.drunkDeltaApplied || 8}% say)!`,
      48
    );
  }
  if (type === 'TABLE_CHEERS') {
    return truncateTextSafe(
      `🍻 ${nick || 'Khách'} hô DÔ! Cả ${fx.tableLabel || 'bàn'} nâng ly (+${fx.drunkDeltaApplied || 5}% say)!`,
      48
    );
  }
  if (type === 'MENU_SNACK') {
    if (fx.targetValid === false) {
      return truncateTextSafe(`🍽️ Gọi ${fx.snackName || 'mồi'}: Bàn chưa có khách ngồi!`, 48);
    }
    return truncateTextSafe(
      `🍽️ ${nick || 'Khách'} gọi ${fx.snackIcon || '🦑'} ${fx.snackName || 'Mồi nhậu'} (${fx.drunkDeltaApplied || -10}% say)!`,
      48
    );
  }
  if (type === 'CHEERS') {
    return `🍻 1, 2, 3 DÔ! Cả bàn tăng +${fx.drunkDeltaApplied || fx.drunkDelta || 5} độ say!`;
  }
  if (type === 'LIKE_MILESTONE') {
    return `❤️ Đạt mốc Like! Cả bàn tăng +${fx.drunkDeltaApplied || fx.drunkDelta || 1} độ say!`;
  }
  if (type === 'KO') {
    return truncateTextSafe(`💥 ${seatLabel} ${nick} đã gục tại bàn (KO 100%)!`, 48);
  }
  if (type === 'KO_RELEASED') {
    return nextNick
      ? truncateTextSafe(`🔄 ${seatLabel} giải phóng -> ${nextNick} vào bàn!`, 48)
      : `🔄 ${seatLabel} đã giải phóng sau khi KO!`;
  }
  if (type === 'WIFE_DRAG') {
    if (fx.targetValid === false) {
      return `🧹 Vợ gọi nhưng mục tiêu không còn hợp lệ!`;
    }
    return truncateTextSafe(`🧹 Vợ bắt về: ${seatLabel} ${nick} rời cuộc chơi!`, 48);
  }
  if (type === 'WIFE_RELEASED') {
    return nextNick
      ? truncateTextSafe(`🔄 ${seatLabel} trống -> ${nextNick} vào ghế!`, 48)
      : `🔄 ${seatLabel} đã trống sau khi Vợ bắt về!`;
  }
  if (fx.actionCategory === 'VIP_ACCESS' || type === 'VIP_PASS') {
    const soberMsg = fx.drunkDeltaApplied ? ` (${fx.drunkDeltaApplied}% say)` : '';
    return truncateTextSafe(`👑 VIP Gift từ ${nick || 'Khán giả'}: Ưu tiên VIP${soberMsg}!`, 48);
  }
  if (fx.actionCategory === 'DRUNK_INCREASE' || type.startsWith('DRINK_')) {
    if (fx.targetValid === false) {
      return truncateTextSafe(`🎁 Gift: Mục tiêu không hợp lệ (giữ nguyên độ say)`, 48);
    }
    if (type === 'DRINK_ALL') {
      return truncateTextSafe(`🍻 Đại gia bao cả bàn: +${fx.drunkDeltaApplied || 15}% độ say!`, 48);
    }
    return truncateTextSafe(`🍺 Gift mời rượu: +${fx.drunkDeltaApplied || 0}% độ say!`, 48);
  }
  if (fx.actionCategory === 'DRUNK_DECREASE' || type === 'SOBER_UP') {
    if (fx.targetValid === false) {
      return truncateTextSafe(`🍋 Gift giải say: Mục tiêu không hợp lệ (không hồi sinh KO)`, 48);
    }
    return truncateTextSafe(`🦑 Gọi thêm Mồi Nhậu giải say: ${fx.drunkDeltaApplied || 0}% độ say!`, 48);
  }
  return truncateTextSafe(`✨ Sự kiện: ${type}`, 48);
}

export class SocketClient {
  constructor(options = {}) {
    this.backendUrl = resolveBackendUrl(options.backendUrl);
    this.socketOptions = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      autoConnect: false,
      ...(options.socketOptions || {})
    };

    this.socket = null;
    this._socketHandlersBound = false;
    this.status = CONNECTION_STATUS.DISCONNECTED;
    this.lastError = null;

    this.lastStateVersion = -1;
    this.hasSynchronizedSnapshot = false;
    this.latestViewData = null;

    this.subscribers = new Map();
    this._subSeq = 0;

    this.seenFxKeys = [];
    this.seenFxSet = new Set();
    this.fxBuffer = [];

    this.stats = {
      snapshotsApplied: 0,
      patchesApplied: 0,
      ignoredStaleSnapshots: 0,
      ignoredStalePatches: 0,
      ignoredStaleFx: 0,
      versionGapsDetected: 0,
      reconnectCount: 0
    };
  }

  /**
   * Register UI subscriber with automatic deduplication by subscriberKey.
   * Returns an unsubscribe cleanup function.
   */
  subscribe(handlers = {}, subscriberKey = null) {
    const key = subscriberKey || `sub_${++this._subSeq}`;
    this.subscribers.set(key, {
      onStatusChange:
        typeof handlers.onStatusChange === 'function' ? handlers.onStatusChange : null,
      onStateSync: typeof handlers.onStateSync === 'function' ? handlers.onStateSync : null,
      onActionFx: typeof handlers.onActionFx === 'function' ? handlers.onActionFx : null,
      onChatBubble: typeof handlers.onChatBubble === 'function' ? handlers.onChatBubble : null,
      onBannerNotice:
        typeof handlers.onBannerNotice === 'function' ? handlers.onBannerNotice : null
    });

    // Immediately notify subscriber of current status and latest synchronized state if available
    const sub = this.subscribers.get(key);
    if (sub.onStatusChange) {
      sub.onStatusChange(this.status, this.lastError);
    }
    if (this.hasSynchronizedSnapshot && this.latestViewData && sub.onStateSync) {
      sub.onStateSync(this.latestViewData, 'CACHED_SNAPSHOT');
    }

    return () => {
      this.subscribers.delete(key);
    };
  }

  unsubscribe(subscriberKey) {
    return this.subscribers.delete(subscriberKey);
  }

  clearSubscribers() {
    this.subscribers.clear();
  }

  connect(overrideUrl = null) {
    if (overrideUrl && overrideUrl !== this.backendUrl) {
      this.disconnect();
      this.backendUrl = resolveBackendUrl(overrideUrl);
    }

    if (!this.socket) {
      this.socket = io(this.backendUrl, this.socketOptions);
      this._bindSocketEventsOnce();
    }

    if (!this.socket.connected) {
      this._setStatus(CONNECTION_STATUS.CONNECTING);
      this.socket.connect();
    }

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this._socketHandlersBound = false;
    }
    this.hasSynchronizedSnapshot = false;
    this.fxBuffer = [];
    this._setStatus(CONNECTION_STATUS.DISCONNECTED);
  }

  requestSnapshot() {
    if (!this.socket || !this.socket.connected) {
      return false;
    }
    this.socket.emit('client:request_snapshot', {
      currentVersion: this.lastStateVersion
    });
    return true;
  }

  _setStatus(nextStatus, errorMsg = null) {
    this.status = nextStatus;
    this.lastError = errorMsg;
    for (const sub of this.subscribers.values()) {
      if (sub.onStatusChange) {
        sub.onStatusChange(this.status, this.lastError);
      }
    }
  }

  _bindSocketEventsOnce() {
    if (!this.socket || this._socketHandlersBound) {
      return;
    }
    this._socketHandlersBound = true;

    this.socket.on('connect', () => {
      if (this.lastStateVersion >= 0) {
        this.stats.reconnectCount += 1;
      }
      // On every connect/reconnect, require a fresh authoritative snapshot before accepting patches/FX
      this.hasSynchronizedSnapshot = false;
      this.fxBuffer = [];
      this._setStatus(CONNECTION_STATUS.CONNECTED, null);

      this.socket.emit('client:ready', {
        clientType: 'obs',
        lastStateVersion: this.lastStateVersion
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.hasSynchronizedSnapshot = false;
      this.fxBuffer = [];
      this._setStatus(CONNECTION_STATUS.DISCONNECTED, reason || null);
    });

    this.socket.on('connect_error', (err) => {
      this.hasSynchronizedSnapshot = false;
      this._setStatus(
        CONNECTION_STATUS.ERROR,
        err && err.message ? err.message : 'Socket connection error'
      );
    });

    this.socket.on('game:state_snapshot', (payload) => {
      this.handleStateSnapshot(payload);
    });

    this.socket.on('game:state_patch', (payload) => {
      this.handleStatePatch(payload);
    });

    this.socket.on('game:action_fx', (payload) => {
      this.handleActionFx(payload);
    });

    this.socket.on('game:chat_bubble', (payload) => {
      this.handleChatBubble(payload);
    });

    this.socket.on('game:banner_notice', (payload) => {
      this.handleBannerNotice(payload);
    });
  }

  handleStateSnapshot(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const rawState = payload.state && typeof payload.state === 'object' ? payload.state : payload;
    const incomingVersion = Number.isInteger(payload.stateVersion)
      ? payload.stateVersion
      : Number.isInteger(rawState.stateVersion)
        ? rawState.stateVersion
        : null;

    if (incomingVersion === null || incomingVersion < 0) {
      return false;
    }

    // If already synchronized in the current session, ignore older or duplicate snapshots
    if (this.hasSynchronizedSnapshot) {
      if (incomingVersion < this.lastStateVersion) {
        this.stats.ignoredStaleSnapshots += 1;
        return false;
      }
      if (incomingVersion === this.lastStateVersion) {
        return false;
      }
    }

    const viewData = mapBackendStateToViewData({
      ...rawState,
      stateVersion: incomingVersion
    });
    if (!viewData) {
      return false;
    }

    this.lastStateVersion = incomingVersion;
    this.hasSynchronizedSnapshot = true;
    this.latestViewData = viewData;
    this.stats.snapshotsApplied += 1;

    for (const sub of this.subscribers.values()) {
      if (sub.onStateSync) {
        sub.onStateSync(viewData, 'SNAPSHOT');
      }
    }
    return true;
  }

  handleStatePatch(patch) {
    if (!patch || typeof patch !== 'object') {
      return false;
    }

    const incomingVersion = Number.isInteger(patch.stateVersion) ? patch.stateVersion : null;
    if (incomingVersion === null || incomingVersion < 0) {
      return false;
    }

    if (!this.hasSynchronizedSnapshot) {
      this.requestSnapshot();
      return false;
    }

    if (incomingVersion <= this.lastStateVersion) {
      this.stats.ignoredStalePatches += 1;
      return false;
    }

    // Detect missing version gap -> request full snapshot instead of guessing state
    if (incomingVersion > this.lastStateVersion + 1) {
      this.stats.versionGapsDetected += 1;
      this.requestSnapshot();
      return false;
    }

    const mergedRaw = {
      ...(this.latestViewData || {}),
      ...patch,
      stateVersion: incomingVersion
    };
    const viewData = mapBackendStateToViewData(mergedRaw);
    if (!viewData) {
      return false;
    }

    this.lastStateVersion = incomingVersion;
    this.latestViewData = viewData;
    this.stats.patchesApplied += 1;

    for (const sub of this.subscribers.values()) {
      if (sub.onStateSync) {
        sub.onStateSync(viewData, 'PATCH');
      }
    }
    return true;
  }

  handleActionFx(fx) {
    if (!fx || typeof fx !== 'object') {
      return false;
    }

    if (!this.hasSynchronizedSnapshot) {
      this.stats.ignoredStaleFx += 1;
      return false;
    }

    if (Number.isInteger(fx.stateVersion) && fx.stateVersion < this.lastStateVersion) {
      this.stats.ignoredStaleFx += 1;
      return false;
    }

    const fxKey = fx.eventId
      ? `${fx.eventId}:${fx.actionType || 'FX'}:${fx.seatId ?? 'all'}`
      : null;

    if (fxKey) {
      if (this.seenFxSet.has(fxKey)) {
        this.stats.ignoredStaleFx += 1;
        return false;
      }
      this.seenFxSet.add(fxKey);
      this.seenFxKeys.push(fxKey);
      if (this.seenFxKeys.length > MAX_SEEN_FX_KEYS) {
        const oldest = this.seenFxKeys.shift();
        this.seenFxSet.delete(oldest);
      }
    }

    this.fxBuffer.push(fx);
    if (this.fxBuffer.length > MAX_FX_BUFFER) {
      this.fxBuffer.shift();
    }

    for (const sub of this.subscribers.values()) {
      if (sub.onActionFx) {
        sub.onActionFx(fx);
      }
    }
    return true;
  }

  handleChatBubble(bubble) {
    if (!bubble || typeof bubble !== 'object') {
      return false;
    }

    if (!this.hasSynchronizedSnapshot) {
      this.stats.ignoredStaleFx += 1;
      return false;
    }

    if (Number.isInteger(bubble.stateVersion) && bubble.stateVersion < this.lastStateVersion) {
      this.stats.ignoredStaleFx += 1;
      return false;
    }

    const dedupKey = bubble.eventId
      ? `chat:${bubble.eventId}:${bubble.seatId ?? 'none'}`
      : null;

    if (dedupKey) {
      if (this.seenFxSet.has(dedupKey)) {
        this.stats.ignoredStaleFx += 1;
        return false;
      }
      this.seenFxSet.add(dedupKey);
      this.seenFxKeys.push(dedupKey);
      if (this.seenFxKeys.length > MAX_SEEN_FX_KEYS) {
        const oldest = this.seenFxKeys.shift();
        this.seenFxSet.delete(oldest);
      }
    }

    for (const sub of this.subscribers.values()) {
      if (sub.onChatBubble) {
        sub.onChatBubble(bubble);
      }
    }
    return true;
  }

  handleBannerNotice(notice) {
    if (!notice || typeof notice !== 'object') {
      return false;
    }

    if (!this.hasSynchronizedSnapshot) {
      this.stats.ignoredStaleFx += 1;
      return false;
    }

    if (Number.isInteger(notice.stateVersion) && notice.stateVersion < this.lastStateVersion) {
      this.stats.ignoredStaleFx += 1;
      return false;
    }

    const dedupKey = notice.eventId
      ? `banner:${notice.eventId}:${notice.actionType || 'NOTICE'}`
      : null;

    if (dedupKey) {
      if (this.seenFxSet.has(dedupKey)) {
        this.stats.ignoredStaleFx += 1;
        return false;
      }
      this.seenFxSet.add(dedupKey);
      this.seenFxKeys.push(dedupKey);
      if (this.seenFxKeys.length > MAX_SEEN_FX_KEYS) {
        const oldest = this.seenFxKeys.shift();
        this.seenFxSet.delete(oldest);
      }
    }

    for (const sub of this.subscribers.values()) {
      if (sub.onBannerNotice) {
        sub.onBannerNotice(notice);
      }
    }
    return true;
  }
}

let sharedSocketClient = null;

export function getSharedSocketClient(options = {}) {
  if (!sharedSocketClient) {
    sharedSocketClient = new SocketClient(options);
  }
  return sharedSocketClient;
}
