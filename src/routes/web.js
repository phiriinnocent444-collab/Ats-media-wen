import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { getDb } from '../db.js';
import {
  HttpError,
  adminTokenCreate,
  adminTokenVerify,
  buildSetCookie,
  csrfOriginOk,
  csrfTokenCreate,
  csrfVerify,
  detectImageExtension,
  h,
  logEmail,
  memberTokenCreate,
  memberTokenVerify,
  money,
  niceDate,
  parseCookies,
  validateBookingInput,
  verifyPassword,
} from '../security.js';
import { renderAppLayout, routeUrl } from '../views/layout.js';
import {
  renderBookPage,
  renderGalleryPage,
  renderHomePage,
  renderNotFoundPage,
  renderStatusPage,
  renderThanksPage,
} from '../views/publicPages.js';
import {
  renderAdminAdminsPage,
  renderAdminBookingsPage,
  renderAdminDepositsPage,
  renderAdminGalleryPage,
  renderAdminInvestmentsPage,
  renderAdminNotificationsPage,
  renderAdminPlansPage,
  renderAdminReportsPage,
  renderAdminServicesPage,
  renderAdminSettingsPage,
  renderAdminTransactionsPage,
  renderAdminUsersPage,
  renderAdminWithdrawalsPage,
  renderDashboardPage,
  renderLoginPage,
} from '../views/adminPages.js';
import {
  renderMember2faPage,
  renderMemberBookingsPage,
  renderMemberDashboardPage,
  renderMemberDepositPage,
  renderMemberInvestPage,
  renderMemberKycPage,
  renderMemberLoginPage,
  renderMemberNotificationsPage,
  renderMemberReferralsPage,
  renderMemberRegisterPage,
  renderMemberTicketsPage,
  renderMemberTransferPage,
  renderMemberWithdrawPage,
} from '../views/memberPages.js';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const UPLOADS_GALLERY_DIR = path.join(ROOT_DIR, 'uploads', 'gallery');
const UPLOADS_THUMBS_DIR = path.join(ROOT_DIR, 'uploads', 'thumbs');

const SESSION_COOKIE = 'ats_sid';
const sessions = new Map();

function isHttpsRequest(req) {
  if (req.secure) return true;
  const xfProto = String(req.header('x-forwarded-proto') || '').toLowerCase();
  if (xfProto.includes('https')) return true;
  const xfSsl = String(req.header('x-forwarded-ssl') || '').toLowerCase();
  if (xfSsl === 'on') return true;
  const origin = String(req.header('origin') || '').toLowerCase();
  if (origin.startsWith('https://')) return true;
  const referer = String(req.header('referer') || '').toLowerCase();
  if (referer.startsWith('https://')) return true;
  return false;
}

function getOrCreateSession(req, res) {
  const cookies = parseCookies(req.header('cookie'));
  const sid = cookies[SESSION_COOKIE];
  let session = sid ? sessions.get(sid) : undefined;
  const hadSessionCookie = Boolean(sid && session);

  if (!session) {
    const newId = crypto.randomBytes(24).toString('hex');
    session = { id: newId, createdAt: Date.now() };
    sessions.set(newId, session);
    res.append(
      'Set-Cookie',
      buildSetCookie(SESSION_COOKIE, newId, { https: isHttpsRequest(req), httpOnly: true })
    );
  }

  return { session, cookies, hadSessionCookie };
}

function getCsrfToken(session) {
  if (!session.csrf || !session.csrf.includes('.')) {
    session.csrf = csrfTokenCreate();
  }
  return session.csrf;
}

function checkCsrfOrThrow(req, session) {
  const posted = String(req.body?.csrf ?? '');
  const originOk = csrfOriginOk(req.header('origin'), req.header('x-forwarded-host') || req.header('host'));
  const ok = csrfVerify(posted, session.csrf, originOk);
  if (ok) {
    session.csrf = posted;
    return true;
  }
  delete session.csrf;
  return false;
}

function csrfErrorPageHtml(backUrl) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Session refreshed | ATS media house</title><style>body{font-family:system-ui,sans-serif;background:#ECE6D6;color:#14171C;padding:48px 20px;margin:0}main{max-width:460px;margin:0 auto;background:#F7F3E8;border:1px solid #C9C0AD;padding:28px}a{display:inline-block;margin-top:14px;padding:10px 16px;background:#1F2B4D;color:#fff;text-decoration:none;font-weight:600}</style></head><body><main><h1>Form session expired</h1><p>Your form security token expired or could not be verified. Please reload the page to receive a fresh token and submit again.</p><a href="${h(backUrl)}">Reload form</a></main></body></html>`;
}

function resolveAdminContext(req, session) {
  const rawTok = String(req.body?._at ?? req.query._at ?? '').trim();
  if (rawTok) {
    const verified = adminTokenVerify(rawTok);
    if (verified) {
      if (!session.admin) {
        session.admin = verified;
      }
      return { adminToken: rawTok };
    }
  }
  return { adminToken: '' };
}

function resolveMemberContext(req, session) {
  const rawTok = String(req.body?._mt ?? req.query._mt ?? '').trim();
  if (rawTok) {
    const verified = memberTokenVerify(rawTok);
    if (verified) {
      if (!session.member) {
        session.member = verified;
      }
      return { memberToken: rawTok };
    }
  }
  return { memberToken: '' };
}

function popFlash(session) {
  const f = session.flash ?? null;
  delete session.flash;
  return f;
}

function setFlash(session, message, type = 'ok') {
  session.flash = { type, message };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
});

export function createWebRouter() {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  const handleHome = (req, res) => {
    const db = getDb();
    const { session, cookies } = getOrCreateSession(req, res);
    const services = db.getActiveServices();

    const formValues = {
      fullName: cookies.ats_name || '',
      phone: '',
      email: '',
      service: String(req.query.service ?? ''),
      eventDate: '',
      notes: '',
    };

    let errors = {};
    let paymentStatus = null;
    let createdBooking = null;
    let activeTxnId = null;
    let paymentPaid = false;

    if (req.method === 'POST') {
      const body = req.body || {};
      for (const k of Object.keys(formValues)) {
        if (body[k] !== undefined) {
          formValues[k] = String(body[k]).trim();
        }
      }

      if (!checkCsrfOrThrow(req, session)) {
        res.status(400);
        paymentStatus = {
          type: 'error',
          message: 'Your form security token expired or was invalid. A fresh token has been issued — please submit again.',
        };
      } else {
        const action = String(body.action || 'book');
        if (action === 'confirm_pin') {
          const txnId = String(body.transactionId || '').trim();
          const bookingId = String(body.bookingId || '').trim();
          try {
            const finalStatus = db.checkAndSettlePayment(txnId, true);
            createdBooking = db.findBooking(bookingId);
            if (finalStatus === 'SUCCESS') {
              paymentPaid = true;
              paymentStatus = {
                type: 'success',
                message:
                  'Payment confirmed — your booking is secured! Tap the WhatsApp button to send your booking details to 0772 300 053.',
              };
            } else if (finalStatus === 'FAILED') {
              paymentStatus = { type: 'error', message: 'Payment was not completed. Please try again.' };
            } else {
              activeTxnId = txnId;
              paymentStatus = {
                type: 'pending',
                message: 'Waiting for Airtel Money confirmation on your phone…',
              };
            }
          } catch (err) {
            paymentStatus = {
              type: 'error',
              message: err instanceof Error ? err.message : 'Payment confirmation failed.',
            };
          }
        } else {
          const check = validateBookingInput(
            formValues,
            services.map((s) => s.code)
          );
          errors = check.errors;
          if (Object.keys(errors).length === 0) {
            try {
              const { booking } = db.createBooking(formValues);
              createdBooking = booking;
              res.append(
                'Set-Cookie',
                buildSetCookie('ats_name', check.clean.name, {
                  https: isHttpsRequest(req),
                  maxAgeSec: 30 * 86400,
                })
              );
              if (booking.status === 'paid') {
                paymentPaid = true;
                paymentStatus = {
                  type: 'success',
                  message: 'Payment confirmed — your booking is secured!',
                };
              } else {
                const { transactionId, msisdn } = db.initiatePayment(booking.id, formValues.phone);
                activeTxnId = transactionId;
                paymentStatus = {
                  type: 'pending',
                  message: `Booking ${booking.id} created for ${money(booking.amount)}. Prompt sent to 0${msisdn} — confirm Airtel Money PIN below.`,
                };
              }
            } catch (err) {
              paymentStatus = {
                type: 'error',
                message: err instanceof Error ? err.message : 'Booking failed.',
              };
            }
          }
        }
      }
    }

    res.type('html').send(
      renderHomePage({
        services,
        investmentPlans: db.listInvestmentPlans(true),
        siteSettings: db.getSettings(),
        formValues,
        errors,
        csrfToken: getCsrfToken(session),
        paymentStatus,
        createdBooking,
        activeTxnId,
        paymentPaid,
      })
    );
  };

  router.all(['/', '/index.php'], handleHome);

  router.post(
    '/app/index.php',
    (req, res, next) => {
      const route = String(req.query.r ?? '');
      if (route === 'admin/gallery_upload') {
        upload.single('photo')(req, res, (err) => {
          if (err) {
            const { session } = getOrCreateSession(req, res);
            const { adminToken } = resolveAdminContext(req, session);
            setFlash(session, err instanceof Error ? err.message : 'Upload failed.', 'err');
            res.redirect(routeUrl('admin/gallery', {}, adminToken));
            return;
          }
          next();
        });
        return;
      }
      next();
    },
    handleAppRoute
  );

  router.get('/app/index.php', handleAppRoute);
  router.get('/app', (_req, res) => res.redirect('/app/index.php?r=page/book'));
  router.get('/app/', (_req, res) => res.redirect('/app/index.php?r=page/book'));

  return router;
}

function handleAppRoute(req, res) {
  const db = getDb();
  const { session, cookies, hadSessionCookie } = getOrCreateSession(req, res);
  const { adminToken } = resolveAdminContext(req, session);
  const { memberToken } = resolveMemberContext(req, session);
  const rawRoute = String(req.query.r ?? 'page/book');
  const route = /^[a-z_]+\/[a-z0-9_]+$/.test(rawRoute) ? rawRoute : 'page/book';
  const [controller, action] = route.split('/');
  const settings = db.getSettings();

  let activeMember = null;
  if (session.member) {
    try {
      activeMember = db.findMemberById(session.member.id);
    } catch {
      delete session.member;
    }
  }

  const renderPage = (title, bodyHtml, statusCode = 200) => {
    const html = renderAppLayout(title, bodyHtml, {
      admin: session.admin ?? null,
      adminToken,
      member: activeMember,
      memberToken,
      csrfToken: getCsrfToken(session),
      flash: popFlash(session),
      currentRoute: route,
      siteName: settings.site_name,
    });
    res.status(statusCode).type('html').send(html);
  };

  const requireCsrfPost = () => {
    if (!checkCsrfOrThrow(req, session)) {
      res.status(400).type('html').send(csrfErrorPageHtml(req.originalUrl || '/app/index.php'));
      return false;
    }
    return true;
  };

  // ---- PageController ----
  if (controller === 'page') {
    if (action === 'index') {
      res.redirect(routeUrl('page/book'));
      return;
    }
    if (action === 'book') {
      const services = db.getActiveServices();
      const body = req.body || {};
      let values = {
        fullName: cookies.ats_name || '',
        service: String(req.query.service ?? ''),
      };
      let errors = {};
      let statusCode = 200;

      if (req.method === 'POST') {
        values = {
          fullName: String(body.fullName ?? ''),
          phone: String(body.phone ?? ''),
          email: String(body.email ?? ''),
          service: String(body.service ?? ''),
          eventDate: String(body.eventDate ?? ''),
          notes: String(body.notes ?? ''),
        };
        if (!checkCsrfOrThrow(req, session)) {
          statusCode = 400;
          errors.form =
            'Your form security token expired or was invalid. A fresh token has been issued — please submit again.';
        } else {
          const check = validateBookingInput(
            values,
            services.map((s) => s.code)
          );
          errors = check.errors;
          if (Object.keys(errors).length === 0) {
            try {
              const { booking } = db.createBooking(values);
              res.append(
                'Set-Cookie',
                buildSetCookie('ats_name', check.clean.name, {
                  https: isHttpsRequest(req),
                  maxAgeSec: 30 * 86400,
                })
              );
              if (check.clean.email) {
                logEmail(
                  check.clean.email,
                  `ATS media house booking ${booking.id}`,
                  `Hello ${check.clean.name},\n\nYour booking ${booking.id} for ${booking.serviceLabel} on ${niceDate(booking.eventDate)} (${money(booking.amount)}) is saved and awaiting payment.\n\nATS media house`
                );
              }
              session.last_booking = booking.id;
              res.redirect(routeUrl('page/thanks', { id: booking.id }));
              return;
            } catch (err) {
              errors.form = err instanceof Error ? err.message : 'Booking failed.';
            }
          }
        }
      }

      renderPage(
        'Book a session',
        renderBookPage({
          services,
          values,
          errors,
          action: routeUrl('page/book'),
          submitLabel: 'Save booking',
          csrfToken: getCsrfToken(session),
        }),
        statusCode
      );
      return;
    }

    if (action === 'thanks') {
      const id = String(req.query.id ?? session.last_booking ?? '').trim();
      if (!id) {
        res.redirect(routeUrl('page/book'));
        return;
      }
      try {
        const booking = db.findBooking(id);
        renderPage('Booking saved', renderThanksPage(booking));
      } catch {
        res.redirect(routeUrl('page/book'));
      }
      return;
    }

    if (action === 'status') {
      const body = req.body || {};
      const q = String(req.query.q ?? body.q ?? '').trim();

      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const id = String(body.id ?? '').trim();
        const op = String(body.do ?? '');
        try {
          if (op === 'pay') {
            const txnId = db.payBookingNow(id);
            setFlash(session, `Payment ${txnId} confirmed — booking ${id} is now paid.`);
          } else if (op === 'cancel') {
            const result = db.deleteBooking(id);
            setFlash(session, `Booking ${id} ${result}.`);
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Action failed.', 'err');
        }
        res.redirect(routeUrl('page/status', q ? { q } : {}));
        return;
      }

      const rows = q ? db.lookupBookings(q) : [];
      renderPage('Booking lookup', renderStatusPage(q, rows, getCsrfToken(session)));
      return;
    }

    if (action === 'gallery') {
      renderPage('Gallery', renderGalleryPage(db.listGallery()));
      return;
    }
  }

  // ---- AuthController ----
  if (controller === 'auth') {
    if (action === 'login') {
      let error = '';
      let statusCode = 200;
      const body = req.body || {};

      if (req.method === 'POST') {
        const nowSec = Math.floor(Date.now() / 1000);
        if (!checkCsrfOrThrow(req, session)) {
          statusCode = 400;
          error =
            'Your login token expired or was invalid. A fresh token has been issued — please log in again.';
        } else if ((session.lock_until ?? 0) > nowSec) {
          error = 'Too many attempts. Wait a minute and try again.';
        } else {
          const username = String(body.username ?? '').trim();
          const password = String(body.password ?? '');
          const adminUser = db.findAdminByUsername(username);
          if (adminUser && verifyPassword(password, adminUser.password_hash)) {
            const newSid = crypto.randomBytes(24).toString('hex');
            sessions.delete(session.id);
            const nextSession = {
              id: newSid,
              admin: { id: adminUser.admin_id, name: adminUser.username },
              fails: 0,
              createdAt: Date.now(),
            };
            sessions.set(newSid, nextSession);
            res.append(
              'Set-Cookie',
              buildSetCookie(SESSION_COOKIE, newSid, { https: isHttpsRequest(req), httpOnly: true })
            );
            res.append(
              'Set-Cookie',
              buildSetCookie('ats_user', adminUser.username, {
                https: isHttpsRequest(req),
                maxAgeSec: 30 * 86400,
              })
            );
            const nextAdminTok = hadSessionCookie
              ? ''
              : adminTokenCreate(adminUser.admin_id, adminUser.username);
            res.redirect(routeUrl('admin/dashboard', {}, nextAdminTok));
            return;
          }
          session.fails = (session.fails ?? 0) + 1;
          if (session.fails >= 5) {
            session.lock_until = nowSec + 60;
            session.fails = 0;
          }
          error = 'Wrong username or password.';
        }
      }

      const remembered = String(body.username ?? cookies.ats_user ?? '');
      renderPage(
        'Admin login',
        renderLoginPage(error, remembered, getCsrfToken(session)),
        statusCode
      );
      return;
    }

    if (action === 'logout') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        sessions.delete(session.id);
        res.append(
          'Set-Cookie',
          buildSetCookie(SESSION_COOKIE, '', { https: isHttpsRequest(req), maxAgeSec: 0 })
        );
      }
      res.redirect(routeUrl('auth/login'));
      return;
    }
  }

  // ---- MemberController (MaxProfit-inspired Client & Investment Portal) ----
  if (controller === 'member') {
    if (action === 'register') {
      let error = '';
      const body = req.body || {};
      const values = {
        fullName: String(body.fullName ?? ''),
        email: String(body.email ?? ''),
        phone: String(body.phone ?? ''),
        referralCode: String(body.referralCode ?? req.query.ref ?? ''),
      };
      if (req.method === 'POST') {
        if (!checkCsrfOrThrow(req, session)) {
          error = 'Security token expired. Please submit again.';
        } else {
          try {
            const member = db.registerMember({ ...values, password: String(body.password ?? '') });
            session.member = { id: member.user_id, name: member.full_name };
            const nextTok = hadSessionCookie ? '' : memberTokenCreate(member.user_id, member.full_name);
            setFlash(session, `Welcome ${member.full_name}! Your ATS Studio & Capital wallet is ready.`);
            res.redirect(routeUrl('member/dashboard', {}, '', nextTok));
            return;
          } catch (err) {
            error = err instanceof Error ? err.message : 'Registration failed.';
          }
        }
      }
      renderPage('Client Registration', renderMemberRegisterPage(error, values, getCsrfToken(session), settings));
      return;
    }

    if (action === 'login') {
      let error = '';
      const body = req.body || {};
      const remembered = String(body.login ?? cookies.ats_member ?? '');
      if (req.method === 'POST') {
        if (!checkCsrfOrThrow(req, session)) {
          error = 'Login token expired. Please try again.';
        } else {
          const user = db.findMemberByLogin(body.login);
          if (!user || !verifyPassword(String(body.password ?? ''), user.password_hash)) {
            error = 'Invalid email/phone or password.';
          } else if (!user.is_active) {
            error = 'This client account has been suspended by administrator.';
          } else {
            res.append(
              'Set-Cookie',
              buildSetCookie('ats_member', user.email, { https: isHttpsRequest(req), maxAgeSec: 30 * 86400 })
            );
            if (user.two_fa_enabled) {
              const code = String(crypto.randomInt(100000, 999999));
              session.pending2fa = { userId: user.user_id, name: user.full_name, code };
              res.redirect(routeUrl('member/verify_2fa'));
              return;
            }
            session.member = { id: user.user_id, name: user.full_name };
            const nextTok = hadSessionCookie ? '' : memberTokenCreate(user.user_id, user.full_name);
            res.redirect(routeUrl('member/dashboard', {}, '', nextTok));
            return;
          }
        }
      }
      renderPage('Client Portal Login', renderMemberLoginPage(error, remembered, getCsrfToken(session)));
      return;
    }

    if (action === 'verify_2fa') {
      if (!session.pending2fa) {
        res.redirect(routeUrl('member/login'));
        return;
      }
      let error = '';
      if (req.method === 'POST') {
        if (!checkCsrfOrThrow(req, session)) {
          error = 'Token expired. Submit again.';
        } else if (String(req.body?.code ?? '').trim() === session.pending2fa.code) {
          const { userId, name } = session.pending2fa;
          delete session.pending2fa;
          session.member = { id: userId, name };
          const nextTok = hadSessionCookie ? '' : memberTokenCreate(userId, name);
          res.redirect(routeUrl('member/dashboard', {}, '', nextTok));
          return;
        } else {
          error = 'Incorrect 2FA verification code.';
        }
      }
      renderPage('2FA Verification', renderMember2faPage(error, session.pending2fa.code, getCsrfToken(session)));
      return;
    }

    if (action === 'logout') {
      if (req.method === 'POST' && !requireCsrfPost()) return;
      delete session.member;
      delete session.pending2fa;
      res.redirect(routeUrl('member/login'));
      return;
    }

    if (!activeMember) {
      setFlash(session, 'Please log in to your client wallet.', 'err');
      res.redirect(routeUrl('member/login'));
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    const mu = (r, extra = {}) => routeUrl(r, extra, '', memberToken);

    if (action === 'dashboard') {
      renderPage('Wallet Dashboard', renderMemberDashboardPage(db.getMemberDashboardSummary(activeMember.user_id), memberToken));
      return;
    }

    if (action === 'deposit') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        try {
          const resDep = db.createMemberDeposit(activeMember.user_id, req.body || {});
          setFlash(
            session,
            resDep.status === 'COMPLETED'
              ? `Deposit ${resDep.wtxId} of ${money(resDep.amount)} credited immediately to your wallet!`
              : `Deposit ${resDep.wtxId} submitted (${money(resDep.amount)}) and queued for admin confirmation.`
          );
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Deposit failed.', 'err');
        }
        res.redirect(mu('member/deposit'));
        return;
      }
      const deposits = db.listMemberWalletTransactions(activeMember.user_id, 50).filter((t) => t.type === 'deposit');
      renderPage('Fund Wallet', renderMemberDepositPage(activeMember, deposits, getCsrfToken(session), memberToken));
      return;
    }

    if (action === 'invest') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        try {
          const resInv = db.subscribeInvestment(activeMember.user_id, Number(req.body?.planId || 0), req.body?.amount);
          setFlash(
            session,
            `Investment ${resInv.investmentId} activated! Expected return: ${money(resInv.expectedReturn)} by ${niceDate(resInv.maturesAt)}.`
          );
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Could not activate investment.', 'err');
        }
        res.redirect(mu('member/invest'));
        return;
      }
      renderPage(
        'Investment Plans',
        renderMemberInvestPage(
          activeMember,
          db.listInvestmentPlans(false),
          db.listMemberInvestments(activeMember.user_id),
          getCsrfToken(session),
          memberToken
        )
      );
      return;
    }

    if (action === 'transfer') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        try {
          const tr = db.transferFunds(activeMember.user_id, req.body?.recipient, req.body?.amount, req.body?.note);
          setFlash(session, `Transferred ${money(tr.amount)} to ${tr.recipientName} (Ref: ${tr.reference}).`);
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Transfer failed.', 'err');
        }
        res.redirect(mu('member/transfer'));
        return;
      }
      renderPage(
        'Internal Transfer',
        renderMemberTransferPage(activeMember, db.listMemberWalletTransactions(activeMember.user_id, 50), getCsrfToken(session), memberToken)
      );
      return;
    }

    if (action === 'withdraw') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        try {
          const w = db.requestWithdrawal(activeMember.user_id, req.body || {});
          setFlash(session, `Withdrawal request ${w.wtxId} for ${money(w.amount)} submitted.`);
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Withdrawal failed.', 'err');
        }
        res.redirect(mu('member/withdraw'));
        return;
      }
      renderPage(
        'Withdraw Funds',
        renderMemberWithdrawPage(activeMember, db.listMemberWalletTransactions(activeMember.user_id, 50), settings, getCsrfToken(session), memberToken)
      );
      return;
    }

    if (action === 'bookings') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          if (body.do === 'pay_wallet') {
            const txnId = db.payBookingWithWallet(activeMember.user_id, String(body.bookingId ?? ''));
            setFlash(session, `Booking paid from wallet (Txn: ${txnId}).`);
          } else {
            const { booking } = db.createBooking({
              fullName: activeMember.full_name,
              phone: activeMember.phone,
              email: activeMember.email,
              service: body.service,
              eventDate: body.eventDate,
              notes: body.notes,
            });
            setFlash(session, `Studio shoot ${booking.id} reserved! You can pay from your wallet below.`);
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Booking action failed.', 'err');
        }
        res.redirect(mu('member/bookings'));
        return;
      }
      renderPage(
        'Studio Bookings',
        renderMemberBookingsPage(
          activeMember,
          db.listMemberBookings(activeMember.phone),
          db.getActiveServices(),
          getCsrfToken(session),
          memberToken
        )
      );
      return;
    }

    if (action === 'kyc') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          if (body.do === 'submit_kyc') {
            db.submitMemberKyc(activeMember.user_id, body);
            setFlash(session, 'KYC identity document submitted and queued for administrator verification.');
          } else if (body.do === 'toggle_2fa') {
            const enable = body.enable === '1';
            db.toggleMember2fa(activeMember.user_id, enable);
            setFlash(session, enable ? 'Two-Factor Authentication enabled.' : 'Two-Factor Authentication disabled.');
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Security update failed.', 'err');
        }
        res.redirect(mu('member/kyc'));
        return;
      }
      renderPage('KYC & 2FA Security', renderMemberKycPage(activeMember, getCsrfToken(session), memberToken));
      return;
    }

    if (action === 'referrals') {
      renderPage('Referral Network', renderMemberReferralsPage(activeMember, db.getMemberReferralSummary(activeMember.user_id), settings));
      return;
    }

    if (action === 'tickets') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          if (body.do === 'create') {
            const tid = db.createSupportTicket(activeMember.user_id, body.subject, body.category, body.message);
            setFlash(session, `Support ticket ${tid} opened.`);
          } else if (body.do === 'reply') {
            db.replySupportTicket(String(body.ticketId ?? ''), 'user', activeMember.full_name, body.body);
            setFlash(session, 'Reply sent to support desk.');
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Ticket error.', 'err');
        }
        res.redirect(mu('member/tickets'));
        return;
      }
      renderPage('Support Tickets', renderMemberTicketsPage(db.listMemberTickets(activeMember.user_id), getCsrfToken(session), memberToken));
      return;
    }

    if (action === 'notifications') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        db.markNotificationsRead(activeMember.user_id);
        setFlash(session, 'Personal notifications marked as read.');
        res.redirect(mu('member/notifications'));
        return;
      }
      renderPage(
        'Notifications',
        renderMemberNotificationsPage(db.listMemberNotifications(activeMember.user_id), getCsrfToken(session), memberToken)
      );
      return;
    }
  }

  // ---- AdminController ----
  if (controller === 'admin') {
    if (!session.admin) {
      setFlash(session, 'Please log in.', 'err');
      res.redirect(routeUrl('auth/login'));
      return;
    }
    res.setHeader('Cache-Control', 'no-store');

    if (action === 'dashboard') {
      renderPage(
        'Dashboard',
        renderDashboardPage(db.getPortalAdminSummary(), db.getUpcomingBookings(5), adminToken)
      );
      return;
    }

    if (action === 'users') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          const msg = db.adminUpdateMember(Number(body.userId || 0), String(body.do || ''), body.amount);
          setFlash(session, msg);
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'User action failed.', 'err');
        }
        res.redirect(routeUrl('admin/users', {}, adminToken));
        return;
      }
      const q = String(req.query.q ?? '');
      renderPage('Manage Users', renderAdminUsersPage(db.listMembers(q), q, getCsrfToken(session), adminToken));
      return;
    }

    if (action === 'admins') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          if (body.do === 'create') {
            db.createAdminUser(body.username, body.password);
            setFlash(session, `Administrator ${String(body.username).trim()} created.`);
          } else if (body.do === 'delete') {
            const removed = db.deleteAdminUser(Number(body.adminId || 0));
            setFlash(session, `Administrator ${removed} removed.`);
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Admin update failed.', 'err');
        }
        res.redirect(routeUrl('admin/admins', {}, adminToken));
        return;
      }
      renderPage('Manage Admins', renderAdminAdminsPage(db.listAdmins(), getCsrfToken(session), adminToken));
      return;
    }

    if (action === 'plans') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          if (body.do === 'save') {
            const resPlan = db.saveInvestmentPlan(Number(body.planId || 0) || null, body);
            if (resPlan.error) setFlash(session, resPlan.error, 'err');
            else setFlash(session, `Investment plan "${resPlan.plan.name}" saved.`);
          } else if (body.do === 'toggle') {
            const next = db.toggleInvestmentPlanStatus(Number(body.planId || 0));
            setFlash(session, `Investment plan is now ${next}.`);
          } else if (body.do === 'delete') {
            const out = db.deleteInvestmentPlan(Number(body.planId || 0));
            setFlash(session, `Investment plan ${out}.`);
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Plan update failed.', 'err');
        }
        res.redirect(routeUrl('admin/plans', {}, adminToken));
        return;
      }
      renderPage('Investment Plans', renderAdminPlansPage(db.listInvestmentPlans(false), getCsrfToken(session), adminToken));
      return;
    }

    if (action === 'investments') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          if (body.do === 'payout') {
            const out = db.creditInvestmentYield(String(body.investmentId || ''));
            setFlash(session, `Credited ${money(out.payout)} ROI payout to investor wallet (Status: ${out.status}).`);
          } else if (body.do === 'toggle') {
            const next = db.toggleInvestmentStatus(String(body.investmentId || ''));
            setFlash(session, `Investment ${String(body.investmentId)} is now ${next}.`);
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Investment update failed.', 'err');
        }
        res.redirect(routeUrl('admin/investments', {}, adminToken));
        return;
      }
      renderPage('Manage Investments', renderAdminInvestmentsPage(db.listAllInvestments(), getCsrfToken(session), adminToken));
      return;
    }

    if (action === 'deposits') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        try {
          const outcome = db.settleDeposit(String(req.body?.wtxId || ''), String(req.body?.outcome || ''));
          setFlash(session, `Deposit ${String(req.body?.wtxId)} settled as ${outcome}.`);
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Deposit settlement failed.', 'err');
        }
        res.redirect(routeUrl('admin/deposits', {}, adminToken));
        return;
      }
      renderPage('User Deposits', renderAdminDepositsPage(db.listAllDeposits(100), getCsrfToken(session), adminToken));
      return;
    }

    if (action === 'withdrawals') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        try {
          const outcome = db.settleWithdrawal(String(req.body?.wtxId || ''), String(req.body?.outcome || ''));
          setFlash(session, `Withdrawal ${String(req.body?.wtxId)} marked ${outcome}.`);
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Withdrawal settlement failed.', 'err');
        }
        res.redirect(routeUrl('admin/withdrawals', {}, adminToken));
        return;
      }
      renderPage('User Withdrawals', renderAdminWithdrawalsPage(db.listAllWithdrawals(100), getCsrfToken(session), adminToken));
      return;
    }

    if (action === 'notifications') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        try {
          if (body.do === 'send_notice') {
            db.sendNotification(body.userId ? Number(body.userId) : null, body.title, body.body);
            setFlash(session, 'Notification dispatched.');
          } else if (body.do === 'reply_ticket') {
            const nextStatus = db.replySupportTicket(
              String(body.ticketId || ''),
              'admin',
              session.admin.name,
              body.body,
              body.closeTicket === '1'
            );
            setFlash(session, `Ticket ${String(body.ticketId)} updated (${nextStatus}).`);
          }
        } catch (err) {
          setFlash(session, err instanceof Error ? err.message : 'Notification action failed.', 'err');
        }
        res.redirect(routeUrl('admin/notifications', {}, adminToken));
        return;
      }
      renderPage(
        'Tickets & Notices',
        renderAdminNotificationsPage(
          db.listAllTickets(),
          db.listAllNotifications(),
          db.listMembers(''),
          getCsrfToken(session),
          adminToken
        )
      );
      return;
    }

    if (action === 'settings') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        db.updateSettings({
          site_name: body.site_name,
          referral_l1_percent: body.referral_l1_percent,
          referral_l2_percent: body.referral_l2_percent,
          smtp_host: body.smtp_host,
          smtp_from: body.smtp_from,
          registration_enabled: Boolean(body.registration_enabled),
          withdrawals_enabled: Boolean(body.withdrawals_enabled),
        });
        setFlash(session, 'Website configuration saved.');
        res.redirect(routeUrl('admin/settings', {}, adminToken));
        return;
      }
      renderPage('Site Settings', renderAdminSettingsPage(settings, getCsrfToken(session), adminToken));
      return;
    }

    if (action === 'bookings') {
      const q = String(req.query.q ?? '').trim();
      const status = String(req.query.status ?? '');
      const timing = String(req.query.timing ?? '');
      renderPage(
        'Bookings',
        renderAdminBookingsPage({
          rows: db.listBookings(q, status, timing),
          q,
          status,
          timing,
          services: db.getActiveServices(),
          csrfToken: getCsrfToken(session),
          adminToken,
        })
      );
      return;
    }

    if (action === 'booking_create') {
      if (req.method !== 'POST') {
        res.redirect(routeUrl('admin/bookings', {}, adminToken));
        return;
      }
      if (!requireCsrfPost()) return;
      const body = req.body || {};
      try {
        const { booking } = db.createBooking({
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          service: body.service,
          eventDate: body.eventDate,
          notes: body.notes,
        });
        setFlash(session, `Booking ${booking.id} created for ${booking.fullName}.`);
      } catch (err) {
        setFlash(session, err instanceof Error ? err.message : 'Could not create booking.', 'err');
      }
      res.redirect(routeUrl('admin/bookings', {}, adminToken));
      return;
    }

    if (action === 'booking_action') {
      if (req.method !== 'POST') {
        res.redirect(routeUrl('admin/bookings', {}, adminToken));
        return;
      }
      if (!requireCsrfPost()) return;
      const body = req.body || {};
      const id = String(body.id ?? '');
      const op = String(body.do ?? '');
      try {
        if (op === 'paid') {
          db.markBookingPaid(id);
          setFlash(session, 'Booking marked as paid (transaction recorded).');
        } else if (op === 'cancel') {
          db.cancelBooking(id);
          setFlash(session, 'Booking cancelled.');
        } else if (op === 'delete') {
          const result = db.deleteBooking(id);
          setFlash(session, `Booking ${result}.`);
        } else {
          setFlash(session, 'Unknown action.', 'err');
        }
      } catch (err) {
        setFlash(session, err instanceof Error ? err.message : 'Action failed.', 'err');
      }
      res.redirect(routeUrl('admin/bookings', {}, adminToken));
      return;
    }

    if (action === 'booking_edit') {
      const id = String(req.query.id ?? '').trim();
      let booking;
      try {
        booking = db.findBooking(id);
      } catch {
        setFlash(session, 'Booking not found.', 'err');
        res.redirect(routeUrl('admin/bookings', {}, adminToken));
        return;
      }

      const services = db.getActiveServices();
      const body = req.body || {};
      let values = {
        fullName: booking.fullName,
        phone: booking.phone,
        email: booking.email ?? '',
        service: booking.service,
        eventDate: booking.eventDate,
        notes: booking.notes ?? '',
      };
      let errors = {};
      let statusCode = 200;

      if (req.method === 'POST') {
        values = {
          fullName: String(body.fullName ?? ''),
          phone: String(body.phone ?? ''),
          email: String(body.email ?? ''),
          service: String(body.service ?? ''),
          eventDate: String(body.eventDate ?? ''),
          notes: String(body.notes ?? ''),
        };
        if (!checkCsrfOrThrow(req, session)) {
          statusCode = 400;
          errors.form =
            'Your form security token expired or was invalid. A fresh token has been issued — please submit again.';
        } else {
          const check = validateBookingInput(
            values,
            services.map((s) => s.code)
          );
          errors = check.errors;
          if (Object.keys(errors).length === 0) {
            try {
              db.updateBooking(id, values);
              setFlash(session, 'Booking updated.');
              res.redirect(routeUrl('admin/bookings', {}, adminToken));
              return;
            } catch (err) {
              errors.form = err instanceof Error ? err.message : 'Could not update booking.';
            }
          }
        }
      }

      renderPage(
        `Edit booking ${id}`,
        renderBookPage({
          services,
          values,
          errors,
          action: routeUrl('admin/booking_edit', { id }, adminToken),
          submitLabel: 'Update booking',
          csrfToken: getCsrfToken(session),
          adminToken,
        }),
        statusCode
      );
      return;
    }

    if (action === 'services') {
      renderPage(
        'Services',
        renderAdminServicesPage(db.getAllServices(), getCsrfToken(session), adminToken)
      );
      return;
    }

    if (action === 'service_save') {
      if (req.method !== 'POST') {
        res.redirect(routeUrl('admin/services', {}, adminToken));
        return;
      }
      if (!requireCsrfPost()) return;
      const body = req.body || {};
      const id = Number(body.id ?? 0) || null;
      const saved = db.saveService(id, {
        code: body.code,
        label: body.label,
        price: body.price,
        isActive: Boolean(body.is_active),
      });
      if (saved.error) {
        setFlash(session, saved.error, 'err');
      } else {
        setFlash(session, id ? 'Service updated.' : 'Service added.');
      }
      res.redirect(routeUrl('admin/services', {}, adminToken));
      return;
    }

    if (action === 'service_delete') {
      if (req.method !== 'POST') {
        res.redirect(routeUrl('admin/services', {}, adminToken));
        return;
      }
      if (!requireCsrfPost()) return;
      const body = req.body || {};
      const id = Number(body.id ?? 0);
      try {
        const resDel = db.deleteService(id);
        setFlash(session, `Service package ${resDel}.`);
      } catch (err) {
        setFlash(session, err instanceof Error ? err.message : 'Could not delete package.', 'err');
      }
      res.redirect(routeUrl('admin/services', {}, adminToken));
      return;
    }

    if (action === 'transactions') {
      renderPage(
        'Transactions',
        renderAdminTransactionsPage(db.listTransactions(100), getCsrfToken(session), adminToken)
      );
      return;
    }

    if (action === 'transaction_action') {
      if (req.method !== 'POST') {
        res.redirect(routeUrl('admin/transactions', {}, adminToken));
        return;
      }
      if (!requireCsrfPost()) return;
      const body = req.body || {};
      const txnId = String(body.id ?? '').trim();
      const outcome = String(body.outcome ?? '');
      try {
        const result = db.settleTransaction(txnId, outcome);
        setFlash(session, `Transaction ${txnId} settled as ${result} inside ACID transaction.`);
      } catch (err) {
        setFlash(session, err instanceof Error ? err.message : 'Settlement failed.', 'err');
      }
      res.redirect(routeUrl('admin/transactions', {}, adminToken));
      return;
    }

    if (action === 'gallery') {
      renderPage(
        'Gallery admin',
        renderAdminGalleryPage(db.listGallery(), getCsrfToken(session), adminToken)
      );
      return;
    }

    if (action === 'gallery_upload') {
      if (req.method !== 'POST') {
        res.redirect(routeUrl('admin/gallery', {}, adminToken));
        return;
      }
      if (!requireCsrfPost()) return;
      const body = req.body || {};
      const title = String(body.title ?? '').trim();
      const file = req.file;
      try {
        if (!title) throw new HttpError('Give the photo a title.', 400);
        if (!file || !file.buffer || file.buffer.length === 0) {
          throw new HttpError('Please select an image file.', 400);
        }
        const ext = detectImageExtension(file.buffer);
        if (!ext) throw new HttpError('Only JPG, PNG or WEBP images are allowed.', 400);

        const safeName = `${crypto.randomBytes(8).toString('hex')}${ext}`;
        fs.mkdirSync(UPLOADS_GALLERY_DIR, { recursive: true });
        fs.mkdirSync(UPLOADS_THUMBS_DIR, { recursive: true });
        fs.writeFileSync(path.join(UPLOADS_GALLERY_DIR, safeName), file.buffer);
        fs.writeFileSync(path.join(UPLOADS_THUMBS_DIR, safeName), file.buffer);
        db.addGalleryPhoto(title, safeName, safeName, session.admin.id);
        setFlash(session, 'Photo uploaded.');
      } catch (err) {
        setFlash(session, err instanceof Error ? err.message : 'Upload failed.', 'err');
      }
      res.redirect(routeUrl('admin/gallery', {}, adminToken));
      return;
    }

    if (action === 'gallery_delete') {
      if (req.method === 'POST') {
        if (!requireCsrfPost()) return;
        const body = req.body || {};
        const id = Number(body.id ?? 0);
        const filename = db.removeGalleryPhoto(id);
        if (filename) {
          const base = path.basename(filename);
          for (const dir of [UPLOADS_GALLERY_DIR, UPLOADS_THUMBS_DIR]) {
            const fp = path.join(dir, base);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          }
        }
        setFlash(session, 'Photo deleted.');
      }
      res.redirect(routeUrl('admin/gallery', {}, adminToken));
      return;
    }

    if (action === 'reports') {
      renderPage(
        'Reports',
        renderAdminReportsPage(
          db.getReportByService(),
          db.getReportByMonth(),
          db.getReportTopCustomers(),
          db.getInvestmentReports()
        )
      );
      return;
    }
  }

  res.status(404).type('html').send(renderNotFoundPage());
}
