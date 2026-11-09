'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const defaultConfigPath = path.resolve(__dirname, '..', 'config', 'default.json');
const rawDefault = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) {
    return parsed;
  }
  return fallback;
}

function parseCorsOrigins(envValue, fallbackList) {
  if (!envValue || typeof envValue !== 'string') {
    return fallbackList;
  }
  const origins = envValue
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '*');
  return origins.length > 0 ? origins : fallbackList;
}

function buildConfig(overrides = {}) {
  const env = overrides.env || process.env.NODE_ENV || 'development';
  const host = overrides.host || process.env.HOST || rawDefault.server.host || '127.0.0.1';
  const port =
    overrides.port !== undefined
      ? parsePort(overrides.port, rawDefault.server.port)
      : parsePort(process.env.PORT, rawDefault.server.port);
  const rawCorsOrigins =
    overrides.corsOrigins || parseCorsOrigins(process.env.CORS_ORIGINS, rawDefault.server.corsOrigins);
  const corsOrigins = Array.isArray(rawCorsOrigins)
    ? rawCorsOrigins.filter((item) => typeof item === 'string' && item.trim().length > 0 && item.trim() !== '*')
    : rawDefault.server.corsOrigins;
  const adminToken =
    overrides.adminToken !== undefined
      ? String(overrides.adminToken)
      : String(process.env.ADMIN_SECRET_TOKEN || '');

  const envAppMode =
    process.env.APP_MODE && ['MOCK', 'LIVE'].includes(String(process.env.APP_MODE).toUpperCase().trim())
      ? String(process.env.APP_MODE).toUpperCase().trim()
      : null;

  const rawTikTokDefault = rawDefault.tiktok || {
    uniqueId: '',
    autoConnect: true,
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false,
    baseReconnectDelayMs: 1000,
    maxReconnectDelayMs: 60000,
    reconnectBackoffFactor: 2,
    reconnectJitterRatio: 0.2,
    maxReconnectAttempts: 10,
    connectTimeoutMs: 15000
  };
  const tiktokOverrides = overrides.tiktok || {};
  const resolvedUniqueId =
    tiktokOverrides.uniqueId !== undefined
      ? String(tiktokOverrides.uniqueId).trim()
      : String(process.env.TIKTOK_UNIQUE_ID || rawTikTokDefault.uniqueId || '').trim();
  const resolvedAutoConnect =
    typeof tiktokOverrides.autoConnect === 'boolean'
      ? tiktokOverrides.autoConnect
      : process.env.TIKTOK_AUTO_CONNECT !== undefined
        ? process.env.TIKTOK_AUTO_CONNECT !== 'false' && process.env.TIKTOK_AUTO_CONNECT !== '0'
        : Boolean(rawTikTokDefault.autoConnect);

  return Object.freeze({
    app: Object.freeze({
      ...rawDefault.app,
      ...(envAppMode ? { defaultMode: envAppMode } : {}),
      ...(overrides.app || {})
    }),
    env,
    server: Object.freeze({
      host,
      port,
      corsOrigins: Object.freeze([...corsOrigins])
    }),
    adminToken,
    security: Object.freeze({
      rateLimitBypassInMock: true,
      ...rawDefault.security,
      ...(overrides.security || {})
    }),
    gameplayV1: Object.freeze({
      ...rawDefault.gameplayV1,
      ...(overrides.gameplayV1 || {}),
      joinKeywords: Object.freeze([
        ...((overrides.gameplayV1 && overrides.gameplayV1.joinKeywords) || rawDefault.gameplayV1.joinKeywords)
      ])
    }),
    gameplayV2: Object.freeze({
      ...(rawDefault.gameplayV2 || {}),
      ...(overrides.gameplayV2 || {})
    }),
    tiktok: Object.freeze({
      ...rawTikTokDefault,
      ...tiktokOverrides,
      uniqueId: resolvedUniqueId,
      autoConnect: resolvedAutoConnect
    }),
    mockSimulator: Object.freeze({
      maxRecentEvents: rawDefault.mockSimulator.maxRecentEvents,
      mockGifts: Object.freeze({ ...rawDefault.mockSimulator.mockGifts })
    }),
    buildConfig,
    buildV2Config
  });
}

function buildV2Config(overrides = {}) {
  const v2Defaults = rawDefault.gameplayV2 || {};
  return buildConfig({
    ...overrides,
    app: {
      ...rawDefault.app,
      masterPlanVersion: '2.0',
      phase: '2.1',
      ...(overrides.app || {})
    },
    gameplayV1: {
      ...rawDefault.gameplayV1,
      ...v2Defaults,
      autoResolveTikTokGifts: true,
      ...(overrides.gameplayV1 || {})
    }
  });
}

const config = buildConfig();

module.exports = config;
