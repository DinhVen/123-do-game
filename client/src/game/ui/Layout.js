/**
 * Layout, Readability & Static Preview Configuration for "1, 2, 3 DÔ!" (Master Plan v1.0)
 * Logical Resolution: 360 x 640 (9:16) — Reference Output: 1080 x 1920 (Scale 3x)
 */

export const RESOLUTION = Object.freeze({
  LOGICAL_WIDTH: 360,
  LOGICAL_HEIGHT: 640,
  ASPECT_RATIO: 9 / 16,
  REFERENCE_SCALE: 3,
  REFERENCE_WIDTH: 1080,
  REFERENCE_HEIGHT: 1920
});

/**
 * 9-Layer Z-Order Hierarchy (GAME_DESIGN.md Section 5.4)
 */
export const LAYERS = Object.freeze({
  BG_BASE: 0,
  BG_AMBIENT: 10,
  BACK_ROW_SEATS: 20,
  TABLE_AND_PROPS: 30,
  FRONT_ROW_SEATS: 40,
  ACTION_FX_LAYER: 50,
  PLAYER_WORLD_UI: 60,
  SCREEN_HUD: 70,
  EVENT_BANNER_AND_SYSTEM: 80
});

/**
 * Vietnamese Street-Night Palette (GAME_DESIGN.md Section 5.5)
 */
export const PALETTE = Object.freeze({
  NIGHT_ASPHALT_DARK: 0x181425,
  NIGHT_ASPHALT_MID: 0x262b44,
  SIDEWALK_TILE: 0x2d334a,
  SIDEWALK_CURB: 0x3b425e,
  WARM_STREETLIGHT: 0xfeae34,
  NEON_YELLOW: 0xfee761,
  PLASTIC_RED: 0xe43b44,
  PLASTIC_RED_DARK: 0x9e2835,
  PLASTIC_BLUE: 0x0099db,
  PLASTIC_BLUE_DARK: 0x124e89,
  GAUGE_BG: 0x090d16,
  GAUGE_BORDER: 0xcbd5e1,
  GAUGE_SOBER: 0x63c74d,
  GAUGE_TIPSY: 0xfeae34,
  GAUGE_DRUNK: 0xe43b44,
  GAUGE_KO: 0xb55088,
  UI_PANEL_BG: 0x1b1f33,
  UI_PANEL_BORDER: 0xfeae34,
  TEXT_WHITE: '#FFFFFF',
  TEXT_WARM: '#FEE761',
  TEXT_MUTED: '#CBD5E1',
  TEXT_VIP: '#FEAE34',
  TEXT_EMPTY: '#94A3B8',
  TEXT_SOBER: '#86EFAC',
  TEXT_TIPSY: '#FDE047',
  TEXT_DRUNK: '#FCA5A5',
  TEXT_KO: '#F0ABFC',
  TEXT_LEAVING: '#7DD3FC',
  TEXT_STROKE: '#181425'
});

/**
 * Distinct Shirt Colors for 6 Seats (seatId 1..6)
 */
export const SEAT_SHIRT_COLORS = Object.freeze({
  1: 0x3b82f6, // Blue
  2: 0x10b981, // Emerald
  3: 0xf59e0b, // Amber
  4: 0x8b5cf6, // Violet
  5: 0xec4899, // Pink
  6: 0x06b6d4  // Cyan
});

/**
 * Valid Seat Display Statuses (View Layer)
 */
export const SEAT_STATUS = Object.freeze({
  EMPTY: 'EMPTY',
  SEATED: 'SEATED',
  KO: 'KO',
  LEAVING: 'LEAVING'
});

/**
 * Non-overlapping Vertical Zones & Coordinates inside 360 x 640 Logical Space
 * Full-Frame 9:16 Overlay Layout (Header -> Banner -> Leaderboard -> Playfield -> Queue -> Guide)
 */
export const LAYOUT_ZONES = Object.freeze({
  SAFE_TOP: { x: 0, y: 0, width: 360, height: 14 },
  HEADER_BAR: { x: 8, y: 16, width: 344, height: 30 },
  EVENT_BANNER: { x: 8, y: 49, width: 344, height: 24 },
  LEADERBOARD_BAR: { x: 8, y: 76, width: 344, height: 24 },
  PLAYFIELD: { x: 0, y: 102, width: 360, height: 300 },
  TABLE_CENTER: { x: 180, y: 266, width: 248, height: 76 },
  QUEUE_PANEL: { x: 8, y: 404, width: 344, height: 58 },
  GUIDE_PANEL: { x: 8, y: 466, width: 344, height: 64 },
  SAFE_BOTTOM_CHAT: { x: 0, y: 534, width: 360, height: 106 }
});

/**
 * 6 Fixed Seat Positions around the Central Red Plastic Table
 * Back row (seatId 1..3): HUD above character (Y: 115..144), Character sits at Y: 174..222
 * Front row (seatId 4..6): Character sits at Y: 310..358, HUD below stool (Y: 372..399)
 * Central Table occupies Y: 228..304.
 */
export const SEAT_LAYOUTS = Object.freeze([
  {
    seatId: 1,
    seatIndex: 0,
    row: 'BACK',
    x: 64,
    stoolY: 224,
    charBottomY: 222,
    hudNameY: 115,
    gaugeY: 130,
    statusY: 144,
    mugOffset: { x: -84, y: -22 }
  },
  {
    seatId: 2,
    seatIndex: 1,
    row: 'BACK',
    x: 180,
    stoolY: 224,
    charBottomY: 222,
    hudNameY: 115,
    gaugeY: 130,
    statusY: 144,
    mugOffset: { x: 0, y: -22 }
  },
  {
    seatId: 3,
    seatIndex: 2,
    row: 'BACK',
    x: 296,
    stoolY: 224,
    charBottomY: 222,
    hudNameY: 115,
    gaugeY: 130,
    statusY: 144,
    mugOffset: { x: 84, y: -22 }
  },
  {
    seatId: 4,
    seatIndex: 3,
    row: 'FRONT',
    x: 64,
    stoolY: 360,
    charBottomY: 358,
    hudNameY: 372,
    gaugeY: 386,
    statusY: 399,
    mugOffset: { x: -84, y: 20 }
  },
  {
    seatId: 5,
    seatIndex: 4,
    row: 'FRONT',
    x: 180,
    stoolY: 360,
    charBottomY: 358,
    hudNameY: 372,
    gaugeY: 386,
    statusY: 399,
    mugOffset: { x: 0, y: 20 }
  },
  {
    seatId: 6,
    seatIndex: 5,
    row: 'FRONT',
    x: 296,
    stoolY: 360,
    charBottomY: 358,
    hudNameY: 372,
    gaugeY: 386,
    statusY: 399,
    mugOffset: { x: 84, y: 20 }
  }
]);

export const PLACEHOLDER_SIZES = Object.freeze({
  CHARACTER_WIDTH: 48,
  CHARACTER_HEIGHT: 48,
  HEAD_RADIUS: 13,
  TORSO_WIDTH: 34,
  TORSO_HEIGHT: 22,
  AVATAR_BOX: 20,
  STOOL_WIDTH: 40,
  STOOL_HEIGHT: 15,
  GAUGE_WIDTH: 68,
  GAUGE_HEIGHT: 9,
  HUD_MAX_WIDTH: 104,
  MAX_NICKNAME_LENGTH: 12,
  MAX_LEADERBOARD_NAME_LENGTH: 14
});

/**
 * ============================================================================
 * MASTER PLAN v2.0 — QUÁN NHẬU CHIBI 7 BÀN, 28 GHẾ (360 x 640 Logical Space)
 * ============================================================================
 */
export const V2_LAYOUT_ZONES = Object.freeze({
  TOP_HEADER: { x: 0, y: 12, width: 360, height: 86 },
  MENU_BOARD: { x: 6, y: 102, width: 108, height: 186 },
  HOST_COUNTER: { x: 118, y: 102, width: 236, height: 186 },
  DUAL_LEADERBOARD: { x: 122, y: 214, width: 228, height: 54 },
  WELCOME_STEP: { x: 118, y: 268, width: 236, height: 18 },
  TAVERN_FLOOR: { x: 0, y: 288, width: 360, height: 352 }
});

export const V2_WAYPOINTS = Object.freeze({
  COUNTER_SPAWN: { x: 224, y: 298 },
  CORRIDOR_TOP: { x: 180, y: 316 },
  CORRIDOR_MID: { x: 180, y: 416 },
  CORRIDOR_BOTTOM: { x: 180, y: 505 },
  EXIT_LEFT: { x: -24, y: 416 },
  EXIT_RIGHT: { x: 384, y: 416 }
});

export const V2_MENU_ITEMS = Object.freeze([
  {
    id: 'MENU_LAC_RANG',
    dishKey: 'LAC_RANG',
    name: 'LẠC RANG',
    coins: 1,
    priceLabel: '1 xu',
    soberDelta: -5,
    icon: '🥜',
    foodImg: '/assets/v2/food/food_lac_rang.png'
  },
  {
    id: 'MENU_NEM_CHUA',
    dishKey: 'NEM_CHUA',
    name: 'NEM CHUA',
    coins: 5,
    priceLabel: '5 xu',
    soberDelta: -8,
    icon: '🥓',
    foodImg: '/assets/v2/food/food_nem_chua.png'
  },
  {
    id: 'MENU_MUC_NUONG',
    dishKey: 'MUC_NUONG',
    name: 'MỰC NƯỚNG',
    coins: 10,
    priceLabel: '10 xu',
    soberDelta: -12,
    icon: '🦑',
    foodImg: '/assets/v2/food/food_muc_nuong.png'
  },
  {
    id: 'MENU_CHAN_GA',
    dishKey: 'CHAN_GA',
    name: 'CHÂN GÀ SẢ TẮC',
    coins: 20,
    priceLabel: '20 xu',
    soberDelta: -15,
    icon: '🍗',
    foodImg: '/assets/v2/food/food_chan_ga.png'
  },
  {
    id: 'MENU_CANH_GA',
    dishKey: 'CANH_GA',
    name: 'CÁNH GÀ CHIÊN',
    coins: 30,
    priceLabel: '30 xu',
    soberDelta: -20,
    icon: '🍖',
    foodImg: '/assets/v2/food/food_canh_ga.png'
  },
  {
    id: 'MENU_BO_NUONG',
    dishKey: 'BO_NUONG',
    name: 'BÒ NƯỚNG',
    coins: 99,
    priceLabel: '99 xu',
    soberDelta: -30,
    icon: '🥩',
    foodImg: '/assets/v2/food/food_bo_nuong.png'
  },
  {
    id: 'MENU_MOI_CA_QUAN',
    dishKey: 'MOI_CA_QUAN',
    name: 'MỜI CẢ QUÁN',
    subtitle: 'Mỗi bàn 1 bò nướng',
    coins: 199,
    priceLabel: '>100 xu',
    soberDelta: -25,
    icon: '🍲',
    foodImg: '/assets/v2/food/food_moi_ca_quan.png'
  }
]);

export const V2_TABLE_LAYOUTS = Object.freeze([
  {
    tableId: 'TABLE_1',
    label: 'BÀN 1',
    isVIP: false,
    row: 1,
    x: 106,
    y: 360,
    rx: 33,
    ry: 17,
    seatIds: [1, 2, 3, 4]
  },
  {
    tableId: 'TABLE_2',
    label: 'BÀN 2',
    isVIP: false,
    row: 1,
    x: 254,
    y: 360,
    rx: 33,
    ry: 17,
    seatIds: [5, 6, 7, 8]
  },
  {
    tableId: 'TABLE_3',
    label: 'BÀN 3',
    isVIP: false,
    row: 2,
    x: 82,
    y: 446,
    rx: 32,
    ry: 16.5,
    seatIds: [9, 10, 11, 12]
  },
  {
    tableId: 'TABLE_VIP',
    label: 'BÀN VIP',
    isVIP: true,
    row: 2,
    x: 180,
    y: 446,
    rx: 34,
    ry: 17.5,
    seatIds: [13, 14, 15, 16]
  },
  {
    tableId: 'TABLE_4',
    label: 'BÀN 4',
    isVIP: false,
    row: 2,
    x: 278,
    y: 446,
    rx: 32,
    ry: 16.5,
    seatIds: [17, 18, 19, 20]
  },
  {
    tableId: 'TABLE_5',
    label: 'BÀN 5',
    isVIP: false,
    row: 3,
    x: 106,
    y: 528,
    rx: 33,
    ry: 17,
    seatIds: [21, 22, 23, 24]
  },
  {
    tableId: 'TABLE_6',
    label: 'BÀN 6',
    isVIP: false,
    row: 3,
    x: 254,
    y: 528,
    rx: 33,
    ry: 17,
    seatIds: [25, 26, 27, 28]
  }
]);

/**
 * 28 Seats across 7 Round Tables (4 seats per table: TOP, LEFT, RIGHT, BOTTOM)
 */
const SEAT_OFFSETS_AROUND_TABLE = Object.freeze([
  { localSeatNo: 1, posKey: 'TOP', dx: 0, dy: -16, mugDx: 0, mugDy: -8 },
  { localSeatNo: 2, posKey: 'LEFT', dx: -29, dy: -1, mugDx: -15, mugDy: -2 },
  { localSeatNo: 3, posKey: 'RIGHT', dx: 29, dy: -1, mugDx: 15, mugDy: -2 },
  { localSeatNo: 4, posKey: 'BOTTOM', dx: 0, dy: 16, mugDx: 0, mugDy: 6 }
]);

export const V2_SEAT_LAYOUTS = Object.freeze(
  V2_TABLE_LAYOUTS.flatMap((tbl) =>
    SEAT_OFFSETS_AROUND_TABLE.map((offset, idx) => {
      const seatId = tbl.seatIds[idx];
      return Object.freeze({
        seatId,
        seatIndex: seatId - 1,
        tableId: tbl.tableId,
        tableLabel: tbl.label,
        isVIPTable: tbl.isVIP,
        localSeatNo: offset.localSeatNo,
        position: offset.posKey,
        x: Math.round(tbl.x + offset.dx),
        y: Math.round(tbl.y + offset.dy),
        tableX: tbl.x,
        tableY: tbl.y,
        mugX: Math.round(tbl.x + offset.mugDx),
        mugY: Math.round(tbl.y + offset.mugDy),
        shirtColor: SEAT_SHIRT_COLORS[((seatId - 1) % 6) + 1]
      });
    })
  )
);

const GRAPHEME_SEGMENTER =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('vi', { granularity: 'grapheme' })
    : null;

/**
 * Split a string into Unicode grapheme clusters (or code points fallback)
 * so emojis, ZWJ sequences, and Vietnamese diacritics are never sliced mid-character.
 */
export function splitGraphemes(text) {
  if (!text) return [];
  if (GRAPHEME_SEGMENTER) {
    return Array.from(GRAPHEME_SEGMENTER.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/**
 * Sanitize control characters, collapse repeated whitespace, and truncate safely
 * on Unicode grapheme boundaries without producing lone surrogates.
 */
export function truncateTextSafe(rawText, maxLength = PLACEHOLDER_SIZES.MAX_NICKNAME_LENGTH) {
  if (rawText === null || rawText === undefined) {
    return '';
  }
  // Remove control characters and lone surrogates, collapse whitespace
  const sanitized = String(rawText)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return '';
  }

  const limit = Math.max(2, Number(maxLength) || PLACEHOLDER_SIZES.MAX_NICKNAME_LENGTH);
  const graphemes = splitGraphemes(sanitized);
  if (graphemes.length <= limit) {
    return sanitized;
  }
  return `${graphemes.slice(0, limit - 1).join('').trimEnd()}…`;
}

/**
 * Pure Helper Functions for Nickname Truncation, Visual Tier & Drunk Bar Calculation
 */
export function formatNickname(rawNickname, maxLength = PLACEHOLDER_SIZES.MAX_NICKNAME_LENGTH) {
  return truncateTextSafe(rawNickname, maxLength);
}

export function clampDrunkLevel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function resolveVisualTier(drunkLevel, status = SEAT_STATUS.SEATED) {
  if (status === SEAT_STATUS.EMPTY) return 'EMPTY';
  if (status === SEAT_STATUS.LEAVING) return 'LEAVING';
  const clamped = clampDrunkLevel(drunkLevel);
  if (status === SEAT_STATUS.KO || clamped >= 100) return 'KO';
  if (clamped >= 70) return 'DRUNK';
  if (clamped >= 30) return 'TIPSY';
  return 'SOBER';
}

export function getDrunkGaugeColor(drunkLevel, status = SEAT_STATUS.SEATED) {
  if (status === SEAT_STATUS.EMPTY) return PALETTE.GAUGE_BG;
  const level = clampDrunkLevel(drunkLevel);
  if (status === SEAT_STATUS.KO || level >= 100) return PALETTE.GAUGE_KO;
  if (level >= 70) return PALETTE.GAUGE_DRUNK;
  if (level >= 30) return PALETTE.GAUGE_TIPSY;
  return PALETTE.GAUGE_SOBER;
}

export function computeDrunkBarSpec(drunkLevel, status = SEAT_STATUS.SEATED) {
  const gaugeW = PLACEHOLDER_SIZES.GAUGE_WIDTH;
  const gaugeH = PLACEHOLDER_SIZES.GAUGE_HEIGHT;
  const innerMaxW = gaugeW - 2;

  if (status === SEAT_STATUS.EMPTY) {
    return {
      drunkLevel: 0,
      ratio: 0,
      fillWidth: 0,
      maxInnerWidth: innerMaxW,
      fillColor: PALETTE.GAUGE_BG,
      visualTier: 'EMPTY',
      statusText: 'TRỐNG',
      statusColor: PALETTE.TEXT_EMPTY
    };
  }

  const clamped = status === SEAT_STATUS.KO ? 100 : clampDrunkLevel(drunkLevel);
  const ratio = clamped / 100;
  const fillWidth = Math.round(innerMaxW * ratio);
  const visualTier = resolveVisualTier(clamped, status);
  const fillColor = getDrunkGaugeColor(clamped, status);

  let statusText = `TỈNH • ${clamped}%`;
  let statusColor = PALETTE.TEXT_SOBER;

  if (status === SEAT_STATUS.KO || visualTier === 'KO') {
    statusText = 'GỤC (KO) • 100%';
    statusColor = PALETTE.TEXT_KO;
  } else if (status === SEAT_STATUS.LEAVING) {
    statusText = `VỢ BẮT • ${clamped}%`;
    statusColor = PALETTE.TEXT_LEAVING;
  } else if (visualTier === 'DRUNK') {
    statusText = `SAY MỀM • ${clamped}%`;
    statusColor = PALETTE.TEXT_DRUNK;
  } else if (visualTier === 'TIPSY') {
    statusText = `NGÀ NGÀ • ${clamped}%`;
    statusColor = PALETTE.TEXT_TIPSY;
  }

  return {
    drunkLevel: clamped,
    ratio,
    fillWidth,
    maxInnerWidth: innerMaxW,
    fillColor,
    visualTier,
    statusText,
    statusColor
  };
}

/**
 * Static Preview Data for Phase 2.2 (Covers EMPTY, SEATED, KO, LEAVING, Long Nicknames & Varied Drunk Levels)
 */
export const PREVIEW_UI_DATA = Object.freeze({
  header: {
    gameTitle: '1, 2, 3 DÔ!',
    liveBadge: 'LIVE',
    likeSummary: '♥ 1,250 (50/100)',
    giftSummary: '🎁 18'
  },
  eventBanner: {
    text: '🍻 Bàn nhậu đêm: Ghế 5 vừa gục (KO), Ghế 6 bị Vợ bắt về!'
  },
  leaderboardPreview: [
    { rank: 1, nickname: 'Anh Tư Sài Gòn', tag: 'Chiến Thần' },
    { rank: 2, nickname: 'Chị Bảy Miền Tây', tag: 'Đô Bất Tử' },
    { rank: 3, nickname: 'Chú Tám Xóm Chợ', tag: 'Bợm Nhậu' }
  ],
  seats: [
    {
      seatId: 1,
      status: SEAT_STATUS.SEATED,
      nickname: 'Anh Tư Sài Gòn Quận 4', // Long nickname (21 chars -> truncated to 12 chars)
      drunkLevel: 20,
      shirtColor: SEAT_SHIRT_COLORS[1]
    },
    {
      seatId: 2,
      status: SEAT_STATUS.SEATED,
      nickname: 'Chị Bảy',
      drunkLevel: 55,
      shirtColor: SEAT_SHIRT_COLORS[2]
    },
    {
      seatId: 3,
      status: SEAT_STATUS.EMPTY,
      nickname: null,
      drunkLevel: 0,
      shirtColor: SEAT_SHIRT_COLORS[3]
    },
    {
      seatId: 4,
      status: SEAT_STATUS.SEATED,
      nickname: 'Hoàng Tử Bia Hơi Vỉa Hè', // Long nickname (23 chars -> truncated to 12 chars)
      drunkLevel: 85,
      shirtColor: SEAT_SHIRT_COLORS[4]
    },
    {
      seatId: 5,
      status: SEAT_STATUS.KO,
      nickname: 'Chú Tám Đô Bất Tử',
      drunkLevel: 100,
      shirtColor: SEAT_SHIRT_COLORS[5]
    },
    {
      seatId: 6,
      status: SEAT_STATUS.LEAVING,
      nickname: 'Anh Ba Sợ Vợ',
      drunkLevel: 65,
      shirtColor: SEAT_SHIRT_COLORS[6]
    }
  ],
  waitingQueue: {
    totalWaiting: 5,
    maxSize: 30,
    vipQueue: ['Đại Gia Tuấn', 'Minh Râu VIP'],
    normalQueue: ['Hùng Q4', 'Bé Ba', 'Tèo Em']
  },
  interactionGuide: [
    '💬 Gõ "nhậu" / "dô" vào ghế • Gõ số 1..6 chọn mục tiêu',
    '🌹 Hoa hồng (1xu): +Mồi -5% say • 🍦 Kem/Tim (5xu): Ép +20% say',
    '👑 VIP (10xu): Vé VIP -25% • 🍩 Donut: Bao bàn • 🦢 Hạc: Gọi Vợ'
  ]
});

export const PREVIEW_PRESETS = Object.freeze({
  MIXED_DEMO: PREVIEW_UI_DATA.seats,
  FULL_TABLE: [
    { seatId: 1, status: SEAT_STATUS.SEATED, nickname: 'Người chơi A', drunkLevel: 10 },
    { seatId: 2, status: SEAT_STATUS.SEATED, nickname: 'Người chơi B', drunkLevel: 35 },
    { seatId: 3, status: SEAT_STATUS.SEATED, nickname: 'Người chơi C', drunkLevel: 60 },
    { seatId: 4, status: SEAT_STATUS.SEATED, nickname: 'Người chơi D', drunkLevel: 75 },
    { seatId: 5, status: SEAT_STATUS.SEATED, nickname: 'Người chơi E', drunkLevel: 40 },
    { seatId: 6, status: SEAT_STATUS.SEATED, nickname: 'Người chơi F', drunkLevel: 90 }
  ],
  EMPTY_TABLE: [
    { seatId: 1, status: SEAT_STATUS.EMPTY, nickname: null, drunkLevel: 0 },
    { seatId: 2, status: SEAT_STATUS.EMPTY, nickname: null, drunkLevel: 0 },
    { seatId: 3, status: SEAT_STATUS.EMPTY, nickname: null, drunkLevel: 0 },
    { seatId: 4, status: SEAT_STATUS.EMPTY, nickname: null, drunkLevel: 0 },
    { seatId: 5, status: SEAT_STATUS.EMPTY, nickname: null, drunkLevel: 0 },
    { seatId: 6, status: SEAT_STATUS.EMPTY, nickname: null, drunkLevel: 0 }
  ]
});

/**
 * Determine whether Dev-Only UI Preview Mode is explicitly requested.
 * Default is false (Backend-connected Live Mode).
 * Production builds NEVER enable Preview Mode.
 */
export function isDevPreviewModeRequested() {
  try {
    const isProd =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      Boolean(import.meta.env.PROD);
    if (isProd) {
      return false;
    }

    const isDev =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      Boolean(import.meta.env.DEV);
    if (!isDev) {
      return false;
    }

    if (
      import.meta.env.VITE_PREVIEW_MODE === 'true' ||
      import.meta.env.VITE_PREVIEW_MODE === '1'
    ) {
      return true;
    }

    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      return params.get('preview') === '1' || params.get('preview') === 'true';
    }
  } catch (_) {
    return false;
  }
  return false;
}

