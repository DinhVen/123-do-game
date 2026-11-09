import {
  LAYERS,
  LAYOUT_ZONES,
  PALETTE,
  SEAT_LAYOUTS,
  SEAT_STATUS
} from '../ui/Layout.js';

/**
 * Dedicated Visual Module for the Central Street-Side Red Plastic Table
 * Layer 30 (TABLE_AND_PROPS): Renders red plastic table, snack plates, decorative props,
 * and 6 beer mug positions aligned with the 6 seats.
 */
export class TableView {
  constructor(scene) {
    this.scene = scene;
    this.tableZone = LAYOUT_ZONES.TABLE_CENTER;
    this.tableGfx = this.scene.add.graphics().setDepth(LAYERS.TABLE_AND_PROPS);
    this.mugsGfx = this.scene.add.graphics().setDepth(LAYERS.TABLE_AND_PROPS + 1);

    this.tableLabel = this.scene.add
      .text(this.tableZone.x, this.tableZone.y - 1, '', {
        fontFamily: 'sans-serif',
        fontSize: '9.5px',
        fontStyle: 'bold',
        color: '#FFE4E6',
        stroke: PALETTE.TEXT_STROKE,
        strokeThickness: 2.5,
        resolution: 3
      })
      .setOrigin(0.5, 0.5)
      .setDepth(LAYERS.TABLE_AND_PROPS + 2)
      .setAlpha(0);

    this.mugStates = new Map();
    this.lastSeatList = [];
    this.cheeringSeatIds = new Set();
    this.activeSnackPlates = 0;
    this._lastMugSignature = null;
    this.redrawCount = 0;
    this.skippedRedrawCount = 0;
    this.renderBaseTableAndSnacks();
    this.updateMugStates([]);
  }

  setCheeringSeats(seatIds = []) {
    this.cheeringSeatIds = new Set(Array.isArray(seatIds) ? seatIds : []);
    this.updateMugStates(this.lastSeatList);
  }

  setSnackPlatesActive(count = 0) {
    const nextCount = Math.max(0, Math.min(3, Number(count) || 0));
    if (this.activeSnackPlates === nextCount) {
      return;
    }
    this.activeSnackPlates = nextCount;
    this.renderBaseTableAndSnacks();
  }

  renderBaseTableAndSnacks() {
    const { x, y, width, height } = this.tableZone;
    const left = x - width / 2;
    const top = y - height / 2;

    this.tableGfx.clear();

    // 1. Table ground drop shadow
    this.tableGfx.fillStyle(0x090710, 0.7);
    this.tableGfx.fillRoundedRect(left + 3, top + 6, width, height, 8);

    // 2. Red plastic table skirt / legs
    this.tableGfx.fillStyle(PALETTE.PLASTIC_RED_DARK, 1);
    this.tableGfx.fillRoundedRect(left, top + 4, width, height, 7);

    // 3. Red plastic tabletop
    this.tableGfx.fillStyle(PALETTE.PLASTIC_RED, 1);
    this.tableGfx.fillRoundedRect(left, top, width, height - 4, 7);

    // Plastic molded inner rim & corner vents
    this.tableGfx.lineStyle(1.5, 0xff6b72, 0.85);
    this.tableGfx.strokeRoundedRect(left + 4, top + 4, width - 8, height - 12, 5);

    // 4. Decorative street-tavern props (pink tissue box on left & green beer bottles on right)
    // Pink tissue box
    this.tableGfx.fillStyle(0xf472b6, 1);
    this.tableGfx.fillRoundedRect(x - 94, y - 7, 16, 12, 2);
    this.tableGfx.fillStyle(0xffffff, 0.95);
    this.tableGfx.fillTriangle(x - 89, y - 7, x - 83, y - 7, x - 86, y - 12);

    // Green beer bottles pair
    this.tableGfx.fillStyle(0x15803d, 1);
    this.tableGfx.fillRoundedRect(x + 82, y - 10, 6, 14, 2);
    this.tableGfx.fillRoundedRect(x + 90, y - 8, 6, 14, 2);
    this.tableGfx.fillStyle(0xfef08a, 1);
    this.tableGfx.fillRect(x + 83, y - 4, 4, 4);
    this.tableGfx.fillRect(x + 91, y - 2, 4, 4);

    // 5. Dynamic Snack Plates: Only appear when viewers send a Gift that includes Snacks/Mồi!
    if (this.activeSnackPlates > 0) {
      const allPlates = [
        { cx: x, cy: y - 1, r: 14, foodColor: 0xb45309, garnishColor: 0xef4444 },
        { cx: x - 54, cy: y - 1, r: 12, foodColor: 0xd97706, garnishColor: 0x65a30d },
        { cx: x + 54, cy: y - 1, r: 12, foodColor: 0xca8a04, garnishColor: 0x22c55e }
      ];
      const platesToDraw = allPlates.slice(0, this.activeSnackPlates);

      platesToDraw.forEach((p) => {
        this.tableGfx.fillStyle(0xf8fafc, 0.95);
        this.tableGfx.fillCircle(p.cx, p.cy, p.r);
        this.tableGfx.lineStyle(1.5, 0xfef08a, 1);
        this.tableGfx.strokeCircle(p.cx, p.cy, p.r);

        this.tableGfx.fillStyle(p.foodColor, 1);
        this.tableGfx.fillCircle(p.cx, p.cy, p.r - 4);
        this.tableGfx.fillStyle(p.garnishColor, 1);
        this.tableGfx.fillCircle(p.cx - 2, p.cy - 1, 2);
        this.tableGfx.fillCircle(p.cx + 2, p.cy + 1, 1.8);
      });
    }
  }

  /**
   * Render 6 Beer Mug Positions aligned with the 6 Seats.
   */
  updateMugStates(seatList = []) {
    this.lastSeatList = Array.isArray(seatList) ? seatList : [];
    const { x, y } = this.tableZone;

    const mugEntries = SEAT_LAYOUTS.map((seatLayout) => {
      const seatEntry =
        this.lastSeatList.find((item) => item && item.seatId === seatLayout.seatId) || null;
      const status = (seatEntry && seatEntry.status) || SEAT_STATUS.EMPTY;
      const isCheering =
        status === SEAT_STATUS.SEATED && this.cheeringSeatIds.has(seatLayout.seatId);
      return { seatLayout, status, isCheering };
    });

    const mugSignature = mugEntries
      .map((item) => `${item.seatLayout.seatId}:${item.status}:${item.isCheering ? 1 : 0}`)
      .join('|');

    if (this._lastMugSignature === mugSignature) {
      this.skippedRedrawCount += 1;
      return;
    }

    this._lastMugSignature = mugSignature;
    this.redrawCount += 1;
    this.mugsGfx.clear();

    mugEntries.forEach(({ seatLayout, status, isCheering }) => {

      // Move mug slightly inward toward table center when cheering
      const cheerShiftX = isCheering ? -Math.sign(seatLayout.mugOffset.x) * 8 : 0;
      const cheerShiftY = isCheering ? -Math.sign(seatLayout.mugOffset.y) * 5 : 0;
      const mx = x + seatLayout.mugOffset.x + cheerShiftX;
      const my = y + seatLayout.mugOffset.y + cheerShiftY;

      this.mugStates.set(seatLayout.seatId, {
        seatId: seatLayout.seatId,
        x: mx,
        y: my,
        status,
        isCheering
      });

      if (status === SEAT_STATUS.EMPTY) {
        // Subtle coaster for empty seat
        this.mugsGfx.fillStyle(0x7f1d1d, 0.75);
        this.mugsGfx.fillCircle(mx, my, 4.5);
        return;
      }

      if (status === SEAT_STATUS.KO) {
        // Spilled / tipped mug on KO seat
        this.mugsGfx.fillStyle(0xfde047, 0.55);
        this.mugsGfx.fillCircle(mx + 4, my + 2, 5);
        this.mugsGfx.fillStyle(0xe2e8f0, 0.9);
        this.mugsGfx.fillRoundedRect(mx - 6, my - 3, 10, 7, 2);
        return;
      }

      // Upright frothy beer mug for SEATED / LEAVING
      this.mugsGfx.fillStyle(PALETTE.WARM_STREETLIGHT, 1);
      this.mugsGfx.fillRoundedRect(mx - 4.5, my - 5, 9, 10, 2);
      this.mugsGfx.fillStyle(0xffffff, 1);
      this.mugsGfx.fillRect(mx - 4.5, my - 6.5, 9, 3);
      this.mugsGfx.lineStyle(1, PALETTE.NIGHT_ASPHALT_DARK, 0.85);
      this.mugsGfx.strokeRoundedRect(mx - 4.5, my - 6.5, 9, 11.5, 2);

      if (isCheering) {
        // Clink golden sparkle above cheering mug
        this.mugsGfx.lineStyle(1.5, PALETTE.NEON_YELLOW, 0.95);
        this.mugsGfx.strokeCircle(mx, my - 9, 3);
      }
    });
  }
}
