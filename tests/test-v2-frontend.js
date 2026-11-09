/**
 * Test Suite — Phase V2-2, V2-3, V2-4: Frontend 7 Tables / 28 Seats Layout, PathWalker & State Mapper
 */

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== PHASE V2-2..V2-4: FRONTEND 7 TABLES / 28 SEATS & PATHWALKER TESTS ===');

  const layoutMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/ui/Layout.js')).href
  );
  const pathWalkerMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/fx/PathWalker.js')).href
  );
  const socketMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/network/SocketClient.js')).href
  );
  const overlayMod = await import(
    pathToFileURL(path.resolve(__dirname, '../client/src/game/entities/TavernV2Overlay.js')).href
  );

  check('V2_TABLE_LAYOUTS defines 7 tables (6 normal + 1 VIP) with 4 seats each', () => {
    assert.strictEqual(layoutMod.V2_TABLE_LAYOUTS.length, 7);
    const vipTables = layoutMod.V2_TABLE_LAYOUTS.filter((t) => t.isVIP);
    assert.strictEqual(vipTables.length, 1);
    assert.strictEqual(vipTables[0].tableId, 'TABLE_VIP');
    layoutMod.V2_TABLE_LAYOUTS.forEach((tbl) => {
      assert.strictEqual(tbl.seatIds.length, 4);
    });
  });

  check('V2_SEAT_LAYOUTS defines 28 unique seats mapped to 7 tables inside 360x640 logical space', () => {
    assert.strictEqual(layoutMod.V2_SEAT_LAYOUTS.length, 28);
    const seenIds = new Set();
    layoutMod.V2_SEAT_LAYOUTS.forEach((seat) => {
      assert(!seenIds.has(seat.seatId), `Duplicate seatId ${seat.seatId}`);
      seenIds.add(seat.seatId);
      assert(seat.x >= 16 && seat.x <= 344, `Seat ${seat.seatId} X out of bounds: ${seat.x}`);
      assert(seat.y >= 300 && seat.y <= 620, `Seat ${seat.seatId} Y out of bounds: ${seat.y}`);
    });
  });

  check('V2_MENU_ITEMS defines all 7 menu items from 1 xu to >100 xu', () => {
    assert.strictEqual(layoutMod.V2_MENU_ITEMS.length, 7);
    assert.strictEqual(layoutMod.V2_MENU_ITEMS[0].id, 'MENU_LAC_RANG');
    assert.strictEqual(layoutMod.V2_MENU_ITEMS[6].id, 'MENU_MOI_CA_QUAN');
  });

  check('PathWalker computes waypoints and interpolates smoothly for WALK_IN and WALK_SWITCH', () => {
    const walkIn = pathWalkerMod.computeChibiWaypoints('WALK_IN', null, 5);
    assert(walkIn.length >= 2);
    assert.strictEqual(walkIn[0].x, layoutMod.V2_WAYPOINTS.COUNTER_SPAWN.x);

    const startPos = pathWalkerMod.interpolateWaypoints(walkIn, 0);
    const midPos = pathWalkerMod.interpolateWaypoints(walkIn, 0.5);
    const endPos = pathWalkerMod.interpolateWaypoints(walkIn, 1);
    assert.strictEqual(startPos.x, walkIn[0].x);
    assert(midPos.y > startPos.y);
    assert.strictEqual(endPos.x, walkIn[walkIn.length - 1].x);

    const walkSwitch = pathWalkerMod.computeChibiWaypoints('WALK_SWITCH', 5, 13);
    assert(walkSwitch.length === 3);
  });

  check('mapBackendStateToViewData maps 28 seats, 7 tables, dual leaderboards, and hostConfig for v2.0', () => {
    const rawV2 = {
      layoutVersion: 2,
      stateVersion: 12,
      mode: 'MOCK',
      seats: [
        {
          seatId: 5,
          seatIndex: 4,
          tableId: 'TABLE_2',
          localSeatNo: 1,
          player: {
            userId: 'u_test',
            nickname: 'Anh Ba Chibi',
            status: 'SEATED',
            drunkLevel: 35,
            isVIP: true,
            beerCount: 6,
            snackCount: 2,
            moveFromSeatId: 1
          }
        }
      ],
      tables: [{ tableId: 'TABLE_2', occupiedCount: 1, capacity: 4 }],
      leaderboards: {
        topDrinkers: [{ rank: 1, userId: 'u_test', nickname: 'Anh Ba Chibi', beerCount: 6 }],
        topEaters: [{ rank: 1, userId: 'u_test', nickname: 'Anh Ba Chibi', snackCount: 2 }]
      },
      hostConfig: { title: 'QUÁN NHẬU GIÁ SV', avatarUrl: 'data:image/png;base64,AAA' }
    };

    const viewData = socketMod.mapBackendStateToViewData(rawV2);
    assert.strictEqual(viewData.layoutVersion, 2);
    assert.strictEqual(viewData.seats.length, 28);
    const seat5 = viewData.seats.find((s) => s.seatId === 5);
    assert.strictEqual(seat5.userId, 'u_test');
    assert.strictEqual(seat5.tableId, 'TABLE_2');
    assert.strictEqual(seat5.beerCount, 6);
    assert.strictEqual(seat5.moveFromSeatId, 1);
    assert.strictEqual(viewData.leaderboards.topDrinkers.length, 1);
    assert.strictEqual(viewData.hostConfig.title, 'QUÁN NHẬU GIÁ SV');
  });

  check('buildChibiSvg generates valid SVG markup for seated, cheering, walking, and KO states', () => {
    const svgSeated = overlayMod.buildChibiSvg({
      seatId: 5,
      userId: 'u1',
      status: 'SEATED',
      drunkLevel: 20,
      isVIP: true
    });
    assert(svgSeated.includes('<svg'));
    assert(svgSeated.includes('v2-chibi-svg'));

    const svgKO = overlayMod.buildChibiSvg({
      seatId: 5,
      userId: 'u1',
      status: 'KO',
      drunkLevel: 100
    });
    assert(svgKO.includes('is-ko'));
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
