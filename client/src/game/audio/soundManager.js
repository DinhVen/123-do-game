import { SEAT_LAYOUTS, SEAT_STATUS } from '../ui/Layout.js';

export const SFX_KEYS = Object.freeze({
  CHEERS: 'CHEERS',
  DRINK: 'DRINK',
  KO: 'KO',
  WIFE_DRAG: 'WIFE_DRAG',
  GIFT: 'GIFT',
  VIP: 'VIP'
});

/**
 * Danh mục cấu hình 6 SFX đã phê duyệt theo GAME_DESIGN.md & Master Plan v1.0.
 * - Trong giai đoạn MVP chưa có file audio bản quyền trong client/public/assets/audio/,
 *   SoundManager sử dụng bộ tạo âm thanh 8-bit/pixel ngắn (PLACEHOLDER_SYNTH) qua Web Audio API
 *   hoặc Phaser Sound Manager nếu asset thực tế đã được nạp vào Phaser Audio Cache.
 */
export const SFX_CATALOG = Object.freeze({
  [SFX_KEYS.CHEERS]: {
    key: SFX_KEYS.CHEERS,
    assetKey: 'sfx_cheers',
    description: 'Tiếng cụng ly 1, 2, 3 DÔ!',
    minIntervalMs: 120,
    durationMs: 180,
    synthProfile: { type: 'triangle', freqStart: 587.33, freqEnd: 880, gainScale: 0.9 }
  },
  [SFX_KEYS.DRINK]: {
    key: SFX_KEYS.DRINK,
    assetKey: 'sfx_drink',
    description: 'Tiếng uống bia / đạt mốc Like',
    minIntervalMs: 100,
    durationMs: 140,
    synthProfile: { type: 'sine', freqStart: 330, freqEnd: 493.88, gainScale: 0.75 }
  },
  [SFX_KEYS.KO]: {
    key: SFX_KEYS.KO,
    assetKey: 'sfx_ko',
    description: 'Tiếng gục tại bàn (100% độ say)',
    minIntervalMs: 150,
    durationMs: 260,
    synthProfile: { type: 'sawtooth', freqStart: 293.66, freqEnd: 110, gainScale: 0.95 }
  },
  [SFX_KEYS.WIFE_DRAG]: {
    key: SFX_KEYS.WIFE_DRAG,
    assetKey: 'sfx_wife_drag',
    description: 'Âm thanh Vợ bắt về (LEAVING)',
    minIntervalMs: 150,
    durationMs: 240,
    synthProfile: { type: 'square', freqStart: 740, freqEnd: 370, gainScale: 0.85 }
  },
  [SFX_KEYS.GIFT]: {
    key: SFX_KEYS.GIFT,
    assetKey: 'sfx_gift',
    description: 'Âm thanh nhận Gift trên bàn nhậu',
    minIntervalMs: 90,
    durationMs: 160,
    synthProfile: { type: 'triangle', freqStart: 523.25, freqEnd: 783.99, gainScale: 0.85 }
  },
  [SFX_KEYS.VIP]: {
    key: SFX_KEYS.VIP,
    assetKey: 'sfx_vip',
    description: 'Âm thanh đặc biệt cho VIP',
    minIntervalMs: 120,
    durationMs: 220,
    synthProfile: { type: 'triangle', freqStart: 659.25, freqEnd: 1046.5, gainScale: 1.0 }
  }
});

const DEFAULT_VOLUME = 0.5;
const MIN_VOLUME = 0.0;
const MAX_VOLUME = 1.0;
const DEFAULT_MAX_SEEN_KEYS = 200;
const DEFAULT_MAX_CONCURRENT_SOUNDS = 4;

/**
 * Đọc cấu hình âm thanh khởi tạo từ URL Query (?muted=1, ?volume=0.5) hoặc biến môi trường Vite.
 * Phù hợp cho OBS Browser Source mà không cần click chuột vào giao diện.
 */
export function resolveInitialAudioOptions(overrides = {}) {
  let muted = typeof overrides.muted === 'boolean' ? overrides.muted : false;
  let volume = typeof overrides.volume === 'number' ? overrides.volume : DEFAULT_VOLUME;

  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (
        overrides.muted === undefined &&
        (import.meta.env.VITE_AUDIO_MUTED === 'true' || import.meta.env.VITE_AUDIO_MUTED === '1')
      ) {
        muted = true;
      }
      if (overrides.volume === undefined && import.meta.env.VITE_AUDIO_VOLUME !== undefined) {
        const parsedEnvVol = Number(import.meta.env.VITE_AUDIO_VOLUME);
        if (Number.isFinite(parsedEnvVol)) {
          volume = parsedEnvVol > 1 ? parsedEnvVol / 100 : parsedEnvVol;
        }
      }
    }

    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (overrides.muted === undefined) {
        const mutedParam = params.get('muted');
        const audioParam = params.get('audio');
        if (mutedParam === '1' || mutedParam === 'true' || audioParam === '0' || audioParam === 'false') {
          muted = true;
        } else if (mutedParam === '0' || mutedParam === 'false' || audioParam === '1' || audioParam === 'true') {
          muted = false;
        }
      }
      if (overrides.volume === undefined && params.has('volume')) {
        const parsedVol = Number(params.get('volume'));
        if (Number.isFinite(parsedVol)) {
          volume = parsedVol > 1 && parsedVol <= 100 ? parsedVol / 100 : parsedVol;
        }
      }
    }
  } catch (_) {
    // Ignore environment/window access errors in headless test environments
  }

  return {
    muted: Boolean(muted),
    volume: clampVolume(volume)
  };
}

export function clampVolume(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_VOLUME;
  }
  return Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.round(num * 100) / 100));
}

export class SoundManager {
  constructor(scene = null, options = {}) {
    this.scene = scene;

    const initial = resolveInitialAudioOptions(options);
    this.muted = initial.muted;
    this.volume = initial.volume;

    this.maxSeenKeys = options.maxSeenKeys || DEFAULT_MAX_SEEN_KEYS;
    this.maxConcurrentSounds = options.maxConcurrentSounds || DEFAULT_MAX_CONCURRENT_SOUNDS;
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();

    this.minAcceptableStateVersion = -1;
    this.isShutDown = false;
    this.audioLocked = false;
    this.hasPlayedUnlockChime = false;

    // Bounded deduplication & anti-harsh overlap state
    this.seenEventKeys = [];
    this.seenEventSet = new Set();
    this.lastPlayedAtByKey = new Map();

    // Track seat occupants & one-shot KO/LEAVING tokens so reconnect/snapshot never replays old SFX
    this.seatOccupants = new Map();
    this.triggeredKoTokens = new Map();
    this.triggeredLeavingTokens = new Map();

    // Bounded pool of Phaser sound instances (at most 1 pooled instance per SFX key)
    this.phaserSoundPool = new Map();
    // Bounded set of active Web Audio synth voices / timers
    this.activeVoices = new Set();
    this.activeTimers = new Set();

    // Single shared AudioContext reference (prefers Phaser's context; never creates unbounded contexts)
    this._sharedAudioContext = null;
    this._ownsAudioContext = false;
    this._unlockHandlerBound = null;

    this.stats = {
      playedTotal: 0,
      playedByKey: {
        [SFX_KEYS.CHEERS]: 0,
        [SFX_KEYS.DRINK]: 0,
        [SFX_KEYS.KO]: 0,
        [SFX_KEYS.WIFE_DRAG]: 0,
        [SFX_KEYS.GIFT]: 0,
        [SFX_KEYS.VIP]: 0
      },
      suppressedMuted: 0,
      suppressedZeroVolume: 0,
      suppressedDuplicateEvent: 0,
      suppressedStaleVersion: 0,
      suppressedCooldown: 0,
      suppressedConcurrencyCap: 0,
      suppressedLockedOrUnsupported: 0,
      suppressedInvalidTarget: 0,
      audioContextCreatedCount: 0
    };

    this._initPhaserIntegration();
  }

  _initPhaserIntegration() {
    try {
      const phaserSound = this.scene && this.scene.sound;
      if (phaserSound) {
        this.audioLocked = Boolean(phaserSound.locked);
        if (typeof phaserSound.on === 'function') {
          this._unlockHandlerBound = () => {
            this.audioLocked = false;
            this.unlockAudio();
          };
          phaserSound.on('unlocked', this._unlockHandlerBound);
        }
      }
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        this._domUnlockBound = () => {
          this.unlockAudio();
        };
        window.addEventListener('pointerdown', this._domUnlockBound, { passive: true });
        window.addEventListener('keydown', this._domUnlockBound, { passive: true });
      }
    } catch (_) {
      // Safe fallback if scene.sound is unavailable
    }
  }

  unlockAudio() {
    if (this.isShutDown) return false;
    try {
      const phaserSound = this.scene && this.scene.sound;
      if (phaserSound && phaserSound.locked && typeof phaserSound.unlock === 'function') {
        phaserSound.unlock();
      }
      const ctx = this._getOrAcquireAudioContext();
      if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const p = ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            this.audioLocked = false;
          }).catch(() => {});
        }
      } else if (ctx && ctx.state === 'running') {
        this.audioLocked = false;
      }
      return !this.audioLocked;
    } catch (_) {
      return false;
    }
  }

  getAssetStatus() {
    const loadedAssets = [];
    for (const cfg of Object.values(SFX_CATALOG)) {
      if (this._hasPhaserAudioAsset(cfg.assetKey)) {
        loadedAssets.push(cfg.assetKey);
      }
    }
    return {
      mode: loadedAssets.length === Object.keys(SFX_CATALOG).length ? 'PHASER_AUDIO_ASSETS' : 'PLACEHOLDER_SYNTH',
      loadedAssets,
      supportedSfxKeys: Object.keys(SFX_CATALOG)
    };
  }

  _hasPhaserAudioAsset(assetKey) {
    try {
      return Boolean(
        this.scene &&
          this.scene.cache &&
          this.scene.cache.audio &&
          typeof this.scene.cache.audio.exists === 'function' &&
          this.scene.cache.audio.exists(assetKey)
      );
    } catch (_) {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.stopAllActiveSounds();
    }
    try {
      if (this.scene && this.scene.sound && 'mute' in this.scene.sound) {
        this.scene.sound.mute = this.muted;
      }
    } catch (_) {}
    return this.muted;
  }

  mute() {
    return this.setMuted(true);
  }

  unmute() {
    return this.setMuted(false);
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  isMuted() {
    return this.muted;
  }

  setVolume(value) {
    this.volume = clampVolume(value);
    try {
      if (this.scene && this.scene.sound && 'volume' in this.scene.sound) {
        this.scene.sound.volume = this.volume;
      }
      for (const soundInstance of this.phaserSoundPool.values()) {
        if (soundInstance && typeof soundInstance.setVolume === 'function') {
          soundInstance.setVolume(this.volume);
        }
      }
    } catch (_) {}
    return this.volume;
  }

  getVolume() {
    return this.volume;
  }

  /**
   * Synchronize seat state from Backend Snapshot or Patch.
   * - Never mutates Game State.
   * - Never plays SFX from state_snapshot or state_patch (prevents duplicate sound with action_fx
   *   and prevents replaying old KO/LEAVING sounds after reconnect).
   */
  syncWithViewData(viewData, syncSource = 'PATCH') {
    if (this.isShutDown || !viewData || typeof viewData !== 'object') {
      return;
    }

    const isSnapshot = syncSource === 'SNAPSHOT' || syncSource === 'CACHED_SNAPSHOT';
    if (Number.isInteger(viewData.stateVersion)) {
      this.minAcceptableStateVersion = isSnapshot
        ? viewData.stateVersion
        : Math.max(this.minAcceptableStateVersion, viewData.stateVersion);
    }

    if (isSnapshot) {
      this.stopAllActiveSounds();
    }

    const seats = Array.isArray(viewData.seats) ? viewData.seats : [];
    SEAT_LAYOUTS.forEach((layout) => {
      const seatId = layout.seatId;
      const entry = seats.find((s) => s && s.seatId === seatId) || null;
      const nextUserId = entry && entry.userId ? String(entry.userId) : null;
      const nextStatus = (entry && entry.status) || SEAT_STATUS.EMPTY;
      const prev = this.seatOccupants.get(seatId);

      if (!prev || prev.userId !== nextUserId || nextStatus === SEAT_STATUS.EMPTY) {
        this.triggeredKoTokens.delete(seatId);
        this.triggeredLeavingTokens.delete(seatId);
      }

      // On snapshot (initial connect or reconnect), mark existing KO/LEAVING occupants
      // so old KO/LEAVING sounds are never replayed
      if (isSnapshot && nextUserId) {
        if (nextStatus === SEAT_STATUS.KO) {
          this.triggeredKoTokens.set(seatId, `${nextUserId}:snapshot`);
        } else if (nextStatus === SEAT_STATUS.LEAVING) {
          this.triggeredLeavingTokens.set(seatId, `${nextUserId}:snapshot`);
        }
      }

      this.seatOccupants.set(seatId, { userId: nextUserId, status: nextStatus });
    });
  }

  /**
   * Handle authoritative Backend `game:action_fx` event and trigger the matching SFX.
   * Strictly read-only with respect to Game State.
   */
  handleActionFx(fx) {
    if (this.isShutDown || !fx || typeof fx !== 'object') {
      return false;
    }

    if (
      Number.isInteger(fx.stateVersion) &&
      this.minAcceptableStateVersion >= 0 &&
      fx.stateVersion < this.minAcceptableStateVersion
    ) {
      this.stats.suppressedStaleVersion += 1;
      return false;
    }

    const actionType = fx.actionType || fx.actionCategory || '';
    const category = fx.actionCategory || actionType;

    // Release notifications do not trigger impact SFX
    if (actionType === 'KO_RELEASED' || actionType === 'WIFE_RELEASED') {
      return false;
    }

    // Invalid target gifts or no-op events do not play gameplay impact SFX
    if (fx.targetValid === false || fx.stateChanged === false) {
      this.stats.suppressedInvalidTarget += 1;
      return false;
    }

    const targetSeatId = fx.seatId ?? fx.targetSeatId ?? 'all';
    const dedupKey = fx.eventId
      ? `${fx.eventId}:${actionType}:${targetSeatId}`
      : null;

    if (dedupKey && !this._recordAndCheckDedupKey(dedupKey)) {
      this.stats.suppressedDuplicateEvent += 1;
      return false;
    }

    // 1. CHEERS
    if (actionType === 'CHEERS') {
      const affected = Array.isArray(fx.affectedSeats) ? fx.affectedSeats : [];
      if (affected.length === 0) {
        this.stats.suppressedInvalidTarget += 1;
        return false;
      }
      return this.playSfx(SFX_KEYS.CHEERS);
    }

    // 2. LIKE MILESTONE or explicit DRINK
    if (actionType === 'LIKE_MILESTONE' || actionType === 'DRINK') {
      return this.playSfx(SFX_KEYS.DRINK);
    }

    // 3. KO (only once per occupant transition on that seat)
    if (actionType === 'KO') {
      const seatId = Number(fx.seatId || fx.targetSeatId);
      const userId = fx.userId ? String(fx.userId) : null;
      if (seatId && userId) {
        const existingMarker = this.triggeredKoTokens.get(seatId);
        if (existingMarker && existingMarker.startsWith(`${userId}:`)) {
          this.stats.suppressedDuplicateEvent += 1;
          return false;
        }
        this.triggeredKoTokens.set(
          seatId,
          `${userId}:${fx.koToken || fx.eventId || fx.stateVersion || 'ko'}`
        );
      }
      return this.playSfx(SFX_KEYS.KO);
    }

    // 4. WIFE_DRAG / LEAVING (only once per occupant transition on that seat)
    if (actionType === 'WIFE_DRAG' || category === 'WIFE_EVENT') {
      const seatId = Number(fx.seatId || fx.targetSeatId);
      const userId = fx.userId ? String(fx.userId) : null;
      if (seatId && userId) {
        const existingMarker = this.triggeredLeavingTokens.get(seatId);
        if (existingMarker && existingMarker.startsWith(`${userId}:`)) {
          this.stats.suppressedDuplicateEvent += 1;
          return false;
        }
        this.triggeredLeavingTokens.set(
          seatId,
          `${userId}:${fx.koToken || fx.eventId || fx.stateVersion || 'leave'}`
        );
      }
      return this.playSfx(SFX_KEYS.WIFE_DRAG);
    }

    // 5. VIP Access / VIP Gift
    if (category === 'VIP_ACCESS' || actionType === 'VIP_PASS' || actionType === 'VIP') {
      return this.playSfx(SFX_KEYS.VIP);
    }

    // 6. Gift (DRUNK_INCREASE, DRUNK_DECREASE, DRINK_SMALL, DRINK_MEDIUM, DRINK_ALL, SOBER_UP, GIFT)
    if (
      category === 'DRUNK_INCREASE' ||
      category === 'DRUNK_DECREASE' ||
      actionType.startsWith('DRINK_') ||
      actionType === 'SOBER_UP' ||
      actionType === 'GIFT'
    ) {
      return this.playSfx(SFX_KEYS.GIFT);
    }

    return false;
  }

  /**
   * Play a specific SFX key from SFX_CATALOG with mute, volume, cooldown, and concurrency guards.
   */
  playSfx(sfxKey, options = {}) {
    if (this.isShutDown) {
      return false;
    }

    const cfg = SFX_CATALOG[sfxKey];
    if (!cfg) {
      return false;
    }

    if (options.eventId) {
      const key = `${options.eventId}:${sfxKey}`;
      if (!this._recordAndCheckDedupKey(key)) {
        this.stats.suppressedDuplicateEvent += 1;
        return false;
      }
    }

    if (this.muted) {
      this.stats.suppressedMuted += 1;
      return false;
    }

    const effectiveVolume = clampVolume(
      options.volume !== undefined ? options.volume * this.volume : this.volume
    );
    if (effectiveVolume <= 0) {
      this.stats.suppressedZeroVolume += 1;
      return false;
    }

    const now = this.nowFn();
    const lastPlayed = this.lastPlayedAtByKey.get(sfxKey) || -Infinity;
    const minInterval = options.ignoreCooldown ? 0 : cfg.minIntervalMs;
    if (now - lastPlayed < minInterval) {
      this.stats.suppressedCooldown += 1;
      return false;
    }

    if (this.activeVoices.size >= this.maxConcurrentSounds) {
      this.stats.suppressedConcurrencyCap += 1;
      return false;
    }

    const played = this._dispatchAudioOutput(cfg, effectiveVolume);
    if (!played) {
      this.stats.suppressedLockedOrUnsupported += 1;
      return false;
    }

    this.lastPlayedAtByKey.set(sfxKey, now);
    this.stats.playedTotal += 1;
    this.stats.playedByKey[sfxKey] = (this.stats.playedByKey[sfxKey] || 0) + 1;
    return true;
  }

  _dispatchAudioOutput(cfg, effectiveVolume) {
    try {
      const phaserSound = this.scene && this.scene.sound;

      // Path 1: Phaser Sound Manager with loaded audio asset (pooled instance per key)
      if (phaserSound && this._hasPhaserAudioAsset(cfg.assetKey) && typeof phaserSound.add === 'function') {
        if (phaserSound.locked) {
          this.audioLocked = true;
          return false;
        }
        let soundInstance = this.phaserSoundPool.get(cfg.key);
        if (!soundInstance) {
          soundInstance = phaserSound.add(cfg.assetKey, { volume: effectiveVolume });
          this.phaserSoundPool.set(cfg.key, soundInstance);
        }
        if (soundInstance.isPlaying && typeof soundInstance.stop === 'function') {
          soundInstance.stop();
        }
        const voiceToken = { type: 'phaser', key: cfg.key, instance: soundInstance };
        this._trackVoiceWithDuration(voiceToken, cfg.durationMs);
        soundInstance.play({ volume: effectiveVolume });
        return true;
      }

      // Path 2: Web Audio API procedural placeholder synth (reusing single AudioContext)
      const ctx = this._getOrAcquireAudioContext();
      if (ctx) {
        const playSynthOnCtx = () => {
          this.audioLocked = false;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const profile = cfg.synthProfile;
          const startTime = ctx.currentTime || 0;
          const durationSec = cfg.durationMs / 1000;
          const peakGain = Math.max(0.001, Math.min(1.0, effectiveVolume * profile.gainScale * 0.55));

          osc.type = profile.type;
          osc.frequency.setValueAtTime(profile.freqStart, startTime);
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(40, profile.freqEnd),
            startTime + durationSec
          );

          gain.gain.setValueAtTime(peakGain, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

          osc.connect(gain);
          gain.connect(ctx.destination);

          const voiceToken = {
            type: 'webaudio',
            key: cfg.key,
            stop: () => {
              try {
                osc.stop();
              } catch (_) {}
              try {
                osc.disconnect();
                gain.disconnect();
              } catch (_) {}
            }
          };

          this._trackVoiceWithDuration(voiceToken, cfg.durationMs);
          osc.start(startTime);
          osc.stop(startTime + durationSec);
        };

        if (ctx.state === 'suspended') {
          this.audioLocked = true;
          if (typeof ctx.resume === 'function') {
            try {
              const p = ctx.resume();
              if (p && typeof p.then === 'function') {
                p.then(() => {
                  if (!this.isShutDown && !this.muted && ctx.state === 'running') {
                    this.audioLocked = false;
                    playSynthOnCtx();
                  }
                }).catch(() => {});
              }
            } catch (_) {}
          }
          return false;
        }

        if (phaserSound && phaserSound.locked && ctx.state !== 'running') {
          this.audioLocked = true;
          return false;
        }

        playSynthOnCtx();
        return true;
      }

      if (phaserSound && phaserSound.locked) {
        this.audioLocked = true;
        return false;
      }

      // Path 3: Headless / No-Audio Phaser sound stub (when scene.sound exists and is not locked)
      if (phaserSound && !phaserSound.locked) {
        const voiceToken = { type: 'virtual', key: cfg.key };
        this._trackVoiceWithDuration(voiceToken, cfg.durationMs);
        return true;
      }
    } catch (_) {
      return false;
    }

    return false;
  }

  _trackVoiceWithDuration(voiceToken, durationMs) {
    this.activeVoices.add(voiceToken);
    const timerId = setTimeout(() => {
      this.activeTimers.delete(timerId);
      this.activeVoices.delete(voiceToken);
    }, durationMs);
    this.activeTimers.add(timerId);
  }

  _getOrAcquireAudioContext() {
    try {
      const phaserCtx = this.scene && this.scene.sound && this.scene.sound.context;
      if (phaserCtx) {
        return phaserCtx;
      }
      if (this._sharedAudioContext) {
        return this._sharedAudioContext;
      }
      const AudioCtx =
        typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (typeof AudioCtx === 'function') {
        this._sharedAudioContext = new AudioCtx();
        this._ownsAudioContext = true;
        this.stats.audioContextCreatedCount += 1;
        return this._sharedAudioContext;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  _recordAndCheckDedupKey(key) {
    if (this.seenEventSet.has(key)) {
      return false;
    }
    this.seenEventSet.add(key);
    this.seenEventKeys.push(key);
    if (this.seenEventKeys.length > this.maxSeenKeys) {
      const oldest = this.seenEventKeys.shift();
      this.seenEventSet.delete(oldest);
    }
    return true;
  }

  stopAllActiveSounds() {
    for (const timerId of this.activeTimers) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();

    for (const voice of this.activeVoices) {
      if (voice && typeof voice.stop === 'function') {
        try {
          voice.stop();
        } catch (_) {}
      } else if (voice && voice.instance && typeof voice.instance.stop === 'function') {
        try {
          voice.instance.stop();
        } catch (_) {}
      }
    }
    this.activeVoices.clear();
  }

  getDiagnostics() {
    return {
      muted: this.muted,
      volume: this.volume,
      audioLocked: this.audioLocked,
      isShutDown: this.isShutDown,
      activeVoicesCount: this.activeVoices.size,
      activeTimersCount: this.activeTimers.size,
      pooledPhaserSoundsCount: this.phaserSoundPool.size,
      seenKeysCount: this.seenEventSet.size,
      minAcceptableStateVersion: this.minAcceptableStateVersion,
      assetStatus: this.getAssetStatus(),
      stats: {
        ...this.stats,
        playedByKey: { ...this.stats.playedByKey }
      }
    };
  }

  shutdown() {
    this.isShutDown = true;
    this.stopAllActiveSounds();

    try {
      const phaserSound = this.scene && this.scene.sound;
      if (phaserSound && this._unlockHandlerBound && typeof phaserSound.off === 'function') {
        phaserSound.off('unlocked', this._unlockHandlerBound);
      }
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && this._domUnlockBound) {
        window.removeEventListener('pointerdown', this._domUnlockBound);
        window.removeEventListener('keydown', this._domUnlockBound);
      }
    } catch (_) {}
    this._unlockHandlerBound = null;
    this._domUnlockBound = null;

    for (const soundInstance of this.phaserSoundPool.values()) {
      try {
        if (soundInstance && typeof soundInstance.destroy === 'function') {
          soundInstance.destroy();
        }
      } catch (_) {}
    }
    this.phaserSoundPool.clear();

    if (this._ownsAudioContext && this._sharedAudioContext) {
      try {
        if (typeof this._sharedAudioContext.close === 'function') {
          const p = this._sharedAudioContext.close();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        }
      } catch (_) {}
    }
    this._sharedAudioContext = null;
    this._ownsAudioContext = false;
  }
}
