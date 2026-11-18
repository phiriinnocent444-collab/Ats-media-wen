import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(message, http = 400) {
    super(message);
    this.http = http;
  }
}

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
const CSRF_SECRET_FILE = path.join(STORAGE_DIR, '.csrf_secret');

let cachedSecret = null;

export function csrfSecret() {
  if (cachedSecret) return cachedSecret;
  try {
    if (fs.existsSync(CSRF_SECRET_FILE)) {
      const val = fs.readFileSync(CSRF_SECRET_FILE, 'utf8').trim();
      if (val.length >= 32) {
        cachedSecret = val;
        return val;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(CSRF_SECRET_FILE, generated, { mode: 0o600 });
    cachedSecret = generated;
    return generated;
  } catch {
    cachedSecret = crypto.createHash('sha256').update(ROOT_DIR).digest('hex');
    return cachedSecret;
  }
}

export function h(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function money(n) {
  const num = Number(n) || 0;
  return 'K' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function moneyWhole(n) {
  const num = Number(n) || 0;
  return 'K' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function todayLusakaYmd(now = new Date()) {
  const lusakaMs = now.getTime() + 2 * 60 * 60 * 1000;
  return new Date(lusakaMs).toISOString().slice(0, 10);
}

export function niceDate(ymd) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!parts) return ymd;
  const d = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function daysUntil(ymd, todayYmd = todayLusakaYmd()) {
  const a = Date.parse(todayYmd + 'T00:00:00Z');
  const b = Date.parse(ymd + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function normalizeMsisdn(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('260')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

export function newId(prefix) {
  const rand = crypto.randomInt(100, 1000);
  return `${prefix}${Date.now()}${rand}`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  const expectedBuf = Buffer.from(hexHash, 'hex');
  const actualBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function csrfTokenCreate(nowSec = Math.floor(Date.now() / 1000)) {
  const ts = String(nowSec);
  const nonce = crypto.randomBytes(12).toString('hex');
  const sig = crypto.createHmac('sha256', csrfSecret()).update(`${ts}.${nonce}`).digest('hex');
  return `${ts}.${nonce}.${sig}`;
}

export function csrfOriginOk(originHeader, hostHeader) {
  const origin = (originHeader || '').trim();
  if (!origin || origin === 'null') return true;
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const serverHost = (hostHeader || '').split(':')[0].toLowerCase();
    return Boolean(originHost && serverHost && originHost === serverHost);
  } catch {
    return false;
  }
}

export function csrfVerify(posted, sessionToken, originOk, nowSec = Math.floor(Date.now() / 1000)) {
  const token = (posted || '').trim();
  if (token && sessionToken && timingSafeEqualStr(sessionToken, token)) {
    return true;
  }
  const parts = token.split('.');
  if (parts.length === 3 && /^\d+$/.test(parts[0]) && parts[1] && parts[2]) {
    const ts = Number(parts[0]);
    const expectedSig = crypto
      .createHmac('sha256', csrfSecret())
      .update(`${parts[0]}.${parts[1]}`)
      .digest('hex');
    const notExpired = ts <= nowSec + 60 && nowSec - ts <= 43200;
    if (notExpired && timingSafeEqualStr(expectedSig, parts[2]) && originOk) {
      return true;
    }
  }
  return false;
}

export function adminTokenCreate(id, name, nowSec = Math.floor(Date.now() / 1000)) {
  const b64 = Buffer.from(name, 'utf8').toString('base64url');
  const payload = `${nowSec}.${id}.${b64}`;
  const sig = crypto.createHmac('sha256', csrfSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function adminTokenVerify(token, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = (token || '').trim().split('.');
  if (parts.length !== 4 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
  const ts = Number(parts[0]);
  if (ts > nowSec + 60 || nowSec - ts > 28800) return null;
  const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const expected = crypto.createHmac('sha256', csrfSecret()).update(payload).digest('hex');
  if (!timingSafeEqualStr(expected, parts[3])) return null;
  try {
    const name = Buffer.from(parts[2], 'base64url').toString('utf8');
    if (!name) return null;
    return { id: Number(parts[1]), name };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

export function buildSetCookie(name, value, options) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    options.httpOnly === false ? '' : 'HttpOnly',
    `SameSite=${options.https ? 'None' : 'Lax'}`,
  ].filter(Boolean);
  if (options.maxAgeSec !== undefined) {
    parts.push(`Max-Age=${Math.max(0, options.maxAgeSec)}`);
  }
  if (options.https) {
    parts.push('Secure', 'Partitioned');
  }
  return parts.join('; ');
}

export function validateBookingInput(input, activeServiceCodes, todayYmd = todayLusakaYmd()) {
  const errors = {};
  const name = String(input.fullName ?? '').trim();
  const phone = normalizeMsisdn(String(input.phone ?? ''));
  const email = String(input.email ?? '').trim();
  const service = String(input.service ?? '').trim();
  const date = String(input.eventDate ?? '').trim();
  const notes = String(input.notes ?? '').trim();

  if (!/^\p{L}[\p{L} .'-]{1,118}$/u.test(name)) {
    errors.fullName = 'Enter your full name (letters only).';
  }
  if (!/^[79]\d{8}$/.test(phone)) {
    errors.phone = 'Enter a valid Zambian number, e.g. 0972971151.';
  }
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'That email address does not look right.';
  }
  if (!activeServiceCodes.includes(service)) {
    errors.service = 'Please choose a package.';
  }
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  let validDate = false;
  if (dateMatch) {
    const y = Number(dateMatch[1]);
    const m = Number(dateMatch[2]);
    const d = Number(dateMatch[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    validDate =
      dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  if (!validDate) {
    errors.eventDate = 'Pick a valid date.';
  } else if (date < todayYmd) {
    errors.eventDate = 'The date cannot be in the past.';
  }
  if (notes.length > 1000) {
    errors.notes = 'Notes are too long (max 1000 characters).';
  }

  return {
    errors,
    clean: { name, phone, email, service, date, notes },
  };
}

export function validateServiceInput(input) {
  const code = String(input.code ?? '').trim().toLowerCase();
  const label = String(input.label ?? '').trim();
  const rawPrice = String(input.price ?? '').trim();
  const price = Number(rawPrice);
  const isActive = input.isActive ? 1 : 0;

  if (!/^[a-z0-9_]{2,20}$/.test(code)) {
    return {
      error: 'Code: 2-20 characters, a-z, 0-9 or _.',
      clean: { code, label, price: 0, isActive },
    };
  }
  if (!label || label.length > 60) {
    return {
      error: 'Label is required (max 60 characters).',
      clean: { code, label, price: 0, isActive },
    };
  }
  if (!rawPrice || Number.isNaN(price) || price <= 0 || price > 1000000) {
    return {
      error: 'Price must be a positive number.',
      clean: { code, label, price: 0, isActive },
    };
  }

  return {
    error: null,
    clean: { code, label, price: Math.round(price * 100) / 100, isActive },
  };
}

export function detectImageExtension(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return '.png';
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  return null;
}

export function logEmail(to, subject, body) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] TO: ${to} | ${subject}\n${body}\n---\n`;
    fs.appendFileSync(path.join(STORAGE_DIR, 'mail.log'), line, 'utf8');
  } catch {
    // Non-fatal
  }
}

export function memberTokenCreate(id, name, nowSec = Math.floor(Date.now() / 1000)) {
  const b64 = Buffer.from(name, 'utf8').toString('base64url');
  const payload = `M.${nowSec}.${id}.${b64}`;
  const sig = crypto.createHmac('sha256', csrfSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function memberTokenVerify(token, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = (token || '').trim().split('.');
  if (parts.length !== 5 || parts[0] !== 'M' || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])) {
    return null;
  }
  const ts = Number(parts[1]);
  if (ts > nowSec + 60 || nowSec - ts > 28800) return null;
  const payload = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`;
  const expected = crypto.createHmac('sha256', csrfSecret()).update(payload).digest('hex');
  if (!timingSafeEqualStr(expected, parts[4])) return null;
  try {
    const name = Buffer.from(parts[3], 'base64url').toString('utf8');
    if (!name) return null;
    return { id: Number(parts[2]), name };
  } catch {
    return null;
  }
}

export function validateMemberRegisterInput(input) {
  const errors = {};
  const fullName = String(input.fullName ?? '').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const phone = normalizeMsisdn(String(input.phone ?? ''));
  const password = String(input.password ?? '');
  const referralCode = String(input.referralCode ?? '').trim().toUpperCase();

  if (!/^\p{L}[\p{L} .'-]{1,118}$/u.test(fullName)) {
    errors.fullName = 'Enter your full name (letters only).';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!/^[79]\d{8}$/.test(phone)) {
    errors.phone = 'Enter a valid Zambian number, e.g. 0972971151.';
  }
  if (password.length < 6 || password.length > 100) {
    errors.password = 'Password must be between 6 and 100 characters.';
  }

  return {
    errors,
    clean: { fullName, email, phone, password, referralCode },
  };
}

export function validateInvestmentPlanInput(input) {
  const code = String(input.code ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const cadence = String(input.cadence ?? 'daily').trim().toLowerCase();
  const roiPercent = Number(String(input.roiPercent ?? '').trim());
  const durationDays = Number(String(input.durationDays ?? '').trim());
  const minAmount = Number(String(input.minAmount ?? '').trim());
  const maxAmount = Number(String(input.maxAmount ?? '').trim());
  const description = String(input.description ?? '').trim();
  const status = String(input.status ?? 'active').trim().toLowerCase() === 'paused' ? 'paused' : 'active';

  if (!/^[a-z0-9_]{2,24}$/.test(code)) {
    return { error: 'Plan code must be 2-24 characters (a-z, 0-9, _).' };
  }
  if (!name || name.length > 80) {
    return { error: 'Plan name is required (max 80 characters).' };
  }
  if (!['daily', 'weekly', 'monthly'].includes(cadence)) {
    return { error: 'Cadence must be daily, weekly, or monthly.' };
  }
  if (Number.isNaN(roiPercent) || roiPercent <= 0 || roiPercent > 500) {
    return { error: 'ROI percent must be between 0.1 and 500.' };
  }
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
    return { error: 'Duration must be a whole number of days (1-3650).' };
  }
  if (Number.isNaN(minAmount) || minAmount < 50) {
    return { error: 'Minimum amount must be at least K50.' };
  }
  if (Number.isNaN(maxAmount) || maxAmount < minAmount || maxAmount > 10000000) {
    return { error: 'Maximum amount must be >= minimum amount.' };
  }

  return {
    error: null,
    clean: {
      code,
      name,
      cadence,
      roiPercent: Math.round(roiPercent * 100) / 100,
      durationDays,
      minAmount: Math.round(minAmount * 100) / 100,
      maxAmount: Math.round(maxAmount * 100) / 100,
      description: description.slice(0, 300),
      status,
    },
  };
}

export function validateKycInput(input) {
  const idType = String(input.idType ?? '').trim();
  const idNumber = String(input.idNumber ?? '').trim().toUpperCase();
  if (!['NRC', 'Passport', 'Driver License'].includes(idType)) {
    return { error: 'Select a valid document type (NRC, Passport, or Driver License).' };
  }
  if (!/^[A-Z0-9\/-]{5,30}$/.test(idNumber)) {
    return { error: 'Enter a valid document number (5-30 alphanumeric characters, / or -).' };
  }
  return { error: null, clean: { idType, idNumber } };
}

