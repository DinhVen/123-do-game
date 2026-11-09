import Phaser from 'phaser';
import {
  RESOLUTION,
  LAYERS,
  PALETTE,
  LAYOUT_ZONES,
  SEAT_LAYOUTS,
  PLACEHOLDER_SIZES,
  PREVIEW_UI_DATA,
  PREVIEW_PRESETS,
  formatNickname,
  truncateTextSafe,
  isDevPreviewModeRequested
} from '../ui/Layout.js';
import { SeatView } from '../entities/SeatView.js';
import { TableView } from '../entities/TableView.js';
import { TavernV2Overlay } from '../entities/TavernV2Overlay.js';
import { AnimationManager } from '../fx/AnimationManager.js';
import { SoundManager } from '../audio/soundManager.js';
import {
  CONNECTION_STATUS,
  formatActionFxBanner,
  getSharedSocketClient
} from '../../network/SocketClient.js';

export class MainScene extends Phaser.Scene {
  constructor(options = {}) {
    super({ key: 'MainScene' });
    this.seatViews = new Map();
    this.tableView = null;
    this.animationManager = null;
    this.soundManager = null;
    this.uiRefs = {};
    this.domHud = null;
    this.tavernV2 = null;
    this._domResizeHandler = null;

    this.isPreviewMode =
      typeof options.previewMode === 'boolean'
        ? options.previewMode
        : isDevPreviewModeRequested();
    this.socketClient = options.socketClient || null;
    this.unsubscribeSocket = null;
    this.lastAppliedStateVersion = -1;
    this.recentFxEvents = [];
    this._lastBannerBorderColor = null;
    this.textUpdateCount = 0;
    this.skippedTextUpdateCount = 0;
  }

  _setTextIfChanged(textObj, nextText) {
    if (!textObj) return false;
    const normalized = String(nextText);
    if (textObj.text === normalized) {
      this.skippedTextUpdateCount += 1;
      return false;
    }
    this.textUpdateCount += 1;
    textObj.setText(normalized);
    return true;
  }

  init(data = {}) {
    if (data && typeof data.previewMode === 'boolean') {
      this.isPreviewMode = data.previewMode;
    }
    if (data && data.socketClient) {
      this.socketClient = data.socketClient;
    }
  }

  create() {
    if (typeof window !== 'undefined') {
      window.__MAIN_SCENE__ = this;
    }
    this.renderBackgroundLayer();
    this.renderAmbientStreetLayer();
    this.renderHeaderAndBanner(PREVIEW_UI_DATA);
    this.renderLeaderboardBar(PREVIEW_UI_DATA.leaderboardPreview);

    // Modular TableView (Layer 30: TABLE_AND_PROPS)
    this.tableView = new TableView(this);

    // Modular 6 SeatViews (Layers 20/40 for characters & Layer 60 for HUD)
    this.initSixSeatViews();
    this.animationManager = new AnimationManager(this, this.seatViews, this.tableView);
    this.soundManager = new SoundManager(this);
    this.renderWaitingQueuePanel(PREVIEW_UI_DATA.waitingQueue);
    this.renderInteractionGuidePanel(PREVIEW_UI_DATA.interactionGuide);
    this.initCrispDomOverlay(PREVIEW_UI_DATA);
    this.setupAudioHotkeys();

    if (this.events && typeof this.events.once === 'function') {
      this.events.once('shutdown', () => this.handleSceneShutdown());
      this.events.once('destroy', () => this.handleSceneShutdown());
    }

    if (this.isPreviewMode) {
      // Explicit Dev-Only UI Preview Mode
      this.updateSeats(PREVIEW_UI_DATA.seats);
      if (this.animationManager) {
        this.animationManager.syncWithViewData(
          { stateVersion: 0, seats: PREVIEW_UI_DATA.seats },
          'SNAPSHOT'
        );
      }
      this.setupPreviewHotkeys();
    } else {
      // Default Authoritative Backend Mode: Clear demo placeholders and connect via Socket.io
      this.resetToCleanLiveWaitingState();
      this.connectToBackend();
    }
  }

  initSixSeatViews() {
    this.seatViews.clear();
    SEAT_LAYOUTS.forEach((seatLayout) => {
      const seatView = new SeatView(this, seatLayout);
      this.seatViews.set(seatLayout.seatId, seatView);
    });
  }

  resetToCleanLiveWaitingState() {
    this.updateSeats([]);
    this.updateWaitingQueueDisplay({
      totalWaiting: 0,
      maxSize: 30,
      vipQueue: [],
      normalQueue: []
    });
    this.updateHeaderStatsDisplay(null, 0);
    this.updateLeaderboardDisplay(null);
    this.updateConnectionStatusDisplay(CONNECTION_STATUS.CONNECTING);
  }

  connectToBackend() {
    if (this.isPreviewMode) {
      return;
    }
    this.cleanupSocketSubscription();

    const client = this.socketClient || getSharedSocketClient();
    this.socketClient = client;

    this.unsubscribeSocket = client.subscribe(
      {
        onStatusChange: (status, err) => {
          this.updateConnectionStatusDisplay(status, err);
        },
        onStateSync: (viewData, syncSource) => {
          this.applyBackendViewData(viewData, syncSource);
        },
        onActionFx: (fx) => {
          this.applyActionFx(fx);
        },
        onChatBubble: (bubble) => {
          this.applyChatBubble(bubble);
        },
        onBannerNotice: (notice) => {
          this.applyBannerNotice(notice);
        }
      },
      'MainScene'
    );

    client.connect();
  }

  cleanupSocketSubscription() {
    if (typeof this.unsubscribeSocket === 'function') {
      this.unsubscribeSocket();
      this.unsubscribeSocket = null;
    } else if (this.socketClient) {
      this.socketClient.unsubscribe('MainScene');
    }
  }

  handleSceneShutdown() {
    this.cleanupSocketSubscription();
    if (this._domResizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._domResizeHandler);
      this._domResizeHandler = null;
    }
    if (this._domResizeObserver) {
      this._domResizeObserver.disconnect();
      this._domResizeObserver = null;
    }
    if (this.tavernV2) {
      this.tavernV2.destroy();
      this.tavernV2 = null;
    }
    if (this.domHud && this.domHud.root && this.domHud.root.parentNode) {
      this.domHud.root.parentNode.removeChild(this.domHud.root);
      this.domHud = null;
    }
    if (this.animationManager) {
      this.animationManager.shutdown();
    }
    if (this.soundManager) {
      this.soundManager.shutdown();
    }
  }

  updateConnectionStatusDisplay(status, errorMsg = null) {
    if (!this.uiRefs.liveBadgeText || !this.uiRefs.eventBannerText) {
      return;
    }

    if (status === CONNECTION_STATUS.CONNECTED) {
      this.uiRefs.liveBadgeText.setText('● LIVE');
      if (this.lastAppliedStateVersion < 0) {
        this.uiRefs.eventBannerText.setText('🍻 Quán Nhậu Vỉa Hè — Gõ "nhậu" hoặc "dô" để vào bàn!');
      }
      this.syncDomTextElements();
      return;
    }

    if (status === CONNECTION_STATUS.CONNECTING) {
      this.uiRefs.liveBadgeText.setText('● SYNC');
      this.uiRefs.eventBannerText.setText('🍻 Đang mở bàn nhậu...');
      this.syncDomTextElements();
      return;
    }

    // DISCONNECTED or ERROR: show clear offline status, NEVER fallback to static demo data
    if (this.animationManager) {
      this.animationManager.clearAllActiveVisuals();
    }
    if (this.soundManager) {
      this.soundManager.stopAllActiveSounds();
    }
    this.uiRefs.liveBadgeText.setText('● OFFLINE');
    const detail = errorMsg ? ` (${errorMsg})` : '';
    this.uiRefs.eventBannerText.setText(
      `🔴 Mất kết nối Backend${detail} — Đang tự động kết nối lại...`
    );
    this.syncDomTextElements();
  }

  applyBackendViewData(viewData, syncSource = 'SNAPSHOT') {
    if (!viewData || typeof viewData !== 'object') {
      return false;
    }

    this.lastAppliedStateVersion = viewData.stateVersion;

    this.updateSeats(viewData.seats || []);
    if (this.animationManager) {
      this.animationManager.syncWithViewData(viewData, syncSource);
    }
    if (this.soundManager) {
      this.soundManager.syncWithViewData(viewData, syncSource);
    }
    this.updateWaitingQueueDisplay(viewData.waitingQueue);
    this.updateHeaderStatsDisplay(viewData.likeMetrics, viewData.stateVersion, viewData.mode);
    this.updateLeaderboardDisplay(viewData.leaderboard);

    if (syncSource === 'SNAPSHOT' && this.uiRefs.eventBannerText) {
      this.recentFxEvents = [];
      const seatedCount = (viewData.seats || []).filter((s) => s && s.status && s.status !== 'EMPTY').length;
      if (seatedCount > 0) {
        this.uiRefs.eventBannerText.setText(
          `🍻 Bàn nhậu đang có ${seatedCount}/6 khách — Cùng nâng ly 1, 2, 3 DÔ!`
        );
      } else {
        this.uiRefs.eventBannerText.setText(
          '🍻 Bàn nhậu sẵn sàng — Gõ "nhậu" hoặc "dô" để vào ghế!'
        );
      }
    }

    if (this.tavernV2) {
      this.tavernV2.syncState(viewData, syncSource);
    }

    this.syncDomTextElements();
    return true;
  }

  applyActionFx(fx) {
    if (!fx || typeof fx !== 'object') {
      return false;
    }

    this.recentFxEvents.push(fx);
    if (this.recentFxEvents.length > 20) {
      this.recentFxEvents.shift();
    }

    if (this.animationManager) {
      this.animationManager.enqueueFx(fx);
    }
    if (this.soundManager) {
      this.soundManager.handleActionFx(fx);
    }

    const summary = formatActionFxBanner(fx);
    if (summary && this.uiRefs.eventBannerText) {
      this.uiRefs.eventBannerText.setText(summary);
    }
    if (this.tavernV2) {
      this.tavernV2.handleActionFx(fx, summary);
    }
    this.syncDomTextElements();
    return true;
  }

  applyChatBubble(bubble) {
    if (!bubble || typeof bubble !== 'object' || !this.animationManager) {
      return false;
    }
    if (this.tavernV2) {
      this.tavernV2.handleChatBubble(bubble);
    }
    return this.animationManager.enqueueChatBubble(bubble);
  }

  applyBannerNotice(notice) {
    if (!notice || typeof notice !== 'object' || !this.uiRefs.eventBannerText) {
      return false;
    }

    const levelColorMap = {
      info: PALETTE.NEON_BLUE,
      success: PALETTE.GAUGE_SOBER,
      warning: PALETTE.WARM_STREETLIGHT,
      danger: PALETTE.PLASTIC_RED
    };
    const borderColor = levelColorMap[notice.level] || PALETTE.PLASTIC_RED;

    if (this.uiRefs.eventBannerGfx && this._lastBannerBorderColor !== borderColor) {
      this._lastBannerBorderColor = borderColor;
      const bannerZone = LAYOUT_ZONES.EVENT_BANNER;
      this.uiRefs.eventBannerGfx.clear();
      this.uiRefs.eventBannerGfx.fillStyle(0x2a1d3d, 0.95);
      this.uiRefs.eventBannerGfx.fillRoundedRect(
        bannerZone.x,
        bannerZone.y,
        bannerZone.width,
        bannerZone.height,
        4
      );
      this.uiRefs.eventBannerGfx.lineStyle(1.5, borderColor, 0.95);
      this.uiRefs.eventBannerGfx.strokeRoundedRect(
        bannerZone.x,
        bannerZone.y,
        bannerZone.width,
        bannerZone.height,
        4
      );
    }

    const rawText = notice.message || notice.title || '';
    if (rawText) {
      this._setTextIfChanged(this.uiRefs.eventBannerText, truncateTextSafe(rawText, 48));
      if (this.tavernV2) {
        this.tavernV2.showBannerToast(truncateTextSafe(rawText, 56));
      }
    }
    this.syncDomTextElements();
    return true;
  }

  updateSeats(seatDataList = []) {
    SEAT_LAYOUTS.forEach((seatLayout) => {
      const seatView = this.seatViews.get(seatLayout.seatId);
      if (!seatView) return;
      const entry =
        seatDataList.find((item) => item && item.seatId === seatLayout.seatId) || null;
      if (entry) {
        seatView.updateSeat(entry);
      } else {
        seatView.clearSeat();
      }
    });

    if (this.tableView) {
      this.tableView.updateMugStates(seatDataList);
    }
    this.syncDomTextElements();
  }

  updateHeaderStatsDisplay(likeMetrics, stateVersion = 0, mode = null) {
    if (!this.uiRefs.statsText) {
      return;
    }

    if (this.uiRefs.liveBadgeText && mode) {
      this._setTextIfChanged(this.uiRefs.liveBadgeText, `● ${mode}`);
    }

    if (!likeMetrics || typeof likeMetrics !== 'object') {
      this._setTextIfChanged(this.uiRefs.statsText, `♥ Like: 0 (0/100)`);
      this.syncDomTextElements();
      return;
    }

    const total = Number(likeMetrics.totalLikes) || 0;
    const unconsumed = Number(likeMetrics.unconsumedLikes) || 0;
    const step = Number(likeMetrics.milestoneStep) || 100;
    this._setTextIfChanged(
      this.uiRefs.statsText,
      `♥ Like: ${total} (${unconsumed}/${step})`
    );
    this.syncDomTextElements();
  }

  updateWaitingQueueDisplay(queueData) {
    if (!queueData || typeof queueData !== 'object') {
      return;
    }

    const vipQueue = Array.isArray(queueData.vipQueue) ? queueData.vipQueue : [];
    const normalQueue = Array.isArray(queueData.normalQueue) ? queueData.normalQueue : [];
    const totalWaiting = Number.isInteger(queueData.totalWaiting)
      ? queueData.totalWaiting
      : vipQueue.length + normalQueue.length;
    const maxSize = Number.isInteger(queueData.maxSize) ? queueData.maxSize : 30;

    const formatQueueSlice = (list) => {
      if (!list || list.length === 0) return 'Trống';
      const visible = list.slice(0, 3).map((n) => formatNickname(n, 13));
      const extra = list.length > 3 ? ` (+${list.length - 3})` : '';
      return `${visible.join(', ')}${extra}`;
    };

    const vipListStr = formatQueueSlice(vipQueue);
    const normalListStr = formatQueueSlice(normalQueue);

    if (this.uiRefs.queueTitleText) {
      this._setTextIfChanged(this.uiRefs.queueTitleText, `⏳ HÀNG CHỜ (${totalWaiting}/${maxSize})`);
    }
    if (this.uiRefs.vipQueueText) {
      this._setTextIfChanged(
        this.uiRefs.vipQueueText,
        truncateTextSafe(`★ VIP (${vipQueue.length}): ${vipListStr}`, 48)
      );
    }
    if (this.uiRefs.normalQueueText) {
      this._setTextIfChanged(
        this.uiRefs.normalQueueText,
        truncateTextSafe(`• Thường (${normalQueue.length}): ${normalListStr}`, 48)
      );
    }
    this.syncDomTextElements();
  }

  updateLeaderboardDisplay(leaderboardData) {
    if (!this.uiRefs.leaderboardText) {
      return;
    }

    if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
      const summary = leaderboardData
        .slice(0, 3)
        .map((item, idx) => {
          const rank = item.rank || idx + 1;
          const nick = formatNickname(
            item.nickname || item.displayNickname || item.userId,
            PLACEHOLDER_SIZES.MAX_LEADERBOARD_NAME_LENGTH
          );
          const drunkSuffix =
            typeof item.drunkLevel === 'number' ? ` (${item.drunkLevel}%)` : '';
          return `#${rank} ${nick}${drunkSuffix}`;
        })
        .join(' | ');
      this._setTextIfChanged(this.uiRefs.leaderboardText, truncateTextSafe(`🏆 ${summary}`, 48));
      this.syncDomTextElements();
      return;
    }

    // Honest placeholder when Backend does not supply leaderboard data
    this._setTextIfChanged(
      this.uiRefs.leaderboardText,
      '🏆 BXH TỬU LƯỢNG: Chưa có dữ liệu xếp hạng'
    );
    this.syncDomTextElements();
  }

  applyPreviewPreset(presetKey) {
    // Strictly prevent preview presets from overwriting live Backend state
    if (!this.isPreviewMode) {
      return false;
    }
    const presetSeats = PREVIEW_PRESETS[presetKey];
    if (!presetSeats) {
      return false;
    }
    this.updateSeats(presetSeats);
    if (this.animationManager) {
      this.animationManager.syncWithViewData({ stateVersion: 0, seats: presetSeats }, 'SNAPSHOT');
    }
    return true;
  }

  setupAudioHotkeys() {
    if (this.input && typeof this.input.on === 'function') {
      this.input.on('pointerdown', () => {
        if (this.soundManager) {
          this.soundManager.unlockAudio();
          if (!this.soundManager.hasPlayedUnlockChime) {
            this.soundManager.hasPlayedUnlockChime = true;
            this.soundManager.playSfx('DRINK', { ignoreCooldown: true });
          }
        }
      });
    }
    if (!this.input || !this.input.keyboard) {
      return;
    }
    this.input.keyboard.on('keydown-M', () => {
      if (this.soundManager) {
        this.soundManager.unlockAudio();
        const muted = this.soundManager.toggleMute();
        if (!muted) {
          this.soundManager.hasPlayedUnlockChime = true;
          this.soundManager.playSfx('DRINK', { ignoreCooldown: true });
        }
      }
    });
  }

  setupPreviewHotkeys() {
    if (!this.isPreviewMode || !this.input || !this.input.keyboard) {
      return;
    }
    this.input.keyboard.on('keydown-ONE', () => this.applyPreviewPreset('MIXED_DEMO'));
    this.input.keyboard.on('keydown-TWO', () => this.applyPreviewPreset('FULL_TABLE'));
    this.input.keyboard.on('keydown-THREE', () => this.applyPreviewPreset('EMPTY_TABLE'));
  }

  renderBackgroundLayer() {
    const bg = this.add.graphics();
    bg.setDepth(LAYERS.BG_BASE);

    bg.fillStyle(PALETTE.NIGHT_ASPHALT_DARK, 1);
    bg.fillRect(0, 0, RESOLUTION.LOGICAL_WIDTH, RESOLUTION.LOGICAL_HEIGHT);

    bg.fillStyle(PALETTE.NIGHT_ASPHALT_MID, 1);
    bg.fillRect(
      0,
      LAYOUT_ZONES.PLAYFIELD.y,
      RESOLUTION.LOGICAL_WIDTH,
      LAYOUT_ZONES.PLAYFIELD.height
    );

    // Warm streetlamp light pool centered around the plastic table
    bg.fillStyle(PALETTE.WARM_STREETLIGHT, 0.06);
    bg.fillCircle(RESOLUTION.LOGICAL_WIDTH / 2, LAYOUT_ZONES.TABLE_CENTER.y, 145);
    bg.fillStyle(PALETTE.WARM_STREETLIGHT, 0.08);
    bg.fillCircle(RESOLUTION.LOGICAL_WIDTH / 2, LAYOUT_ZONES.TABLE_CENTER.y, 95);

    bg.lineStyle(1, PALETTE.SIDEWALK_CURB, 0.35);
    for (let y = LAYOUT_ZONES.PLAYFIELD.y + 28; y < LAYOUT_ZONES.QUEUE_PANEL.y; y += 36) {
      bg.lineBetween(0, y, RESOLUTION.LOGICAL_WIDTH, y);
    }
    for (let x = 36; x < RESOLUTION.LOGICAL_WIDTH; x += 48) {
      bg.lineBetween(x, LAYOUT_ZONES.PLAYFIELD.y, x, LAYOUT_ZONES.QUEUE_PANEL.y);
    }
  }

  renderAmbientStreetLayer() {
    const ambient = this.add.graphics();
    ambient.setDepth(LAYERS.BG_AMBIENT);

    const wireY = LAYOUT_ZONES.PLAYFIELD.y + 4;
    ambient.lineStyle(1, 0x6e5936, 0.9);
    ambient.lineBetween(8, wireY, RESOLUTION.LOGICAL_WIDTH - 8, wireY);

    const bulbColors = [PALETTE.NEON_YELLOW, 0xfb7185, 0x38bdf8, PALETTE.WARM_STREETLIGHT];
    let idx = 0;
    for (let x = 24; x <= RESOLUTION.LOGICAL_WIDTH - 24; x += 34) {
      const bulbColor = bulbColors[idx % bulbColors.length];
      idx += 1;
      ambient.fillStyle(bulbColor, 0.22);
      ambient.fillCircle(x, wireY + 3, 6.5);
      ambient.fillStyle(bulbColor, 0.95);
      ambient.fillCircle(x, wireY + 3, 2.5);
    }
  }

  renderHeaderAndBanner(data) {
    const headerZone = LAYOUT_ZONES.HEADER_BAR;
    const bannerZone = LAYOUT_ZONES.EVENT_BANNER;

    const headerGfx = this.add.graphics();
    headerGfx.setDepth(LAYERS.SCREEN_HUD);
    headerGfx.fillStyle(PALETTE.UI_PANEL_BG, 0.95);
    headerGfx.fillRoundedRect(headerZone.x, headerZone.y, headerZone.width, headerZone.height, 5);
    headerGfx.lineStyle(1.5, PALETTE.UI_PANEL_BORDER, 1);
    headerGfx.strokeRoundedRect(headerZone.x, headerZone.y, headerZone.width, headerZone.height, 5);

    headerGfx.fillStyle(PALETTE.PLASTIC_RED, 1);
    headerGfx.fillRoundedRect(headerZone.x + 6, headerZone.y + 7, 46, 20, 4);
    this.uiRefs.headerGfx = headerGfx;

    this.uiRefs.liveBadgeText = this.add
      .text(headerZone.x + 29, headerZone.y + 17, `● ${data.header.liveBadge}`, {
        fontFamily: 'sans-serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_WHITE,
        resolution: 3
      })
      .setOrigin(0.5, 0.5)
      .setDepth(LAYERS.SCREEN_HUD);

    this.uiRefs.gameTitleText = this.add
      .text(headerZone.x + 58, headerZone.y + 17, data.header.gameTitle, {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_WARM,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 2.5,
        resolution: 3
      })
      .setOrigin(0, 0.5)
      .setDepth(LAYERS.SCREEN_HUD);

    this.uiRefs.statsText = this.add
      .text(
        headerZone.x + headerZone.width - 8,
        headerZone.y + 17,
        `${data.header.likeSummary}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '9.5px',
          fontStyle: 'bold',
          color: PALETTE.TEXT_WHITE,
          resolution: 3
        }
      )
      .setOrigin(1, 0.5)
      .setDepth(LAYERS.SCREEN_HUD);

    const bannerGfx = this.add.graphics();
    bannerGfx.setDepth(LAYERS.EVENT_BANNER_AND_SYSTEM);
    bannerGfx.fillStyle(0x2a1d3d, 0.95);
    bannerGfx.fillRoundedRect(bannerZone.x, bannerZone.y, bannerZone.width, bannerZone.height, 4);
    bannerGfx.lineStyle(1, PALETTE.PLASTIC_RED, 0.9);
    bannerGfx.strokeRoundedRect(bannerZone.x, bannerZone.y, bannerZone.width, bannerZone.height, 4);
    this.uiRefs.eventBannerGfx = bannerGfx;

    this.uiRefs.eventBannerText = this.add
      .text(
        bannerZone.x + bannerZone.width / 2,
        bannerZone.y + bannerZone.height / 2,
        truncateTextSafe(data.eventBanner.text, 48),
        {
          fontFamily: 'sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          color: PALETTE.TEXT_WARM,
          stroke: PALETTE.TEXT_STROKE,
          strokeThickness: 2.5,
          resolution: 3
        }
      )
      .setOrigin(0.5, 0.5)
      .setDepth(LAYERS.EVENT_BANNER_AND_SYSTEM);
  }

  renderLeaderboardBar(leaderboardPreview) {
    const zone = LAYOUT_ZONES.LEADERBOARD_BAR;
    const gfx = this.add.graphics();
    gfx.setDepth(LAYERS.SCREEN_HUD);

    gfx.fillStyle(PALETTE.UI_PANEL_BG, 0.92);
    gfx.fillRoundedRect(zone.x, zone.y, zone.width, zone.height, 4);
    gfx.lineStyle(1, 0x475569, 1);
    gfx.strokeRoundedRect(zone.x, zone.y, zone.width, zone.height, 4);
    this.uiRefs.leaderboardGfx = gfx;

    const summary = leaderboardPreview
      .slice(0, 3)
      .map(
        (item) =>
          `#${item.rank} ${formatNickname(
            item.nickname,
            PLACEHOLDER_SIZES.MAX_LEADERBOARD_NAME_LENGTH
          )}`
      )
      .join(' | ');

    this.uiRefs.leaderboardText = this.add
      .text(
        zone.x + zone.width / 2,
        zone.y + zone.height / 2,
        truncateTextSafe(`🏆 ${summary}`, 48),
        {
          fontFamily: 'sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          color: PALETTE.TEXT_MUTED,
          stroke: PALETTE.TEXT_STROKE,
          strokeThickness: 2.5,
          resolution: 3
        }
      )
      .setOrigin(0.5, 0.5)
      .setDepth(LAYERS.SCREEN_HUD);
  }

  renderWaitingQueuePanel(queueData) {
    const zone = LAYOUT_ZONES.QUEUE_PANEL;
    const gfx = this.add.graphics();
    gfx.setDepth(LAYERS.SCREEN_HUD);

    gfx.fillStyle(PALETTE.UI_PANEL_BG, 0.95);
    gfx.fillRoundedRect(zone.x, zone.y, zone.width, zone.height, 5);
    gfx.lineStyle(1, PALETTE.PLASTIC_BLUE, 0.95);
    gfx.strokeRoundedRect(zone.x, zone.y, zone.width, zone.height, 5);
    this.uiRefs.queueGfx = gfx;

    this.uiRefs.queueTitleText = this.add
      .text(zone.x + 10, zone.y + 16, '', {
        fontFamily: 'sans-serif',
        fontSize: '10.5px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_WARM,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 2.5,
        resolution: 3
      })
      .setOrigin(0, 0.5)
      .setDepth(LAYERS.SCREEN_HUD);

    this.uiRefs.vipQueueText = this.add
      .text(zone.x + 10, zone.y + 37, '', {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_VIP,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 2.5,
        resolution: 3
      })
      .setOrigin(0, 0.5)
      .setDepth(LAYERS.SCREEN_HUD);

    this.uiRefs.normalQueueText = this.add
      .text(zone.x + 10, zone.y + 57, '', {
        fontFamily: 'sans-serif',
        fontSize: '9.5px',
        color: PALETTE.TEXT_WHITE,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 2,
        resolution: 3
      })
      .setOrigin(0, 0.5)
      .setDepth(LAYERS.SCREEN_HUD);

    this.updateWaitingQueueDisplay(queueData);
  }

  renderInteractionGuidePanel(guideLines) {
    const zone = LAYOUT_ZONES.GUIDE_PANEL;
    const gfx = this.add.graphics();
    gfx.setDepth(LAYERS.SCREEN_HUD);

    gfx.fillStyle(PALETTE.UI_PANEL_BG, 0.95);
    gfx.fillRoundedRect(zone.x, zone.y, zone.width, zone.height, 5);
    gfx.lineStyle(1, PALETTE.WARM_STREETLIGHT, 0.85);
    gfx.strokeRoundedRect(zone.x, zone.y, zone.width, zone.height, 5);
    this.uiRefs.guideGfx = gfx;
    this.uiRefs.guideTexts = [];

    guideLines.forEach((line, index) => {
      const txt = this.add
        .text(zone.x + 10, zone.y + 15 + index * 20, line, {
          fontFamily: 'sans-serif',
          fontSize: '9.5px',
          fontStyle: index === 0 ? 'bold' : 'normal',
          color: index === 0 ? PALETTE.TEXT_WARM : PALETTE.TEXT_WHITE,
          stroke: PALETTE.TEXT_STROKE,
          strokeThickness: 2,
          resolution: 3
        })
        .setOrigin(0, 0.5)
        .setDepth(LAYERS.SCREEN_HUD);
      this.uiRefs.guideTexts.push(txt);
    });
  }

  initCrispDomOverlay(data) {
    if (typeof document === 'undefined') {
      return;
    }

    const container = document.getElementById('game-container');
    if (!container) {
      return;
    }

    if (this.tavernV2) {
      this.tavernV2.destroy();
      this.tavernV2 = null;
    }

    this.tavernV2 = new TavernV2Overlay(this, container);
    this.tavernV2.mount();
  }

  syncDomTextElements() {
    if (!this.domHud) {
      return;
    }

    if (this.uiRefs.liveBadgeText && this.domHud.badgeEl) {
      this.domHud.badgeEl.textContent = this.uiRefs.liveBadgeText.text;
    }
    if (this.uiRefs.statsText && this.domHud.statsEl) {
      this.domHud.statsEl.textContent = this.uiRefs.statsText.text;
    }
    if (this.uiRefs.eventBannerText && this.domHud.bannerEl) {
      this.domHud.bannerEl.textContent = this.uiRefs.eventBannerText.text;
    }
    if (this.uiRefs.leaderboardText && this.domHud.leaderboardEl) {
      this.domHud.leaderboardEl.textContent = this.uiRefs.leaderboardText.text;
    }
    if (this.uiRefs.queueTitleText && this.domHud.queueTitleEl) {
      this.domHud.queueTitleEl.textContent = this.uiRefs.queueTitleText.text;
    }
    if (this.uiRefs.vipQueueText && this.domHud.vipQueueEl) {
      this.domHud.vipQueueEl.textContent = this.uiRefs.vipQueueText.text;
    }
    if (this.uiRefs.normalQueueText && this.domHud.normalQueueEl) {
      this.domHud.normalQueueEl.textContent = this.uiRefs.normalQueueText.text;
    }

    this.seatViews.forEach((seatView, seatId) => {
      // Keep blurry canvas text hidden while preserving text objects for unit tests
      if (seatView.nicknameText) seatView.nicknameText.setAlpha(0);
      if (seatView.statusText) seatView.statusText.setAlpha(0);
      if (seatView.playerPlaceholder && seatView.playerPlaceholder.seatBadgeText) {
        seatView.playerPlaceholder.seatBadgeText.setAlpha(0);
      }

      const domSeat = this.domHud.seatsDom.get(seatId);
      if (!domSeat) return;

      const state = seatView.viewState || {};
      const isOccupied = state.status && state.status !== 'EMPTY';

      if (seatView.nicknameText) {
        const rawNick = state.rawNickname;
        if (isOccupied && rawNick) {
          const vipPrefix = state.isVIP ? '★ ' : '';
          domSeat.nameEl.textContent = `#${seatId} ${vipPrefix}${formatNickname(rawNick, 14)}`;
        } else {
          domSeat.nameEl.textContent = seatView.nicknameText.text;
        }
        domSeat.nameEl.style.color =
          (seatView.nicknameText.style && seatView.nicknameText.style.color) || '#ffffff';
        domSeat.nameEl.style.opacity = isOccupied ? '1' : '0.78';
        domSeat.nameEl.style.borderColor = isOccupied
          ? 'rgba(251, 191, 36, 0.55)'
          : 'rgba(148, 163, 184, 0.25)';
      }

      if (seatView.statusText) {
        domSeat.statusEl.textContent = seatView.statusText.text;
        domSeat.statusEl.style.color =
          (seatView.statusText.style && seatView.statusText.style.color) || '#22c55e';
      }

      if (seatView.playerPlaceholder && seatView.playerPlaceholder.seatBadgeText) {
        const badgeY = isOccupied
          ? domSeat.layout.charBottomY - 12
          : domSeat.layout.stoolY - 1;
        domSeat.stoolEl.style.top = `${((badgeY / RESOLUTION.LOGICAL_HEIGHT) * 100).toFixed(4)}%`;
        domSeat.stoolEl.style.color = isOccupied ? '#ffffff' : '#94a3b8';
      }
    });
  }
}
