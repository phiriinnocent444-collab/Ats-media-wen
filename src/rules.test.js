import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioDatabase } from './db.js';
import {
  adminTokenCreate,
  adminTokenVerify,
  csrfTokenCreate,
  csrfVerify,
  detectImageExtension,
  hashPassword,
  normalizeMsisdn,
  validateBookingInput,
  validateServiceInput,
  verifyPassword,
} from './security.js';

test('normalizeMsisdn normalizes Zambian numbers consistently', () => {
  assert.equal(normalizeMsisdn('0972971151'), '972971151');
  assert.equal(normalizeMsisdn('+260972971151'), '972971151');
  assert.equal(normalizeMsisdn('260 972 971 151'), '972971151');
  assert.equal(normalizeMsisdn('972971151'), '972971151');
});

test('validateBookingInput catches invalid inputs and accepts valid Zambian bookings', () => {
  const active = ['wedding', 'corporate', 'graduation'];
  const bad = validateBookingInput(
    {
      fullName: '123',
      phone: '0811111111',
      email: 'not-an-email',
      service: 'unknown',
      eventDate: '2020-01-01',
    },
    active,
    '2026-11-18'
  );
  assert.ok(bad.errors.fullName);
  assert.ok(bad.errors.phone);
  assert.ok(bad.errors.email);
  assert.ok(bad.errors.service);
  assert.ok(bad.errors.eventDate);

  const good = validateBookingInput(
    {
      fullName: "Chanda O'Mwansa",
      phone: '+260972971151',
      email: 'chanda@example.com',
      service: 'wedding',
      eventDate: '2026-12-28',
      notes: 'Kabulonga Gardens',
    },
    active,
    '2026-11-18'
  );
  assert.deepEqual(good.errors, {});
  assert.equal(good.clean.phone, '972971151');
});

test('validateServiceInput validates package codes, labels, and positive prices', () => {
  const bad = validateServiceInput({ code: 'A', label: '', price: '-10' });
  assert.ok(bad.error);
  const good = validateServiceInput({ code: 'drone_pkg', label: 'Drone Coverage', price: '1250', isActive: true });
  assert.equal(good.error, null);
  assert.equal(good.clean.code, 'drone_pkg');
  assert.equal(good.clean.price, 1250);
});

test('password hashing & verification work with scrypt hashes', () => {
  const hashed = hashPassword('ats-2026');
  assert.equal(verifyPassword('ats-2026', hashed), true);
  assert.equal(verifyPassword('ats2026', hashed), false);
});

test('CSRF and cookieless admin tokens verify and reject tampering/expiry', () => {
  const now = 1_794_837_700;
  const tok = csrfTokenCreate(now);
  assert.equal(csrfVerify(tok, tok, true, now + 10), true);
  assert.equal(csrfVerify(tok, undefined, true, now + 10), true);
  assert.equal(csrfVerify(tok, undefined, false, now + 10), false);
  assert.equal(csrfVerify(tok + 'x', undefined, true, now + 10), false);
  assert.equal(csrfVerify(tok, undefined, true, now + 50000), false);

  const adminTok = adminTokenCreate(1, 'admin', now);
  assert.deepEqual(adminTokenVerify(adminTok, now + 60), { id: 1, name: 'admin' });
  assert.equal(adminTokenVerify(adminTok + '0', now + 60), null);
  assert.equal(adminTokenVerify(adminTok, now + 30000), null);
});

test('detectImageExtension verifies magic bytes for JPEG, PNG, and WEBP', () => {
  assert.equal(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), '.jpg');
  assert.equal(
    detectImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    '.png'
  );
  assert.equal(detectImageExtension(Buffer.from('RIFF1234WEBP', 'ascii')), '.webp');
  assert.equal(detectImageExtension(Buffer.from('<html>not an image</html>', 'ascii')), null);
});

test('SQLite ACID transactions enforce idempotency, payment settlement, and rollback', () => {
  const db = new StudioDatabase(':memory:', false);

  const first = db.createBooking({
    fullName: 'Luyando Banda',
    phone: '0971112233',
    email: 'luyando@example.com',
    service: 'graduation',
    eventDate: '2026-12-20',
    notes: 'UNZA Main Campus',
  });
  assert.equal(first.created, true);
  assert.equal(first.booking.amount, 700);
  assert.equal(first.booking.status, 'pending_payment');

  const retry = db.createBooking({
    fullName: 'Luyando Banda',
    phone: '0971112233',
    email: 'luyando@example.com',
    service: 'graduation',
    eventDate: '2026-12-20',
    notes: 'UNZA Main Campus',
  });
  assert.equal(retry.created, false);
  assert.equal(retry.booking.id, first.booking.id);

  const { transactionId } = db.initiatePayment(first.booking.id, '0971112233');
  const settled = db.settleTransaction(transactionId, 'SUCCESS');
  assert.equal(settled, 'SUCCESS');
  assert.equal(db.findBooking(first.booking.id).status, 'paid');

  assert.throws(
    () =>
      db.createBooking({
        fullName: 'Luyando Banda',
        phone: '0971112233',
        email: 'luyando@example.com',
        service: 'graduation',
        eventDate: '2026-12-20',
        notes: 'Duplicate',
      }),
    /already have a paid booking/
  );

  const beforeCount = db.listBookings().length;
  assert.throws(() => {
    db.withTx(() => {
      db.sqlite
        .prepare(
          "INSERT INTO bookings (booking_id, customer_id, service_id, amount_due, event_date, status) VALUES ('BK_ROLLBACK', 1, 1, 100, '2026-12-30', 'pending_payment')"
        )
        .run();
      throw new Error('simulated failure');
    });
  }, /simulated failure/);
  assert.equal(db.listBookings().length, beforeCount);
});

test('Combined Studio & Capital ACID wallet, L1/L2 referrals, investments, transfers, and refunds work accurately', () => {
  const db = new StudioDatabase(':memory:', false);

  // Register L1 (Bupe) referred by Dalitso, and L2 (Kabwe) referred by Bupe
  const dalitso = db.registerMember({
    fullName: 'Dalitso Tembo',
    email: 'dalitso.test@example.com',
    phone: '0975551111',
    password: 'password123',
    referralCode: '',
  });
  const bupe = db.registerMember({
    fullName: 'Bupe Lungu',
    email: 'bupe.test@example.com',
    phone: '0975552222',
    password: 'password123',
    referralCode: dalitso.referral_code,
  });
  const kabwe = db.registerMember({
    fullName: 'Kabwe Phiri',
    email: 'kabwe.test@example.com',
    phone: '0975553333',
    password: 'password123',
    referralCode: bupe.referral_code,
  });

  // Kabwe submits Airtel Money deposit of K1000 -> credits K1000 to Kabwe + 5% (K50) L1 to Bupe + 2% (K20) L2 to Dalitso
  const dep = db.createMemberDeposit(kabwe.user_id, { method: 'airtel_money', amount: 1000, reference: 'AM-UNIT-1' });
  assert.equal(dep.status, 'COMPLETED');
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, 1000);
  assert.equal(db.findMemberById(bupe.user_id).wallet_balance, 50);
  assert.equal(db.findMemberById(dalitso.user_id).wallet_balance, 20);

  // Bank transfer stays pending until admin approves (credits K1000 -> total K2000)
  const bankDep = db.createMemberDeposit(kabwe.user_id, { method: 'bank_transfer', amount: 1000, reference: 'BANK-UNIT-2' });
  assert.equal(bankDep.status, 'PENDING');
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, 1000);
  db.settleDeposit(bankDep.wtxId, 'COMPLETED');
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, 2000);

  // Kabwe subscribes to seeded Daily plan (min 250) with K1000 and receives admin yield payout
  const plans = db.listInvestmentPlans(true);
  assert.ok(plans.length >= 3);
  const plan = plans[0];
  const inv = db.subscribeInvestment(kabwe.user_id, plan.plan_id, 1000);
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, 1000);

  const payoutRes = db.creditInvestmentYield(inv.investmentId);
  assert.equal(payoutRes.payout, Number(((1000 * plan.roi_percent) / 100).toFixed(2)));
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, 1000 + payoutRes.payout);

  // Internal transfer from Kabwe to Bupe
  db.transferFunds(kabwe.user_id, bupe.email, 100, 'Shared shoot split');
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, 900 + payoutRes.payout);

  // Withdrawal reserves balance and rejection refunds it atomically
  const beforeWithdrawBal = db.findMemberById(kabwe.user_id).wallet_balance;
  const wdr = db.requestWithdrawal(kabwe.user_id, { method: 'airtel_money', amount: 200, destination: '0975553333' });
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, beforeWithdrawBal - 200);
  db.settleWithdrawal(wdr.wtxId, 'REJECTED');
  assert.equal(db.findMemberById(kabwe.user_id).wallet_balance, beforeWithdrawBal);

  // Member creates studio booking and pays from wallet
  const bk = db.createBooking({
    fullName: 'Kabwe Phiri',
    phone: '0975553333',
    email: 'kabwe.test@example.com',
    service: 'family',
    eventDate: '2026-12-29',
    notes: 'Wallet booking test',
  });
  assert.equal(bk.booking.status, 'pending_payment');
  db.payBookingWithWallet(kabwe.user_id, bk.booking.id);
  assert.equal(db.findBooking(bk.booking.id).status, 'paid');
});

