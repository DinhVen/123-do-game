import {
  PALETTE,
  PLACEHOLDER_SIZES,
  SEAT_SHIRT_COLORS,
  SEAT_STATUS,
  resolveVisualTier
} from '../ui/Layout.js';

/**
 * Modular Character & Stool Placeholder (Head + Torso + Stool separated)
 * Designed so headGfx and torsoGfx can be swapped with Pixel Art Spritesheets later
 * without changing SeatView interface.
 */
export class PlayerPlaceholder {
  constructor(scene, seatLayout, depth) {
    this.scene = scene;
    this.seatLayout = seatLayout;
    this.seatId = seatLayout.seatId;
    this.depth = depth;
    this.defaultShirtColor = SEAT_SHIRT_COLORS[this.seatId] || 0x3b82f6;

    // Separate visual layers for Stool, Torso, and Head
    this.stoolGfx = this.scene.add.graphics().setDepth(this.depth);
    this.torsoGfx = this.scene.add.graphics().setDepth(this.depth + 1);
    this.headGfx = this.scene.add.graphics().setDepth(this.depth + 2);

    this.seatBadgeText = this.scene.add
      .text(this.seatLayout.x, this.seatLayout.stoolY - 1, `GHẾ ${this.seatId}`, {
        fontFamily: 'sans-serif',
        fontSize: '8.5px',
        fontStyle: 'bold',
        color: PALETTE.TEXT_WHITE,
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 2,
        resolution: 3
      })
      .setOrigin(0.5, 0.5)
      .setDepth(this.depth + 3);

    this.visibleCharacter = false;
    this.currentStatus = SEAT_STATUS.EMPTY;
    this.currentDrunkLevel = 0;
    this.currentShirtColor = this.defaultShirtColor;
    this.currentVisualTier = 'EMPTY';
    this.poseOffset = { x: 0, y: 0, raiseMug: false };
    this.renderStool(false);
  }

  setPoseOffset({ x = 0, y = 0, raiseMug = false } = {}) {
    if (this.currentStatus === SEAT_STATUS.EMPTY) {
      this.poseOffset = { x: 0, y: 0, raiseMug: false };
      return;
    }
    this.poseOffset = {
      x: Number(x) || 0,
      y: Number(y) || 0,
      raiseMug: Boolean(raiseMug) && this.currentStatus === SEAT_STATUS.SEATED
    };
    this.renderTorso(this.currentStatus, this.currentShirtColor);
    this.renderHead(this.currentStatus, this.currentDrunkLevel);
  }

  resetPoseOffset() {
    this.setPoseOffset({ x: 0, y: 0, raiseMug: false });
  }

  getPoseOffset() {
    return { ...this.poseOffset };
  }

  renderStool(isOccupied = false) {
    const { x, stoolY } = this.seatLayout;
    const stoolW = PLACEHOLDER_SIZES.STOOL_WIDTH;
    const stoolH = PLACEHOLDER_SIZES.STOOL_HEIGHT;

    this.stoolGfx.clear();

    // Stool shadow
    this.stoolGfx.fillStyle(0x090710, 0.55);
    this.stoolGfx.fillRoundedRect(x - stoolW / 2 + 2, stoolY - stoolH / 2 + 4, stoolW, stoolH, 3);

    // Plastic stool legs / base
    this.stoolGfx.fillStyle(PALETTE.PLASTIC_BLUE_DARK, 1);
    this.stoolGfx.fillRoundedRect(x - stoolW / 2, stoolY - stoolH / 2 + 2, stoolW, stoolH, 3);

    // Plastic stool top surface
    const topColor = isOccupied ? PALETTE.PLASTIC_BLUE : 0x1e6091;
    this.stoolGfx.fillStyle(topColor, 1);
    this.stoolGfx.fillRoundedRect(x - stoolW / 2, stoolY - stoolH / 2, stoolW, stoolH - 3, 3);
    this.stoolGfx.lineStyle(1, PALETTE.NIGHT_ASPHALT_DARK, 0.9);
    this.stoolGfx.strokeRoundedRect(x - stoolW / 2, stoolY - stoolH / 2, stoolW, stoolH, 3);
  }

  renderTorso(status, shirtColor) {
    this.torsoGfx.clear();
    if (status === SEAT_STATUS.EMPTY) {
      this.torsoGfx.setVisible(false);
      return;
    }

    this.torsoGfx.setVisible(true);
    const { x, charBottomY } = this.seatLayout;
    const torsoW = PLACEHOLDER_SIZES.TORSO_WIDTH;
    const torsoH = PLACEHOLDER_SIZES.TORSO_HEIGHT;

    // Slight tilt/slump offset for KO or LEAVING visual state + transient animation poseOffset
    const poseX = this.poseOffset ? this.poseOffset.x : 0;
    const poseY = this.poseOffset ? this.poseOffset.y : 0;
    const offsetX = (status === SEAT_STATUS.LEAVING ? 5 : 0) + poseX;
    const offsetY = (status === SEAT_STATUS.KO ? 4 : 0) + poseY;
    const activeColor =
      status === SEAT_STATUS.KO ? 0x64748b : shirtColor || this.defaultShirtColor;

    this.torsoGfx.fillStyle(activeColor, 1);
    this.torsoGfx.fillRoundedRect(
      x - torsoW / 2 + offsetX,
      charBottomY - torsoH - 2 + offsetY,
      torsoW,
      torsoH,
      5
    );
    // Shirt collar / shoulder highlight
    this.torsoGfx.fillStyle(0xffffff, 0.22);
    this.torsoGfx.fillRoundedRect(
      x - torsoW / 2 + 2 + offsetX,
      charBottomY - torsoH - 1 + offsetY,
      torsoW - 4,
      4,
      2
    );
    this.torsoGfx.lineStyle(1.5, PALETTE.NIGHT_ASPHALT_DARK, 1);
    this.torsoGfx.strokeRoundedRect(
      x - torsoW / 2 + offsetX,
      charBottomY - torsoH - 2 + offsetY,
      torsoW,
      torsoH,
      5
    );

    // Raised cheering mug when CHEERS animation is active on a SEATED player
    if (this.poseOffset && this.poseOffset.raiseMug && status === SEAT_STATUS.SEATED) {
      const mugX = x + offsetX + 16;
      const mugY = charBottomY - torsoH - 10 + offsetY;
      this.torsoGfx.fillStyle(PALETTE.WARM_STREETLIGHT, 1);
      this.torsoGfx.fillRoundedRect(mugX - 4, mugY - 5, 8, 10, 2);
      this.torsoGfx.fillStyle(0xffffff, 1);
      this.torsoGfx.fillRect(mugX - 4, mugY - 6, 8, 3);
      this.torsoGfx.lineStyle(1, PALETTE.NIGHT_ASPHALT_DARK, 1);
      this.torsoGfx.strokeRoundedRect(mugX - 4, mugY - 6, 8, 11, 2);
    }
  }

  renderHead(status, drunkLevel) {
    this.headGfx.clear();
    if (status === SEAT_STATUS.EMPTY) {
      this.headGfx.setVisible(false);
      return;
    }

    this.headGfx.setVisible(true);
    const { x, charBottomY } = this.seatLayout;
    const charH = PLACEHOLDER_SIZES.CHARACTER_HEIGHT;
    const radius = PLACEHOLDER_SIZES.HEAD_RADIUS;
    const tier = resolveVisualTier(drunkLevel, status);

    const poseX = this.poseOffset ? this.poseOffset.x : 0;
    const poseY = this.poseOffset ? this.poseOffset.y : 0;
    const headX = x + (status === SEAT_STATUS.LEAVING ? 6 : 0) + poseX;
    const headY =
      charBottomY - charH + radius + 2 + (status === SEAT_STATUS.KO ? 5 : 0) + poseY;

    // Skin tone shifts slightly warmer/flushed when drunk
    let skinColor = 0xfde68a;
    if (tier === 'DRUNK') skinColor = 0xfca5a5;
    if (tier === 'KO') skinColor = 0xe2e8f0;

    this.headGfx.fillStyle(skinColor, 1);
    this.headGfx.fillCircle(headX, headY, radius);
    this.headGfx.lineStyle(1.5, PALETTE.NIGHT_ASPHALT_DARK, 1);
    this.headGfx.strokeCircle(headX, headY, radius);

    // Hair / cap top accent per seatId for lively character personality
    const hairColors = [0x1e293b, 0x3f2e21, 0x0f172a, 0x451a03, 0x1e1b4b, 0x27272a];
    const hairColor = hairColors[(this.seatId - 1) % hairColors.length];
    this.headGfx.fillStyle(hairColor, 0.95);
    this.headGfx.fillRoundedRect(headX - radius + 1, headY - radius - 2, (radius - 1) * 2, 5, 2.5);

    // Blush cheeks for TIPSY / DRUNK
    if (tier === 'TIPSY' || tier === 'DRUNK') {
      const blushColor = tier === 'DRUNK' ? PALETTE.PLASTIC_RED : 0xfb7185;
      this.headGfx.fillStyle(blushColor, 0.9);
      this.headGfx.fillCircle(headX - 6, headY + 2, 2.5);
      this.headGfx.fillCircle(headX + 6, headY + 2, 2.5);
    }

    // Facial expression by visualTier / status
    this.headGfx.fillStyle(PALETTE.NIGHT_ASPHALT_DARK, 1);
    this.headGfx.lineStyle(1.5, PALETTE.NIGHT_ASPHALT_DARK, 1);

    if (status === SEAT_STATUS.KO || tier === 'KO') {
      // X eyes for KO
      this.headGfx.lineBetween(headX - 6, headY - 4, headX - 2, headY);
      this.headGfx.lineBetween(headX - 2, headY - 4, headX - 6, headY);
      this.headGfx.lineBetween(headX + 2, headY - 4, headX + 6, headY);
      this.headGfx.lineBetween(headX + 6, headY - 4, headX + 2, headY);
      // Open dizzy mouth
      this.headGfx.strokeCircle(headX, headY + 4, 2);
    } else if (status === SEAT_STATUS.LEAVING) {
      // Sweating / startled eyes when dragged home by Wife
      this.headGfx.fillCircle(headX - 4, headY - 2, 2);
      this.headGfx.fillCircle(headX + 4, headY - 2, 2);
      this.headGfx.fillRect(headX - 3, headY + 4, 6, 2);
      // Sweat drop on temple
      this.headGfx.fillStyle(0x38bdf8, 1);
      this.headGfx.fillCircle(headX - 9, headY - 4, 2);
    } else {
      // Normal / Tipsy / Drunk eyes & smile
      this.headGfx.fillCircle(headX - 4, headY - 2, 1.6);
      this.headGfx.fillCircle(headX + 4, headY - 2, 1.6);
      this.headGfx.fillRect(headX - 3, headY + 4, 6, 1.5);
    }
  }

  updateCharacter({ status = SEAT_STATUS.EMPTY, drunkLevel = 0, shirtColor = null } = {}) {
    const isOccupied = status !== SEAT_STATUS.EMPTY;
    this.visibleCharacter = isOccupied;
    this.currentStatus = status;
    this.currentDrunkLevel = drunkLevel;
    this.currentShirtColor = shirtColor || this.defaultShirtColor;
    this.currentVisualTier = resolveVisualTier(drunkLevel, status);
    if (!isOccupied || status !== SEAT_STATUS.SEATED) {
      this.poseOffset = { x: 0, y: 0, raiseMug: false };
    }

    this.renderStool(isOccupied);
    this.renderTorso(status, this.currentShirtColor);
    this.renderHead(status, drunkLevel);

    // Position the seat badge on the chest when occupied, or on the stool when empty
    const badgeY = isOccupied ? this.seatLayout.charBottomY - 12 : this.seatLayout.stoolY - 1;
    this.seatBadgeText.setPosition(this.seatLayout.x, badgeY);
    this.seatBadgeText.setColor(isOccupied ? PALETTE.TEXT_WHITE : PALETTE.TEXT_EMPTY);
  }
}
