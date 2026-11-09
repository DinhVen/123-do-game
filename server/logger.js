'use strict';

const SENSITIVE_KEYS = new Set([
  'token',
  'x-admin-token',
  'admintoken',
  'admin_secret_token',
  'cookie',
  'cookies',
  'set-cookie',
  'cookiejar',
  'session',
  'sessionid',
  'session_id',
  'sid_tt',
  'sid_guard',
  'uid_tt',
  'odin_tt',
  'ttwid',
  'tt-target-idc',
  'tt_target_idc',
  'mstoken',
  'ms_token',
  'signapikey',
  'sign_api_key',
  'apikey',
  'api_key',
  'x-api-key',
  'oauthtoken',
  'oauth_token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'proxy-authorization',
  'password',
  'passwd',
  'secret',
  'secretkey',
  'secret_key',
  'privatekey',
  'private_key',
  'credentials',
  'headers',
  'clientheaders',
  'webclientoptions',
  'wsclientoptions',
  'rawpayload',
  'rawdata'
]);

const SENSITIVE_KEY_PATTERN =
  /(cookie|sessionid|session_id|sid_tt|sid_guard|uid_tt|odin_tt|ttwid|tt[-_]?target[-_]?idc|ms[-_]?token|oauth|sign[-_]?api[-_]?key|api[-_]?key|admin[-_]?secret|x[-_]?admin[-_]?token|authorization|password|passwd|secret[-_]?token|private[-_]?key|access[-_]?token|refresh[-_]?token)/i;

const FORBIDDEN_ERROR_INTERNALS = new Set([
  'config',
  'request',
  'response',
  'options',
  'headers',
  'rawheaders',
  'cookiejar',
  '_webclient',
  '_wsclientinstance',
  'socket',
  'agent',
  'client'
]);

function isSensitiveKey(key) {
  if (typeof key !== 'string') {
    return false;
  }
  const lower = key.toLowerCase().trim();
  return SENSITIVE_KEYS.has(lower) || SENSITIVE_KEY_PATTERN.test(lower);
}

function redactString(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return input;
  }
  let out = input;

  // 1. Scrub Cookie / Set-Cookie header lines
  out = out.replace(/\b(Cookie|Set-Cookie)\s*:\s*([^\r\n"|]+)/gi, '$1: [REDACTED]');

  // 2. Scrub Authorization / Proxy-Authorization headers and Bearer tokens
  out = out.replace(
    /\b(Authorization|Proxy-Authorization)\s*([=:])\s*(?:Bearer\s+|Basic\s+)?([^\s"',;}\]]+)/gi,
    '$1$2 [REDACTED]'
  );
  out = out.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]');

  // 3. Scrub key=value or key: value secret assignments in URLs, query strings, cookies, or messages
  out = out.replace(
    /\b(sessionid|session_id|sid_tt|sid_guard|uid_tt|odin_tt|ttwid|tt-target-idc|tt_target_idc|msToken|ms_token|oAuthToken|oauth_token|signApiKey|sign_api_key|apiKey|api_key|x-api-key|x-admin-token|adminToken|ADMIN_SECRET_TOKEN|password|passwd|secret|access_token|refresh_token)\s*([=:])\s*([^\s;&"',}\]]+)/gi,
    '$1$2[REDACTED]'
  );

  return out;
}

function redactObject(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (depth > 6) {
    return '[TRUNCATED_DEPTH]';
  }
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, depth + 1, seen));
  }

  if (value instanceof Error) {
    const safeError = {
      name: typeof value.name === 'string' ? value.name : 'Error',
      message: redactString(typeof value.message === 'string' ? value.message : 'Error')
    };
    if (value.code !== undefined && (typeof value.code === 'string' || typeof value.code === 'number')) {
      safeError.code = redactObject(value.code, depth + 1, seen);
    }
    if (typeof value.reason === 'string') {
      safeError.reason = redactString(value.reason);
    }
    if (typeof value.category === 'string') {
      safeError.category = value.category;
    }
    if (typeof value.recoverable === 'boolean') {
      safeError.recoverable = value.recoverable;
    }
    for (const [k, v] of Object.entries(value)) {
      const lowerKey = String(k).toLowerCase().trim();
      if (FORBIDDEN_ERROR_INTERNALS.has(lowerKey)) {
        continue;
      }
      if (isSensitiveKey(k)) {
        safeError[k] = '[REDACTED]';
      } else if (!(k in safeError)) {
        safeError[k] = redactObject(v, depth + 1, seen);
      }
    }
    return safeError;
  }

  const clean = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = redactObject(v, depth + 1, seen);
    }
  }
  return clean;
}

function pickAllowedMeta(meta, allowedKeys = null) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return redactObject(meta);
  }
  if (!Array.isArray(allowedKeys) || allowedKeys.length === 0) {
    return redactObject(meta);
  }
  const filtered = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(meta, key) && meta[key] !== undefined) {
      filtered[key] = meta[key];
    }
  }
  return redactObject(filtered);
}

function writeLog(level, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: redactString(String(message ?? ''))
  };
  if (meta !== undefined) {
    entry.meta = redactObject(meta);
  }
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
  return entry;
}

module.exports = {
  info: (msg, meta) => writeLog('info', msg, meta),
  warn: (msg, meta) => writeLog('warn', msg, meta),
  error: (msg, meta) => writeLog('error', msg, meta),
  redactObject,
  redactString,
  isSensitiveKey,
  pickAllowedMeta
};
