import {
  LAYERS,
  LAYOUT_ZONES,
  PALETTE,
  SEAT_LAYOUTS,
  SEAT_STATUS,
  resolveVisualTier,
  truncateTextSafe
} from '../ui/Layout.js';

const DEFAULT_MAX_QUEUE_SIZE = 20;
const DEFAULT_MAX_SEEN_KEYS = 200;

/**
 * Bounded, Stateless-View Animation & Event FX Manager (Master Plan v1.0 — Task 2.4)
 * - Strictly visual: NEVER mutates drunkLevel, seat status, KO timers, or waiting queues.
 * - Uses pre-allocated pooled Phaser Graphics & Text objects on Layer 50 (ACTION_FX_LAYER).
 * - Guards against stale stateVersion, duplicate eventId, seat occupant changes, and reconnect replay.
 */
export class AnimationManager {
  constructor(scene, seatViewsOrOpts, tableViewArg, optionsArg = {}) {
    this.scene = scene;

    let rawSeatViews = seatViewsOrOpts;
    let tableView = tableViewArg;
    let options = optionsArg;

    if (
      seatViewsOrOpts &&
      !Array.isArray(seatViewsOrOpts) &&
      !(seatViewsOrOpts instanceof Map) &&
      typeof seatViewsOrOpts === 'object' &&
      ('seatViews' in seatViewsOrOpts || 'tableView' in seatViewsOrOpts)
    ) {
      rawSeatViews = seatViewsOrOpts.seatViews;
      tableView = seatViewsOrOpts.tableView;
      options = seatViewsOrOpts;
    }

    if (Array.isArray(rawSeatViews)) {
      this.seatViews = new Map(rawSeatViews.map((sv) => [sv.seatId, sv]));
    } else if (rawSeatViews instanceof Map) {
      this.seatViews = rawSeatViews;
    } else {
      this.seatViews = new Map();
    }

    this.tableView = tableView || null;

    this.maxQueueSize = options.maxQueueSize || DEFAULT_MAX_QUEUE_SIZE;
    this.maxSeenKeys = options.maxSeenKeys || DEFAULT_MAX_SEEN_KEYS;
    this.fxDurationMs = options.fxDurationMs || 650;
    this.holdFxDurationMs = options.holdFxDurationMs || 1200;
    this.chatBubbleDurationMs = options.chatBubbleDurationMs || 2200;

    this.queue = [];
    this.isDraining = false;
    this.seenFxKeys = [];
    this.seenFxSet = new Set();

    // Track occupant identity per seat to prevent animating the wrong player when a seat is reused
    this.seatOccupants = new Map();
    // Prevent duplicate KO or LEAVING impact animations for the same occupant transition
    this.triggeredKoTokens = new Map();
    this.triggeredLeavingTokens = new Map();

    // Track all active timers & tweens for leak-free cleanup on shutdown/reconnect
    this.activeTimers = new Set();
    this.timerCallbacks = new Map();
    this.activeTweens = new Set();
    this.seatActiveTimers = new Map();
    this.chatBubbleTimers = new Map();
    this.centerBannerTimer = null;
    this.swayTimer = null;
    this.swayPhase = 0;

    this.minAcceptableStateVersion = -1;
    this.isShutDown = false;

    this.stats = {
      enqueued: 0,
      played: 0,
      cheersPlayed: 0,
      koPlayed: 0,
      leavingPlayed: 0,
      giftPlayed: 0,
      likeMilestonePlayed: 0,
      chatBubblesPlayed: 0,
      droppedOverflow: 0,
      ignoredDuplicateFx: 0,
      ignoredStaleVersion: 0,
      skippedMismatchedUser: 0
    };

    this._initPooledFxObjects();
    this.startDrunkSwayLoop();
  }

  _initPooledFxObjects() {
    const tableCenter = LAYOUT_ZONES.TABLE_CENTER;

    // 1. Pre-allocated Center Playfield FX Banner (Layer 50..51)
    this.centerFxGfx = this.scene.add
      .graphics()
      .setDepth(LAYERS.ACTION_FX_LAYER + 1)
      .setVisible(false);

    this.centerFxText = this.scene.add
      .text(tableCenter.x, tableCenter.y - 22, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_WARM,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 3,
        resolution: 3
      })
      .setOrigin(0.5, 0.5)
      .setDepth(LAYERS.ACTION_FX_LAYER + 2)
      .setVisible(false);

    // 2. Pre-allocated Per-Seat FX Overlays (6 fixed slots on Layer 50..52)
    this.seatFxPool = new Map();
    SEAT_LAYOUTS.forEach((layout) => {
      const calloutY = layout.row === 'BACK' ? layout.charBottomY - 26 : layout.charBottomY - 36;
      const propGfx = this.scene.add
        .graphics()
        .setDepth(LAYERS.ACTION_FX_LAYER)
        .setVisible(false);
      const calloutGfx = this.scene.add
        .graphics()
        .setDepth(LAYERS.ACTION_FX_LAYER + 1)
        .setVisible(false);
      const calloutText = this.scene.add
        .text(layout.x, calloutY, '', {
          fontFamily: 'sans-serif',
          fontSize: '9px',
          fontStyle: 'bold',
          color: PALETTE.TEXT_WHITE,
          stroke: PALETTE.TEXT_STROKE,
          strokeThickness: 2.5,
          resolution: 3
        })
        .setOrigin(0.5, 0.5)
        .setDepth(LAYERS.ACTION_FX_LAYER + 2)
        .setVisible(false);

      this.seatFxPool.set(layout.seatId, {
        seatId: layout.seatId,
        layout,
        calloutY,
        propGfx,
        calloutGfx,
        calloutText,
        activeEffect: null,
        targetUserId: null
      });
    });

    // 3. Pre-allocated Per-Seat Chat Bubble Overlays (6 fixed slots on Layer 42..43)
    this.chatBubblePool = new Map();
    SEAT_LAYOUTS.forEach((layout) => {
      const bubbleY = layout.row === 'BACK' ? layout.charBottomY - 46 : layout.charBottomY - 54;
      const bubbleGfx = this.scene.add
        .graphics()
        .setDepth(LAYERS.PLAYER_WORLD_UI + 2)
        .setVisible(false);
      const bubbleText = this.scene.add
        .text(layout.x, bubbleY, '', {
          fontFamily: 'sans-serif',
          fontSize: '9px',
          fontStyle: 'bold',
          color: PALETTE.TEXT_WHITE,
          stroke: PALETTE.TEXT_STROKE,
          strokeThickness: 2.5,
          resolution: 3
        })
        .setOrigin(0.5, 0.5)
        .setDepth(LAYERS.PLAYER_WORLD_UI + 3)
        .setVisible(false);

      this.chatBubblePool.set(layout.seatId, {
        seatId: layout.seatId,
        layout,
        bubbleY,
        bubbleGfx,
        bubbleText,
        targetUserId: null,
        message: ''
      });
    });
  }

  _scheduleTimer(callback, delayMs) {
    if (this.isShutDown) {
      return null;
    }
    const timerId = setTimeout(() => {
      this.activeTimers.delete(timerId);
      this.timerCallbacks.delete(timerId);
      if (!this.isShutDown) {
        callback();
      }
    }, delayMs);
    this.activeTimers.add(timerId);
    this.timerCallbacks.set(timerId, callback);
    return timerId;
  }

  _cancelTimer(timerId) {
    if (timerId !== null && timerId !== undefined) {
      clearTimeout(timerId);
      this.activeTimers.delete(timerId);
      this.timerCallbacks.delete(timerId);
    }
  }

  /**
   * Synchronously execute and clear all currently pending FX timers (used by deterministic tests).
   */
  flushTimers() {
    const entries = Array.from(this.timerCallbacks.entries());
    for (const [timerId, cb] of entries) {
      if (this.activeTimers.has(timerId)) {
        clearTimeout(timerId);
        this.activeTimers.delete(timerId);
        this.timerCallbacks.delete(timerId);
        if (!this.isShutDown && typeof cb === 'function') {
          cb();
        }
      }
    }
  }

  /**
   * Gentle Drunk Sway Loop for TIPSY (30..69) and DRUNK (70..99) seated players.
   * Cleaned up deterministically on shutdown().
   */
  startDrunkSwayLoop(intervalMs = 240) {
    this.stopDrunkSwayLoop();
    if (this.isShutDown) {
      return;
    }
    this.swayTimer = setInterval(() => {
      if (this.isShutDown) return;
      this.stepDrunkSway();
    }, intervalMs);
  }

  stopDrunkSwayLoop() {
    if (this.swayTimer !== null) {
      clearInterval(this.swayTimer);
      this.swayTimer = null;
    }
  }

  stepDrunkSway() {
    this.swayPhase = (this.swayPhase + 1) % 4;
    const dir = this.swayPhase === 0 ? -1 : this.swayPhase === 2 ? 1 : 0;

    for (const [seatId, seatView] of this.seatViews.entries()) {
      const state = seatView.getDisplayState();
      const slot = this.seatFxPool.get(seatId);
      const isRaisingMug = slot && slot.activeEffect === 'CHEERS';

      if (state.status !== SEAT_STATUS.SEATED || isRaisingMug) {
        continue;
      }

      const tier = resolveVisualTier(state.drunkLevel, state.status);
      if (tier === 'SOBER') {
        seatView.setAnimationOffset({ x: 0, y: 0, raiseMug: false });
      } else if (tier === 'TIPSY') {
        seatView.setAnimationOffset({ x: dir * 1.5, y: 0, raiseMug: false });
      } else if (tier === 'DRUNK') {
        seatView.setAnimationOffset({
          x: dir * 3,
          y: this.swayPhase % 2 === 1 ? 1 : 0,
          raiseMug: false
        });
      }
    }
  }

  /**
   * Synchronize seat occupant tracking whenever a Backend Snapshot or Patch is applied.
   * If isFullSnapshot === true (initial connect, reconnect, or server recovery),
   * clears old queued FX and marks existing KO/LEAVING seats so old impact FX never replay.
   */
  syncWithViewData(viewData, syncSource = 'PATCH') {
    if (!viewData || typeof viewData !== 'object') {
      return;
    }

    const isSnapshot = syncSource === 'SNAPSHOT' || syncSource === 'CACHED_SNAPSHOT';
    if (Number.isInteger(viewData.stateVersion)) {
      this.minAcceptableStateVersion = isSnapshot
        ? viewData.stateVersion
        : Math.max(this.minAcceptableStateVersion, viewData.stateVersion);
    }

    if (isSnapshot) {
      this.clearAllActiveVisuals();
      this.queue = [];
    }

    const seats = Array.isArray(viewData.seats) ? viewData.seats : [];
    SEAT_LAYOUTS.forEach((layout) => {
      const seatId = layout.seatId;
      const entry = seats.find((s) => s && s.seatId === seatId) || null;
      const nextUserId = entry && entry.userId ? String(entry.userId) : null;
      const nextStatus = (entry && entry.status) || SEAT_STATUS.EMPTY;
      const prev = this.seatOccupants.get(seatId);

      // If seat became empty or changed player userId, immediately cancel any lingering FX on this seat
      if (!prev || prev.userId !== nextUserId || nextStatus === SEAT_STATUS.EMPTY) {
        this.cancelSeatFx(seatId);
        this.cancelChatBubble(seatId);
        this.triggeredKoTokens.delete(seatId);
        this.triggeredLeavingTokens.delete(seatId);
      } else if (nextStatus !== SEAT_STATUS.SEATED) {
        this.cancelChatBubble(seatId);
      }

      // On full snapshot (connect/reconnect/recovery), mark already-KO or already-LEAVING players
      // so we display their static KO/LEAVING posture without replaying old impact animations
      if (isSnapshot && nextUserId) {
        if (nextStatus === SEAT_STATUS.KO) {
          this.triggeredKoTokens.set(seatId, `${nextUserId}:snapshot`);
        } else if (nextStatus === SEAT_STATUS.LEAVING) {
          this.triggeredLeavingTokens.set(seatId, `${nextUserId}:snapshot`);
        }
      }

      this.seatOccupants.set(seatId, { userId: nextUserId, status: nextStatus });
    });

    this.stepDrunkSway();
  }

  /**
   * Enqueue an incoming game:action_fx event with bounded queue and deduplication.
   */
  enqueueFx(fx) {
    if (this.isShutDown || !fx || typeof fx !== 'object') {
      return false;
    }

    if (
      this.minAcceptableStateVersion >= 0 &&
      Number.isInteger(fx.stateVersion) &&
      fx.stateVersion < this.minAcceptableStateVersion
    ) {
      this.stats.ignoredStaleVersion += 1;
      return false;
    }

    const fxKey = fx.eventId
      ? `${fx.eventId}:${fx.actionType || fx.actionCategory || 'FX'}:${fx.seatId ?? 'all'}`
      : null;

    if (fxKey) {
      if (this.seenFxSet.has(fxKey)) {
        this.stats.ignoredDuplicateFx += 1;
        return false;
      }
      this.seenFxSet.add(fxKey);
      this.seenFxKeys.push(fxKey);
      if (this.seenFxKeys.length > this.maxSeenKeys) {
        const oldestKey = this.seenFxKeys.shift();
        this.seenFxSet.delete(oldestKey);
      }
    }

    // Enforce bounded queue size
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      this.stats.droppedOverflow += 1;
    }

    this.queue.push(fx);
    this.stats.enqueued += 1;

    this.drainQueue();
    return true;
  }

  enqueueActionFx(fx) {
    return this.enqueueFx(fx);
  }

  drainQueue() {
    if (this.isDraining) {
      return;
    }
    while (this.queue.length > 0 && !this.isShutDown && !this.isDraining) {
      const fx = this.queue.shift();
      this._executeFx(fx);
    }
  }

  /**
   * Validate that a target seat currently holds the exact expected player userId.
   * Never animate a seat if the player has left or been replaced by a new player.
   */
  isValidSeatTarget(seatId, expectedUserId, options = {}) {
    const parsedSeatId = Number(seatId);
    if (!Number.isInteger(parsedSeatId) || parsedSeatId < 1 || parsedSeatId > 6) {
      return false;
    }

    const seatView = this.seatViews.get(parsedSeatId);
    if (!seatView) {
      return false;
    }

    const current = seatView.getDisplayState();
    if (current.status === SEAT_STATUS.EMPTY) {
      this.stats.skippedMismatchedUser += 1;
      return false;
    }

    if (options.requireExplicitUser !== false && !expectedUserId) {
      return false;
    }

    if (expectedUserId && current.userId && String(current.userId) !== String(expectedUserId)) {
      this.stats.skippedMismatchedUser += 1;
      return false;
    }

    if (options.requireSeated && current.status !== SEAT_STATUS.SEATED) {
      return false;
    }

    return true;
  }

  _executeFx(fx) {
    const actionType = fx.actionType || fx.actionCategory;

    if (actionType === 'CHEERS') {
      return this._playCheersFx(fx);
    }
    if (actionType === 'LIKE_MILESTONE') {
      return this._playLikeMilestoneFx(fx);
    }
    if (actionType === 'KO') {
      return this._playKoFx(fx);
    }
    if (actionType === 'WIFE_DRAG') {
      return this._playWifeDragFx(fx);
    }
    if (actionType === 'KO_RELEASED' || actionType === 'WIFE_RELEASED') {
      if (fx.seatId) {
        this.cancelSeatFx(Number(fx.seatId));
      }
      this.stats.played += 1;
      return true;
    }
    if (
      fx.actionCategory === 'DRUNK_INCREASE' ||
      fx.actionCategory === 'DRUNK_DECREASE' ||
      fx.actionCategory === 'VIP_ACCESS' ||
      actionType === 'DRINK_SMALL' ||
      actionType === 'DRINK_MEDIUM' ||
      actionType === 'DRINK_ALL' ||
      actionType === 'SOBER_UP' ||
      actionType === 'VIP_PASS'
    ) {
      return this._playGiftFx(fx);
    }

    return false;
  }

  /**
   * IV. HIỆU ỨNG DÔ (CHEERS)
   */
  _playCheersFx(fx) {
    const affected = Array.isArray(fx.affectedSeats) ? fx.affectedSeats : [];
    const validCheerSeatIds = [];

    for (const item of affected) {
      if (!item || !item.seatId || !item.userId) continue;
      // Do not animate CHEERS mug-raising on a player who transitioned to KO/LEAVING or left the seat
      if (item.status === SEAT_STATUS.KO || item.status === SEAT_STATUS.LEAVING) {
        continue;
      }
      if (this.isValidSeatTarget(item.seatId, item.userId, { requireSeated: true })) {
        validCheerSeatIds.push(Number(item.seatId));
      }
    }

    this._showCenterBanner('🍻 1, 2, 3 DÔ!', PALETTE.PLASTIC_RED, this.fxDurationMs);

    if (validCheerSeatIds.length > 0) {
      if (this.tableView) {
        this.tableView.setCheeringSeats(validCheerSeatIds);
      }

      for (const seatId of validCheerSeatIds) {
        const seatView = this.seatViews.get(seatId);
        const targetItem = affected.find((a) => Number(a.seatId) === seatId);
        const targetUserId = targetItem ? targetItem.userId : null;

        this._showSeatCallout(
          seatId,
          targetUserId,
          'CHEERS',
          `DÔ! +${fx.drunkDelta || 5}`,
          PALETTE.WARM_STREETLIGHT,
          this.fxDurationMs
        );
        if (seatView) {
          seatView.setAnimationOffset({ x: 0, y: -3, raiseMug: true });
        }
      }

      this._scheduleTimer(() => {
        if (this.tableView) {
          this.tableView.setCheeringSeats([]);
        }
        for (const seatId of validCheerSeatIds) {
          const seatView = this.seatViews.get(seatId);
          if (seatView) {
            seatView.resetAnimationOffset();
          }
        }
        this.stepDrunkSway();
      }, this.fxDurationMs);
    }

    this.stats.played += 1;
    this.stats.cheersPlayed += 1;
    return true;
  }

  /**
   * VII. HIỆU ỨNG LIKE MILESTONE
   */
  _playLikeMilestoneFx(fx) {
    const delta = fx.drunkDelta || 1;
    this._showCenterBanner(`❤️ ĐẠT MỐC LIKE! (+${delta} SAY)`, 0xe11d48, this.fxDurationMs);

    const affected = Array.isArray(fx.affectedSeats) ? fx.affectedSeats : [];
    for (const item of affected) {
      if (!item || !item.seatId || !item.userId) continue;
      if (item.status === SEAT_STATUS.KO || item.status === SEAT_STATUS.LEAVING) continue;
      if (this.isValidSeatTarget(item.seatId, item.userId, { requireSeated: true })) {
        this._showSeatCallout(
          Number(item.seatId),
          item.userId,
          'LIKE_MILESTONE',
          `♥ +${delta} SAY`,
          0xe11d48,
          this.fxDurationMs
        );
      }
    }

    this.stats.played += 1;
    this.stats.likeMilestonePlayed += 1;
    return true;
  }

  /**
   * VI. HIỆU ỨNG KO (Chỉ kích hoạt 1 lần cho mỗi lần chuyển trạng thái KO, không tự giải phóng ghế)
   */
  _playKoFx(fx) {
    const seatId = Number(fx.seatId);
    const userId = fx.userId ? String(fx.userId) : null;
    if (!this.isValidSeatTarget(seatId, userId, { requireSeated: false })) {
      return false;
    }

    // Prevent playing KO animation twice for the same player occupancy on this seat
    const existingMarker = this.triggeredKoTokens.get(seatId);
    if (existingMarker && existingMarker.startsWith(`${userId}:`)) {
      this.stats.ignoredDuplicateFx += 1;
      return false;
    }

    const marker = `${userId}:${fx.koToken || fx.eventId || fx.stateVersion || 'ko'}`;
    this.triggeredKoTokens.set(seatId, marker);

    const seatView = this.seatViews.get(seatId);
    if (seatView) {
      seatView.resetAnimationOffset();
    }

    this._showSeatCallout(
      seatId,
      userId,
      'KO',
      'GỤC RỒI! 💥',
      PALETTE.GAUGE_KO,
      this.holdFxDurationMs,
      (propGfx, layout) => {
        // Draw dizzy halo / stars above slumped character
        const haloY = layout.charBottomY - 44;
        propGfx.lineStyle(1.5, PALETTE.NEON_YELLOW, 0.95);
        propGfx.strokeCircle(layout.x, haloY, 12);
        propGfx.fillStyle(PALETTE.PLASTIC_RED, 1);
        propGfx.fillCircle(layout.x - 10, haloY, 2.5);
        propGfx.fillCircle(layout.x + 10, haloY, 2.5);
      }
    );

    this.stats.played += 1;
    this.stats.koPlayed += 1;
    return true;
  }

  /**
   * VIII. HIỆU ỨNG VỢ BẮT VỀ (WIFE_DRAG / LEAVING)
   */
  _playWifeDragFx(fx) {
    if (fx.targetValid === false || fx.stateChanged === false) {
      this._showCenterBanner('🧹 VỢ GỌI NHƯNG MỤC TIÊU ĐÃ RỜI / KO!', 0x475569, this.fxDurationMs);
      this.stats.played += 1;
      return true;
    }

    const seatId = Number(fx.seatId);
    const userId = fx.userId ? String(fx.userId) : null;
    if (!this.isValidSeatTarget(seatId, userId, { requireSeated: false })) {
      return false;
    }

    const existingMarker = this.triggeredLeavingTokens.get(seatId);
    if (existingMarker && existingMarker.startsWith(`${userId}:`)) {
      this.stats.ignoredDuplicateFx += 1;
      return false;
    }

    const marker = `${userId}:${fx.koToken || fx.eventId || fx.stateVersion || 'leave'}`;
    this.triggeredLeavingTokens.set(seatId, marker);

    const seatView = this.seatViews.get(seatId);
    if (seatView) {
      seatView.resetAnimationOffset();
    }

    this._showCenterBanner('🧹 VỢ BẮT VỀ!', 0x0284c7, this.fxDurationMs);

    this._showSeatCallout(
      seatId,
      userId,
      'WIFE_DRAG',
      'VỢ BẮT VỀ! 🧹',
      0x0284c7,
      this.holdFxDurationMs,
      (propGfx, layout) => {
        // Draw simple placeholder "Wife with broom" silhouette pulling the player sideways
        const wx = layout.x + 22;
        const wy = layout.charBottomY - 18;
        // Wife dress/torso
        propGfx.fillStyle(0xf43f5e, 0.95);
        propGfx.fillRoundedRect(wx - 7, wy - 4, 14, 16, 3);
        // Wife head
        propGfx.fillStyle(0xfde68a, 1);
        propGfx.fillCircle(wx, wy - 10, 6);
        // Broomstick & bristles
        propGfx.lineStyle(2, 0xd97706, 1);
        propGfx.lineBetween(wx - 8, wy + 2, wx + 8, wy - 14);
        propGfx.fillStyle(0xfacc15, 1);
        propGfx.fillTriangle(wx + 6, wy - 16, wx + 12, wy - 12, wx + 10, wy - 19);
      }
    );

    this.stats.played += 1;
    this.stats.leavingPlayed += 1;
    return true;
  }

  /**
   * VII. HIỆU ỨNG GIFT (DRUNK_INCREASE, DRUNK_DECREASE, VIP_ACCESS)
   */
  _playGiftFx(fx) {
    const category = fx.actionCategory;
    const actionType = fx.actionType || category;

    if (category === 'VIP_ACCESS' || actionType === 'VIP_PASS') {
      const nick = (fx.sender && fx.sender.displayNickname) || 'Khách VIP';
      this._showCenterBanner(`★ VIP: ${nick}`, PALETTE.WARM_STREETLIGHT, this.fxDurationMs);
      const vipAffected = Array.isArray(fx.affectedSeats) ? fx.affectedSeats : [];
      if (vipAffected.length > 0 && this.tableView && typeof this.tableView.setSnackPlatesActive === 'function') {
        this._triggerTableSnackPlates(3, 6000);
      }
      for (const item of vipAffected) {
        if (!item || !item.seatId || !item.userId) continue;
        if (this.isValidSeatTarget(item.seatId, item.userId, { requireSeated: false })) {
          this._showSeatCallout(
            Number(item.seatId),
            item.userId,
            'VIP_PASS',
            '★ THẺ VIP',
            PALETTE.WARM_STREETLIGHT,
            this.fxDurationMs
          );
        }
      }
      this.stats.played += 1;
      this.stats.giftPlayed += 1;
      return true;
    }

    if (fx.targetValid === false || fx.stateChanged === false) {
      this._showCenterBanner('🎁 MỤC TIÊU GIFT KHÔNG HỢP LỆ', 0x64748b, this.fxDurationMs);
      this.stats.played += 1;
      this.stats.giftPlayed += 1;
      return true;
    }

    const affected = Array.isArray(fx.affectedSeats) ? fx.affectedSeats : [];
    const delta = Number(fx.drunkDeltaApplied) || 0;

    if (category === 'DRUNK_DECREASE' || actionType === 'SOBER_UP') {
      this._showCenterBanner(`🦑 +MỒI GIẢI SAY! (${delta}%)`, PALETTE.GAUGE_SOBER, this.fxDurationMs);
      this._triggerTableSnackPlates(3, 6000);
      for (const item of affected) {
        if (!item || !item.seatId || !item.userId) continue;
        if (this.isValidSeatTarget(item.seatId, item.userId, { requireSeated: true })) {
          this._showSeatCallout(
            Number(item.seatId),
            item.userId,
            'SOBER_UP',
            `${delta} GIẢI SAY 🦑`,
            PALETTE.GAUGE_SOBER,
            this.fxDurationMs,
            (propGfx, layout) => {
              // Draw golden snack plate + grilled squid/garnish around character
              propGfx.lineStyle(1.5, PALETTE.GAUGE_SOBER, 0.9);
              propGfx.strokeCircle(layout.x, layout.charBottomY - 22, 18);
              propGfx.fillStyle(0xfef08a, 0.95);
              propGfx.fillEllipse(layout.x + 16, layout.charBottomY - 8, 12, 7);
              propGfx.fillStyle(0xf97316, 1);
              propGfx.fillCircle(layout.x + 15, layout.charBottomY - 8, 2.5);
              propGfx.fillStyle(0x22c55e, 1);
              propGfx.fillCircle(layout.x + 18, layout.charBottomY - 9, 1.8);
            }
          );
        }
      }
      this.stats.played += 1;
      this.stats.giftPlayed += 1;
      return true;
    }

    // DRUNK_INCREASE (DRINK_SMALL, DRINK_MEDIUM, DRINK_ALL)
    if (actionType === 'DRINK_ALL' || affected.length > 1) {
      this._showCenterBanner(`🍻 BAO CẢ BÀN! (+${Math.abs(delta)} SAY)`, PALETTE.PLASTIC_RED, this.fxDurationMs);
    }

    for (const item of affected) {
      if (!item || !item.seatId || !item.userId) continue;
      // If this gift caused KO on this seat, the dedicated KO FX handles the KO visual
      if (item.status === SEAT_STATUS.KO) continue;
      if (this.isValidSeatTarget(item.seatId, item.userId, { requireSeated: true })) {
        const applied =
          typeof item.drunkLevel === 'number' && typeof item.previousDrunk === 'number'
            ? item.drunkLevel - item.previousDrunk
            : Math.abs(delta);
        this._showSeatCallout(
          Number(item.seatId),
          item.userId,
          actionType,
          `+${applied} SAY 🍺`,
          PALETTE.WARM_STREETLIGHT,
          this.fxDurationMs,
          (propGfx, layout) => {
            propGfx.lineStyle(1.5, PALETTE.WARM_STREETLIGHT, 0.9);
            propGfx.strokeCircle(layout.x, layout.charBottomY - 22, 16);
          }
        );
      }
    }

    this.stats.played += 1;
    this.stats.giftPlayed += 1;
    return true;
  }

  _triggerTableSnackPlates(plateCount = 3, durationMs = 6000) {
    if (!this.tableView || typeof this.tableView.setSnackPlatesActive !== 'function') {
      return;
    }
    this._cancelTimer(this.snackPlateTimer);
    this.tableView.setSnackPlatesActive(plateCount);
    this.snackPlateTimer = this._scheduleTimer(() => {
      if (this.tableView && typeof this.tableView.setSnackPlatesActive === 'function') {
        this.tableView.setSnackPlatesActive(0);
      }
      this.snackPlateTimer = null;
    }, durationMs);
  }

  _showCenterBanner(text, borderColor, durationMs) {
    this._cancelTimer(this.centerBannerTimer);
    const tableCenter = LAYOUT_ZONES.TABLE_CENTER;
    const w = 186;
    const h = 24;
    const left = tableCenter.x - w / 2;
    const top = tableCenter.y - h / 2;

    this.centerFxGfx.clear();
    this.centerFxGfx.fillStyle(PALETTE.NIGHT_ASPHALT_DARK, 0.92);
    this.centerFxGfx.fillRoundedRect(left, top, w, h, 6);
    this.centerFxGfx.lineStyle(2, borderColor, 1);
    this.centerFxGfx.strokeRoundedRect(left, top, w, h, 6);
    this.centerFxGfx.setVisible(true);

    this.centerFxText.setText(truncateTextSafe(text, 28));
    this.centerFxText.setPosition(tableCenter.x, top + h / 2);
    this.centerFxText.setVisible(true);

    this.centerBannerTimer = this._scheduleTimer(() => {
      this.centerFxGfx.clear();
      this.centerFxGfx.setVisible(false);
      this.centerFxText.setVisible(false);
      this.centerBannerTimer = null;
    }, durationMs);
  }

  _showSeatCallout(seatId, targetUserId, effectType, labelText, badgeColor, durationMs, drawPropFn = null) {
    const slot = this.seatFxPool.get(seatId);
    if (!slot) return;

    this.cancelSeatFx(seatId);

    slot.activeEffect = effectType;
    slot.targetUserId = targetUserId ? String(targetUserId) : null;

    const { layout, calloutY, propGfx, calloutGfx, calloutText } = slot;
    const boxW = 76;
    const boxH = 16;
    const left = layout.x - boxW / 2;
    const top = calloutY - boxH / 2;

    calloutGfx.clear();
    calloutGfx.fillStyle(PALETTE.NIGHT_ASPHALT_DARK, 0.92);
    calloutGfx.fillRoundedRect(left, top, boxW, boxH, 4);
    calloutGfx.lineStyle(1.5, badgeColor, 1);
    calloutGfx.strokeRoundedRect(left, top, boxW, boxH, 4);
    calloutGfx.setVisible(true);

    calloutText.setText(truncateTextSafe(labelText, 14));
    calloutText.setPosition(layout.x, calloutY);
    calloutText.setVisible(true);

    propGfx.clear();
    if (typeof drawPropFn === 'function') {
      drawPropFn(propGfx, layout);
      propGfx.setVisible(true);
    } else {
      propGfx.setVisible(false);
    }

    const timerId = this._scheduleTimer(() => {
      this.seatActiveTimers.delete(seatId);
      this.cancelSeatFx(seatId);
    }, durationMs);
    this.seatActiveTimers.set(seatId, timerId);
  }

  cancelSeatFx(seatId) {
    const parsedId = Number(seatId);
    const existingTimer = this.seatActiveTimers.get(parsedId);
    if (existingTimer) {
      this._cancelTimer(existingTimer);
      this.seatActiveTimers.delete(parsedId);
    }

    const slot = this.seatFxPool.get(parsedId);
    if (slot) {
      slot.activeEffect = null;
      slot.targetUserId = null;
      slot.propGfx.clear().setVisible(false);
      slot.calloutGfx.clear().setVisible(false);
      slot.calloutText.setText('').setVisible(false);
    }

    const seatView = this.seatViews.get(parsedId);
    if (seatView) {
      seatView.resetAnimationOffset();
    }
  }

  enqueueChatBubble(bubble) {
    if (this.isShutDown || !bubble || typeof bubble !== 'object') {
      return false;
    }

    if (
      Number.isInteger(bubble.stateVersion) &&
      this.minAcceptableStateVersion >= 0 &&
      bubble.stateVersion < this.minAcceptableStateVersion
    ) {
      this.stats.ignoredStaleVersion += 1;
      return false;
    }

    const seatId = Number(bubble.seatId);
    const userId = bubble.userId ? String(bubble.userId) : null;
    if (!this.isValidSeatTarget(seatId, userId, { requireSeated: true })) {
      return false;
    }

    const dedupKey = bubble.eventId ? `chat:${bubble.eventId}:${seatId}` : null;
    if (dedupKey) {
      if (this.seenFxSet.has(dedupKey)) {
        this.stats.ignoredDuplicateFx += 1;
        return false;
      }
      this.seenFxSet.add(dedupKey);
      this.seenFxKeys.push(dedupKey);
      if (this.seenFxKeys.length > this.maxSeenKeys) {
        const oldest = this.seenFxKeys.shift();
        this.seenFxSet.delete(oldest);
      }
    }

    const slot = this.chatBubblePool.get(seatId);
    if (!slot) {
      return false;
    }

    this.cancelChatBubble(seatId);

    const rawText = typeof bubble.message === 'string' ? bubble.message.trim() : '';
    if (!rawText) {
      return false;
    }

    const displayMessage = truncateTextSafe(rawText, 22);
    slot.targetUserId = userId;
    slot.message = displayMessage;

    const { layout, bubbleY, bubbleGfx, bubbleText } = slot;
    const boxW = 94;
    const boxH = 16;
    const left = Math.max(8, Math.min(360 - boxW - 8, layout.x - boxW / 2));
    const top = bubbleY - boxH / 2;
    const borderColor = bubble.isVIP ? PALETTE.WARM_STREETLIGHT : PALETTE.NEON_BLUE;

    bubbleGfx.clear();
    bubbleGfx.fillStyle(PALETTE.NIGHT_ASPHALT_DARK, 0.94);
    bubbleGfx.fillRoundedRect(left, top, boxW, boxH, 5);
    bubbleGfx.lineStyle(1.5, borderColor, 1);
    bubbleGfx.strokeRoundedRect(left, top, boxW, boxH, 5);
    bubbleGfx.fillStyle(PALETTE.NIGHT_ASPHALT_DARK, 0.94);
    bubbleGfx.fillTriangle(layout.x - 3, top + boxH, layout.x + 3, top + boxH, layout.x, top + boxH + 4);
    bubbleGfx.setVisible(true);

    bubbleText.setText(`💬 ${displayMessage}`);
    bubbleText.setPosition(left + boxW / 2, bubbleY);
    bubbleText.setVisible(true);

    const timerId = this._scheduleTimer(() => {
      this.chatBubbleTimers.delete(seatId);
      this.cancelChatBubble(seatId);
    }, this.chatBubbleDurationMs);
    this.chatBubbleTimers.set(seatId, timerId);

    this.stats.chatBubblesPlayed += 1;
    return true;
  }

  cancelChatBubble(seatId) {
    const parsedId = Number(seatId);
    const existingTimer = this.chatBubbleTimers.get(parsedId);
    if (existingTimer) {
      this._cancelTimer(existingTimer);
      this.chatBubbleTimers.delete(parsedId);
    }

    const slot = this.chatBubblePool && this.chatBubblePool.get(parsedId);
    if (slot) {
      slot.targetUserId = null;
      slot.message = '';
      slot.bubbleGfx.clear().setVisible(false);
      slot.bubbleText.setText('').setVisible(false);
    }
  }

  clearActiveVisuals() {
    this.clearAllActiveVisuals();
  }

  clearAllActiveVisuals() {
    this._cancelTimer(this.centerBannerTimer);
    this.centerBannerTimer = null;
    this._cancelTimer(this.snackPlateTimer);
    this.snackPlateTimer = null;
    if (this.centerFxGfx) this.centerFxGfx.clear().setVisible(false);
    if (this.centerFxText) this.centerFxText.setText('').setVisible(false);

    for (const seatId of this.seatFxPool.keys()) {
      this.cancelSeatFx(seatId);
    }

    if (this.chatBubblePool) {
      for (const seatId of this.chatBubblePool.keys()) {
        this.cancelChatBubble(seatId);
      }
    }

    if (this.tableView) {
      this.tableView.setCheeringSeats([]);
      if (typeof this.tableView.setSnackPlatesActive === 'function') {
        this.tableView.setSnackPlatesActive(0);
      }
    }
  }

  getDiagnostics() {
    return {
      queueLength: this.queue.length,
      activeTimersCount: this.activeTimers.size,
      activeTweensCount: this.activeTweens.size,
      hasSwayTimer: this.swayTimer !== null,
      minAcceptableStateVersion: this.minAcceptableStateVersion,
      stats: { ...this.stats }
    };
  }

  shutdown() {
    this.isShutDown = true;
    this.stopDrunkSwayLoop();
    this.queue = [];

    for (const timerId of this.activeTimers) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();
    this.timerCallbacks.clear();
    this.seatActiveTimers.clear();
    this.chatBubbleTimers.clear();
    this.centerBannerTimer = null;
    this.snackPlateTimer = null;

    for (const tween of this.activeTweens) {
      if (tween && typeof tween.stop === 'function') tween.stop();
      if (tween && typeof tween.remove === 'function') tween.remove();
    }
    this.activeTweens.clear();

    this.clearAllActiveVisuals();
  }
}
