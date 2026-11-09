import {
  LAYERS,
  PALETTE,
  PLACEHOLDER_SIZES,
  SEAT_SHIRT_COLORS,
  SEAT_STATUS,
  clampDrunkLevel,
  computeDrunkBarSpec,
  formatNickname
} from '../ui/Layout.js';
import { PlayerPlaceholder } from './PlayerPlaceholder.js';

/**
 * View-only Component for a Single Seat (seatId 1..6)
 * Does not hold authoritative Game State or run gameplay timers.
 */
export class SeatView {
  constructor(scene, seatLayout) {
    if (!seatLayout || typeof seatLayout.seatId !== 'number') {
      throw new Error('SeatView requires a valid seatLayout with seatId 1..6');
    }

    this.scene = scene;
    this.seatLayout = seatLayout;
    this.seatId = seatLayout.seatId;
    this.seatIndex = seatLayout.seatIndex;
    this.row = seatLayout.row;

    const charDepth =
      this.row === 'BACK' ? LAYERS.BACK_ROW_SEATS : LAYERS.FRONT_ROW_SEATS;

    // 1. Character & Stool Placeholder (Head + Torso + Stool)
    this.playerPlaceholder = new PlayerPlaceholder(this.scene, this.seatLayout, charDepth);

    // 2. Player World UI (Layer 60: PLAYER_WORLD_UI)
    this.drunkBarGfx = this.scene.add.graphics().setDepth(LAYERS.PLAYER_WORLD_UI);

    this.nicknameText = this.scene.add
      .text(this.seatLayout.x, this.seatLayout.hudNameY, '', {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_WHITE,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 3,
        resolution: 3
      })
      .setOrigin(0.5, 0.5)
      .setDepth(LAYERS.PLAYER_WORLD_UI);

    this.statusText = this.scene.add
      .text(this.seatLayout.x, this.seatLayout.statusY, '', {
        fontFamily: 'sans-serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_SOBER,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 3,
        resolution: 3
      })
      .setOrigin(0.5, 0.5)
      .setDepth(LAYERS.PLAYER_WORLD_UI);

    // Internal view state snapshot for inspection & tests
    this._lastRenderKey = null;
    this.redrawCount = 0;
    this.skippedRedrawCount = 0;
    this.viewState = {
      seatId: this.seatId,
      userId: null,
      status: SEAT_STATUS.EMPTY,
      rawNickname: null,
      displayNickname: '',
      drunkLevel: 0,
      visualTier: 'EMPTY',
      barSpec: computeDrunkBarSpec(0, SEAT_STATUS.EMPTY)
    };

    this.clearSeat();
  }

  setAnimationOffset(poseOffset) {
    this.playerPlaceholder.setPoseOffset(poseOffset);
  }

  resetAnimationOffset() {
    this.playerPlaceholder.resetPoseOffset();
  }

  /**
   * Clear seat to EMPTY state and remove any previous player's nickname/drunk display.
   */
  clearSeat() {
    this.updateSeat({
      seatId: this.seatId,
      userId: null,
      status: SEAT_STATUS.EMPTY,
      nickname: null,
      drunkLevel: 0
    });
  }

  /**
   * Update seat display from static preview data or Backend snapshot seat entry.
   */
  updateSeat(seatData = null) {
    const validStatuses = new Set([
      SEAT_STATUS.EMPTY,
      SEAT_STATUS.SEATED,
      SEAT_STATUS.KO,
      SEAT_STATUS.LEAVING
    ]);

    const rawStatus =
      seatData && seatData.status && validStatuses.has(seatData.status)
        ? seatData.status
        : seatData && seatData.nickname
          ? SEAT_STATUS.SEATED
          : SEAT_STATUS.EMPTY;

    const isOccupied = rawStatus !== SEAT_STATUS.EMPTY;
    const nextUserId =
      isOccupied && seatData && seatData.userId ? String(seatData.userId) : null;
    if (this.viewState && this.viewState.userId !== nextUserId) {
      this.playerPlaceholder.resetPoseOffset();
    }

    const rawNickname = isOccupied && seatData ? seatData.nickname : null;
    const truncatedNick = isOccupied ? formatNickname(rawNickname || 'Khách') : '';
    const drunkLevel = isOccupied
      ? rawStatus === SEAT_STATUS.KO
        ? 100
        : clampDrunkLevel(seatData ? seatData.drunkLevel : 0)
      : 0;
    const shirtColor =
      (seatData && seatData.shirtColor) || SEAT_SHIRT_COLORS[this.seatId] || 0x3b82f6;

    const barSpec = computeDrunkBarSpec(drunkLevel, rawStatus);
    const isVIP = Boolean(isOccupied && seatData && (seatData.isVIP || seatData.isVip));
    const renderKey = `${nextUserId || ''}|${rawStatus}|${barSpec.drunkLevel}|${truncatedNick}|${isVIP ? 1 : 0}|${shirtColor}`;

    if (this._lastRenderKey === renderKey) {
      this.skippedRedrawCount += 1;
      this.viewState = {
        ...this.viewState,
        rawNickname: isOccupied ? rawNickname : null
      };
      return this.viewState;
    }

    this._lastRenderKey = renderKey;
    this.redrawCount += 1;

    // Update character & stool placeholder
    this.playerPlaceholder.updateCharacter({
      status: rawStatus,
      drunkLevel: barSpec.drunkLevel,
      shirtColor
    });

    // Update Nickname Text (When EMPTY, never display old player's nickname)
    if (isOccupied) {
      this.nicknameText.setText(`#${this.seatId} ${truncatedNick}`);
      this.nicknameText.setColor(isVIP ? PALETTE.TEXT_WARM : PALETTE.TEXT_WHITE);
      this.nicknameText.setAlpha(1);
    } else {
      this.nicknameText.setText(`#${this.seatId} [Ghế trống]`);
      this.nicknameText.setColor(PALETTE.TEXT_EMPTY);
      this.nicknameText.setAlpha(0.8);
    }

    // Update Drunk Gauge Bar (52 x 8 px with 30% & 70% threshold ticks)
    this.renderDrunkBar(barSpec, isOccupied);

    // Update Status Label
    this.statusText.setText(barSpec.statusText);
    this.statusText.setColor(barSpec.statusColor);

    this.viewState = {
      seatId: this.seatId,
      userId: nextUserId,
      status: rawStatus,
      rawNickname: isOccupied ? rawNickname : null,
      displayNickname: truncatedNick,
      drunkLevel: barSpec.drunkLevel,
      visualTier: barSpec.visualTier,
      barSpec,
      isCharacterVisible: this.playerPlaceholder.visibleCharacter
    };

    return this.viewState;
  }

  renderDrunkBar(barSpec, isOccupied) {
    const { x, hudNameY, gaugeY } = this.seatLayout;
    const gaugeW = PLACEHOLDER_SIZES.GAUGE_WIDTH;
    const gaugeH = PLACEHOLDER_SIZES.GAUGE_HEIGHT;
    const left = x - gaugeW / 2;
    const top = gaugeY - gaugeH / 2;

    this.drunkBarGfx.clear();

    // Subtle dark HUD backdrop plate when running without DOM HUD
    if (typeof document === 'undefined') {
      this.drunkBarGfx.fillStyle(PALETTE.NIGHT_ASPHALT_DARK, isOccupied ? 0.72 : 0.35);
      this.drunkBarGfx.fillRoundedRect(x - 48, hudNameY - 8, 96, 42, 4);
    }

    // Outer dark gauge background
    this.drunkBarGfx.fillStyle(PALETTE.GAUGE_BG, isOccupied ? 0.96 : 0.55);
    this.drunkBarGfx.fillRect(left, top, gaugeW, gaugeH);

    // Colored fill proportional to drunkLevel 0..100 with top glossy highlight
    if (isOccupied && barSpec.fillWidth > 0) {
      this.drunkBarGfx.fillStyle(barSpec.fillColor, 1);
      this.drunkBarGfx.fillRect(left + 1, top + 1, barSpec.fillWidth, gaugeH - 2);
      this.drunkBarGfx.fillStyle(0xffffff, 0.25);
      this.drunkBarGfx.fillRect(left + 1, top + 1, barSpec.fillWidth, 2);
    }

    // Threshold tick marks at 30% (TIPSY) and 70% (DRUNK) for high readability
    if (isOccupied) {
      const tick30X = left + 1 + Math.round((gaugeW - 2) * 0.3);
      const tick70X = left + 1 + Math.round((gaugeW - 2) * 0.7);
      this.drunkBarGfx.lineStyle(1, PALETTE.NIGHT_ASPHALT_DARK, 0.85);
      this.drunkBarGfx.lineBetween(tick30X, top + 1, tick30X, top + gaugeH - 1);
      this.drunkBarGfx.lineBetween(tick70X, top + 1, tick70X, top + gaugeH - 1);
    }

    // Crisp outer border (accented when DRUNK or KO)
    const borderColor = !isOccupied
      ? 0x475569
      : barSpec.visualTier === 'DRUNK' || barSpec.visualTier === 'KO'
        ? barSpec.fillColor
        : PALETTE.GAUGE_BORDER;
    this.drunkBarGfx.lineStyle(1, borderColor, isOccupied ? 0.98 : 0.55);
    this.drunkBarGfx.strokeRect(left, top, gaugeW, gaugeH);
  }

  getDisplayState() {
    return { ...this.viewState };
  }
}
