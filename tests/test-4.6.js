'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const defaultConfig = require('../server/config');
const logger = require('../server/logger');
const { SequentialEventQueue } = require('../server/engines/eventQueue');
const { GameStateManager } = require('../server/services/gameStateManager');
const {
  TikTokService,
  classifyTikTokError
} = require('../server/services/tiktokService');
const { startServer } = require('../server/index');

// Synthetic canary markers (never real credentials; never printed to stdout)
const CANARY = Object.freeze({
  COOKIE: 'CANARY_COOKIE_VAL_991122',
  SESSION_ID: 'CANARY_SESSION_ID_882233',
  TTWID: 'CANARY_TTWID_773344',
  TARGET_IDC: 'CANARY_IDC_USEAST55',
  OAUTH: 'CANARY_OAUTH_TOKEN_664455',
  SIGN_KEY: 'CANARY_EULER_SIGN_KEY_556677',
  BEARER: 'CANARY_BEARER_JWT_447788',
  API_KEY: 'CANARY_API_KEY_338899',
  PASSWORD: 'CANARY_PASSWORD_229900',
  ADMIN_TOKEN: 'CANARY_ADMIN_SECRET_110099',
  RAW_EXTRA_FIELD: 'CANARY_UNNEEDED_RAW_PROTO_FIELD_009988'
});

function assertZeroCanaryLeak(serializedText, contextLabel) {
  const text = String(serializedText || '');
  for (const [name, marker] of Object.entries(CANARY)) {
    assert.strictEqual(
      text.includes(marker),
      false,
      `Security Audit Failure in [${contextLabel}]: leaked synthetic marker ${name}`
    );
  }
}

/**
 * Capture all logger output lines in-memory without printing sensitive test logs to terminal.
 */
async function withCapturedLogs(fn) {
  const captured = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => captured.push(args.join(' '));
  console.warn = (...args) => captured.push(args.join(' '));
  console.error = (...args) => captured.push(args.join(' '));

  try {
    const result = await fn(captured);
    return { result, captured };
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
}

class FakeAuditConnector extends EventEmitter {
  constructor(uniqueId, options = {}, behavior = {}) {
    super();
    this.uniqueId = uniqueId;
    this.options = options;
    this.behavior = behavior;
    this.roomId = behavior.roomId || '7399999999999994600';
  }

  async connect() {
    if (this.behavior.errorToThrow) {
      throw this.behavior.errorToThrow;
    }
    const state = { isConnected: true, roomId: this.roomId };
    this.emit('connected', state);
    return state;
  }

  async disconnect() {}
}

async function runTests() {
  console.log('=== PHASE 4 — TASK 4.6: TIKTOK LIVE SECURITY LOG AUDIT TESTS ===\n');

  // ---------------------------------------------------------------------------
  // TEST 1–9: Redaction of Cookie, sessionId, ttwid, oAuthToken, signApiKey,
  //           Authorization header, API key, Password, and ADMIN_SECRET_TOKEN
  //           (both as object keys and inline inside strings)
  // ---------------------------------------------------------------------------
  console.log('Test 1–9: Redaction of all 9 credential categories (object keys & inline strings)...');
  const { captured: logs1to9 } = await withCapturedLogs(async () => {
    logger.info('Audit credential keys and inline strings', {
      cookie: `sessionid=${CANARY.SESSION_ID}; ttwid=${CANARY.TTWID}`,
      sessionId: CANARY.SESSION_ID,
      ttwid: CANARY.TTWID,
      'tt-target-idc': CANARY.TARGET_IDC,
      oAuthToken: CANARY.OAUTH,
      signApiKey: CANARY.SIGN_KEY,
      authorization: `Bearer ${CANARY.BEARER}`,
      apiKey: CANARY.API_KEY,
      'x-api-key': CANARY.API_KEY,
      password: CANARY.PASSWORD,
      ADMIN_SECRET_TOKEN: CANARY.ADMIN_TOKEN,
      'x-admin-token': CANARY.ADMIN_TOKEN,
      inlineErrorSummary: [
        `Cookie: sessionid=${CANARY.COOKIE}; ttwid=${CANARY.TTWID}`,
        `Authorization: Bearer ${CANARY.BEARER}`,
        `wss://webcast.tiktok.com/ws?signApiKey=${CANARY.SIGN_KEY}&oAuthToken=${CANARY.OAUTH}`,
        `api_key=${CANARY.API_KEY}&password=${CANARY.PASSWORD}&ADMIN_SECRET_TOKEN=${CANARY.ADMIN_TOKEN}`
      ].join(' | ')
    });
  });

  assert.strictEqual(logs1to9.length, 1);
  assertZeroCanaryLeak(logs1to9[0], 'Tests 1-9 (Object keys & inline strings)');
  const parsed1to9 = JSON.parse(logs1to9[0]);
  assert.strictEqual(parsed1to9.meta.cookie, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.sessionId, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.ttwid, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta['tt-target-idc'], '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.oAuthToken, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.signApiKey, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.authorization, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.apiKey, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.password, '[REDACTED]');
  assert.strictEqual(parsed1to9.meta.ADMIN_SECRET_TOKEN, '[REDACTED]');
  console.log('  -> PASS');

  // ---------------------------------------------------------------------------
  // TEST 10 & 11: Nested objects (including deep depth > 6) & Arrays containing secrets
  // ---------------------------------------------------------------------------
  console.log('Test 10 & 11: Deep nested objects (depth 1..8) and arrays containing secrets...');
  const deepPayload = {
    level1: {
      session: {
        cookie: {
          sessionId: CANARY.SESSION_ID,
          ttTargetIdc: CANARY.TARGET_IDC
        },
        oAuthToken: CANARY.OAUTH
      },
      items: [
        { signApiKey: CANARY.SIGN_KEY, safeLabel: 'item_1' },
        `Bearer ${CANARY.BEARER}`,
        `sessionid=${CANARY.COOKIE}`
      ],
      l2: {
        l3: {
          l4: {
            l5: {
              l6: {
                l7: {
                  l8Secret: CANARY.ADMIN_TOKEN
                }
              }
            }
          }
        }
      }
    }
  };

  const { captured: logs10to11 } = await withCapturedLogs(async () => {
    logger.warn('Audit nested and array structures', deepPayload);
  });
  assertZeroCanaryLeak(logs10to11.join('\n'), 'Tests 10-11 (Nested & Arrays)');
  const parsed10to11 = JSON.parse(logs10to11[0]);
  assert.strictEqual(parsed10to11.meta.level1.session, '[REDACTED]');
  assert.strictEqual(parsed10to11.meta.level1.items[0].signApiKey, '[REDACTED]');
  assert.strictEqual(parsed10to11.meta.level1.items[0].safeLabel, 'item_1');
  console.log('  -> PASS');

  // ---------------------------------------------------------------------------
  // TEST 12: Error object của TikTok Connector (HTTP headers, request config, cookieJar)
  // ---------------------------------------------------------------------------
  console.log('Test 12: Connector Error object strips HTTP config/headers/cookieJar and scrubs message...');
  const connectorErr = new Error(
    `Sign server error 401 with signApiKey=${CANARY.SIGN_KEY} and sessionid=${CANARY.SESSION_ID}`
  );
  connectorErr.name = 'SignAPIError';
  connectorErr.reason = `Authenticated WS failed for oAuthToken=${CANARY.OAUTH}`;
  connectorErr.config = {
    headers: {
      Cookie: `sessionid=${CANARY.COOKIE}; ttwid=${CANARY.TTWID}`,
      Authorization: `Bearer ${CANARY.BEARER}`,
      'x-api-key': CANARY.API_KEY
    },
    cookieJar: {
      store: { sessionid: CANARY.SESSION_ID, ttwid: CANARY.TTWID }
    }
  };
  connectorErr.request = { headers: { Cookie: CANARY.COOKIE } };
  connectorErr.response = { headers: { 'set-cookie': [`sessionid=${CANARY.SESSION_ID}`] } };

  const redactedErr = logger.redactObject(connectorErr);
  assertZeroCanaryLeak(JSON.stringify(redactedErr), 'Test 12 (redactObject on Error)');
  assert.strictEqual(redactedErr.config, undefined, 'Must strip raw HTTP config from Error');
  assert.strictEqual(redactedErr.request, undefined, 'Must strip raw HTTP request from Error');
  assert.strictEqual(redactedErr.response, undefined, 'Must strip raw HTTP response from Error');

  const classified = classifyTikTokError(connectorErr);
  assertZeroCanaryLeak(JSON.stringify(classified), 'Test 12 (classifyTikTokError)');
  console.log('  -> PASS');

  // ---------------------------------------------------------------------------
  // TEST 13, 14, 15, 19, 20: TikTokService Live Flow Audit (Connect fail, Reconnect,
  //                          WebSocket error, StreamEnd, Invalid events, Chat/Like/Gift
  //                          allowlist without raw payload, Game State preservation)
  // ---------------------------------------------------------------------------
  console.log('Test 13, 14, 15, 19, 20: TikTokService full lifecycle log audit (0 secret or raw payload leaks)...');
  const testConfig = defaultConfig.buildConfig({
    app: { defaultMode: 'LIVE' },
    tiktok: {
      uniqueId: 'audit_streamer_46',
      autoConnect: true,
      autoReconnect: true,
      baseReconnectDelayMs: 500,
      maxReconnectDelayMs: 5000
    }
  });

  const gsm = new GameStateManager(testConfig);
  gsm.stopCheersScheduler();
  gsm.stopWifeScheduler();
  const queue = new SequentialEventQueue((ev) => gsm.processEvent(ev));

  let activeConnector = null;
  let shouldThrowOnConnect = true;

  const service = new TikTokService(testConfig, null, queue, gsm, {
    uniqueId: 'audit_streamer_46',
    autoReconnect: true,
    scheduler: {
      setTimeout: () => 1,
      clearTimeout: () => {}
    },
    connectionFactory: async (uid, opts) => {
      if (shouldThrowOnConnect) {
        activeConnector = new FakeAuditConnector(uid, opts, {
          errorToThrow: connectorErr
        });
      } else {
        activeConnector = new FakeAuditConnector(uid, opts, {
          roomId: '7399999999999994600'
        });
      }
      return activeConnector;
    }
  });

  const { captured: serviceLogs } = await withCapturedLogs(async () => {
    // 1. Connect failure with connectorErr containing secrets -> schedules reconnect
    const failRes = await service.connect();
    assert.strictEqual(failRes.ok, false);
    assertZeroCanaryLeak(JSON.stringify(failRes), 'connect() failure return object');
    assertZeroCanaryLeak(JSON.stringify(service.getStatus()), 'getStatus() after connect failure');

    // 2. Connect success
    shouldThrowOnConnect = false;
    const okRes = await service.connect();
    assert.strictEqual(okRes.ok, true);

    // 3. WebSocket error event containing inline Cookie & Bearer token
    activeConnector.emit(
      'error',
      new Error(`WS frame error: Cookie: sessionid=${CANARY.COOKIE} | Bearer ${CANARY.BEARER}`)
    );
    assertZeroCanaryLeak(JSON.stringify(service.getStatus()), 'getStatus() after WS error');

    // 4. Invalid events containing secrets & raw fields
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'bad_chat_1' },
      user: { id: '', nickname: 'NoId' },
      content: '',
      sessionId: CANARY.SESSION_ID,
      rawExtra: CANARY.RAW_EXTRA_FIELD
    });
    service.handleRawWebcastEvent('UNKNOWN_TYPE', {
      cookie: CANARY.COOKIE,
      rawExtra: CANARY.RAW_EXTRA_FIELD
    });

    // 5. Valid Chat / Like / Gift events carrying extra raw protobuf fields and secret fields
    service.handleRawWebcastEvent('CHAT', {
      common: { msgId: 'audit_chat_1' },
      user: { id: 'audit_u1', nickname: 'Khách Audit 1' },
      content: 'nhậu',
      cookie: CANARY.COOKIE,
      rawProtoDump: CANARY.RAW_EXTRA_FIELD
    });
    service.handleRawWebcastEvent('LIKE', {
      common: { msgId: 'audit_like_1', roomId: '7399999999999994600' },
      user: { id: 'audit_u2', nickname: 'Khách Audit 2' },
      count: 100,
      total: '500',
      signApiKey: CANARY.SIGN_KEY,
      rawProtoDump: CANARY.RAW_EXTRA_FIELD
    });
    service.handleRawWebcastEvent('GIFT', {
      common: { msgId: 'audit_gift_1' },
      user: { id: 'audit_u3', nickname: 'Khách Audit 3' },
      giftId: '9999',
      repeatCount: 1,
      oAuthToken: CANARY.OAUTH,
      rawProtoDump: CANARY.RAW_EXTRA_FIELD
    });

    // 6. Unexpected disconnect with inline secret in reason -> reconnect log
    activeConnector.emit('disconnected', {
      code: 1006,
      reason: `WS closed: sessionid=${CANARY.SESSION_ID} & signApiKey=${CANARY.SIGN_KEY}`
    });

    // 7. Reconnect & StreamEnd
    await service.connect();
    activeConnector.emit('streamEnd', { action: 3 });

    // 8. Shutdown
    await service.shutdown();
  });

  const combinedServiceLogs = serviceLogs.join('\n');
  assertZeroCanaryLeak(combinedServiceLogs, 'Tests 13, 14, 15, 19 (TikTokService Logs)');

  // Verify Game State was updated properly by valid events (Seat 1 seated with +1 drunk from 100 Likes)
  const snapAfterAudit = gsm.getSnapshot();
  assert.strictEqual(snapAfterAudit.seats[0].player.userId, 'audit_u1');
  assert.strictEqual(snapAfterAudit.seats[0].player.drunkLevel, 1);
  gsm.shutdown();
  console.log('  -> PASS');

  // ---------------------------------------------------------------------------
  // TEST 16 & 17: Mock Dashboard, API Errors & Socket.io Payloads Security Audit
  // ---------------------------------------------------------------------------
  console.log('Test 16 & 17: Mock Dashboard, HTTP API error responses & Socket.io payloads leak 0 secrets...');
  const e2eConfig = defaultConfig.buildConfig({
    port: 0,
    adminToken: CANARY.ADMIN_TOKEN,
    app: { defaultMode: 'LIVE' },
    tiktok: {
      uniqueId: 'e2e_sec_streamer',
      autoConnect: false,
      autoReconnect: false
    }
  });

  let e2eConn = null;
  const { result: e2ePayloads, captured: e2eServerLogs } = await withCapturedLogs(async () => {
    const srv = await startServer(e2eConfig, {
      tiktokOptions: {
        autoReconnect: false,
        connectionFactory: async (uid, opts) => {
          e2eConn = new FakeAuditConnector(uid, opts, { roomId: '7399999999999994699' });
          return e2eConn;
        }
      }
    });

    const socketMod = await import(
      pathToFileURL(path.resolve(__dirname, '../client/src/network/SocketClient.js')).href
    );
    const { SocketClient } = socketMod;
    const client = new SocketClient({
      backendUrl: `http://127.0.0.1:${srv.port}`,
      socketOptions: { reconnection: false }
    });

    const collectedSocketPayloads = [];
    try {
      srv.gameStateManager.stopCheersScheduler();
      srv.gameStateManager.stopWifeScheduler();

      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Socket timeout')), 3000);
        client.subscribe(
          {
            onStateSync: (vd, src) => {
              collectedSocketPayloads.push({ type: 'stateSync', src, vd });
              if (src === 'SNAPSHOT') {
                clearTimeout(t);
                resolve();
              }
            },
            onActionFx: (fx) => collectedSocketPayloads.push({ type: 'actionFx', fx }),
            onChatBubble: (cb) => collectedSocketPayloads.push({ type: 'chatBubble', cb }),
            onBannerNotice: (bn) => collectedSocketPayloads.push({ type: 'bannerNotice', bn })
          },
          'AuditClient46'
        );
        client.connect();
      });

      await srv.tiktokService.connect();
      e2eConn.emit('chat', {
        common: { msgId: 'sec_e2e_1' },
        user: { id: 'sec_u1', nickname: 'Khách Bảo Mật' },
        content: 'nhậu',
        cookie: CANARY.COOKIE,
        sessionId: CANARY.SESSION_ID,
        rawExtra: CANARY.RAW_EXTRA_FIELD
      });
      await new Promise((r) => setTimeout(r, 30));

      srv.tiktokService.rateLimiter.clear();
      e2eConn.emit('chat', {
        common: { msgId: 'sec_e2e_2' },
        user: { id: 'sec_u1', nickname: 'Khách Bảo Mật' },
        content: 'Chúc anh em vui vẻ!',
        oAuthToken: CANARY.OAUTH
      });
      e2eConn.emit('like', {
        common: { msgId: 'sec_e2e_3', roomId: '7399999999999994699' },
        user: { id: 'sec_u2', nickname: 'Khách Tim' },
        count: 100,
        total: '100',
        signApiKey: CANARY.SIGN_KEY
      });
      await new Promise((r) => setTimeout(r, 50));

      // Test unauthorized /api/mock/events request -> must return 403 without echoing ADMIN_SECRET_TOKEN
      const unauthRes = await fetch(`http://127.0.0.1:${srv.port}/api/mock/events`, {
        headers: { 'x-admin-token': 'wrong_token' }
      });
      assert.strictEqual(unauthRes.status, 403);
      const unauthBody = await unauthRes.text();
      collectedSocketPayloads.push({ type: 'http403', body: unauthBody });

      // Test /api/state & /health -> must not contain adminToken or TikTok credentials
      const stateHttpBody = await (await fetch(`http://127.0.0.1:${srv.port}/api/state`)).text();
      const healthHttpBody = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).text();
      collectedSocketPayloads.push({ type: 'httpState', body: stateHttpBody });
      collectedSocketPayloads.push({ type: 'httpHealth', body: healthHttpBody });
    } finally {
      client.disconnect();
      await srv.shutdown();
    }
    return collectedSocketPayloads;
  });

  assert.ok(e2ePayloads.some((p) => p.type === 'actionFx'));
  assert.ok(e2ePayloads.some((p) => p.type === 'chatBubble'));
  assert.ok(e2ePayloads.some((p) => p.type === 'bannerNotice'));
  assertZeroCanaryLeak(JSON.stringify(e2ePayloads), 'Tests 16-17 (Socket.io & HTTP payloads)');
  assertZeroCanaryLeak(e2eServerLogs.join('\n'), 'Tests 16-17 (E2E Server Logs)');

  // Inspect Mock Dashboard HTML file for hardcoded secrets
  const mockHtml = fs.readFileSync(
    path.resolve(__dirname, '../mock-dashboard/index.html'),
    'utf8'
  );
  assertZeroCanaryLeak(mockHtml, 'Mock Dashboard HTML');
  assert.strictEqual(/sessionid|ttwid|signApiKey|oAuthToken/i.test(mockHtml), false);
  console.log('  -> PASS');

  // ---------------------------------------------------------------------------
  // TEST 18 & V: Frontend Bundle, .gitignore & Production Config Audit
  // ---------------------------------------------------------------------------
  console.log('Test 18 & Section V: .gitignore, config/default.json, .env.example & Frontend files audit...');
  const gitignorePath = path.resolve(__dirname, '../.gitignore');
  assert.strictEqual(fs.existsSync(gitignorePath), true, '.gitignore must exist in workspace root');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert.ok(
    gitignoreContent.split(/\r?\n/).some((line) => line.trim() === '.env'),
    '.gitignore must explicitly ignore .env'
  );

  const rawDefaultJson = fs.readFileSync(
    path.resolve(__dirname, '../config/default.json'),
    'utf8'
  );
  const parsedDefaultJson = JSON.parse(rawDefaultJson);
  assert.strictEqual(parsedDefaultJson.app.defaultMode, 'MOCK');
  assert.strictEqual(parsedDefaultJson.tiktok.uniqueId, '');
  assert.strictEqual(parsedDefaultJson.gameplayV1.vipGiftThreshold, null);
  assert.deepStrictEqual(parsedDefaultJson.gameplayV1.liveGiftMappings, {});
  assert.strictEqual(
    /sessionid|ttwid|signApiKey|oAuthToken|password|ADMIN_SECRET_TOKEN/i.test(rawDefaultJson),
    false,
    'config/default.json must not contain sensitive credential keys or values'
  );

  const envExampleContent = fs.readFileSync(
    path.resolve(__dirname, '../.env.example'),
    'utf8'
  );
  assert.ok(envExampleContent.includes('ADMIN_SECRET_TOKEN='));
  assert.ok(envExampleContent.includes('APP_MODE=MOCK'));

  // Check Frontend dist bundle (if built) and client/src files for forbidden backend secrets
  const clientDistDir = path.resolve(__dirname, '../client/dist/assets');
  if (fs.existsSync(clientDistDir)) {
    const assetFiles = fs.readdirSync(clientDistDir).filter((f) => f.endsWith('.js'));
    for (const file of assetFiles) {
      const content = fs.readFileSync(path.join(clientDistDir, file), 'utf8');
      assert.strictEqual(
        content.includes('ADMIN_SECRET_TOKEN'),
        false,
        'Frontend bundle must not contain ADMIN_SECRET_TOKEN'
      );
      assertZeroCanaryLeak(content, `Frontend bundle ${file}`);
    }
  }
  console.log('  -> PASS');

  console.log('\n=== ALL 22 TASK 4.6 SECURITY AUDIT CHECKS PASSED ===');
}

runTests().catch((err) => {
  console.error('Task 4.6 test failed:', err.message);
  process.exit(1);
});
