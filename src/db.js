import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  HttpError,
  hashPassword,
  newId,
  normalizeMsisdn,
  todayLusakaYmd,
  validateBookingInput,
  validateInvestmentPlanInput,
  validateKycInput,
  validateMemberRegisterInput,
  validateServiceInput,
} from './security.js';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
const DEFAULT_DB_PATH = path.join(STORAGE_DIR, 'ats_media_house.sqlite');
const LEGACY_JSON_PATH = path.join(STORAGE_DIR, 'db.json');
const UPLOADS_GALLERY_DIR = path.join(ROOT_DIR, 'uploads', 'gallery');

const GALLERY_FILENAME_MAP = {
  'gallery_wedding_ceremony_1794837382397.jpg': 'wedding_reception.jpg',
  'gallery_corporate_headshot_1794837382217.jpg': 'corporate_portrait.jpg',
  'gallery_event_coverage_1794837382832.jpg': 'annual_gala.jpg',
  'gallery_graduation_shoot_1794837383565.jpg': 'unza_graduation.jpg',
};

function resolveGalleryFilename(filename) {
  const mapped = GALLERY_FILENAME_MAP[filename] ?? filename;
  if (fs.existsSync(path.join(UPLOADS_GALLERY_DIR, mapped))) {
    return mapped;
  }
  return filename;
}

export class StudioDatabase {
  constructor(dbPath = DEFAULT_DB_PATH, seedFromJson = true) {
    this.inTx = false;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.sqlite = new DatabaseSync(dbPath);
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    if (dbPath !== ':memory:') {
      this.sqlite.exec('PRAGMA journal_mode = WAL;');
    }
    this.bookingSelectSql = `
      SELECT b.booking_id AS id, b.customer_id AS customerId, b.service_id AS serviceId,
             c.full_name AS fullName, c.phone, c.email,
             s.code AS service, s.label AS serviceLabel, b.amount_due AS amount,
             b.event_date AS eventDate, b.notes, b.status, b.created_at AS createdAt
      FROM bookings b
      JOIN customers c ON c.customer_id = b.customer_id
      JOIN services s ON s.service_id = b.service_id
    `;
    this.initSchema(seedFromJson);
  }

  initSchema(seedFromJson) {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        email TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS services (
        service_id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS bookings (
        booking_id TEXT PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        amount_due REAL NOT NULL,
        event_date TEXT NOT NULL,
        notes TEXT NULL,
        status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','cancelled')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
        FOREIGN KEY (service_id) REFERENCES services(service_id)
      );

      CREATE INDEX IF NOT EXISTS idx_bookings_status_date ON bookings(status, event_date);
      CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);

      CREATE TABLE IF NOT EXISTS payments (
        transaction_id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        msisdn TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED')),
        airtel_response TEXT NULL,
        error TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_checked TEXT NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id, status);

      CREATE TABLE IF NOT EXISTS admin_users (
        admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS gallery (
        photo_id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        thumb TEXT NOT NULL,
        uploaded_by INTEGER NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (uploaded_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        wallet_balance REAL NOT NULL DEFAULT 0,
        referral_code TEXT NOT NULL UNIQUE,
        referred_by INTEGER NULL,
        kyc_status TEXT NOT NULL DEFAULT 'unverified' CHECK (kyc_status IN ('unverified','pending','verified','rejected')),
        kyc_id_type TEXT NULL,
        kyc_id_number TEXT NULL,
        two_fa_enabled INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (referred_by) REFERENCES users(user_id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS investment_plans (
        plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
        roi_percent REAL NOT NULL,
        duration_days INTEGER NOT NULL,
        min_amount REAL NOT NULL,
        max_amount REAL NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS investments (
        investment_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        plan_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        expected_return REAL NOT NULL,
        credited_return REAL NOT NULL DEFAULT 0,
        cadence TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
        started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        matures_at TEXT NOT NULL,
        last_payout_at TEXT NULL,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES investment_plans(plan_id)
      );

      CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id, status);

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        wtx_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('deposit','withdrawal','investment','roi_payout','transfer_in','transfer_out','referral_bonus','booking_payment','admin_adjust')),
        method TEXT NOT NULL,
        reference TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','FAILED','REJECTED')),
        note TEXT NULL,
        counterparty TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        processed_at TEXT NULL,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_wtx_user ON wallet_transactions(user_id, created_at);

      CREATE TABLE IF NOT EXISTS support_tickets (
        ticket_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ticket_messages (
        message_id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        sender_role TEXT NOT NULL CHECK (sender_role IN ('user','admin')),
        sender_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(ticket_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notifications (
        notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const svcCount = Number(this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM services').get().cnt);
    if (svcCount === 0) {
      if (seedFromJson && fs.existsSync(LEGACY_JSON_PATH)) {
        this.seedFromJsonFile(LEGACY_JSON_PATH);
      } else {
        this.seedDefaults();
      }
    }

    this.seedPortalDefaults();
  }

  seedPortalDefaults() {
    const planCount = Number(this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM investment_plans').get().cnt);
    if (planCount > 0) return;

    this.withTx(() => {
      const insertSetting = this.sqlite.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
      const defaults = [
        ['site_name', 'ATS media house & Capital'],
        ['registration_enabled', '1'],
        ['withdrawals_enabled', '1'],
        ['referral_l1_percent', '5'],
        ['referral_l2_percent', '2'],
        ['smtp_host', 'smtp.atsmediahouse.zm'],
        ['smtp_from', 'alinanits287@gmail.com'],
      ];
      for (const [k, v] of defaults) {
        insertSetting.run(k, v);
      }

      const insertPlan = this.sqlite.prepare(
        'INSERT INTO investment_plans (code, name, cadence, roi_percent, duration_days, min_amount, max_amount, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      insertPlan.run(
        'daily_reel',
        'Daily Studio Reel Pool',
        'daily',
        2.5,
        14,
        200,
        10000,
        'Short-cycle commercial reel & portrait editing liquidity pool with daily 2.5% yield payouts.',
        'active'
      );
      insertPlan.run(
        'weekly_wedding',
        'Weekly Wedding Production Fund',
        'weekly',
        8.0,
        28,
        500,
        25000,
        'Supports full-day Lusaka wedding production crews & album printing with 8.0% weekly returns.',
        'active'
      );
      insertPlan.run(
        'monthly_cinema',
        'Monthly Cinema Rig & Gear Yield',
        'monthly',
        22.0,
        90,
        1500,
        100000,
        'Studio camera rig, lighting & drone fleet expansion fund yielding 22.0% monthly over 90 days.',
        'active'
      );

      const clientHash = hashPassword('client-2026');
      const insertUser = this.sqlite.prepare(
        'INSERT INTO users (full_name, email, phone, password_hash, wallet_balance, referral_code, referred_by, kyc_status, kyc_id_type, kyc_id_number, two_fa_enabled, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const u1 = insertUser.run(
        'Chanda Mwansa',
        'chanda@example.com',
        '972971151',
        clientHash,
        4500,
        'ATS-CHANDA',
        null,
        'verified',
        'NRC',
        '248192/10/1',
        0,
        1
      );
      const chandaId = Number(u1.lastInsertRowid);

      const u2 = insertUser.run(
        'Mutale Banda',
        'mutale@example.com',
        '971554433',
        clientHash,
        1800,
        'ATS-MUTALE',
        chandaId,
        'pending',
        'NRC',
        '319405/10/1',
        0,
        1
      );
      const mutaleId = Number(u2.lastInsertRowid);

      const plans = this.sqlite.prepare('SELECT plan_id, code, cadence, roi_percent, duration_days FROM investment_plans').all();
      const weeklyPlan = plans.find((p) => p.code === 'weekly_wedding') || plans[0];
      const dailyPlan = plans.find((p) => p.code === 'daily_reel') || plans[0];

      const now = new Date().toISOString();
      const maturesWeekly = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
      const maturesDaily = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const insertInv = this.sqlite.prepare(
        'INSERT INTO investments (investment_id, user_id, plan_id, amount, expected_return, credited_return, cadence, status, started_at, matures_at, last_payout_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      insertInv.run('INV202601', chandaId, weeklyPlan.plan_id, 2500, 3300, 200, weeklyPlan.cadence, 'active', now, maturesWeekly, now);
      insertInv.run('INV202602', mutaleId, dailyPlan.plan_id, 1200, 1620, 30, dailyPlan.cadence, 'active', now, maturesDaily, now);

      const insertWtx = this.sqlite.prepare(
        'INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, counterparty, created_at, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      insertWtx.run('DEP202601', chandaId, 'deposit', 'airtel_money', 'AM-972971151', 7000, 'COMPLETED', 'Initial Airtel Money wallet funding', null, now, now);
      insertWtx.run('WTX202602', chandaId, 'investment', 'internal_wallet', 'INV202601', 2500, 'COMPLETED', 'Allocated to Weekly Wedding Production Fund', null, now, now);
      insertWtx.run('DEP202603', mutaleId, 'deposit', 'bank_transfer', 'ZANACO-88421', 3000, 'COMPLETED', 'Direct Zanaco bank deposit', null, now, now);
      insertWtx.run('REF202604', chandaId, 'referral_bonus', 'system', 'L1-ATS-MUTALE', 150, 'COMPLETED', '5% Level-1 referral bonus from Mutale Banda', 'Mutale Banda', now, now);
      insertWtx.run('DEP202605', mutaleId, 'deposit', 'bitcoin', 'BTC-UAT-4810', 950, 'PENDING', 'Bitcoin deposit awaiting admin confirmation', null, now, null);
      insertWtx.run('WDR202606', chandaId, 'withdrawal', 'airtel_money', '0972971151', 400, 'PENDING', 'Airtel Money payout request', null, now, null);

      this.sqlite
        .prepare("INSERT INTO support_tickets (ticket_id, user_id, subject, category, status, created_at, updated_at) VALUES ('TKT202601', ?, 'Upgrade wedding package + yield transfer', 'bookings', 'answered', ?, ?)")
        .run(chandaId, now, now);
      this.sqlite
        .prepare("INSERT INTO ticket_messages (ticket_id, sender_role, sender_name, body, created_at) VALUES ('TKT202601', 'user', 'Chanda Mwansa', 'Hi team, can I use my wallet balance to settle my Kabulonga wedding balance?', ?)")
        .run(now);
      this.sqlite
        .prepare("INSERT INTO ticket_messages (ticket_id, sender_role, sender_name, body, created_at) VALUES ('TKT202601', 'admin', 'admin', 'Yes! Open Studio Bookings in your portal and click Pay from Wallet on any pending shoot.', ?)")
        .run(now);

      this.sqlite
        .prepare('INSERT INTO notifications (user_id, title, body, is_read, created_at) VALUES (NULL, ?, ?, 0, ?)')
        .run(
          'Welcome to ATS Studio & Capital',
          'Clients can now fund their ZMW wallet via Airtel Money, Bank, or Bitcoin, book studio shoots, and participate in Daily, Weekly & Monthly Studio Production Plans.',
          now
        );
    });
  }

  seedDefaults() {
    this.withTx(() => {
      const insertSvc = this.sqlite.prepare(
        'INSERT INTO services (code, label, description, price, is_active) VALUES (?, ?, ?, ?, 1)'
      );
      insertSvc.run('wedding', 'Wedding Photography', 'Full-day coverage of your ceremony and reception, edited highlight gallery.', 3500);
      insertSvc.run('corporate', 'Corporate Shoot', 'Headshots, office and event photography for your business or team.', 1800);
      insertSvc.run('event', 'Event Coverage', 'Parties, launches and celebrations, delivered within 48 hours.', 1500);
      insertSvc.run('family', 'Family Portrait Session', 'A relaxed studio or outdoor session for the whole family.', 900);
      insertSvc.run('graduation', 'Graduation Shoot', 'Shoot your graduation memories with us — gown, cap and all.', 700);

      this.sqlite
        .prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)')
        .run('admin', hashPassword('ats-2026'));

      const adminRow = this.sqlite
        .prepare("SELECT admin_id FROM admin_users WHERE username = 'admin'")
        .get();

      const photos = [
        ['Kabulonga Evening Reception', 'wedding_reception.jpg'],
        ['Lusaka Executive Portrait', 'corporate_portrait.jpg'],
        ['Annual Gala & Banquet', 'annual_gala.jpg'],
        ['UNZA Graduation Memories', 'unza_graduation.jpg'],
      ];
      const insertPhoto = this.sqlite.prepare(
        'INSERT INTO gallery (title, filename, thumb, uploaded_by) VALUES (?, ?, ?, ?)'
      );
      for (const [title, file] of photos) {
        insertPhoto.run(title, file, file, adminRow.admin_id);
      }
    });
  }

  seedFromJsonFile(jsonPath) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    this.withTx(() => {
      const insertCust = this.sqlite.prepare(
        'INSERT INTO customers (customer_id, full_name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const c of raw.customers ?? []) {
        insertCust.run(
          c.id,
          c.fullName,
          normalizeMsisdn(c.phone),
          c.email ?? null,
          c.createdAt ?? new Date().toISOString(),
          c.updatedAt ?? new Date().toISOString()
        );
      }

      const insertSvc = this.sqlite.prepare(
        'INSERT INTO services (service_id, code, label, description, price, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const s of raw.services ?? []) {
        insertSvc.run(
          s.id,
          s.code,
          s.label,
          s.description ?? '',
          s.price,
          s.isActive === false ? 0 : 1
        );
      }

      const insertBooking = this.sqlite.prepare(
        'INSERT INTO bookings (booking_id, customer_id, service_id, amount_due, event_date, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const b of raw.bookings ?? []) {
        insertBooking.run(
          b.id,
          b.customerId,
          b.serviceId,
          b.amount,
          b.eventDate,
          b.notes ?? null,
          b.status,
          b.createdAt ?? new Date().toISOString(),
          b.updatedAt ?? new Date().toISOString()
        );
      }

      const insertPay = this.sqlite.prepare(
        'INSERT INTO payments (transaction_id, booking_id, msisdn, amount, status, airtel_response, error, created_at, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const p of raw.payments ?? []) {
        insertPay.run(
          p.transactionId,
          p.bookingId,
          p.msisdn,
          p.amount,
          p.status,
          p.airtelResponse ?? null,
          p.error ?? null,
          p.createdAt ?? new Date().toISOString(),
          p.lastChecked ?? null
        );
      }

      const insertAdmin = this.sqlite.prepare(
        'INSERT INTO admin_users (admin_id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
      );
      for (const a of raw.adminUsers ?? []) {
        insertAdmin.run(a.id, a.username, a.passwordHash, a.createdAt ?? new Date().toISOString());
      }
      if ((raw.adminUsers ?? []).length === 0) {
        this.sqlite
          .prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)')
          .run('admin', hashPassword('ats-2026'));
      }

      const adminRow = this.sqlite.prepare('SELECT admin_id FROM admin_users LIMIT 1').get();

      const insertGallery = this.sqlite.prepare(
        'INSERT INTO gallery (photo_id, title, filename, thumb, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const g of raw.gallery ?? []) {
        const resolved = resolveGalleryFilename(g.filename);
        insertGallery.run(
          g.id,
          g.title,
          resolved,
          resolved,
          adminRow?.admin_id ?? null,
          g.createdAt ?? new Date().toISOString()
        );
      }
    });
  }

  withTx(fn) {
    if (this.inTx) {
      return fn();
    }
    this.sqlite.exec('BEGIN IMMEDIATE');
    this.inTx = true;
    try {
      const result = fn();
      this.sqlite.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      this.inTx = false;
    }
  }

  healthCheck() {
    const row = this.sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table'")
      .get();
    return { ok: true, engine: 'SQLite (ACID)', tables: Number(row.cnt) };
  }

  // ---- Services ----
  getActiveServices() {
    const rows = this.sqlite
      .prepare(
        'SELECT service_id AS id, code, label, description, price, is_active FROM services WHERE is_active = 1 ORDER BY price DESC'
      )
      .all();
    return rows.map((r) => ({ ...r }));
  }

  getAllServices() {
    const rows = this.sqlite
      .prepare(
        'SELECT service_id AS id, code, label, description, price, is_active FROM services ORDER BY service_id ASC'
      )
      .all();
    return rows.map((r) => ({ ...r }));
  }

  saveService(id, input) {
    const { error, clean } = validateServiceInput(input);
    if (error) return { error };

    try {
      const savedId = this.withTx(() => {
        if (id) {
          const existing = this.sqlite
            .prepare('SELECT service_id FROM services WHERE service_id = ?')
            .get(id);
          if (!existing) throw new HttpError('Service not found.', 404);
          this.sqlite
            .prepare('UPDATE services SET code = ?, label = ?, price = ?, is_active = ? WHERE service_id = ?')
            .run(clean.code, clean.label, clean.price, clean.isActive, id);
          return id;
        }
        const info = this.sqlite
          .prepare('INSERT INTO services (code, label, description, price, is_active) VALUES (?, ?, ?, ?, ?)')
          .run(clean.code, clean.label, `${clean.label} photography session with edited digital delivery.`, clean.price, clean.isActive);
        return Number(info.lastInsertRowid);
      });
      const row = this.sqlite
        .prepare('SELECT service_id AS id, code, label, description, price, is_active FROM services WHERE service_id = ?')
        .get(savedId);
      return { error: null, service: { ...row } };
    } catch (err) {
      if (err instanceof HttpError) return { error: err.message };
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        return { error: 'That code already exists.' };
      }
      return { error: 'Database error.' };
    }
  }

  deleteService(id) {
    return this.withTx(() => {
      const row = this.sqlite
        .prepare('SELECT service_id FROM services WHERE service_id = ?')
        .get(id);
      if (!row) throw new HttpError('Service package not found.', 404);
      const cnt = Number(
        this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM bookings WHERE service_id = ?').get(id).cnt
      );
      if (cnt > 0) {
        this.sqlite.prepare('UPDATE services SET is_active = 0 WHERE service_id = ?').run(id);
        return 'deactivated (has existing bookings)';
      }
      this.sqlite.prepare('DELETE FROM services WHERE service_id = ?').run(id);
      return 'deleted';
    });
  }

  // ---- Bookings ----
  findBooking(id) {
    const row = this.sqlite.prepare(`${this.bookingSelectSql} WHERE b.booking_id = ?`).get(id);
    if (!row) throw new HttpError('Booking not found.', 404);
    return { ...row };
  }

  listBookings(q = '', status = '', timing = '') {
    const where = [];
    const params = [];
    const trimmedQ = q.trim();
    if (trimmedQ !== '') {
      const words = trimmedQ.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
      const wordClauses = words.map(() => "LOWER(COALESCE(b.notes, '')) LIKE ?");
      where.push(
        `(LOWER(c.full_name) LIKE ? OR b.booking_id = ?${wordClauses.length ? ' OR (' + wordClauses.join(' AND ') + ')' : ''})`
      );
      params.push(`%${trimmedQ.toLowerCase()}%`, trimmedQ);
      for (const w of words) {
        params.push(`%${w.toLowerCase()}%`);
      }
    }
    if (status === 'pending_payment' || status === 'paid' || status === 'cancelled') {
      where.push('b.status = ?');
      params.push(status);
    }
    if (timing === 'upcoming') {
      where.push("b.event_date >= ? AND b.status <> 'cancelled'");
      params.push(todayLusakaYmd());
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const orderSql = timing === 'upcoming' ? 'b.event_date ASC, b.created_at DESC' : 'b.created_at DESC';
    const rows = this.sqlite.prepare(`${this.bookingSelectSql}${whereSql} ORDER BY ${orderSql}`).all(...params);
    return rows.map((r) => ({ ...r }));
  }

  lookupBookings(query) {
    const q = query.trim();
    if (!q) return [];
    const msisdn = normalizeMsisdn(q);
    const isPhone = /^\d{9}$/.test(msisdn);
    const rows = isPhone
      ? this.sqlite
          .prepare(`${this.bookingSelectSql} WHERE c.phone = ? ORDER BY b.created_at DESC LIMIT 20`)
          .all(msisdn)
      : this.sqlite
          .prepare(`${this.bookingSelectSql} WHERE b.booking_id = ? LIMIT 1`)
          .all(q);

    const payStmt = this.sqlite.prepare(
      'SELECT transaction_id, booking_id, msisdn, amount, status, airtel_response, error, created_at, last_checked FROM payments WHERE booking_id = ? ORDER BY created_at DESC'
    );
    return rows.map((r) => ({
      ...r,
      payments: payStmt.all(r.id).map((p) => ({ ...p })),
    }));
  }

  upsertCustomerTx(name, phone, email) {
    const now = new Date().toISOString();
    const existing = this.sqlite
      .prepare('SELECT customer_id, email FROM customers WHERE phone = ?')
      .get(phone);
    if (existing) {
      this.sqlite
        .prepare('UPDATE customers SET full_name = ?, email = COALESCE(?, email), updated_at = ? WHERE customer_id = ?')
        .run(name, email, now, existing.customer_id);
      return existing.customer_id;
    }
    const info = this.sqlite
      .prepare('INSERT INTO customers (full_name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, phone, email, now, now);
    return Number(info.lastInsertRowid);
  }

  createBooking(input) {
    const activeServices = this.getActiveServices();
    const { errors, clean } = validateBookingInput(
      input,
      activeServices.map((s) => s.code)
    );
    if (Object.keys(errors).length > 0) {
      const firstErr = Object.values(errors)[0] || 'Invalid booking input.';
      throw new HttpError(firstErr, 400);
    }

    const { bookingId, created } = this.withTx(() => {
      const svc = this.sqlite
        .prepare('SELECT service_id, price FROM services WHERE code = ? AND is_active = 1')
        .get(clean.service);
      if (!svc) throw new HttpError('Unknown or inactive service package.', 400);

      const cid = this.upsertCustomerTx(clean.name, clean.phone, clean.email || null);
      const dup = this.sqlite
        .prepare(
          "SELECT booking_id, status FROM bookings WHERE customer_id = ? AND service_id = ? AND event_date = ? AND status <> 'cancelled'"
        )
        .get(cid, svc.service_id, clean.date);

      if (dup) {
        if (dup.status === 'paid') {
          throw new HttpError('You already have a paid booking for this package on that date.', 409);
        }
        return { bookingId: dup.booking_id, created: false };
      }

      const bid = newId('BK');
      const now = new Date().toISOString();
      this.sqlite
        .prepare(
          'INSERT INTO bookings (booking_id, customer_id, service_id, amount_due, event_date, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(bid, cid, svc.service_id, svc.price, clean.date, clean.notes || null, 'pending_payment', now, now);

      return { bookingId: bid, created: true };
    });

    return { booking: this.findBooking(bookingId), created };
  }

  updateBooking(id, input) {
    const activeServices = this.getActiveServices();
    const { errors, clean } = validateBookingInput(
      input,
      activeServices.map((s) => s.code)
    );
    if (Object.keys(errors).length > 0) {
      const firstErr = Object.values(errors)[0] || 'Invalid booking input.';
      throw new HttpError(firstErr, 400);
    }

    this.withTx(() => {
      const b = this.sqlite
        .prepare('SELECT booking_id, status FROM bookings WHERE booking_id = ?')
        .get(id);
      if (!b) throw new HttpError('Booking not found.', 404);
      if (b.status !== 'pending_payment') throw new HttpError('Only unpaid bookings can be edited.', 409);
      const pendingPay = Number(
        this.sqlite
          .prepare("SELECT COUNT(*) AS cnt FROM payments WHERE booking_id = ? AND status = 'PENDING'")
          .get(id).cnt
      );
      if (pendingPay > 0) throw new HttpError('A payment is in progress for this booking.', 409);

      const svc = this.sqlite
        .prepare('SELECT service_id, price FROM services WHERE code = ? AND is_active = 1')
        .get(clean.service);
      if (!svc) throw new HttpError('Unknown or inactive service package.', 400);

      const cid = this.upsertCustomerTx(clean.name, clean.phone, clean.email || null);
      this.sqlite
        .prepare(
          'UPDATE bookings SET customer_id = ?, service_id = ?, amount_due = ?, event_date = ?, notes = ?, updated_at = ? WHERE booking_id = ?'
        )
        .run(cid, svc.service_id, svc.price, clean.date, clean.notes || null, new Date().toISOString(), id);
    });

    return this.findBooking(id);
  }

  deleteBooking(id) {
    return this.withTx(() => {
      const b = this.sqlite
        .prepare('SELECT booking_id, status FROM bookings WHERE booking_id = ?')
        .get(id);
      if (!b) throw new HttpError('Booking not found.', 404);
      if (b.status === 'paid') throw new HttpError('Paid bookings cannot be deleted (refund first).', 409);

      const pendingCount = Number(
        this.sqlite
          .prepare("SELECT COUNT(*) AS cnt FROM payments WHERE booking_id = ? AND status = 'PENDING'")
          .get(id).cnt
      );
      if (pendingCount > 0) throw new HttpError('A payment is in progress for this booking.', 409);

      const anyPayCount = Number(
        this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM payments WHERE booking_id = ?').get(id).cnt
      );
      if (anyPayCount > 0) {
        this.sqlite
          .prepare("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE booking_id = ?")
          .run(new Date().toISOString(), id);
        return 'cancelled';
      }
      this.sqlite.prepare('DELETE FROM bookings WHERE booking_id = ?').run(id);
      return 'deleted';
    });
  }

  markBookingPaid(id) {
    this.withTx(() => {
      const b = this.sqlite
        .prepare('SELECT booking_id, status FROM bookings WHERE booking_id = ?')
        .get(id);
      if (!b) throw new HttpError('Booking not found.', 404);
      if (b.status !== 'pending_payment') throw new HttpError('Only unpaid bookings can be marked paid.', 409);
      const pendingCount = Number(
        this.sqlite
          .prepare("SELECT COUNT(*) AS cnt FROM payments WHERE booking_id = ? AND status = 'PENDING'")
          .get(id).cnt
      );
      if (pendingCount > 0) {
        throw new HttpError('An Airtel payment is still pending. Settle it from Transactions.', 409);
      }

      const details = this.sqlite
        .prepare(
          'SELECT c.phone, b.amount_due FROM bookings b JOIN customers c ON c.customer_id = b.customer_id WHERE b.booking_id = ?'
        )
        .get(id);
      const now = new Date().toISOString();
      this.sqlite
        .prepare(
          "INSERT INTO payments (transaction_id, booking_id, msisdn, amount, status, error, created_at, last_checked) VALUES (?, ?, ?, ?, 'SUCCESS', 'Manual confirmation by admin', ?, ?)"
        )
        .run(newId('MAN'), id, details.phone, details.amount_due, now, now);
      this.sqlite
        .prepare("UPDATE bookings SET status = 'paid', updated_at = ? WHERE booking_id = ?")
        .run(now, id);
    });
  }

  cancelBooking(id) {
    this.withTx(() => {
      const b = this.sqlite
        .prepare('SELECT booking_id, status FROM bookings WHERE booking_id = ?')
        .get(id);
      if (!b) throw new HttpError('Booking not found.', 404);
      if (b.status === 'paid') {
        throw new HttpError('Paid bookings cannot be cancelled here (refund first).', 409);
      }
      this.sqlite
        .prepare("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE booking_id = ?")
        .run(new Date().toISOString(), id);
    });
  }

  payBookingNow(bookingId) {
    return this.withTx(() => {
      const b = this.sqlite
        .prepare('SELECT booking_id, status FROM bookings WHERE booking_id = ?')
        .get(bookingId);
      if (!b) throw new HttpError('Booking not found.', 404);
      if (b.status === 'paid') throw new HttpError('This booking is already paid.', 409);
      if (b.status === 'cancelled') throw new HttpError('Cancelled bookings cannot be paid.', 409);

      const details = this.sqlite
        .prepare(
          'SELECT c.phone, b.amount_due FROM bookings b JOIN customers c ON c.customer_id = b.customer_id WHERE b.booking_id = ?'
        )
        .get(bookingId);

      const txnId = newId('TXN');
      const now = new Date().toISOString();
      this.sqlite
        .prepare(
          "INSERT INTO payments (transaction_id, booking_id, msisdn, amount, status, airtel_response, error, created_at, last_checked) VALUES (?, ?, ?, ?, 'SUCCESS', ?, 'UAT instant confirm', ?, ?)"
        )
        .run(
          txnId,
          bookingId,
          details.phone,
          details.amount_due,
          JSON.stringify({ mode: 'uat_instant', settled: true }),
          now,
          now
        );
      this.sqlite
        .prepare("UPDATE bookings SET status = 'paid', updated_at = ? WHERE booking_id = ?")
        .run(now, bookingId);
      return txnId;
    });
  }

  // ---- Payments ----
  initiatePayment(bookingId, rawPhone) {
    const msisdn = normalizeMsisdn(rawPhone);
    if (!bookingId || !msisdn) throw new HttpError('bookingId and phone are required.', 400);
    if (!/^\d{9}$/.test(msisdn)) throw new HttpError('Invalid Airtel number.', 400);

    return this.withTx(() => {
      const b = this.sqlite
        .prepare('SELECT amount_due, status FROM bookings WHERE booking_id = ?')
        .get(bookingId);
      if (!b) throw new HttpError('Unknown booking.', 404);
      if (b.status !== 'pending_payment') throw new HttpError('This booking is not awaiting payment.', 409);

      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const recentPending = Number(
        this.sqlite
          .prepare(
            "SELECT COUNT(*) AS cnt FROM payments WHERE booking_id = ? AND status = 'PENDING' AND created_at > ?"
          )
          .get(bookingId, fiveMinAgo).cnt
      );
      if (recentPending > 0) {
        throw new HttpError('A payment prompt was just sent. Please wait for it to finish.', 409);
      }

      const txnId = newId('TXN');
      const now = new Date().toISOString();
      this.sqlite
        .prepare(
          "INSERT INTO payments (transaction_id, booking_id, msisdn, amount, status, airtel_response, created_at) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)"
        )
        .run(txnId, bookingId, msisdn, b.amount_due, JSON.stringify({ mode: 'uat_sandbox', msisdn }), now);

      return { transactionId: txnId, amount: Number(b.amount_due), msisdn };
    });
  }

  checkAndSettlePayment(txnId, forceImmediate = false) {
    const pay = this.sqlite
      .prepare('SELECT transaction_id, booking_id, status, created_at FROM payments WHERE transaction_id = ?')
      .get(txnId);
    if (!pay) throw new HttpError('Unknown transaction id.', 404);
    if (pay.status !== 'PENDING') return pay.status;

    const ageMs = Date.now() - Date.parse(pay.created_at);
    if (!forceImmediate && ageMs < 1000) {
      return 'PENDING';
    }

    return this.withTx(() => {
      const locked = this.sqlite
        .prepare('SELECT booking_id, status FROM payments WHERE transaction_id = ?')
        .get(txnId);
      if (!locked) throw new HttpError('Unknown transaction id.', 404);
      if (locked.status !== 'PENDING') return locked.status;

      const now = new Date().toISOString();
      this.sqlite
        .prepare("UPDATE payments SET status = 'SUCCESS', airtel_response = ?, last_checked = ? WHERE transaction_id = ?")
        .run(JSON.stringify({ mode: 'uat_simulation', settled: true }), now, txnId);
      this.sqlite
        .prepare("UPDATE bookings SET status = 'paid', updated_at = ? WHERE booking_id = ? AND status = 'pending_payment'")
        .run(now, locked.booking_id);
      return 'SUCCESS';
    });
  }

  listTransactions(limit = 100) {
    const rows = this.sqlite
      .prepare(
        `SELECT p.transaction_id, p.booking_id, p.msisdn, p.amount, p.status, p.airtel_response, p.error,
                p.created_at, p.last_checked, c.full_name, s.label AS service_label,
                b.status AS booking_status, b.event_date
         FROM payments p
         JOIN bookings b ON b.booking_id = p.booking_id
         JOIN customers c ON c.customer_id = b.customer_id
         JOIN services s ON s.service_id = b.service_id
         ORDER BY p.created_at DESC
         LIMIT ?`
      )
      .all(limit);
    return rows.map((r) => ({ ...r }));
  }

  settleTransaction(txnId, outcome) {
    if (outcome !== 'SUCCESS' && outcome !== 'FAILED') {
      throw new HttpError('Invalid outcome.', 400);
    }
    return this.withTx(() => {
      const pay = this.sqlite
        .prepare('SELECT booking_id, status FROM payments WHERE transaction_id = ?')
        .get(txnId);
      if (!pay) throw new HttpError('Transaction not found.', 404);
      if (pay.status !== 'PENDING') throw new HttpError('Only pending transactions can be settled.', 409);

      const b = this.sqlite
        .prepare('SELECT booking_id, status FROM bookings WHERE booking_id = ?')
        .get(pay.booking_id);
      if (!b) throw new HttpError('Booking not found.', 404);

      const now = new Date().toISOString();
      const note =
        outcome === 'SUCCESS' ? 'Confirmed in Admin Transactions' : 'Marked failed in Admin Transactions';
      this.sqlite
        .prepare('UPDATE payments SET status = ?, last_checked = ?, error = ? WHERE transaction_id = ?')
        .run(outcome, now, note, txnId);

      if (outcome === 'SUCCESS' && b.status === 'pending_payment') {
        this.sqlite
          .prepare("UPDATE bookings SET status = 'paid', updated_at = ? WHERE booking_id = ?")
          .run(now, pay.booking_id);
      }
      return outcome;
    });
  }

  // ---- Stats & Reports ----
  getDashboardStats() {
    const row = this.sqlite
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END), 0) AS pending,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
                COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_due ELSE 0 END), 0) AS revenue
         FROM bookings`
      )
      .get();
    return { ...row };
  }

  getUpcomingBookings(limit = 5) {
    const rows = this.sqlite
      .prepare(
        `${this.bookingSelectSql}
         WHERE b.status <> 'cancelled' AND b.event_date >= ?
         ORDER BY b.event_date ASC
         LIMIT ?`
      )
      .all(todayLusakaYmd(), limit);
    return rows.map((r) => ({ ...r }));
  }

  getReportByService() {
    const rows = this.sqlite
      .prepare(
        `SELECT s.label,
                COUNT(b.booking_id) AS bookings,
                COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.amount_due ELSE 0 END), 0) AS revenue
         FROM services s
         LEFT JOIN bookings b ON b.service_id = s.service_id
         GROUP BY s.service_id, s.label
         ORDER BY revenue DESC, bookings DESC`
      )
      .all();
    return rows.map((r) => ({ ...r }));
  }

  getReportByMonth() {
    const rows = this.sqlite
      .prepare(
        `SELECT substr(event_date, 1, 7) AS month,
                COUNT(*) AS bookings,
                COALESCE(SUM(amount_due), 0) AS value
         FROM bookings
         WHERE status <> 'cancelled'
         GROUP BY month
         HAVING COUNT(*) >= 1
         ORDER BY month DESC
         LIMIT 12`
      )
      .all();
    return rows.map((r) => ({ ...r }));
  }

  getReportTopCustomers() {
    const rows = this.sqlite
      .prepare(
        `SELECT c.full_name, c.phone, COUNT(*) AS bookings, COALESCE(SUM(b.amount_due), 0) AS value
         FROM customers c
         JOIN bookings b ON b.customer_id = c.customer_id
         WHERE b.status <> 'cancelled'
         GROUP BY c.customer_id, c.full_name, c.phone
         ORDER BY value DESC
         LIMIT 5`
      )
      .all();
    return rows.map((r) => ({ ...r }));
  }

  // ---- Admin Users ----
  findAdminByUsername(username) {
    const row = this.sqlite
      .prepare('SELECT admin_id, username, password_hash FROM admin_users WHERE username = ?')
      .get(username);
    return row ? { ...row } : null;
  }

  // ---- Gallery ----
  listGallery() {
    const rows = this.sqlite
      .prepare('SELECT photo_id, title, filename, thumb, created_at FROM gallery ORDER BY created_at DESC, photo_id DESC')
      .all();
    return rows.map((r) => ({ ...r }));
  }

  addGalleryPhoto(title, filename, thumb, adminId) {
    const info = this.sqlite
      .prepare('INSERT INTO gallery (title, filename, thumb, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(title, filename, thumb, adminId, new Date().toISOString());
    return Number(info.lastInsertRowid);
  }

  removeGalleryPhoto(id) {
    const row = this.sqlite.prepare('SELECT filename FROM gallery WHERE photo_id = ?').get(id);
    if (!row) return null;
    this.sqlite.prepare('DELETE FROM gallery WHERE photo_id = ?').run(id);
    return row.filename;
  }

  // ---- Site Settings & Admin Users Management ----
  getSettings() {
    const rows = this.sqlite.prepare('SELECT key, value FROM site_settings').all();
    const out = {
      site_name: 'ATS media house & Capital',
      registration_enabled: '1',
      withdrawals_enabled: '1',
      referral_l1_percent: '5',
      referral_l2_percent: '2',
      smtp_host: 'smtp.atsmediahouse.zm',
      smtp_from: 'alinanits287@gmail.com',
    };
    for (const r of rows) {
      out[r.key] = r.value;
    }
    return out;
  }

  updateSettings(input) {
    const siteName = String(input.site_name ?? 'ATS media house & Capital').trim().slice(0, 80) || 'ATS media house & Capital';
    const reg = input.registration_enabled ? '1' : '0';
    const wdr = input.withdrawals_enabled ? '1' : '0';
    const l1 = Math.max(0, Math.min(50, Number(input.referral_l1_percent ?? 5) || 0));
    const l2 = Math.max(0, Math.min(50, Number(input.referral_l2_percent ?? 2) || 0));
    const smtpHost = String(input.smtp_host ?? 'smtp.atsmediahouse.zm').trim().slice(0, 120);
    const smtpFrom = String(input.smtp_from ?? 'alinanits287@gmail.com').trim().slice(0, 120);

    this.withTx(() => {
      const stmt = this.sqlite.prepare(
        'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      );
      stmt.run('site_name', siteName);
      stmt.run('registration_enabled', reg);
      stmt.run('withdrawals_enabled', wdr);
      stmt.run('referral_l1_percent', String(l1));
      stmt.run('referral_l2_percent', String(l2));
      stmt.run('smtp_host', smtpHost);
      stmt.run('smtp_from', smtpFrom);
    });
    return this.getSettings();
  }

  listAdmins() {
    return this.sqlite
      .prepare('SELECT admin_id, username, created_at FROM admin_users ORDER BY admin_id ASC')
      .all()
      .map((r) => ({ ...r }));
  }

  createAdminUser(username, password) {
    const cleanUser = String(username ?? '').trim().toLowerCase();
    const cleanPass = String(password ?? '');
    if (!/^[a-z0-9_.-]{3,32}$/.test(cleanUser)) {
      throw new HttpError('Username must be 3-32 characters (a-z, 0-9, _, ., -).', 400);
    }
    if (cleanPass.length < 6) {
      throw new HttpError('Password must be at least 6 characters.', 400);
    }
    try {
      const info = this.sqlite
        .prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)')
        .run(cleanUser, hashPassword(cleanPass));
      return Number(info.lastInsertRowid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        throw new HttpError('Admin username already exists.', 409);
      }
      throw err;
    }
  }

  deleteAdminUser(adminId) {
    return this.withTx(() => {
      const row = this.sqlite.prepare('SELECT admin_id, username FROM admin_users WHERE admin_id = ?').get(adminId);
      if (!row) throw new HttpError('Admin account not found.', 404);
      if (row.username === 'admin') {
        throw new HttpError('The primary admin account cannot be deleted.', 409);
      }
      this.sqlite.prepare('DELETE FROM admin_users WHERE admin_id = ?').run(adminId);
      return row.username;
    });
  }

  // ---- Member Accounts, KYC & 2FA ----
  registerMember(input) {
    const settings = this.getSettings();
    if (settings.registration_enabled !== '1') {
      throw new HttpError('Public registration is currently disabled by administrator.', 403);
    }
    const { errors, clean } = validateMemberRegisterInput(input);
    if (Object.keys(errors).length > 0) {
      throw new HttpError(Object.values(errors)[0], 400);
    }

    return this.withTx(() => {
      let referredById = null;
      if (clean.referralCode) {
        const refUser = this.sqlite
          .prepare('SELECT user_id FROM users WHERE referral_code = ?')
          .get(clean.referralCode);
        if (refUser) referredById = refUser.user_id;
      }

      const codePrefix = clean.fullName.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'USER';
      const refCode = `ATS-${codePrefix}-${String(Date.now()).slice(-4)}`;
      try {
        const info = this.sqlite
          .prepare(
            'INSERT INTO users (full_name, email, phone, password_hash, wallet_balance, referral_code, referred_by, kyc_status, two_fa_enabled, is_active) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0, 1)'
          )
          .run(clean.fullName, clean.email, clean.phone, hashPassword(clean.password), refCode, referredById, 'unverified');
        return this.findMemberById(Number(info.lastInsertRowid));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE constraint failed')) {
          throw new HttpError('An account with that email or phone number already exists.', 409);
        }
        throw err;
      }
    });
  }

  findMemberByLogin(identifier) {
    const raw = String(identifier ?? '').trim();
    if (!raw) return null;
    const email = raw.toLowerCase();
    const phone = normalizeMsisdn(raw);
    const row = this.sqlite
      .prepare('SELECT * FROM users WHERE LOWER(email) = ? OR phone = ? LIMIT 1')
      .get(email, phone);
    return row ? { ...row } : null;
  }

  findMemberById(userId) {
    const row = this.sqlite
      .prepare(
        'SELECT user_id, full_name, email, phone, wallet_balance, referral_code, referred_by, kyc_status, kyc_id_type, kyc_id_number, two_fa_enabled, is_active, created_at FROM users WHERE user_id = ?'
      )
      .get(userId);
    if (!row) throw new HttpError('Member account not found.', 404);
    return { ...row };
  }

  submitMemberKyc(userId, input) {
    const { error, clean } = validateKycInput(input);
    if (error) throw new HttpError(error, 400);
    this.sqlite
      .prepare("UPDATE users SET kyc_id_type = ?, kyc_id_number = ?, kyc_status = 'pending' WHERE user_id = ?")
      .run(clean.idType, clean.idNumber, userId);
    return this.findMemberById(userId);
  }

  toggleMember2fa(userId, enabled) {
    this.sqlite
      .prepare('UPDATE users SET two_fa_enabled = ? WHERE user_id = ?')
      .run(enabled ? 1 : 0, userId);
    return this.findMemberById(userId);
  }

  listMembers(q = '') {
    const trimmed = String(q ?? '').trim().toLowerCase();
    const rows = trimmed
      ? this.sqlite
          .prepare(
            `SELECT u.user_id, u.full_name, u.email, u.phone, u.wallet_balance, u.referral_code,
                    u.kyc_status, u.kyc_id_type, u.kyc_id_number, u.two_fa_enabled, u.is_active, u.created_at,
                    (SELECT COUNT(*) FROM investments i WHERE i.user_id = u.user_id AND i.status = 'active') AS active_investments
             FROM users u
             WHERE LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR u.phone LIKE ?
             ORDER BY u.user_id DESC`
          )
          .all(`%${trimmed}%`, `%${trimmed}%`, `%${trimmed}%`)
      : this.sqlite
          .prepare(
            `SELECT u.user_id, u.full_name, u.email, u.phone, u.wallet_balance, u.referral_code,
                    u.kyc_status, u.kyc_id_type, u.kyc_id_number, u.two_fa_enabled, u.is_active, u.created_at,
                    (SELECT COUNT(*) FROM investments i WHERE i.user_id = u.user_id AND i.status = 'active') AS active_investments
             FROM users u
             ORDER BY u.user_id DESC`
          )
          .all();
    return rows.map((r) => ({ ...r }));
  }

  adminUpdateMember(userId, action, amount = 0) {
    return this.withTx(() => {
      const user = this.findMemberById(userId);
      const now = new Date().toISOString();
      if (action === 'kyc_verify') {
        this.sqlite.prepare("UPDATE users SET kyc_status = 'verified' WHERE user_id = ?").run(userId);
        return 'KYC verified.';
      }
      if (action === 'kyc_reject') {
        this.sqlite.prepare("UPDATE users SET kyc_status = 'rejected' WHERE user_id = ?").run(userId);
        return 'KYC rejected.';
      }
      if (action === 'toggle_active') {
        const next = user.is_active ? 0 : 1;
        this.sqlite.prepare('UPDATE users SET is_active = ? WHERE user_id = ?').run(next, userId);
        return next ? 'Account activated.' : 'Account deactivated.';
      }
      if (action === 'credit_wallet') {
        const amt = Math.round((Number(amount) || 0) * 100) / 100;
        if (amt <= 0 || amt > 1000000) throw new HttpError('Enter a valid credit amount (1 - 1,000,000).', 400);
        this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(amt, userId);
        this.sqlite
          .prepare(
            "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, created_at, processed_at) VALUES (?, ?, 'admin_adjust', 'system', 'ADMIN-CREDIT', ?, 'COMPLETED', 'Direct wallet credit by administrator', ?, ?)"
          )
          .run(newId('ADJ'), userId, amt, now, now);
        return `Credited K${amt.toFixed(2)} to ${user.full_name}.`;
      }
      throw new HttpError('Unknown user action.', 400);
    });
  }

  // ---- Investment Plans ----
  listInvestmentPlans(activeOnly = false) {
    const sql = activeOnly
      ? "SELECT * FROM investment_plans WHERE status = 'active' ORDER BY min_amount ASC"
      : 'SELECT * FROM investment_plans ORDER BY plan_id ASC';
    return this.sqlite.prepare(sql).all().map((r) => ({ ...r }));
  }

  saveInvestmentPlan(planId, input) {
    const { error, clean } = validateInvestmentPlanInput(input);
    if (error) return { error };
    try {
      const savedId = this.withTx(() => {
        if (planId) {
          const existing = this.sqlite.prepare('SELECT plan_id FROM investment_plans WHERE plan_id = ?').get(planId);
          if (!existing) throw new HttpError('Plan not found.', 404);
          this.sqlite
            .prepare(
              'UPDATE investment_plans SET code = ?, name = ?, cadence = ?, roi_percent = ?, duration_days = ?, min_amount = ?, max_amount = ?, description = ?, status = ? WHERE plan_id = ?'
            )
            .run(
              clean.code,
              clean.name,
              clean.cadence,
              clean.roiPercent,
              clean.durationDays,
              clean.minAmount,
              clean.maxAmount,
              clean.description,
              clean.status,
              planId
            );
          return planId;
        }
        const info = this.sqlite
          .prepare(
            'INSERT INTO investment_plans (code, name, cadence, roi_percent, duration_days, min_amount, max_amount, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            clean.code,
            clean.name,
            clean.cadence,
            clean.roiPercent,
            clean.durationDays,
            clean.minAmount,
            clean.maxAmount,
            clean.description,
            clean.status
          );
        return Number(info.lastInsertRowid);
      });
      const plan = this.sqlite.prepare('SELECT * FROM investment_plans WHERE plan_id = ?').get(savedId);
      return { error: null, plan: { ...plan } };
    } catch (err) {
      if (err instanceof HttpError) return { error: err.message };
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) return { error: 'That plan code already exists.' };
      return { error: 'Could not save investment plan.' };
    }
  }

  toggleInvestmentPlanStatus(planId) {
    return this.withTx(() => {
      const plan = this.sqlite.prepare('SELECT plan_id, status FROM investment_plans WHERE plan_id = ?').get(planId);
      if (!plan) throw new HttpError('Investment plan not found.', 404);
      const next = plan.status === 'active' ? 'paused' : 'active';
      this.sqlite.prepare('UPDATE investment_plans SET status = ? WHERE plan_id = ?').run(next, planId);
      return next;
    });
  }

  deleteInvestmentPlan(planId) {
    return this.withTx(() => {
      const plan = this.sqlite.prepare('SELECT plan_id FROM investment_plans WHERE plan_id = ?').get(planId);
      if (!plan) throw new HttpError('Investment plan not found.', 404);
      const refCount = Number(
        this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM investments WHERE plan_id = ?').get(planId).cnt
      );
      if (refCount > 0) {
        this.sqlite.prepare("UPDATE investment_plans SET status = 'paused' WHERE plan_id = ?").run(planId);
        return 'paused (has existing investments)';
      }
      this.sqlite.prepare('DELETE FROM investment_plans WHERE plan_id = ?').run(planId);
      return 'deleted';
    });
  }

  // ---- Wallet Deposits, Referral Bonuses, Transfers & Withdrawals ----
  creditReferralChainTx(userId, baseAmount, sourceLabel) {
    const settings = this.getSettings();
    const l1Pct = Number(settings.referral_l1_percent) || 0;
    const l2Pct = Number(settings.referral_l2_percent) || 0;
    const now = new Date().toISOString();

    const user = this.sqlite.prepare('SELECT full_name, referred_by FROM users WHERE user_id = ?').get(userId);
    if (!user || !user.referred_by) return;

    const l1 = this.sqlite.prepare('SELECT user_id, referred_by FROM users WHERE user_id = ? AND is_active = 1').get(user.referred_by);
    if (l1 && l1Pct > 0) {
      const bonus1 = Math.round(baseAmount * (l1Pct / 100) * 100) / 100;
      if (bonus1 > 0) {
        this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(bonus1, l1.user_id);
        this.sqlite
          .prepare(
            "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, counterparty, created_at, processed_at) VALUES (?, ?, 'referral_bonus', 'system', ?, ?, 'COMPLETED', ?, ?, ?, ?)"
          )
          .run(
            newId('REF'),
            l1.user_id,
            `L1-${sourceLabel}`,
            bonus1,
            `${l1Pct}% Level-1 referral commission`,
            user.full_name,
            now,
            now
          );
      }

      if (l1.referred_by && l2Pct > 0) {
        const l2 = this.sqlite.prepare('SELECT user_id FROM users WHERE user_id = ? AND is_active = 1').get(l1.referred_by);
        if (l2) {
          const bonus2 = Math.round(baseAmount * (l2Pct / 100) * 100) / 100;
          if (bonus2 > 0) {
            this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(bonus2, l2.user_id);
            this.sqlite
              .prepare(
                "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, counterparty, created_at, processed_at) VALUES (?, ?, 'referral_bonus', 'system', ?, ?, 'COMPLETED', ?, ?, ?, ?)"
              )
              .run(
                newId('REF'),
                l2.user_id,
                `L2-${sourceLabel}`,
                bonus2,
                `${l2Pct}% Level-2 referral commission`,
                user.full_name,
                now,
                now
              );
          }
        }
      }
    }
  }

  createMemberDeposit(userId, input) {
    const method = String(input.method ?? 'airtel_money').trim();
    if (!['airtel_money', 'bank_transfer', 'bitcoin'].includes(method)) {
      throw new HttpError('Choose Airtel Money, Direct Bank Deposit, or Bitcoin.', 400);
    }
    const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (Number.isNaN(amount) || amount < 50 || amount > 1000000) {
      throw new HttpError('Deposit amount must be between K50 and K1,000,000.', 400);
    }
    const reference = String(input.reference ?? '').trim() || (method === 'airtel_money' ? 'Airtel UAT' : 'Deposit ref');

    return this.withTx(() => {
      this.findMemberById(userId);
      const wtxId = newId('DEP');
      const now = new Date().toISOString();
      const instant = method === 'airtel_money';
      const status = instant ? 'COMPLETED' : 'PENDING';
      this.sqlite
        .prepare(
          'INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, created_at, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          wtxId,
          userId,
          'deposit',
          method,
          reference.slice(0, 80),
          amount,
          status,
          instant ? 'Airtel Money UAT instant wallet funding' : `${method.replace('_', ' ')} deposit awaiting admin review`,
          now,
          instant ? now : null
        );

      if (instant) {
        this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(amount, userId);
        this.creditReferralChainTx(userId, amount, wtxId);
      }

      return { wtxId, status, amount, method };
    });
  }

  settleDeposit(wtxId, outcome) {
    if (!['COMPLETED', 'REJECTED'].includes(outcome)) {
      throw new HttpError('Invalid deposit settlement outcome.', 400);
    }
    return this.withTx(() => {
      const tx = this.sqlite
        .prepare("SELECT * FROM wallet_transactions WHERE wtx_id = ? AND type = 'deposit'")
        .get(wtxId);
      if (!tx) throw new HttpError('Deposit record not found.', 404);
      if (tx.status !== 'PENDING') throw new HttpError('Only pending deposits can be settled.', 409);

      const now = new Date().toISOString();
      this.sqlite
        .prepare('UPDATE wallet_transactions SET status = ?, processed_at = ? WHERE wtx_id = ?')
        .run(outcome, now, wtxId);

      if (outcome === 'COMPLETED') {
        this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(tx.amount, tx.user_id);
        this.creditReferralChainTx(tx.user_id, tx.amount, wtxId);
      }
      return outcome;
    });
  }

  subscribeInvestment(userId, planId, rawAmount) {
    const amount = Math.round((Number(rawAmount) || 0) * 100) / 100;
    if (Number.isNaN(amount) || amount <= 0) {
      throw new HttpError('Enter a valid investment amount.', 400);
    }
    return this.withTx(() => {
      const user = this.findMemberById(userId);
      if (!user.is_active) throw new HttpError('Your account is currently suspended.', 403);
      const plan = this.sqlite.prepare('SELECT * FROM investment_plans WHERE plan_id = ?').get(planId);
      if (!plan) throw new HttpError('Investment plan not found.', 404);
      if (plan.status !== 'active') throw new HttpError('This investment plan is currently paused by admin.', 409);
      if (amount < plan.min_amount || amount > plan.max_amount) {
        throw new HttpError(`Amount must be between K${plan.min_amount} and K${plan.max_amount}.`, 400);
      }
      if (user.wallet_balance < amount) {
        throw new HttpError('Insufficient wallet balance. Fund your wallet first.', 409);
      }

      const periods =
        plan.cadence === 'daily'
          ? plan.duration_days
          : plan.cadence === 'weekly'
            ? Math.max(1, Math.floor(plan.duration_days / 7))
            : Math.max(1, Math.floor(plan.duration_days / 30));
      const totalProfit = Math.round(amount * (plan.roi_percent / 100) * periods * 100) / 100;
      const expectedReturn = Math.round((amount + totalProfit) * 100) / 100;

      const invId = newId('INV');
      const now = new Date().toISOString();
      const maturesAt = new Date(Date.now() + plan.duration_days * 86400000).toISOString().slice(0, 10);

      this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE user_id = ?').run(amount, userId);
      this.sqlite
        .prepare(
          'INSERT INTO investments (investment_id, user_id, plan_id, amount, expected_return, credited_return, cadence, status, started_at, matures_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
        )
        .run(invId, userId, plan.plan_id, amount, expectedReturn, plan.cadence, 'active', now, maturesAt);
      this.sqlite
        .prepare(
          "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, created_at, processed_at) VALUES (?, ?, 'investment', 'internal_wallet', ?, ?, 'COMPLETED', ?, ?, ?)"
        )
        .run(newId('WTX'), userId, invId, amount, `Subscribed to ${plan.name}`, now, now);

      return { investmentId: invId, expectedReturn, maturesAt };
    });
  }

  creditInvestmentYield(investmentId) {
    return this.withTx(() => {
      const inv = this.sqlite
        .prepare(
          `SELECT i.*, p.name AS plan_name, p.roi_percent
           FROM investments i
           JOIN investment_plans p ON p.plan_id = i.plan_id
           WHERE i.investment_id = ?`
        )
        .get(investmentId);
      if (!inv) throw new HttpError('Investment not found.', 404);
      if (inv.status !== 'active') throw new HttpError('Only active investments can receive yield payouts.', 409);

      const cycleYield = Math.round(inv.amount * (inv.roi_percent / 100) * 100) / 100;
      const remaining = Math.max(0, Math.round((inv.expected_return - inv.credited_return) * 100) / 100);
      const payout = Math.min(cycleYield, remaining);
      if (payout <= 0) {
        this.sqlite.prepare("UPDATE investments SET status = 'completed' WHERE investment_id = ?").run(investmentId);
        return { payout: 0, status: 'completed' };
      }

      const now = new Date().toISOString();
      const newCredited = Math.round((inv.credited_return + payout) * 100) / 100;
      const nextStatus = newCredited >= inv.expected_return ? 'completed' : 'active';

      this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(payout, inv.user_id);
      this.sqlite
        .prepare('UPDATE investments SET credited_return = ?, status = ?, last_payout_at = ? WHERE investment_id = ?')
        .run(newCredited, nextStatus, now, investmentId);
      this.sqlite
        .prepare(
          "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, created_at, processed_at) VALUES (?, ?, 'roi_payout', 'system', ?, ?, 'COMPLETED', ?, ?, ?)"
        )
        .run(newId('ROI'), inv.user_id, investmentId, payout, `Yield payout for ${inv.plan_name}`, now, now);

      return { payout, status: nextStatus };
    });
  }

  toggleInvestmentStatus(investmentId) {
    return this.withTx(() => {
      const inv = this.sqlite.prepare('SELECT investment_id, status FROM investments WHERE investment_id = ?').get(investmentId);
      if (!inv) throw new HttpError('Investment not found.', 404);
      if (inv.status === 'completed') throw new HttpError('Completed investments cannot be paused.', 409);
      const next = inv.status === 'active' ? 'paused' : 'active';
      this.sqlite.prepare('UPDATE investments SET status = ? WHERE investment_id = ?').run(next, investmentId);
      return next;
    });
  }

  transferFunds(fromUserId, recipientLookup, rawAmount, note = '') {
    const amount = Math.round((Number(rawAmount) || 0) * 100) / 100;
    if (Number.isNaN(amount) || amount < 10 || amount > 500000) {
      throw new HttpError('Transfer amount must be between K10 and K500,000.', 400);
    }
    const cleanLookup = String(recipientLookup ?? '').trim();
    if (!cleanLookup) throw new HttpError('Enter recipient email, phone, or referral code.', 400);

    return this.withTx(() => {
      const sender = this.findMemberById(fromUserId);
      if (sender.wallet_balance < amount) throw new HttpError('Insufficient wallet balance.', 409);

      const normPhone = normalizeMsisdn(cleanLookup);
      const recipient = this.sqlite
        .prepare(
          'SELECT user_id, full_name, email, is_active FROM users WHERE LOWER(email) = ? OR phone = ? OR UPPER(referral_code) = ? LIMIT 1'
        )
        .get(cleanLookup.toLowerCase(), normPhone, cleanLookup.toUpperCase());
      if (!recipient) throw new HttpError('Recipient account not found.', 404);
      if (recipient.user_id === fromUserId) throw new HttpError('You cannot transfer funds to yourself.', 400);
      if (!recipient.is_active) throw new HttpError('Recipient account is inactive.', 409);

      const now = new Date().toISOString();
      const ref = newId('TRF');
      const cleanNote = String(note ?? '').trim().slice(0, 140) || 'Internal wallet transfer';

      this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE user_id = ?').run(amount, fromUserId);
      this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(amount, recipient.user_id);

      this.sqlite
        .prepare(
          "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, counterparty, created_at, processed_at) VALUES (?, ?, 'transfer_out', 'internal_wallet', ?, ?, 'COMPLETED', ?, ?, ?, ?)"
        )
        .run(newId('WTX'), fromUserId, ref, amount, cleanNote, recipient.full_name, now, now);

      this.sqlite
        .prepare(
          "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, counterparty, created_at, processed_at) VALUES (?, ?, 'transfer_in', 'internal_wallet', ?, ?, 'COMPLETED', ?, ?, ?, ?)"
        )
        .run(newId('WTX'), recipient.user_id, ref, amount, cleanNote, sender.full_name, now, now);

      return { reference: ref, recipientName: recipient.full_name, amount };
    });
  }

  requestWithdrawal(userId, input) {
    const settings = this.getSettings();
    if (settings.withdrawals_enabled !== '1') {
      throw new HttpError('Withdrawals are temporarily paused by administrator.', 403);
    }
    const method = String(input.method ?? 'airtel_money').trim();
    if (!['airtel_money', 'bank_transfer'].includes(method)) {
      throw new HttpError('Select Airtel Money or Direct Bank payout.', 400);
    }
    const destination = String(input.destination ?? '').trim();
    if (!destination || destination.length < 5) {
      throw new HttpError('Enter your Airtel Money number or bank account details.', 400);
    }
    const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (Number.isNaN(amount) || amount < 50 || amount > 500000) {
      throw new HttpError('Withdrawal amount must be between K50 and K500,000.', 400);
    }

    return this.withTx(() => {
      const user = this.findMemberById(userId);
      if (user.wallet_balance < amount) {
        throw new HttpError('Insufficient wallet balance.', 409);
      }
      const wtxId = newId('WDR');
      const now = new Date().toISOString();
      this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE user_id = ?').run(amount, userId);
      this.sqlite
        .prepare(
          "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, created_at) VALUES (?, ?, 'withdrawal', ?, ?, ?, 'PENDING', ?, ?)"
        )
        .run(wtxId, userId, method, destination.slice(0, 80), amount, `Payout requested to ${destination.slice(0, 60)}`, now);

      return { wtxId, amount, method };
    });
  }

  settleWithdrawal(wtxId, outcome) {
    if (!['COMPLETED', 'REJECTED'].includes(outcome)) {
      throw new HttpError('Invalid withdrawal settlement outcome.', 400);
    }
    return this.withTx(() => {
      const tx = this.sqlite
        .prepare("SELECT * FROM wallet_transactions WHERE wtx_id = ? AND type = 'withdrawal'")
        .get(wtxId);
      if (!tx) throw new HttpError('Withdrawal record not found.', 404);
      if (tx.status !== 'PENDING') throw new HttpError('Only pending withdrawals can be settled.', 409);

      const now = new Date().toISOString();
      this.sqlite
        .prepare('UPDATE wallet_transactions SET status = ?, processed_at = ? WHERE wtx_id = ?')
        .run(outcome, now, wtxId);

      if (outcome === 'REJECTED') {
        this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?').run(tx.amount, tx.user_id);
      }
      return outcome;
    });
  }

  payBookingWithWallet(userId, bookingId) {
    return this.withTx(() => {
      const user = this.findMemberById(userId);
      const b = this.sqlite.prepare('SELECT booking_id, amount_due, status FROM bookings WHERE booking_id = ?').get(bookingId);
      if (!b) throw new HttpError('Booking not found.', 404);
      if (b.status !== 'pending_payment') throw new HttpError('This booking is not awaiting payment.', 409);
      if (user.wallet_balance < b.amount_due) {
        throw new HttpError('Insufficient wallet balance to cover this studio booking.', 409);
      }

      const now = new Date().toISOString();
      const txnId = newId('WAL');
      this.sqlite.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE user_id = ?').run(b.amount_due, userId);
      this.sqlite
        .prepare(
          "INSERT INTO wallet_transactions (wtx_id, user_id, type, method, reference, amount, status, note, created_at, processed_at) VALUES (?, ?, 'booking_payment', 'internal_wallet', ?, ?, 'COMPLETED', ?, ?, ?)"
        )
        .run(txnId, userId, bookingId, b.amount_due, `Studio booking settlement ${bookingId}`, now, now);
      this.sqlite
        .prepare(
          "INSERT INTO payments (transaction_id, booking_id, msisdn, amount, status, airtel_response, error, created_at, last_checked) VALUES (?, ?, ?, ?, 'SUCCESS', ?, 'Paid from Client Wallet', ?, ?)"
        )
        .run(txnId, bookingId, user.phone, b.amount_due, JSON.stringify({ mode: 'member_wallet' }), now, now);
      this.sqlite.prepare("UPDATE bookings SET status = 'paid', updated_at = ? WHERE booking_id = ?").run(now, bookingId);
      return txnId;
    });
  }

  // ---- Listings & Dashboards for Portal ----
  listMemberInvestments(userId) {
    return this.sqlite
      .prepare(
        `SELECT i.*, p.name AS plan_name, p.roi_percent, p.duration_days
         FROM investments i
         JOIN investment_plans p ON p.plan_id = i.plan_id
         WHERE i.user_id = ?
         ORDER BY i.started_at DESC`
      )
      .all(userId)
      .map((r) => ({ ...r }));
  }

  listAllInvestments() {
    return this.sqlite
      .prepare(
        `SELECT i.*, p.name AS plan_name, p.roi_percent, u.full_name, u.email
         FROM investments i
         JOIN investment_plans p ON p.plan_id = i.plan_id
         JOIN users u ON u.user_id = i.user_id
         ORDER BY i.started_at DESC`
      )
      .all()
      .map((r) => ({ ...r }));
  }

  listMemberWalletTransactions(userId, limit = 50) {
    return this.sqlite
      .prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit)
      .map((r) => ({ ...r }));
  }

  listAllDeposits(limit = 100) {
    return this.sqlite
      .prepare(
        `SELECT w.*, u.full_name, u.email, u.phone
         FROM wallet_transactions w
         JOIN users u ON u.user_id = w.user_id
         WHERE w.type = 'deposit'
         ORDER BY w.created_at DESC LIMIT ?`
      )
      .all(limit)
      .map((r) => ({ ...r }));
  }

  listAllWithdrawals(limit = 100) {
    return this.sqlite
      .prepare(
        `SELECT w.*, u.full_name, u.email, u.phone
         FROM wallet_transactions w
         JOIN users u ON u.user_id = w.user_id
         WHERE w.type = 'withdrawal'
         ORDER BY w.created_at DESC LIMIT ?`
      )
      .all(limit)
      .map((r) => ({ ...r }));
  }

  getMemberReferralSummary(userId) {
    const level1 = this.sqlite
      .prepare('SELECT user_id, full_name, email, created_at FROM users WHERE referred_by = ? ORDER BY user_id DESC')
      .all(userId)
      .map((r) => ({ ...r }));

    const l1Ids = level1.map((r) => r.user_id);
    let level2 = [];
    if (l1Ids.length > 0) {
      const placeholders = l1Ids.map(() => '?').join(',');
      level2 = this.sqlite
        .prepare(`SELECT user_id, full_name, email, created_at FROM users WHERE referred_by IN (${placeholders}) ORDER BY user_id DESC`)
        .all(...l1Ids)
        .map((r) => ({ ...r }));
    }

    const earnedRow = this.sqlite
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions WHERE user_id = ? AND type = 'referral_bonus'")
      .get(userId);

    const bonuses = this.sqlite
      .prepare("SELECT * FROM wallet_transactions WHERE user_id = ? AND type = 'referral_bonus' ORDER BY created_at DESC LIMIT 30")
      .all(userId)
      .map((r) => ({ ...r }));

    return { level1, level2, totalEarned: Number(earnedRow.total), bonuses };
  }

  listMemberBookings(phone) {
    return this.sqlite
      .prepare(`${this.bookingSelectSql} WHERE c.phone = ? ORDER BY b.created_at DESC`)
      .all(normalizeMsisdn(phone))
      .map((r) => ({ ...r }));
  }

  // ---- Support Tickets & Mass Notifications ----
  createSupportTicket(userId, subject, category, message) {
    const cleanSub = String(subject ?? '').trim();
    const cleanCat = String(category ?? 'general').trim() || 'general';
    const cleanMsg = String(message ?? '').trim();
    if (!cleanSub || cleanSub.length > 120) throw new HttpError('Subject is required (max 120 chars).', 400);
    if (!cleanMsg || cleanMsg.length > 2000) throw new HttpError('Message is required.', 400);

    return this.withTx(() => {
      const user = this.findMemberById(userId);
      const ticketId = newId('TKT');
      const now = new Date().toISOString();
      this.sqlite
        .prepare("INSERT INTO support_tickets (ticket_id, user_id, subject, category, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?)")
        .run(ticketId, userId, cleanSub, cleanCat, now, now);
      this.sqlite
        .prepare("INSERT INTO ticket_messages (ticket_id, sender_role, sender_name, body, created_at) VALUES (?, 'user', ?, ?, ?)")
        .run(ticketId, user.full_name, cleanMsg, now);
      return ticketId;
    });
  }

  replySupportTicket(ticketId, senderRole, senderName, body, closeTicket = false) {
    const cleanBody = String(body ?? '').trim();
    if (!cleanBody && !closeTicket) throw new HttpError('Reply message cannot be empty.', 400);
    return this.withTx(() => {
      const t = this.sqlite.prepare('SELECT ticket_id FROM support_tickets WHERE ticket_id = ?').get(ticketId);
      if (!t) throw new HttpError('Ticket not found.', 404);
      const now = new Date().toISOString();
      if (cleanBody) {
        this.sqlite
          .prepare('INSERT INTO ticket_messages (ticket_id, sender_role, sender_name, body, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(ticketId, senderRole, senderName, cleanBody, now);
      }
      const nextStatus = closeTicket ? 'closed' : senderRole === 'admin' ? 'answered' : 'open';
      this.sqlite
        .prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE ticket_id = ?')
        .run(nextStatus, now, ticketId);
      return nextStatus;
    });
  }

  listMemberTickets(userId) {
    const rows = this.sqlite
      .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId);
    const msgStmt = this.sqlite.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY message_id ASC');
    return rows.map((t) => ({ ...t, messages: msgStmt.all(t.ticket_id).map((m) => ({ ...m })) }));
  }

  listAllTickets() {
    const rows = this.sqlite
      .prepare(
        `SELECT t.*, u.full_name, u.email
         FROM support_tickets t
         JOIN users u ON u.user_id = t.user_id
         ORDER BY t.updated_at DESC`
      )
      .all();
    const msgStmt = this.sqlite.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY message_id ASC');
    return rows.map((t) => ({ ...t, messages: msgStmt.all(t.ticket_id).map((m) => ({ ...m })) }));
  }

  sendNotification(userIdOrNull, title, body) {
    const cleanTitle = String(title ?? '').trim();
    const cleanBody = String(body ?? '').trim();
    if (!cleanTitle || !cleanBody) throw new HttpError('Title and notification message are required.', 400);
    const target = userIdOrNull ? Number(userIdOrNull) : null;
    this.sqlite
      .prepare('INSERT INTO notifications (user_id, title, body, is_read, created_at) VALUES (?, ?, ?, 0, ?)')
      .run(target, cleanTitle.slice(0, 120), cleanBody.slice(0, 1000), new Date().toISOString());
  }

  listMemberNotifications(userId) {
    return this.sqlite
      .prepare('SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY notification_id DESC LIMIT 40')
      .all(userId)
      .map((r) => ({ ...r }));
  }

  listAllNotifications() {
    return this.sqlite
      .prepare(
        `SELECT n.*, u.full_name AS recipient_name
         FROM notifications n
         LEFT JOIN users u ON u.user_id = n.user_id
         ORDER BY n.notification_id DESC LIMIT 50`
      )
      .all()
      .map((r) => ({ ...r }));
  }

  markNotificationsRead(userId) {
    this.sqlite.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  }

  getMemberDashboardSummary(userId) {
    const user = this.findMemberById(userId);
    const invRow = this.sqlite
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_count,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
                COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) AS active_capital,
                COALESCE(SUM(credited_return), 0) AS total_profit
         FROM investments WHERE user_id = ?`
      )
      .get(userId);
    const wtxRow = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) AS total_deposits,
                COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status IN ('PENDING','COMPLETED') THEN amount ELSE 0 END), 0) AS total_withdrawals
         FROM wallet_transactions WHERE user_id = ?`
      )
      .get(userId);
    const bookings = this.listMemberBookings(user.phone);
    const paidBookings = bookings.filter((b) => b.status === 'paid').length;
    const ref = this.getMemberReferralSummary(userId);

    return {
      user,
      investmentsTotal: Number(invRow.total),
      investmentsActive: Number(invRow.active_count),
      investmentsCompleted: Number(invRow.completed_count),
      activeCapital: Number(invRow.active_capital),
      totalProfit: Number(invRow.total_profit),
      totalDeposits: Number(wtxRow.total_deposits),
      totalWithdrawals: Number(wtxRow.total_withdrawals),
      bookingsTotal: bookings.length,
      bookingsPaid: paidBookings,
      referralsTotal: ref.level1.length + ref.level2.length,
      referralsL1: ref.level1.length,
      referralsL2: ref.level2.length,
      referralEarned: ref.totalEarned,
      recentTx: this.listMemberWalletTransactions(userId, 6),
      upcomingBookings: bookings.slice(0, 4),
    };
  }

  getPortalAdminSummary() {
    const bookingStats = this.getDashboardStats();
    const userRow = this.sqlite
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active_users,
                COALESCE(SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END), 0) AS inactive_users,
                COALESCE(SUM(CASE WHEN kyc_status = 'pending' THEN 1 ELSE 0 END), 0) AS kyc_pending
         FROM users`
      )
      .get();
    const invRow = this.sqlite
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_inv,
                COALESCE(SUM(CASE WHEN status <> 'active' THEN 1 ELSE 0 END), 0) AS inactive_inv,
                COALESCE(SUM(amount), 0) AS invested_total
         FROM investments`
      )
      .get();
    const wtxRow = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN 1 ELSE 0 END), 0) AS deposit_count,
                COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'PENDING' THEN 1 ELSE 0 END), 0) AS deposit_pending,
                COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) AS deposits_total,
                COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status IN ('PENDING','COMPLETED') THEN amount ELSE 0 END), 0) AS withdrawals_total,
                COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'PENDING' THEN 1 ELSE 0 END), 0) AS withdrawal_pending
         FROM wallet_transactions`
      )
      .get();

    return {
      bookingStats,
      usersTotal: Number(userRow.total),
      usersActive: Number(userRow.active_users),
      usersInactive: Number(userRow.inactive_users),
      kycPending: Number(userRow.kyc_pending),
      investmentsTotal: Number(invRow.total),
      investmentsActive: Number(invRow.active_inv),
      investmentsInactive: Number(invRow.inactive_inv),
      investedVolume: Number(invRow.invested_total),
      depositCount: Number(wtxRow.deposit_count),
      depositPending: Number(wtxRow.deposit_pending),
      depositsTotal: Number(wtxRow.deposits_total),
      withdrawalsTotal: Number(wtxRow.withdrawals_total),
      withdrawalPending: Number(wtxRow.withdrawal_pending),
    };
  }

  getInvestmentReports() {
    const byPlan = this.sqlite
      .prepare(
        `SELECT p.name, p.cadence, p.roi_percent,
                COUNT(i.investment_id) AS subscriptions,
                COALESCE(SUM(i.amount), 0) AS capital,
                COALESCE(SUM(i.credited_return), 0) AS payouts
         FROM investment_plans p
         LEFT JOIN investments i ON i.plan_id = p.plan_id
         GROUP BY p.plan_id, p.name, p.cadence, p.roi_percent
         ORDER BY capital DESC`
      )
      .all()
      .map((r) => ({ ...r }));

    const byWalletType = this.sqlite
      .prepare(
        `SELECT type, status, COUNT(*) AS tx_count, COALESCE(SUM(amount), 0) AS total_amount
         FROM wallet_transactions
         GROUP BY type, status
         ORDER BY total_amount DESC`
      )
      .all()
      .map((r) => ({ ...r }));

    return { byPlan, byWalletType };
  }
}

let singletonDb = null;

export function getDb() {
  if (!singletonDb) {
    singletonDb = new StudioDatabase();
  }
  return singletonDb;
}
