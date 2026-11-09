/**
 * TavernV2Overlay.js — Full AI Chibi 2D & Realistic Props Tavern Renderer (Master Plan v2.0)
 * Features:
 * - 8 AI Chibi Character Sprites (4 Male, 4 Female) with Sit, Walk, Cheer, and Drunk/KO poses
 * - Animated Chibi Waiter ("Nhân viên chạy bàn") carrying food plates from the Counter to Tables on Gift
 * - 7 Realistic Vietnamese Tavern Food Plates on the Wooden Menu Board & Tabletops
 * - Realistic Stainless-Steel Boong Bia Mát, Heart Beer Jar, Chibi Host, and Tables/Stools
 * - Dual Corner Bass Speakers with Rhythmic Music Thumping, Soundwave Rings & Floating Musical Notes
 * - Extra-large, high-contrast typography for crisp readability on TikTok LIVE Studio
 */

import {
  RESOLUTION,
  SEAT_STATUS,
  V2_TABLE_LAYOUTS,
  V2_SEAT_LAYOUTS,
  V2_MENU_ITEMS,
  V2_WAYPOINTS,
  formatNickname,
  truncateTextSafe
} from '../ui/Layout.js';
import {
  resolveChibiAppearance,
  computeChibiWaypoints,
  interpolateWaypoints
} from '../fx/PathWalker.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FOOD_IMAGE_BY_KEY = Object.freeze({
  LAC_RANG: '/assets/v2/food/food_lac_rang.png',
  MENU_LAC_RANG: '/assets/v2/food/food_lac_rang.png',
  NEM_CHUA: '/assets/v2/food/food_nem_chua.png',
  MENU_NEM_CHUA: '/assets/v2/food/food_nem_chua.png',
  MUC_NUONG: '/assets/v2/food/food_muc_nuong.png',
  MENU_MUC_NUONG: '/assets/v2/food/food_muc_nuong.png',
  CHAN_GA: '/assets/v2/food/food_chan_ga.png',
  MENU_CHAN_GA: '/assets/v2/food/food_chan_ga.png',
  CANH_GA: '/assets/v2/food/food_canh_ga.png',
  MENU_CANH_GA: '/assets/v2/food/food_canh_ga.png',
  BO_NUONG: '/assets/v2/food/food_bo_nuong.png',
  MENU_BO_NUONG: '/assets/v2/food/food_bo_nuong.png',
  MOI_CA_QUAN: '/assets/v2/food/food_moi_ca_quan.png',
  MENU_MOI_CA_QUAN: '/assets/v2/food/food_moi_ca_quan.png'
});

export function resolveFoodImageUrl(fxOrDishKey) {
  if (!fxOrDishKey) return '/assets/v2/food/food_bo_nuong.png';
  if (typeof fxOrDishKey === 'string') {
    return FOOD_IMAGE_BY_KEY[fxOrDishKey] || '/assets/v2/food/food_bo_nuong.png';
  }
  const key = fxOrDishKey.dishKey || fxOrDishKey.mockGiftKey || fxOrDishKey.snackKey || '';
  if (FOOD_IMAGE_BY_KEY[key]) return FOOD_IMAGE_BY_KEY[key];
  const name = String(fxOrDishKey.snackName || '').toUpperCase();
  if (name.includes('LẠC')) return FOOD_IMAGE_BY_KEY.LAC_RANG;
  if (name.includes('NEM')) return FOOD_IMAGE_BY_KEY.NEM_CHUA;
  if (name.includes('MỰC')) return FOOD_IMAGE_BY_KEY.MUC_NUONG;
  if (name.includes('CHÂN GÀ')) return FOOD_IMAGE_BY_KEY.CHAN_GA;
  if (name.includes('CÁNH GÀ')) return FOOD_IMAGE_BY_KEY.CANH_GA;
  if (name.includes('CẢ QUÁN')) return FOOD_IMAGE_BY_KEY.MOI_CA_QUAN;
  return FOOD_IMAGE_BY_KEY.BO_NUONG;
}

/**
 * Build Chibi Character visual markup using the 8 AI-generated Chibi character sprite sets
 * (`char_1` .. `char_8` with `_sit.png`, `_walk.png`, `_cheer.png`, `_ko.png`).
 */
export function buildChibiSvg(seatState, options = {}) {
  const appearance = resolveChibiAppearance(seatState, seatState?.seatId || 1);
  const charIndex = (Math.abs(Number(appearance.seed) || 0) % 8) + 1;
  const status = seatState?.status || SEAT_STATUS.SEATED;
  const drunkLevel = Number(seatState?.drunkLevel) || 0;
  const isWalking = Boolean(options.isWalking);
  const isCheering = Boolean(options.isCheering);
  const isKO = status === SEAT_STATUS.KO || drunkLevel >= 100;

  let poseSuffix = 'sit';
  if (isWalking) {
    poseSuffix = 'walk';
  } else if (isKO) {
    poseSuffix = 'ko';
  } else if (isCheering) {
    poseSuffix = 'cheer';
  }

  const spriteUrl = `/assets/v2/chars/char_${charIndex}_${poseSuffix}.png`;
  const vipCrown = seatState?.isVIP ? `<span class="v2-vip-crown-badge">👑</span>` : '';

  return `
    <div class="v2-chibi-svg ${isKO ? 'is-ko' : ''} ${isCheering ? 'is-cheering' : ''} ${isWalking ? 'is-walking' : ''}">
      ${vipCrown}
      <img src="${spriteUrl}" class="v2-chibi-sprite-img" alt="" draggable="false" />
      <svg viewBox="0 0 1 1" style="display:none;"></svg>
    </div>
  `;
}

function buildDefaultHostHtml() {
  return `<img src="/assets/v2/props/host_bartender.png" class="v2-default-host-svg" alt="Chủ Quán" draggable="false" />`;
}

export class TavernV2Overlay {
  constructor(scene, container) {
    this.scene = scene;
    this.container = container;
    this.root = null;
    this.refs = {
      titleText: null,
      menuSeatInfo: null,
      hostAvatarBox: null,
      likeCounterText: null,
      likeFillBar: null,
      topDrinkersList: null,
      topEatersList: null,
      tablesDom: new Map(),
      seatsDom: new Map(),
      walkersLayer: null,
      calloutsLayer: null,
      bannerToast: null
    };

    this.lastSeatMap = new Map();
    this.activeWalkers = new Map();
    this.activeWaiters = new Map();
    this._waiterSeq = 0;
    this.cheeringSeats = new Map();
    this.tableSnacks = new Map();
    this._rafId = null;
    this._bannerTimeout = null;
  }

  mount() {
    if (!this.container || typeof document === 'undefined') return;

    const existing = document.getElementById('crisp-hud-root');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    this.injectStylesOnce();

    const root = document.createElement('div');
    root.id = 'crisp-hud-root';
    root.className = 'v2-tavern-root';

    const pctX = (val) => `${((val / RESOLUTION.LOGICAL_WIDTH) * 100).toFixed(4)}%`;
    const pctY = (val) => `${((val / RESOLUTION.LOGICAL_HEIGHT) * 100).toFixed(4)}%`;

    root.innerHTML = `
      <!-- 1. BACKGROUND SKYLINE, BRIDGE, WARM STRING LIGHTS & TERRACOTTA TAVERN FLOOR -->
      <div class="v2-bg-sky">
        <div class="v2-sky-city"></div>
        <div class="v2-sky-bridge"></div>
        <div class="v2-string-lights">
          <span class="bulb"></span><span class="bulb"></span><span class="bulb"></span>
          <span class="bulb"></span><span class="bulb"></span><span class="bulb"></span>
          <span class="bulb"></span><span class="bulb"></span><span class="bulb"></span>
        </div>
        <div class="v2-bush-left"></div>
        <div class="v2-bush-right"></div>
      </div>

      <div class="v2-tavern-floor">
        <div class="v2-floor-grid"></div>
        <!-- Bottom Corner Speakers with Music Pulse & Floating Notes -->
        <div class="v2-speaker-wrap v2-speaker-left">
          <div class="v2-sound-wave wave-1"></div>
          <div class="v2-sound-wave wave-2"></div>
          <span class="v2-music-note note-1">♪</span>
          <span class="v2-music-note note-2">♫</span>
          <span class="v2-music-note note-3">♬</span>
          <img src="/assets/v2/props/loa_thung.png" class="v2-speaker-img" alt="Loa" />
        </div>
        <div class="v2-speaker-wrap v2-speaker-right">
          <div class="v2-sound-wave wave-1"></div>
          <div class="v2-sound-wave wave-2"></div>
          <span class="v2-music-note note-1">♫</span>
          <span class="v2-music-note note-2">♪</span>
          <span class="v2-music-note note-3">♬</span>
          <img src="/assets/v2/props/loa_thung.png" class="v2-speaker-img is-flipped" alt="Loa" />
        </div>
      </div>

      <!-- 2. TOP HEADER: TITLE + LARGE CRISP COMMAND GUIDE (NO LIVE TICKER PILL) -->
      <div class="v2-top-header">
        <div class="v2-main-title" id="v2-main-title">QUÁN NHẬU GIÁ SV</div>
        <div class="v2-cmd-guide">
          <div>CMT <span class="hl">"BIA"</span> ĐỂ THƯỞNG THỨC BIA</div>
          <div>CMT <span class="hl">"DZO"</span> ĐỂ NÂNG LY</div>
          <div>ĐỔI BÀN CMT <span class="hl">"BAN 1–6 hoặc VIP"</span></div>
        </div>
      </div>

      <!-- 3. LEFT WOODEN MENU BOARD (THỰC ĐƠN 7 MÓN THẬT) -->
      <div class="v2-menu-board">
        <div class="v2-menu-inner">
          <div class="v2-menu-title">THỰC ĐƠN</div>
          <div class="v2-menu-sub" id="v2-menu-seat-info">Còn 28 ghế • 0 chờ bàn</div>
          <div class="v2-menu-divider"></div>
          <div class="v2-menu-list">
            ${V2_MENU_ITEMS.map(
              (item) => `
              <div class="v2-menu-row" data-menu-id="${item.id}">
                <img src="${item.foodImg}" class="v2-menu-food-img" alt="${escapeHtml(item.name)}" />
                <div class="v2-dish-name-wrap">
                  <div class="v2-dish-name">${item.name}</div>
                  ${item.subtitle ? `<div class="v2-dish-sub">${item.subtitle}</div>` : ''}
                </div>
                <span class="v2-dish-price">${item.priceLabel}</span>
              </div>
            `
            ).join('')}
          </div>
        </div>
        <div class="v2-easel-leg leg-l"></div>
        <div class="v2-easel-leg leg-r"></div>
      </div>

      <!-- 4. RIGHT HOST COUNTER BOOTH + REALISTIC BOONG BIA + DUAL LEADERBOARDS -->
      <div class="v2-host-booth">
        <div class="v2-booth-roof"></div>
        <div class="v2-booth-backwall">
          <div class="v2-pillar pillar-l"></div>
          <div class="v2-pillar pillar-r"></div>
          <div class="v2-hanging-lamp lamp-1"></div>
          <div class="v2-hanging-lamp lamp-2"></div>

          <!-- Host Character (Chibi Bartender Default or Custom Uploaded PNG) -->
          <div class="v2-host-figure" id="v2-host-avatar-box">
            ${buildDefaultHostHtml()}
          </div>

          <!-- Left Prop: Realistic Boong Bia Mát & Bottles -->
          <div class="v2-prop-keg-wrap">
            <img src="/assets/v2/props/boong_bia.png" class="v2-boong-bia-img" alt="Boong Bia Mát" />
            <span class="v2-boong-badge">BIA MÁT</span>
          </div>
          <img src="/assets/v2/props/chai_bia.png" class="v2-chai-bia-img" alt="Chai bia" />

          <!-- Right Prop: Realistic Heart Beer Dispenser & Like Counter -->
          <div class="v2-prop-like-jar">
            <img src="/assets/v2/props/binh_bia_tim.png" class="v2-binh-tim-img" alt="Bình Tim" />
            <div class="like-jar-label" id="v2-like-counter">0 / 100 ♥</div>
          </div>
        </div>

        <!-- Marble Counter Top -->
        <div class="v2-counter-top"></div>

        <!-- Counter Front: Dual Leaderboards (THẦN CỒN & THẦN DIỆT MỒI) -->
        <div class="v2-counter-front">
          <div class="v2-lb-box">
            <div class="v2-lb-title">THẦN CỒN</div>
            <div class="v2-lb-rows" id="v2-lb-drinkers"></div>
          </div>
          <div class="v2-lb-box">
            <div class="v2-lb-title">THẦN DIỆT MỒI</div>
            <div class="v2-lb-rows" id="v2-lb-eaters"></div>
          </div>
        </div>

        <!-- Welcome Step Mat -->
        <div class="v2-welcome-mat">
          CMT <span class="v2-vao-key">VAO</span> ĐỂ GHÉ QUÁN
        </div>
      </div>

      <!-- 5. TABLES & SEATS PLAYFIELD LAYER -->
      <div class="v2-playfield-layer" id="v2-playfield-layer"></div>

      <!-- 6. ACTIVE CHIBI WALKERS & WAITER RUNNERS LAYER -->
      <div class="v2-walkers-layer" id="v2-walkers-layer"></div>

      <!-- 7. FLOATING CALLOUTS & CHAT BUBBLES LAYER -->
      <div class="v2-callouts-layer" id="v2-callouts-layer"></div>

      <!-- 8. TOP ACTION TOAST BANNER -->
      <div class="v2-action-toast" id="v2-action-toast"></div>
    `;

    this.container.appendChild(root);
    this.root = root;

    this.refs.titleText = root.querySelector('#v2-main-title');
    this.refs.menuSeatInfo = root.querySelector('#v2-menu-seat-info');
    this.refs.hostAvatarBox = root.querySelector('#v2-host-avatar-box');
    this.refs.likeCounterText = root.querySelector('#v2-like-counter');
    this.refs.topDrinkersList = root.querySelector('#v2-lb-drinkers');
    this.refs.topEatersList = root.querySelector('#v2-lb-eaters');
    this.refs.playfieldLayer = root.querySelector('#v2-playfield-layer');
    this.refs.walkersLayer = root.querySelector('#v2-walkers-layer');
    this.refs.calloutsLayer = root.querySelector('#v2-callouts-layer');
    this.refs.bannerToast = root.querySelector('#v2-action-toast');

    this._buildTablesAndSeatsDom(pctX, pctY);
    this.renderDualLeaderboards({ topDrinkers: [], topEaters: [] });
    this._startAnimationLoop();
  }

  _buildTablesAndSeatsDom(pctX, pctY) {
    const playfield = this.refs.playfieldLayer;
    if (!playfield) return;

    // Create 7 Round Tables + Stools using AI 2.5D PNG assets
    V2_TABLE_LAYOUTS.forEach((tbl) => {
      const tableWrap = document.createElement('div');
      tableWrap.className = `v2-table-wrap ${tbl.isVIP ? 'is-vip-table' : ''}`;
      tableWrap.style.left = pctX(tbl.x);
      tableWrap.style.top = pctY(tbl.y);
      tableWrap.style.zIndex = String(Math.round(tbl.y));

      const stoolSrc = tbl.isVIP
        ? '/assets/v2/props/stool_vip.png'
        : '/assets/v2/props/stool_normal.png';
      const tableSrc = tbl.isVIP
        ? '/assets/v2/props/table_vip.png'
        : '/assets/v2/props/table_normal.png';

      tableWrap.innerHTML = `
        <img src="${stoolSrc}" class="v2-stool-img stool-top" data-stool-seat="${tbl.seatIds[0]}" alt="" />
        <img src="${stoolSrc}" class="v2-stool-img stool-left" data-stool-seat="${tbl.seatIds[1]}" alt="" />
        <img src="${stoolSrc}" class="v2-stool-img stool-right" data-stool-seat="${tbl.seatIds[2]}" alt="" />
        <img src="${stoolSrc}" class="v2-stool-img stool-bottom" data-stool-seat="${tbl.seatIds[3]}" alt="" />
        <div class="v2-table-surface-img-wrap">
          <img src="${tableSrc}" class="v2-table-img" alt="${tbl.label}" />
          <div class="v2-table-props" id="v2-tprops-${tbl.tableId}"></div>
        </div>
        <div class="v2-table-badge" id="v2-tbadge-${tbl.tableId}">${tbl.label} • 0/4</div>
      `;

      playfield.appendChild(tableWrap);
      this.refs.tablesDom.set(tbl.tableId, {
        wrap: tableWrap,
        propsEl: tableWrap.querySelector(`#v2-tprops-${tbl.tableId}`),
        badgeEl: tableWrap.querySelector(`#v2-tbadge-${tbl.tableId}`),
        layout: tbl
      });
    });

    // Create 28 Seat Character Slots (with integrated centered stool underneath each seated character)
    V2_SEAT_LAYOUTS.forEach((seatLayout) => {
      const seatEl = document.createElement('div');
      seatEl.className = `v2-seat-slot pos-${seatLayout.position.toLowerCase()} is-empty`;
      seatEl.style.left = pctX(seatLayout.x);
      seatEl.style.top = pctY(seatLayout.y);
      const depthOffset =
        seatLayout.position === 'TOP' ? 2 : seatLayout.position === 'BOTTOM' ? 12 : 6;
      seatEl.style.zIndex = String(Math.round(seatLayout.tableY + depthOffset));

      const seatStoolSrc = seatLayout.isVIPTable
        ? '/assets/v2/props/stool_vip.png'
        : '/assets/v2/props/stool_normal.png';

      seatEl.innerHTML = `
        <div class="v2-seat-name-pill"></div>
        <div class="v2-seat-avatar-box"></div>
        <div class="v2-seat-sub-badge"></div>
        <img src="${seatStoolSrc}" class="v2-seat-stool-under" alt="" />
      `;

      const emptyStoolEl = playfield.querySelector(`[data-stool-seat="${seatLayout.seatId}"]`);

      playfield.appendChild(seatEl);
      this.refs.seatsDom.set(seatLayout.seatId, {
        root: seatEl,
        nameEl: seatEl.querySelector('.v2-seat-name-pill'),
        avatarEl: seatEl.querySelector('.v2-seat-avatar-box'),
        subBadgeEl: seatEl.querySelector('.v2-seat-sub-badge'),
        emptyStoolEl,
        layout: seatLayout,
        lastSignature: ''
      });
    });
  }

  syncState(viewData, syncSource = 'SNAPSHOT') {
    if (!viewData || !this.root) return;

    const seats = Array.isArray(viewData.seats) ? viewData.seats : [];
    const now = performance.now();

    // Update Host Config (Title & Custom Host PNG Avatar)
    if (viewData.hostConfig) {
      if (viewData.hostConfig.title && this.refs.titleText) {
        this.refs.titleText.textContent = viewData.hostConfig.title;
      }
      const avatarUrl = (viewData.hostConfig.avatarUrl || '').trim();
      if (this.refs.hostAvatarBox) {
        const currentUrl = this.refs.hostAvatarBox.getAttribute('data-avatar-url') || '';
        if (currentUrl !== avatarUrl) {
          this.refs.hostAvatarBox.setAttribute('data-avatar-url', avatarUrl);
          if (avatarUrl) {
            this.refs.hostAvatarBox.innerHTML = `<img src="${escapeHtml(avatarUrl)}" class="v2-custom-host-img" alt="Host" />`;
          } else {
            this.refs.hostAvatarBox.innerHTML = buildDefaultHostHtml();
          }
        }
      }
    }

    // Detect newly seated or moved players to trigger smooth, unhurried Chibi Walking animations
    if (syncSource !== 'SNAPSHOT') {
      seats.forEach((seat) => {
        if (!seat || seat.status === SEAT_STATUS.EMPTY || !seat.userId) return;
        const prev = this.lastSeatMap.get(seat.seatId);
        const isNewlyOccupied = !prev || prev.userId !== seat.userId;
        if (isNewlyOccupied) {
          const fromSeatId = Number(seat.moveFromSeatId) || 0;
          const waypoints =
            fromSeatId > 0 && fromSeatId !== seat.seatId
              ? computeChibiWaypoints('WALK_SWITCH', fromSeatId, seat.seatId)
              : computeChibiWaypoints('WALK_IN', null, seat.seatId);

          let pathDist = 0;
          for (let i = 0; i < waypoints.length - 1; i++) {
            pathDist += Math.hypot(
              waypoints[i + 1].x - waypoints[i].x,
              waypoints[i + 1].y - waypoints[i].y
            );
          }
          // Gentle, unhurried walking speed (~48 logical px/sec -> 2.8s to 4.2s)
          const walkDurationMs = Math.max(2800, Math.min(4200, Math.round((pathDist / 48) * 1000)));
          this._spawnWalker(seat.seatId, seat, waypoints, walkDurationMs, now);
        }
      });
    } else {
      this.activeWalkers.clear();
      this.activeWaiters.clear();
      if (this.refs.walkersLayer) {
        this.refs.walkersLayer.innerHTML = '';
      }
    }

    // Save current occupant map & update 28 Seat Slots
    this.lastSeatMap.clear();
    let occupiedTotal = 0;
    const tableCounts = new Map();

    seats.forEach((seat) => {
      if (!seat) return;
      const isOccupied = seat.status && seat.status !== SEAT_STATUS.EMPTY && Boolean(seat.userId);
      if (isOccupied) {
        occupiedTotal += 1;
        this.lastSeatMap.set(seat.seatId, { ...seat });
        const tId = seat.tableId || this.refs.seatsDom.get(seat.seatId)?.layout?.tableId;
        if (tId) {
          tableCounts.set(tId, (tableCounts.get(tId) || 0) + 1);
        }
      }

      const domSeat = this.refs.seatsDom.get(seat.seatId);
      if (!domSeat) return;

      const walkerActive = this.activeWalkers.has(seat.seatId);
      const isCheering = (this.cheeringSeats.get(seat.seatId) || 0) > now;

      if (domSeat.emptyStoolEl) {
        domSeat.emptyStoolEl.classList.toggle('is-seat-occupied', Boolean(isOccupied && !walkerActive));
      }

      if (!isOccupied) {
        if (domSeat.lastSignature !== 'EMPTY') {
          domSeat.lastSignature = 'EMPTY';
          domSeat.root.className = `v2-seat-slot pos-${domSeat.layout.position.toLowerCase()} is-empty`;
          domSeat.nameEl.textContent = '';
          domSeat.avatarEl.innerHTML = '';
          domSeat.subBadgeEl.textContent = '';
        }
        return;
      }

      const sig = `${seat.userId}|${seat.status}|${seat.drunkLevel}|${seat.beerCount || 0}|${seat.isVIP ? 1 : 0}|${walkerActive ? 1 : 0}|${isCheering ? 1 : 0}`;
      if (domSeat.lastSignature !== sig) {
        domSeat.lastSignature = sig;
        domSeat.root.className = `v2-seat-slot pos-${domSeat.layout.position.toLowerCase()} is-occupied status-${seat.status.toLowerCase()} ${walkerActive ? 'is-walking-hidden' : ''}`;
        const nick = formatNickname(seat.nickname || seat.userId, 11);
        domSeat.nameEl.textContent = seat.isVIP ? `👑 ${nick}` : nick;
        domSeat.avatarEl.innerHTML = buildChibiSvg(seat, { isCheering });

        if (seat.status === SEAT_STATUS.KO) {
          domSeat.subBadgeEl.textContent = 'KO 100%';
          domSeat.subBadgeEl.className = 'v2-seat-sub-badge badge-ko';
        } else if (seat.status === SEAT_STATUS.LEAVING) {
          domSeat.subBadgeEl.textContent = 'VỢ BẮT';
          domSeat.subBadgeEl.className = 'v2-seat-sub-badge badge-leave';
        } else {
          const beers = Number(seat.beerCount) || 0;
          domSeat.subBadgeEl.textContent = beers > 0 ? `🍺 ${beers}` : `${seat.drunkLevel}%`;
          domSeat.subBadgeEl.className = 'v2-seat-sub-badge';
        }
      }
    });

    // Update 7 Tables (Occupancy Badges + Tabletop Mugs & Ordered Snacks)
    this.refs.tablesDom.forEach((tblRef, tableId) => {
      const count = tableCounts.get(tableId) || 0;
      const label = `${tblRef.layout.label} • ${count}/4`;
      if (tblRef.badgeEl.textContent !== label) {
        tblRef.badgeEl.textContent = label;
      }
      this._renderTabletopProps(tableId, count);
    });

    // Update Menu Board Seat & Queue Counter
    const freeSeats = Math.max(0, 28 - occupiedTotal);
    const waitingCount = Number(viewData.waitingQueue?.totalWaiting) || 0;
    if (this.refs.menuSeatInfo) {
      this.refs.menuSeatInfo.textContent = `Còn ${freeSeats} ghế • ${waitingCount} chờ bàn`;
    }

    // Update Like Jar Counter
    if (viewData.likeMetrics && this.refs.likeCounterText) {
      const unconsumed = Number(viewData.likeMetrics.unconsumedLikes) || 0;
      const step = Number(viewData.likeMetrics.milestoneStep) || 100;
      this.refs.likeCounterText.textContent = `${unconsumed} / ${step} ♥`;
    }

    // Update Dual Leaderboards (THẦN CỒN & THẦN DIỆT MỒI)
    if (viewData.leaderboards) {
      this.renderDualLeaderboards(viewData.leaderboards);
    }
  }

  renderDualLeaderboards(leaderboards = {}) {
    const topDrinkers = Array.isArray(leaderboards.topDrinkers) ? leaderboards.topDrinkers : [];
    const topEaters = Array.isArray(leaderboards.topEaters) ? leaderboards.topEaters : [];

    const renderList = (items, unitLabel) => {
      const rows = [];
      for (let i = 0; i < 3; i++) {
        const entry = items[i];
        const rank = i + 1;
        if (entry) {
          const nick = escapeHtml(formatNickname(entry.nickname || entry.userId, 11));
          const count =
            unitLabel === 'ly' ? Number(entry.beerCount) || 0 : Number(entry.snackCount) || 0;
          rows.push(`
            <div class="v2-lb-row rank-${rank}">
              <span class="lb-rank">${rank}</span>
              <span class="lb-name">${nick}</span>
              <span class="lb-score"><b>${count}</b> ${unitLabel}</span>
            </div>
          `);
        } else {
          rows.push(`
            <div class="v2-lb-row rank-${rank} is-empty">
              <span class="lb-rank">${rank}</span>
              <span class="lb-name">Chưa có khách</span>
              <span class="lb-score">0 ${unitLabel}</span>
            </div>
          `);
        }
      }
      return rows.join('');
    };

    if (this.refs.topDrinkersList) {
      this.refs.topDrinkersList.innerHTML = renderList(topDrinkers, 'ly');
    }
    if (this.refs.topEatersList) {
      this.refs.topEatersList.innerHTML = renderList(topEaters, 'món');
    }
  }

  _renderTabletopProps(tableId, occupiedCount) {
    const tblRef = this.refs.tablesDom.get(tableId);
    if (!tblRef || !tblRef.propsEl) return;

    const snacks = this.tableSnacks.get(tableId) || [];
    const mugsHtml = [];
    const mugCoords = [
      { left: '50%', top: '24%' },
      { left: '26%', top: '48%' },
      { left: '74%', top: '48%' },
      { left: '50%', top: '72%' }
    ];
    for (let i = 0; i < Math.min(4, occupiedCount); i++) {
      mugsHtml.push(
        `<img src="/assets/v2/props/prop_beer_mug.png" class="v2-table-mug-img" style="left:${mugCoords[i].left};top:${mugCoords[i].top};" alt="" />`
      );
    }

    const snackImages = snacks.slice(-3).map((foodImgUrl, idx) => {
      const offsets = [
        { left: '50%', top: '48%' },
        { left: '38%', top: '44%' },
        { left: '62%', top: '44%' }
      ];
      const pos = offsets[idx % offsets.length];
      return `<img src="${foodImgUrl}" class="v2-table-dish-img" style="left:${pos.left};top:${pos.top};" alt="" />`;
    });

    const html = mugsHtml.concat(snackImages).join('');
    if (tblRef.propsEl.innerHTML !== html) {
      tblRef.propsEl.innerHTML = html;
    }
  }

  handleActionFx(fx, bannerSummary = '') {
    if (!fx || !this.root) return;
    const now = performance.now();
    const type = fx.actionType || fx.actionCategory || 'EVENT';

    if (bannerSummary) {
      this.showBannerToast(bannerSummary);
    }

    if (type === 'CHEERS' || type === 'TABLE_CHEERS' || type === 'DRINK_ALL') {
      const affected = Array.isArray(fx.affectedSeats) ? fx.affectedSeats : [];
      affected.forEach((item) => {
        const sId = Number(item.seatId || item);
        if (sId) {
          this.cheeringSeats.set(sId, now + 1500);
          this._markSeatDirty(sId);
        }
      });
      if (fx.tableId) {
        const tbl = this.refs.tablesDom.get(fx.tableId);
        if (tbl) {
          this.spawnCallout(tbl.layout.x, tbl.layout.y - 24, '🍻 1, 2, 3 DÔ!', '#fde047');
        }
      } else {
        this.spawnCallout(180, 420, '🍻 CẢ QUÁN 1, 2, 3 DÔ!', '#fde047');
      }
      return;
    }

    if (type === 'DRINK_BEER' || fx.actionCategory === 'DRUNK_INCREASE') {
      const sId = Number(fx.seatId);
      if (sId) {
        this.cheeringSeats.set(sId, now + 1300);
        this._markSeatDirty(sId);
        const seatRef = this.refs.seatsDom.get(sId);
        if (seatRef) {
          this.spawnCallout(
            seatRef.layout.x,
            seatRef.layout.y - 26,
            `🍺 +1 LY (+${fx.drunkDeltaApplied || 8}%)`,
            '#fde047'
          );
        }
      }
      return;
    }

    if (type === 'MENU_SNACK' || fx.actionCategory === 'MENU_SNACK') {
      const foodImgUrl = resolveFoodImageUrl(fx);
      const tables =
        Array.isArray(fx.affectedTables) && fx.affectedTables.length > 0
          ? fx.affectedTables
          : fx.tableId
            ? [fx.tableId]
            : ['TABLE_2'];

      tables.forEach((tId, idx) => {
        this._spawnWaiterDelivery(
          tId,
          foodImgUrl,
          fx.snackName || 'Mồi nhậu',
          fx.drunkDeltaApplied || -10,
          now + idx * 450
        );
      });
      return;
    }

    if (type === 'SWITCH_TABLE') {
      const toSeat = this.refs.seatsDom.get(Number(fx.toSeatId));
      if (toSeat) {
        this.spawnCallout(
          toSeat.layout.x,
          toSeat.layout.y - 26,
          `🚶 -> ${fx.toTableLabel || fx.toTableId}`,
          '#38bdf8'
        );
      }
      return;
    }

    if (type === 'KO') {
      const seatRef = this.refs.seatsDom.get(Number(fx.seatId));
      if (seatRef) {
        this.spawnCallout(seatRef.layout.x, seatRef.layout.y - 26, '💥 GỤC TẠI BÀN (KO)!', '#f472b6');
      }
      return;
    }

    if (type === 'WIFE_DRAG') {
      const seatRef = this.refs.seatsDom.get(Number(fx.seatId));
      if (seatRef) {
        this.spawnCallout(seatRef.layout.x, seatRef.layout.y - 26, '🧹 VỢ BẮT VỀ!', '#38bdf8');
      }
    }
  }

  /**
   * Spawn a Chibi Waiter ("Nhân viên chạy bàn") who walks gently from the Host Counter to the target table
   * carrying the ordered dish, places the dish onto the table, and walks back to the counter!
   */
  _spawnWaiterDelivery(tableId, foodImgUrl, snackName, drunkDelta, startTime) {
    if (!this.refs.walkersLayer || typeof document === 'undefined') return;
    const tblRef = this.refs.tablesDom.get(tableId);
    if (!tblRef) return;

    const waiterId = `waiter_${++this._waiterSeq}`;
    const startPt = { x: V2_WAYPOINTS.COUNTER_SPAWN.x, y: V2_WAYPOINTS.COUNTER_SPAWN.y };
    const targetPt = { x: tblRef.layout.x, y: tblRef.layout.y - 10 };
    const midPt = {
      x: Math.round((startPt.x + targetPt.x) / 2),
      y: Math.min(targetPt.y - 10, Math.max(305, Math.round((startPt.y + targetPt.y) / 2)))
    };

    const outDist =
      Math.hypot(midPt.x - startPt.x, midPt.y - startPt.y) +
      Math.hypot(targetPt.x - midPt.x, targetPt.y - midPt.y);
    // Gentle, unhurried round-trip delivery duration (5.2s to 6.8s total)
    const totalDurationMs = Math.max(5200, Math.min(6800, Math.round((outDist / 42) * 1000) * 2 + 1000));

    const el = document.createElement('div');
    el.className = 'v2-walker-entity v2-waiter-runner';
    el.innerHTML = `
      <div class="v2-seat-name-pill waiter-pill">🍽️ PHỤC VỤ</div>
      <div class="v2-waiter-sprite-wrap">
        <img src="/assets/v2/chars/waiter_walk.png" class="v2-chibi-sprite-img waiter-img" alt="Phục vụ" />
        <img src="${foodImgUrl}" class="v2-waiter-carried-dish" alt="" />
      </div>
    `;

    this.refs.walkersLayer.appendChild(el);
    this.activeWaiters.set(waiterId, {
      waiterId,
      tableId,
      foodImgUrl,
      snackName,
      drunkDelta,
      el,
      waiterImgEl: el.querySelector('.waiter-img'),
      carriedDishEl: el.querySelector('.v2-waiter-carried-dish'),
      outWaypoints: [startPt, midPt, targetPt],
      backWaypoints: [targetPt, midPt, startPt],
      startTime,
      durationMs: totalDurationMs,
      served: false
    });
  }

  handleChatBubble(bubble) {
    if (!bubble || !bubble.seatId) return;
    const seatRef = this.refs.seatsDom.get(Number(bubble.seatId));
    if (!seatRef) return;
    const text = truncateTextSafe(bubble.text || bubble.message || '', 26);
    if (!text) return;
    this.spawnCallout(seatRef.layout.x, seatRef.layout.y - 28, `💬 ${text}`, '#ffffff');
  }

  showBannerToast(text) {
    if (!this.refs.bannerToast || !text) return;
    this.refs.bannerToast.textContent = text;
    this.refs.bannerToast.classList.add('is-visible');
    if (this._bannerTimeout) {
      clearTimeout(this._bannerTimeout);
    }
    this._bannerTimeout = setTimeout(() => {
      if (this.refs.bannerToast) {
        this.refs.bannerToast.classList.remove('is-visible');
      }
    }, 3200);
  }

  spawnCallout(logicalX, logicalY, text, color = '#fde047') {
    if (!this.refs.calloutsLayer || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'v2-floating-callout';
    el.style.left = `${((logicalX / RESOLUTION.LOGICAL_WIDTH) * 100).toFixed(2)}%`;
    el.style.top = `${((logicalY / RESOLUTION.LOGICAL_HEIGHT) * 100).toFixed(2)}%`;
    el.style.color = color;
    el.textContent = text;
    this.refs.calloutsLayer.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1700);
  }

  _spawnWalker(seatId, seatData, waypoints, durationMs, startTime) {
    if (!this.refs.walkersLayer || typeof document === 'undefined') return;

    const existing = this.activeWalkers.get(seatId);
    if (existing && existing.el && existing.el.parentNode) {
      existing.el.parentNode.removeChild(existing.el);
    }

    const el = document.createElement('div');
    el.className = 'v2-walker-entity';
    const nick = escapeHtml(formatNickname(seatData.nickname || seatData.userId, 11));
    el.innerHTML = `
      <div class="v2-seat-name-pill">${seatData.isVIP ? `👑 ${nick}` : nick}</div>
      <div class="v2-seat-avatar-box">${buildChibiSvg(seatData, { isWalking: true })}</div>
    `;

    this.refs.walkersLayer.appendChild(el);
    this.activeWalkers.set(seatId, {
      seatId,
      el,
      waypoints,
      startTime,
      durationMs: durationMs || 3200
    });
  }

  _markSeatDirty(seatId) {
    const domSeat = this.refs.seatsDom.get(seatId);
    if (domSeat) {
      domSeat.lastSignature = '';
    }
  }

  _startAnimationLoop() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }

    const step = (now) => {
      // 1. Update active player Chibi walkers
      if (this.activeWalkers.size > 0) {
        this.activeWalkers.forEach((walker, seatId) => {
          const elapsed = now - walker.startTime;
          const progress = Math.min(1, Math.max(0, elapsed / walker.durationMs));
          const pos = interpolateWaypoints(walker.waypoints, progress);

          walker.el.style.left = `${((pos.x / RESOLUTION.LOGICAL_WIDTH) * 100).toFixed(3)}%`;
          walker.el.style.top = `${(((pos.y + pos.bobY) / RESOLUTION.LOGICAL_HEIGHT) * 100).toFixed(3)}%`;

          if (progress >= 1) {
            if (walker.el.parentNode) {
              walker.el.parentNode.removeChild(walker.el);
            }
            this.activeWalkers.delete(seatId);
            const domSeat = this.refs.seatsDom.get(seatId);
            if (domSeat) {
              domSeat.root.classList.remove('is-walking-hidden');
              if (domSeat.emptyStoolEl) {
                domSeat.emptyStoolEl.classList.add('is-seat-occupied');
              }
            }
          }
        });
      }

      // 2. Update active Chibi Waiters ("Nhân viên chạy bàn")
      if (this.activeWaiters.size > 0) {
        this.activeWaiters.forEach((w, waiterId) => {
          if (now < w.startTime) return;
          const elapsed = now - w.startTime;
          const progress = Math.min(1, Math.max(0, elapsed / w.durationMs));

          let pos;
          if (progress < 0.44) {
            // Walking gently from Counter to Table
            const tOut = progress / 0.44;
            pos = interpolateWaypoints(w.outWaypoints, tOut);
          } else if (progress < 0.60) {
            // Serving dish onto the table!
            pos = interpolateWaypoints(w.outWaypoints, 1);
            if (!w.served) {
              w.served = true;
              if (w.waiterImgEl) {
                w.waiterImgEl.src = '/assets/v2/chars/waiter_serve.png';
              }
              if (w.carriedDishEl) {
                w.carriedDishEl.style.display = 'none';
              }
              const list = this.tableSnacks.get(w.tableId) || [];
              list.push(w.foodImgUrl);
              if (list.length > 4) list.shift();
              this.tableSnacks.set(w.tableId, list);
              const tbl = this.refs.tablesDom.get(w.tableId);
              if (tbl) {
                const count = Array.from(this.lastSeatMap.values()).filter(
                  (s) => s.tableId === w.tableId
                ).length;
                this._renderTabletopProps(w.tableId, count);
                this.spawnCallout(
                  tbl.layout.x,
                  tbl.layout.y - 20,
                  `🍽️ ${w.snackName} (${w.drunkDelta}%)`,
                  '#86efac'
                );
              }
            }
          } else {
            // Walking gently back to Counter
            if (w.waiterImgEl && !w.waiterImgEl.src.endsWith('waiter_idle.png')) {
              w.waiterImgEl.src = '/assets/v2/chars/waiter_idle.png';
            }
            const tBack = (progress - 0.60) / 0.40;
            pos = interpolateWaypoints(w.backWaypoints, tBack);
          }

          w.el.style.left = `${((pos.x / RESOLUTION.LOGICAL_WIDTH) * 100).toFixed(3)}%`;
          w.el.style.top = `${(((pos.y + pos.bobY) / RESOLUTION.LOGICAL_HEIGHT) * 100).toFixed(3)}%`;

          if (progress >= 1) {
            if (w.el.parentNode) {
              w.el.parentNode.removeChild(w.el);
            }
            this.activeWaiters.delete(waiterId);
          }
        });
      }

      // 3. Expire finished cheers poses
      if (this.cheeringSeats.size > 0) {
        this.cheeringSeats.forEach((until, seatId) => {
          if (now >= until) {
            this.cheeringSeats.delete(seatId);
            const seatData = this.lastSeatMap.get(seatId);
            const domSeat = this.refs.seatsDom.get(seatId);
            if (seatData && domSeat) {
              domSeat.avatarEl.innerHTML = buildChibiSvg(seatData, { isCheering: false });
            }
          }
        });
      }

      this._rafId = window.requestAnimationFrame(step);
    };

    this._rafId = window.requestAnimationFrame(step);
  }

  destroy() {
    if (this._rafId && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._bannerTimeout) {
      clearTimeout(this._bannerTimeout);
      this._bannerTimeout = null;
    }
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
      this.root = null;
    }
  }

  injectStylesOnce() {
    if (typeof document === 'undefined' || document.getElementById('v2-tavern-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'v2-tavern-styles';
    style.textContent = `
      .v2-tavern-root {
        position: absolute;
        inset: 0;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        pointer-events: none;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        font-size: calc(100vw * 10 / 360);
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        z-index: 10;
      }

      /* 1. NIGHT SKYLINE & TERRACOTTA TAVERN FLOOR */
      .v2-bg-sky {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 47.2%;
        background: linear-gradient(180deg, #1e121b 0%, #35202c 58%, #4a2f3b 100%);
        overflow: hidden;
      }
      .v2-sky-city {
        position: absolute;
        bottom: 6%;
        left: 0;
        width: 100%;
        height: 36%;
        background-image:
          linear-gradient(90deg, rgba(24,38,56,0.85) 0 12%, transparent 12% 18%, rgba(28,45,66,0.85) 18% 31%, transparent 31% 68%, rgba(24,42,62,0.9) 68% 82%, transparent 82% 86%, rgba(20,34,52,0.9) 86% 100%);
      }
      .v2-sky-bridge {
        position: absolute;
        right: -5%;
        bottom: 8%;
        width: 38%;
        height: 18%;
        border-top: 0.25em solid rgba(217, 119, 6, 0.55);
        border-radius: 50% 50% 0 0;
      }
      .v2-string-lights {
        position: absolute;
        top: 11.8%;
        left: 5%;
        width: 90%;
        height: 2.6em;
        display: flex;
        justify-content: space-around;
        align-items: flex-start;
        border-top: 1px solid rgba(255, 255, 255, 0.22);
      }
      .v2-string-lights .bulb {
        width: 0.52em;
        height: 0.68em;
        border-radius: 50%;
        background: #fef08a;
        box-shadow: 0 0 0.85em 0.28em rgba(253, 224, 71, 0.8);
        margin-top: 0.12em;
      }
      .v2-bush-left, .v2-bush-right {
        position: absolute;
        bottom: 0;
        width: 4.5em;
        height: 3.2em;
        background: #365338;
        border-radius: 50% 50% 0 0;
        border: 0.15em solid #1e3320;
      }
      .v2-bush-left { left: 2%; }
      .v2-bush-right { right: 2%; }

      .v2-tavern-floor {
        position: absolute;
        left: 0;
        top: 47.0%;
        width: 100%;
        height: 53.0%;
        background: linear-gradient(180deg, #9c724f 0%, #a87c56 45%, #8f6543 100%);
        border-top: 0.25em solid #6b4930;
        overflow: hidden;
      }
      .v2-floor-grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, rgba(74, 46, 27, 0.28) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(74, 46, 27, 0.28) 1px, transparent 1px);
        background-size: 12.5% 9%;
      }

      /* Animated Bass Speakers inside Mobile Safe Zone (Left 6.4%, Right 6.4%, Bottom 8.6% above TikTok chat bar) */
      .v2-speaker-wrap {
        position: absolute;
        bottom: 15.8%;
        width: 3.6em;
        height: 4.6em;
        z-index: 900;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .v2-speaker-left { left: 6.4%; }
      .v2-speaker-right { right: 6.4%; }
      .v2-speaker-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 0.25em 0.5em rgba(0,0,0,0.65));
        animation: v2-speaker-thump 0.58s ease-in-out infinite alternate;
      }
      .v2-speaker-img.is-flipped {
        animation: v2-speaker-thump-flip 0.58s ease-in-out infinite alternate;
      }
      .v2-sound-wave {
        position: absolute;
        width: 2.3em;
        height: 2.3em;
        border-radius: 50%;
        border: 0.14em solid rgba(253, 224, 71, 0.75);
        pointer-events: none;
        animation: v2-wave-pulse 1.5s ease-out infinite;
      }
      .v2-sound-wave.wave-2 {
        animation-delay: 0.75s;
        border-color: rgba(56, 189, 248, 0.75);
      }
      .v2-music-note {
        position: absolute;
        font-weight: 900;
        font-size: 0.88em;
        color: #fef08a;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9);
        pointer-events: none;
        animation: v2-note-float 2.1s ease-in-out infinite;
      }
      .v2-music-note.note-1 { top: -0.2em; left: 20%; animation-delay: 0s; color: #fde047; }
      .v2-music-note.note-2 { top: -0.6em; left: 62%; animation-delay: 0.7s; color: #38bdf8; }
      .v2-music-note.note-3 { top: -0.3em; left: 42%; animation-delay: 1.4s; color: #f472b6; }

      /* 2. TOP HEADER: PLACED BELOW TIKTOK NATIVE TOP UI (+Follow / Gaming Ranking) */
      .v2-top-header {
        position: absolute;
        top: 12.6%;
        left: 6.4%;
        width: 87.2%;
        z-index: 30;
        pointer-events: none;
      }
      .v2-main-title {
        text-align: center;
        color: #fef08a;
        font-weight: 900;
        font-size: 1.72em;
        line-height: 1.1;
        letter-spacing: 0.04em;
        -webkit-text-stroke: 0.045em #1c0a00;
        text-shadow:
          0 2px 0 #78350f,
          -2px -2px 0 #000,
          2px -2px 0 #000,
          -2px 2px 0 #000,
          2px 2px 0 #000,
          0 4px 8px rgba(0,0,0,0.95);
      }
      /* Command Guide sits above the Host Booth roof (right of Menu Board), 100% clear of TikTok Top UI */
      .v2-cmd-guide {
        margin-top: 0.28em;
        margin-left: 31.8%;
        width: 68.2%;
        background: rgba(15, 23, 42, 0.88);
        border: 1.5px solid rgba(253, 224, 71, 0.65);
        border-radius: 0.4em;
        padding: 0.22em 0.35em;
        text-align: center;
        color: #ffffff;
        font-weight: 900;
        font-size: 0.72em;
        line-height: 1.34;
        letter-spacing: 0.015em;
        box-shadow: 0 3px 8px rgba(0,0,0,0.75);
        text-shadow:
          -1.5px -1.5px 0 #000,
          1.5px -1.5px 0 #000,
          -1.5px 1.5px 0 #000,
          1.5px 1.5px 0 #000;
      }
      .v2-cmd-guide .hl {
        color: #fde047;
      }

      /* 3. LEFT WOODEN MENU BOARD (SAFE MARGIN left: 6.4% SO NEVER CROPPED ON PHONE) */
      .v2-menu-board {
        position: absolute;
        left: 6.4%;
        top: 16.8%;
        width: 27.2%;
        height: 30.2%;
        z-index: 25;
      }
      .v2-menu-inner {
        width: 100%;
        height: 93%;
        background: linear-gradient(180deg, #32241b 0%, #1d140e 100%);
        border: 0.24em solid #9a653c;
        border-radius: 0.42em;
        padding: 0.22em 0.28em;
        display: flex;
        flex-direction: column;
        box-shadow: 0 0.35em 0.8em rgba(0,0,0,0.8);
      }
      .v2-menu-title {
        text-align: center;
        color: #fef08a;
        font-weight: 900;
        font-size: 1.02em;
        letter-spacing: 0.03em;
        text-shadow:
          -1.5px -1.5px 0 #000,
          1.5px -1.5px 0 #000,
          -1.5px 1.5px 0 #000,
          1.5px 1.5px 0 #000;
      }
      .v2-menu-sub {
        text-align: center;
        color: #ffffff;
        font-size: 0.56em;
        font-weight: 900;
        margin-top: 0.04em;
        white-space: nowrap;
        text-shadow: 0 1px 3px #000, 0 0 4px #000;
      }
      .v2-menu-divider {
        height: 1.5px;
        background: rgba(253, 224, 71, 0.4);
        margin: 0.16em 0;
      }
      .v2-menu-list {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .v2-menu-row {
        display: flex;
        align-items: center;
        gap: 0.18em;
      }
      .v2-menu-food-img {
        width: 1.32em;
        height: 1.32em;
        object-fit: contain;
        flex-shrink: 0;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.85));
      }
      .v2-dish-name-wrap {
        flex: 1;
        min-width: 0;
      }
      .v2-dish-name {
        color: #ffffff;
        font-weight: 900;
        font-size: 0.62em;
        line-height: 1.08;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
      }
      .v2-dish-sub {
        color: #fde68a;
        font-weight: 800;
        font-size: 0.46em;
        line-height: 1.05;
        text-shadow: 0 1px 2px #000;
      }
      .v2-dish-price {
        color: #fde047;
        font-weight: 900;
        font-size: 0.64em;
        white-space: nowrap;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
      }
      .v2-easel-leg {
        position: absolute;
        bottom: 0;
        width: 0.45em;
        height: 8%;
        background: #5c3a21;
      }
      .v2-easel-leg.leg-l { left: 18%; transform: skewX(-12deg); }
      .v2-easel-leg.leg-r { right: 18%; transform: skewX(12deg); }

      /* 4. RIGHT HOST COUNTER BOOTH (SAFE RIGHT EDGE AT 93.6% SO NEVER CROPPED) */
      .v2-host-booth {
        position: absolute;
        left: 34.4%;
        top: 22.8%;
        width: 59.2%;
        height: 24.4%;
        z-index: 25;
        display: flex;
        flex-direction: column;
      }
      .v2-booth-roof {
        height: 13%;
        width: 96%;
        margin: 0 auto;
        background: repeating-linear-gradient(
          90deg,
          #78523b 0px,
          #78523b 18px,
          #65432f 18px,
          #65432f 36px
        );
        border-radius: 0.4em 0.4em 0.15em 0.15em;
        border-bottom: 0.2em solid #4a3020;
        box-shadow: 0 0.2em 0.4em rgba(0,0,0,0.45);
      }
      .v2-booth-backwall {
        position: relative;
        height: 38%;
        width: 92%;
        margin: 0 auto;
        background: linear-gradient(180deg, rgba(120, 74, 46, 0.55) 0%, rgba(70, 42, 26, 0.7) 100%);
        overflow: visible;
      }
      .v2-pillar {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 0.5em;
        background: #7c5236;
      }
      .pillar-l { left: 0; }
      .pillar-r { right: 0; }
      .v2-hanging-lamp {
        position: absolute;
        top: 0;
        width: 0.58em;
        height: 0.75em;
        background: #fef08a;
        border-radius: 0 0 50% 50%;
        box-shadow: 0 0.2em 0.9em 0.25em rgba(254, 240, 138, 0.7);
      }
      .lamp-1 { left: 26%; }
      .lamp-2 { right: 26%; }

      .v2-host-figure {
        position: absolute;
        left: 50%;
        bottom: -6%;
        transform: translateX(-50%);
        width: 6.8em;
        height: 6.8em;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        z-index: 3;
      }
      .v2-default-host-svg, .v2-custom-host-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 0.15em 0.35em rgba(0,0,0,0.65));
      }

      /* Left Prop: Realistic Boong Bia Mát */
      .v2-prop-keg-wrap {
        position: absolute;
        left: 2.5%;
        bottom: -6%;
        width: 3.6em;
        height: 4.1em;
        z-index: 4;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
      }
      .v2-boong-bia-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.65));
      }
      .v2-boong-badge {
        position: absolute;
        bottom: 24%;
        left: 44%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        color: #fef08a;
        font-weight: 900;
        font-size: 0.44em;
        padding: 0.08em 0.28em;
        border-radius: 0.22em;
        border: 1px solid rgba(253, 224, 71, 0.65);
        white-space: nowrap;
      }
      .v2-chai-bia-img {
        position: absolute;
        left: 21%;
        bottom: -5%;
        width: 1.9em;
        height: 2.3em;
        object-fit: contain;
        z-index: 4;
      }

      /* Right Prop: Realistic Heart Beer Jar */
      .v2-prop-like-jar {
        position: absolute;
        right: 2.5%;
        bottom: -6%;
        width: 3.8em;
        height: 4.2em;
        z-index: 4;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
      }
      .v2-binh-tim-img {
        width: 100%;
        height: 92%;
        object-fit: contain;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.65));
      }
      .like-jar-label {
        margin-top: -0.35em;
        background: rgba(15, 23, 42, 0.95);
        color: #fef08a;
        font-size: 0.54em;
        font-weight: 900;
        padding: 0.08em 0.38em;
        border-radius: 99px;
        border: 1px solid rgba(253, 224, 71, 0.65);
        white-space: nowrap;
        z-index: 5;
      }

      .v2-counter-top {
        height: 6.5%;
        width: 98%;
        margin: 0 auto;
        background: linear-gradient(180deg, #e2e8f0 0%, #94a3b8 100%);
        border-radius: 0.25em;
        border: 1px solid #475569;
        z-index: 5;
      }

      /* Counter Front: Dual Leaderboards (CRISP HIGH-CONTRAST TEXT) */
      .v2-counter-front {
        height: 32.5%;
        width: 96%;
        margin: 0 auto;
        background: #5c3b24;
        border-left: 0.2em solid #3d2516;
        border-right: 0.2em solid #3d2516;
        padding: 0.16em;
        display: flex;
        gap: 0.2em;
      }
      .v2-lb-box {
        flex: 1;
        min-width: 0;
        background: #1e130c;
        border: 1.5px solid #b47b4e;
        border-radius: 0.25em;
        padding: 0.12em 0.22em;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .v2-lb-title {
        text-align: center;
        color: #fef08a;
        font-weight: 900;
        font-size: 0.68em;
        letter-spacing: 0.02em;
        border-bottom: 1px solid rgba(253, 224, 71, 0.3);
        padding-bottom: 0.04em;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
      }
      .v2-lb-rows {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
      }
      .v2-lb-row {
        display: flex;
        align-items: center;
        gap: 0.16em;
        font-size: 0.58em;
        color: #ffffff;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
      }
      .v2-lb-row.is-empty {
        opacity: 0.72;
      }
      .lb-rank {
        color: #fbbf24;
        font-weight: 900;
        width: 0.85em;
        flex-shrink: 0;
      }
      .lb-name {
        flex: 1;
        min-width: 0;
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lb-score {
        color: #fde047;
        font-weight: 900;
        white-space: nowrap;
        flex-shrink: 0;
      }

      /* Welcome Mat */
      .v2-welcome-mat {
        height: 10%;
        width: 98%;
        margin: 0 auto;
        background: linear-gradient(180deg, #4a2f1d 0%, #2d1b10 100%);
        border: 1.5px solid #b47b4e;
        border-radius: 0.25em;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.32em;
        color: #ffffff;
        font-weight: 900;
        font-size: 0.74em;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
      }
      .v2-vao-key {
        background: #b45309;
        border: 1.5px solid #fef08a;
        color: #fef08a;
        padding: 0.02em 0.38em;
        border-radius: 0.25em;
      }

      /* 5. PLAYFIELD: 7 ROUND TABLES & 28 CHIBI SEATS (ALL WITHIN SAFE MOBILE MARGIN) */
      .v2-playfield-layer, .v2-walkers-layer, .v2-callouts-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .v2-walkers-layer { z-index: 750; }
      .v2-callouts-layer { z-index: 950; }

      .v2-table-wrap {
        position: absolute;
        width: 6.4em;
        height: 3.45em;
        transform: translate(-50%, -50%);
      }
      .v2-table-surface-img-wrap {
        position: absolute;
        inset: 0;
        z-index: 5;
      }
      .v2-table-img {
        width: 100%;
        height: 100%;
        object-fit: fill;
        filter: drop-shadow(0 0.25em 0.45em rgba(0,0,0,0.5));
      }
      .v2-stool-img {
        position: absolute;
        width: 1.38em;
        height: 1.28em;
        object-fit: contain;
        filter: drop-shadow(0 0.12em 0.2em rgba(0,0,0,0.45));
        z-index: 1;
        transition: opacity 0.15s ease;
      }
      .v2-stool-img.is-seat-occupied {
        opacity: 0;
      }
      .stool-top { left: 50%; top: 2%; transform: translate(-50%, -50%); }
      .stool-left { left: 4%; top: 55%; transform: translate(-50%, -50%); }
      .stool-right { left: 96%; top: 55%; transform: translate(-50%, -50%); }
      .stool-bottom { left: 50%; top: 96%; transform: translate(-50%, -50%); }

      .v2-table-props {
        position: absolute;
        inset: 0;
        z-index: 6;
      }
      .v2-table-mug-img {
        position: absolute;
        width: 1.05em;
        height: 1.05em;
        object-fit: contain;
        transform: translate(-50%, -50%);
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.65));
      }
      .v2-table-dish-img {
        position: absolute;
        width: 1.65em;
        height: 1.65em;
        object-fit: contain;
        transform: translate(-50%, -50%);
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.75));
        z-index: 3;
      }

      /* Table Badge positioned cleanly so it NEVER touches the bottom player's badge and NEVER clips off-screen */
      .v2-table-badge {
        position: absolute;
        left: 68%;
        bottom: -27%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.96);
        color: #ffffff;
        font-weight: 900;
        font-size: 0.58em;
        line-height: 1.2;
        padding: 0.12em 0.44em;
        border-radius: 0.32em;
        border: 1.5px solid #e2e8f0;
        white-space: nowrap;
        box-shadow: 0 2px 5px rgba(0,0,0,0.85);
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
        z-index: 30;
      }
      .v2-table-wrap.is-vip-table .v2-table-badge {
        left: 50%;
        bottom: -32%;
        background: linear-gradient(90deg, #fef08a 0%, #facc15 100%);
        color: #451a03;
        border-color: #b45309;
        text-shadow: none;
      }

      /* 28 Seat Character Slots & Waiter Runners */
      .v2-seat-slot, .v2-walker-entity {
        position: absolute;
        width: 4.8em;
        height: auto;
        transform: translate(-50%, -78%);
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
      }
      .v2-seat-slot.is-empty {
        display: none;
      }
      .v2-seat-slot.is-walking-hidden {
        opacity: 0;
      }
      .v2-seat-name-pill {
        flex-shrink: 0;
        display: inline-block;
        background: rgba(15, 23, 42, 0.96);
        color: #ffffff;
        font-weight: 900;
        font-size: 0.62em;
        line-height: 1.28;
        padding: 0.12em 0.52em;
        border-radius: 99px;
        border: 1.5px solid #fde047;
        white-space: nowrap;
        max-width: 9.2em;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 0.04em;
        box-shadow: 0 2px 4px rgba(0,0,0,0.9);
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
        z-index: 4;
      }
      .v2-seat-name-pill.waiter-pill {
        background: #991b1b;
        border-color: #fde047;
        color: #fef08a;
      }
      .v2-seat-avatar-box, .v2-waiter-sprite-wrap {
        flex-shrink: 0;
        width: 2.95em;
        height: 2.85em;
        position: relative;
        z-index: 3;
      }
      .v2-chibi-svg {
        width: 100%;
        height: 100%;
        position: relative;
      }
      .v2-chibi-sprite-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 0.12em 0.25em rgba(0,0,0,0.65));
      }
      /* Flip right-side seat character horizontally so they face inward toward the table */
      .v2-seat-slot.pos-right .v2-chibi-sprite-img {
        transform: scaleX(-1);
      }
      .v2-vip-crown-badge {
        position: absolute;
        top: -0.45em;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.72em;
        z-index: 5;
      }
      .v2-waiter-carried-dish {
        position: absolute;
        right: -0.35em;
        top: 32%;
        width: 1.45em;
        height: 1.45em;
        object-fit: contain;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.75));
      }
      .v2-chibi-svg.is-cheering {
        animation: v2-cheers-bounce 0.35s ease-in-out infinite alternate;
      }
      .v2-chibi-svg.is-ko {
        transform: rotate(-8deg);
      }
      .v2-seat-sub-badge {
        flex-shrink: 0;
        margin-top: -0.22em;
        background: rgba(15, 23, 42, 0.96);
        color: #fde047;
        font-weight: 900;
        font-size: 0.5em;
        line-height: 1.2;
        padding: 0.06em 0.38em;
        border-radius: 0.25em;
        border: 1.5px solid #fbbf24;
        white-space: nowrap;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000;
        z-index: 5;
      }
      .v2-seat-sub-badge.badge-ko {
        background: #9d174d;
        color: #fce7f3;
        border-color: #f472b6;
      }
      .v2-seat-sub-badge.badge-leave {
        background: #0369a1;
        color: #e0f2fe;
        border-color: #38bdf8;
      }
      /* Centered stool directly under seated character's waist & badge (100% aligned, never offset) */
      .v2-seat-stool-under {
        flex-shrink: 0;
        width: 1.55em;
        height: 1.15em;
        object-fit: contain;
        margin-top: -0.38em;
        z-index: 1;
        pointer-events: none;
      }
      .v2-seat-slot.pos-top .v2-seat-stool-under {
        display: none;
      }

      /* Floating Callout & Top Toast */
      .v2-floating-callout {
        position: absolute;
        transform: translate(-50%, -100%);
        background: rgba(15, 23, 42, 0.95);
        border: 1.5px solid #fde047;
        padding: 0.16em 0.56em;
        border-radius: 99px;
        font-weight: 900;
        font-size: 0.72em;
        white-space: nowrap;
        box-shadow: 0 0.2em 0.5em rgba(0,0,0,0.75);
        text-shadow: 0 1px 2px rgba(0,0,0,0.95);
        animation: v2-float-up 1.65s ease-out forwards;
      }

      .v2-action-toast {
        position: absolute;
        left: 50%;
        top: 11.8%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        border: 1.5px solid #fbbf24;
        color: #fef08a;
        font-weight: 900;
        font-size: 0.76em;
        padding: 0.2em 0.85em;
        border-radius: 99px;
        white-space: nowrap;
        max-width: 92%;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 980;
      }
      .v2-action-toast.is-visible {
        opacity: 1;
      }

      @keyframes v2-cheers-bounce {
        from { transform: translateY(0) scale(1); }
        to { transform: translateY(-0.22em) scale(1.06); }
      }
      @keyframes v2-speaker-thump {
        0% { transform: scale(1) rotate(-2deg); }
        100% { transform: scale(1.06, 1.04) rotate(0deg); }
      }
      @keyframes v2-speaker-thump-flip {
        0% { transform: scaleX(-1) scale(1) rotate(-2deg); }
        100% { transform: scaleX(-1) scale(1.06, 1.04) rotate(0deg); }
      }
      @keyframes v2-wave-pulse {
        0% { opacity: 0.85; transform: scale(0.6); }
        100% { opacity: 0; transform: scale(1.85); }
      }
      @keyframes v2-note-float {
        0% { opacity: 0; transform: translateY(0.4em) scale(0.8); }
        30% { opacity: 1; transform: translateY(-0.5em) scale(1.08); }
        100% { opacity: 0; transform: translateY(-1.8em) translateX(0.35em) scale(0.95); }
      }
      @keyframes v2-float-up {
        0% { opacity: 0; transform: translate(-50%, -40%) scale(0.85); }
        18% { opacity: 1; transform: translate(-50%, -100%) scale(1.04); }
        80% { opacity: 1; transform: translate(-50%, -155%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -185%) scale(0.95); }
      }
    `;
    document.head.appendChild(style);
  }
}
