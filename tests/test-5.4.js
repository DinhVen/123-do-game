'use strict';

/**
 * TEST SUITE — PHASE 5 (TASK 5.4): WINDOWS STARTUP SCRIPT & OBS OPERATIONS GUIDE
 *
 * Phân tách rõ:
 *  A. [STATIC SCRIPT & DOCS VALIDATION]: Kiểm tra nội dung start.bat & README.md theo đủ 18 yêu cầu.
 *  B. [WINDOWS BATCH EXECUTION TEST]: Thực thi cmd.exe /c start.bat trong các kịch bản kiểm soát
 *     (phát hiện xung đột cổng khi cổng đang bị chiếm -> báo lỗi tiếng Việt rõ ràng, exit code = 1,
 *      không tự chạy npm install, không xóa data/state-snapshot.json, không lộ secret).
 *  C. [BACKEND + FRONTEND PRODUCTION BUILD INTEGRATION TEST]: Khởi chạy Backend phục vụ trực tiếp
 *     bản build client/dist trên cùng cổng HTTP, kiểm tra:
 *     - GET / trả về giao diện Game (HTML + bundle JS Phaser 3)
 *     - GET /mock trả về bảng điều khiển Mock Dashboard
 *     - GET /health & GET /api/state hoạt động đúng
 *     - Socket.io kết nối thành công và đồng bộ snapshot/patch
 *     - Shutdown an toàn lưu snapshot và giải phóng toàn bộ timer/cổng.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { io: createClient } = require('socket.io-client');

const defaultConfig = require('../server/config');
const { startServer } = require('../server/index');
const { SnapshotStore } = require('../server/services/snapshotStore');

let passed = 0;
let failed = 0;

async function runScenario(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}:`, err.message);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

async function main() {
  console.log('======================================================================');
  console.log('PHASE 5 — TASK 5.4: START.BAT, README.MD & PRODUCTION SERVING SUITE');
  console.log('======================================================================');

  const rootDir = path.resolve(__dirname, '..');
  const startBatPath = path.join(rootDir, 'start.bat');
  const readmePath = path.join(rootDir, 'README.md');
  const clientDistDir = path.join(rootDir, 'client', 'dist');
  const clientDistIndex = path.join(clientDistDir, 'index.html');

  // ---------------------------------------------------------------------------
  // 1. STATIC VALIDATION OF start.bat (Requirements 1..18)
  // ---------------------------------------------------------------------------
  await runScenario('1. [STATIC CHECK] start.bat tồn tại và đáp ứng đủ các quy tắc an toàn vận hành (cd /d "%~dp0", kiểm tra node/npm, không tự npm install, không tự bật LIVE, không lộ secret, không xóa snapshot)', async () => {
    assert.strictEqual(fs.existsSync(startBatPath), true, 'start.bat must exist at project root');
    const batContent = fs.readFileSync(startBatPath, 'utf8');

    // 1. Chuyển đúng thư mục chứa start.bat, hỗ trợ đường dẫn có dấu cách
    assert.ok(
      batContent.includes('cd /d "%~dp0"'),
      'start.bat must use cd /d "%~dp0" with quotes for paths with spaces'
    );

    // 2. Kiểm tra Node.js và npm
    assert.ok(batContent.includes('where node'), 'start.bat must check where node');
    assert.ok(batContent.includes('where npm'), 'start.bat must check where npm');

    // 3. Kiểm tra các file bắt buộc & node_modules
    assert.ok(batContent.includes('package.json'), 'start.bat must check package.json');
    assert.ok(batContent.includes('server\\index.js'), 'start.bat must check server\\index.js');
    assert.ok(batContent.includes('config\\default.json'), 'start.bat must check config\\default.json');
    assert.ok(batContent.includes('node_modules'), 'start.bat must check node_modules');

    // 4 & 5. Không tự động chạy npm install
    const lines = batContent.split(/\r?\n/);
    const executableLines = lines
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('::') && !l.toLowerCase().startsWith('rem ') && !l.toLowerCase().startsWith('echo '));
    const hasAutoNpmInstall = executableLines.some((l) => /\bnpm\s+(install|i|ci)\b/i.test(l));
    assert.strictEqual(
      hasAutoNpmInstall,
      false,
      'start.bat must NEVER automatically execute npm install without user consent'
    );

    // 6 & 7. Giữ nguyên MOCK mode mặc định, không tự chuyển APP_MODE=LIVE
    assert.ok(
      batContent.includes('set "GAME_MODE=MOCK"'),
      'start.bat must default GAME_MODE to MOCK'
    );
    const hasForcedLive = executableLines.some((l) => /APP_MODE\s*=\s*LIVE/i.test(l));
    assert.strictEqual(
      hasForcedLive,
      false,
      'start.bat must never force APP_MODE=LIVE'
    );

    // 8 & 9. Không yêu cầu hay in secret/cookie/session/token
    const forbiddenSecretEcho = executableLines.some((l) =>
      /(ADMIN_SECRET_TOKEN|sessionId|ttwid|oAuthToken|signApiKey|cookie)/i.test(l)
    );
    assert.strictEqual(
      forbiddenSecretEcho,
      false,
      'start.bat executable commands must not read or print secrets/cookies/tokens'
    );

    // 10, 11 & 14. Kiểm tra cổng bị chiếm bằng netstat để ngăn chạy trùng tiến trình
    assert.ok(
      /netstat(\.exe)?/i.test(batContent) && batContent.includes('LISTENING'),
      'start.bat must check port availability via netstat -ano LISTENING'
    );

    // 12 & 15. Hiển thị địa chỉ Game, Mock Dashboard và hướng dẫn dừng Ctrl+C
    assert.ok(batContent.includes('/mock'), 'start.bat must display Mock Dashboard URL');
    assert.ok(batContent.includes('Ctrl + C'), 'start.bat must display Ctrl + C safe stop instruction');

    // 17. Không xóa data/state-snapshot.json
    const deletesSnapshot = executableLines.some(
      (l) => /\b(del|erase|rd|rmdir)\b/i.test(l) && /state-snapshot\.json/i.test(l)
    );
    assert.strictEqual(
      deletesSnapshot,
      false,
      'start.bat must NEVER delete data/state-snapshot.json on startup'
    );

    // 18. Không chạy test mỗi lần mở game; chỉ build khi thiếu client\dist\index.html
    assert.ok(
      batContent.includes('if not exist "%~dp0client\\dist\\index.html"'),
      'start.bat must only build client when client\\dist\\index.html is missing'
    );
    const runsTestsOnStart = executableLines.some((l) => /\bnpm\s+test|\bnpm\s+run\s+test/i.test(l));
    assert.strictEqual(runsTestsOnStart, false, 'start.bat must not run test suites on startup');
  });

  // ---------------------------------------------------------------------------
  // 2. STATIC VALIDATION OF README.md (All 10 Mandatory Sections)
  // ---------------------------------------------------------------------------
  await runScenario('2. [STATIC CHECK] README.md tiếng Việt đầy đủ 10 phần bắt buộc (Giới thiệu, Yêu cầu, Cài đặt, start.bat, MOCK, LIVE, OBS 1080x1920, Snapshot, Troubleshooting, Checklist)', async () => {
    assert.strictEqual(fs.existsSync(readmePath), true, 'README.md must exist at project root');
    const readme = fs.readFileSync(readmePath, 'utf8');

    const requiredKeywords = [
      '1, 2, 3 DÔ!',
      'Phaser 3',
      'Socket.io',
      'Node.js',
      'start.bat',
      'http://127.0.0.1:3000/',
      'http://127.0.0.1:3000/mock',
      'APP_MODE=MOCK',
      'APP_MODE=LIVE',
      'TIKTOK_UNIQUE_ID',
      '1080x1920',
      '60',
      'data/state-snapshot.json',
      'KO',
      'LEAVING',
      'Troubleshooting',
      'Checklist'
    ];

    for (const kw of requiredKeywords) {
      assert.ok(readme.includes(kw), `README.md missing required content: ${kw}`);
    }

    // Security warning against entering TikTok password/cookies
    assert.ok(
      readme.includes('TUYỆT ĐỐI KHÔNG') && readme.includes('sessionId'),
      'README.md must warn users never to provide TikTok password/cookies/sessionId'
    );
  });

  // ---------------------------------------------------------------------------
  // 3. PRODUCTION BUILD & UNIFIED HTTP SERVING INTEGRATION TEST
  // ---------------------------------------------------------------------------
  await runScenario('3. [INTEGRATION TEST] Backend phục vụ trực tiếp Frontend Production Build (client/dist), Mock Dashboard (/mock), Health (/health), State (/api/state), Socket.io và Shutdown an toàn', async () => {
    assert.strictEqual(
      fs.existsSync(clientDistIndex),
      true,
      'client/dist/index.html must exist (run cd client && npm run build)'
    );

    const tempSnapPath = path.join(rootDir, 'data', `test-5.4-snap-${process.pid}.json`);
    const snapshotStore = new SnapshotStore({
      filePath: tempSnapPath,
      throttleMs: 200
    });

    const testConfig = defaultConfig.buildConfig({
      host: '127.0.0.1',
      port: 0
    });

    const serverInstance = await startServer(testConfig, {
      snapshotStore,
      enableSnapshotPersistence: true
    });

    const baseUrl = `http://127.0.0.1:${serverInstance.port}`;
    let clientSocket = null;

    try {
      // 13. Game URL (GET /) serves production HTML & JS bundle
      const gameRes = await fetch(`${baseUrl}/`);
      assert.strictEqual(gameRes.status, 200, 'GET / must return HTTP 200');
      const gameHtml = await gameRes.text();
      assert.ok(
        gameHtml.includes('id="game-container"'),
        'GET / must serve Phaser game-container HTML'
      );

      // Extract asset JS path from index.html and verify it is served with 200 OK
      const assetMatch = gameHtml.match(/src="\.?\/?(assets\/[^"]+\.js)"/);
      assert.ok(assetMatch && assetMatch[1], 'index.html must reference built JS bundle in assets/');
      const jsRes = await fetch(`${baseUrl}/${assetMatch[1]}`);
      assert.strictEqual(jsRes.status, 200, `GET /${assetMatch[1]} must return HTTP 200`);

      // 14. Mock Dashboard URL (GET /mock) is accessible in MOCK mode
      const mockRes = await fetch(`${baseUrl}/mock`);
      assert.strictEqual(mockRes.status, 200, 'GET /mock must return HTTP 200');
      const mockHtml = await mockRes.text();
      assert.ok(mockHtml.includes('Mock'), 'GET /mock must serve Mock Dashboard HTML');

      // 15. Socket.io connects and synchronizes snapshot + state patch
      clientSocket = createClient(baseUrl, {
        transports: ['websocket'],
        reconnection: false
      });

      const snapshotPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for game:state_snapshot')), 3000);
        clientSocket.once('game:state_snapshot', (snap) => {
          clearTimeout(timer);
          resolve(snap);
        });
      });

      const initialSnap = await snapshotPromise;
      const snapState = initialSnap && initialSnap.state ? initialSnap.state : initialSnap;
      assert.strictEqual(Array.isArray(snapState.seats), true);
      assert.strictEqual(snapState.seats.length, 6);

      // Trigger a join event via POST /api/mock/events
      const joinRes = await fetch(`${baseUrl}/api/mock/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'ops_test_u1',
          nickname: 'Khách Vận Hành 1',
          eventType: 'CHAT',
          comment: 'nhậu'
        })
      });
      assert.strictEqual(joinRes.status, 200);
      const joinJson = await joinRes.json();
      assert.strictEqual(joinJson.ok, true);
      assert.strictEqual(joinJson.stateResult.stateVersion, 1);
    } finally {
      if (clientSocket) {
        clientSocket.disconnect();
      }
      // 16. Safe shutdown flushes snapshot to disk
      await serverInstance.shutdown();
    }

    assert.strictEqual(
      fs.existsSync(tempSnapPath),
      true,
      'Graceful shutdown must flush pending snapshot to disk'
    );
    const savedSnap = JSON.parse(fs.readFileSync(tempSnapPath, 'utf8'));
    assert.strictEqual(savedSnap.stateVersion, 1);
    assert.strictEqual(savedSnap.seats[0].player.userId, 'ops_test_u1');

    try {
      fs.unlinkSync(tempSnapPath);
    } catch (_) {}
  });

  // ---------------------------------------------------------------------------
  // 4. WINDOWS EXECUTION TEST OF start.bat (Port Conflict Guard & Snapshot Preservation)
  // ---------------------------------------------------------------------------
  await runScenario('4. [WINDOWS EXECUTION TEST] Thực thi start.bat trên Windows khi cổng đang bận -> chặn chạy trùng, báo lỗi dễ hiểu và bảo toàn nguyên vẹn data/state-snapshot.json', async () => {
    const defaultSnapPath = path.join(rootDir, 'data', 'state-snapshot.json');
    const hadExistingSnap = fs.existsSync(defaultSnapPath);
    const backupSnapContent = hadExistingSnap ? fs.readFileSync(defaultSnapPath, 'utf8') : null;

    // Write a sentinel snapshot to verify start.bat does NOT delete it
    const sentinelPayload = JSON.stringify(
      { sentinel: 'DO_NOT_DELETE_ON_START', savedAt: Date.now(), stateVersion: 7 },
      null,
      2
    );
    fs.mkdirSync(path.dirname(defaultSnapPath), { recursive: true });
    fs.writeFileSync(defaultSnapPath, sentinelPayload, 'utf8');

    // Occupy a test port with a live Server instance
    const blockerServer = await startServer(
      defaultConfig.buildConfig({ host: '127.0.0.1', port: 0 }),
      { enableSnapshotPersistence: false }
    );

    try {
      // Pipe an immediate newline into cmd.exe so `pause` exits cleanly when port conflict is detected
      // Override GAME_PORT check by temporarily creating a .env if none exists, or test against occupied port
      const envPath = path.join(rootDir, '.env');
      const hadEnv = fs.existsSync(envPath);
      const backupEnv = hadEnv ? fs.readFileSync(envPath, 'utf8') : null;

      try {
        fs.writeFileSync(
          envPath,
          `HOST=127.0.0.1\nPORT=${blockerServer.port}\nAPP_MODE=MOCK\nADMIN_SECRET_TOKEN=super_secret_should_never_print_999\n`,
          'utf8'
        );

        const proc = spawnSync('cmd.exe', ['/d', '/c', 'start.bat'], {
          cwd: rootDir,
          input: '\r\n',
          encoding: 'utf8',
          timeout: 8000
        });

        const combinedOut = `${proc.stdout || ''}\n${proc.stderr || ''}`;
        if (!combinedOut.includes(`Cong ${blockerServer.port} dang bi chiem`)) {
          console.error('DEBUG start.bat output:', combinedOut);
        }
        assert.strictEqual(proc.status, 1, `start.bat must exit with code 1 when port ${blockerServer.port} is occupied`);
        assert.ok(
          combinedOut.includes(`Cong ${blockerServer.port} dang bi chiem`),
          'start.bat must print clear port conflict message'
        );
        assert.strictEqual(
          combinedOut.includes('super_secret_should_never_print_999'),
          false,
          'start.bat must NEVER print ADMIN_SECRET_TOKEN from .env to terminal'
        );

        // Verify data/state-snapshot.json was untouched
        assert.strictEqual(fs.existsSync(defaultSnapPath), true, 'data/state-snapshot.json must still exist');
        assert.strictEqual(
          fs.readFileSync(defaultSnapPath, 'utf8'),
          sentinelPayload,
          'data/state-snapshot.json content must not be modified or deleted by start.bat check'
        );
      } finally {
        if (hadEnv) {
          fs.writeFileSync(envPath, backupEnv, 'utf8');
        } else {
          try {
            fs.unlinkSync(envPath);
          } catch (_) {}
        }
      }
    } finally {
      await blockerServer.shutdown();
      if (hadExistingSnap && backupSnapContent !== null) {
        fs.writeFileSync(defaultSnapPath, backupSnapContent, 'utf8');
      } else {
        try {
          if (fs.existsSync(defaultSnapPath)) fs.unlinkSync(defaultSnapPath);
        } catch (_) {}
      }
    }
  });

  console.log('----------------------------------------------------------------------');
  console.log(`Task 5.4 Verification Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in test-5.4.js:', err);
  process.exit(1);
});
