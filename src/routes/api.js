import crypto from 'node:crypto';
import express from 'express';
import { getDb } from '../db.js';
import { HttpError } from '../security.js';

function getAdminApiToken() {
  return process.env.ATS_ADMIN_API_TOKEN || '';
}

function requireAdminApi(req) {
  const want = getAdminApiToken();
  const got = String(req.header('X-Admin-Token') || '');
  if (!want || want === 'change_me_to_a_long_random_string') {
    throw new HttpError('Admin token required.', 401);
  }
  const ab = Buffer.from(want, 'utf8');
  const bb = Buffer.from(got, 'utf8');
  if (ab.length !== bb.length || !crypto.timingSafeEqual(ab, bb)) {
    throw new HttpError('Admin token required.', 401);
  }
}

function handleApi(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.http).json({ error: err.message });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: 'Duplicate record.' });
        return;
      }
      if (msg.includes('FOREIGN KEY constraint failed')) {
        res.status(409).json({ error: 'Operation would break a relationship.' });
        return;
      }
      res.status(500).json({ error: 'Server error.' });
    }
  };
}

export function createApiRouter() {
  const router = express.Router();
  router.use(express.json());

  router.get(
    ['/health.php', '/health'],
    handleApi((_req, res) => {
      const h = getDb().healthCheck();
      res.json({
        status: 'ok',
        service: 'ATS media house & Capital backend',
        database: 'connected',
        engine: h.engine,
      });
    })
  );

  router.get(
    ['/plans.php', '/plans'],
    handleApi((_req, res) => {
      const plans = getDb().listInvestmentPlans(true);
      res.json(
        plans.map((p) => ({
          id: p.plan_id,
          code: p.code,
          name: p.name,
          cadence: p.cadence,
          roiPercent: p.roi_percent,
          durationDays: p.duration_days,
          minAmount: p.min_amount,
          maxAmount: p.max_amount,
          description: p.description,
        }))
      );
    })
  );

  router.get(
    ['/portal_stats.php', '/portal_stats'],
    handleApi((req, res) => {
      requireAdminApi(req);
      const db = getDb();
      res.json(db.getAdminPortalSummary());
    })
  );

  router.all(
    ['/services.php', '/services'],
    handleApi((req, res) => {
      const db = getDb();
      const id = Number(req.query.id ?? 0);

      if (req.method === 'GET') {
        if (req.query.all !== undefined) {
          requireAdminApi(req);
          res.json(
            db.getAllServices().map((s) => ({
              id: s.id,
              code: s.code,
              label: s.label,
              price: s.price,
              isActive: s.is_active,
            }))
          );
          return;
        }
        res.json(
          db.getActiveServices().map((s) => ({
            id: s.id,
            code: s.code,
            label: s.label,
            price: s.price,
            isActive: s.is_active,
          }))
        );
        return;
      }

      requireAdminApi(req);

      if (req.method === 'POST') {
        const body = req.body || {};
        const resSave = db.saveService(null, {
          code: body.code,
          label: body.label,
          price: body.price,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        });
        if (resSave.error || !resSave.service) {
          throw new HttpError(resSave.error || 'Invalid service.', 400);
        }
        const s = resSave.service;
        res.status(201).json({
          id: s.id,
          code: s.code,
          label: s.label,
          price: s.price,
          isActive: s.is_active,
        });
        return;
      }

      if (id <= 0) throw new HttpError('id is required.', 400);

      if (req.method === 'PUT') {
        const body = req.body || {};
        const resSave = db.saveService(id, {
          code: body.code,
          label: body.label,
          price: body.price,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        });
        if (resSave.error || !resSave.service) {
          throw new HttpError(resSave.error || 'Invalid service.', 400);
        }
        const s = resSave.service;
        res.json({
          id: s.id,
          code: s.code,
          label: s.label,
          price: s.price,
          isActive: s.is_active,
        });
        return;
      }

      if (req.method === 'DELETE') {
        const result = db.deleteService(id);
        res.json({ id, result });
        return;
      }

      throw new HttpError('Method not allowed.', 405);
    })
  );

  router.all(
    ['/bookings.php', '/bookings'],
    handleApi((req, res) => {
      const db = getDb();
      const id = String(req.query.id ?? '').trim();

      if (req.method === 'GET') {
        requireAdminApi(req);
        if (id) {
          res.json(db.findBooking(id));
          return;
        }
        res.json(db.listBookings());
        return;
      }

      if (req.method === 'POST') {
        const body = req.body || {};
        const { booking, created } = db.createBooking({
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          service: body.service,
          eventDate: body.eventDate,
          notes: body.notes,
        });
        res.status(created ? 201 : 200).json(booking);
        return;
      }

      if (req.method === 'PUT') {
        requireAdminApi(req);
        if (!id) throw new HttpError('id is required.', 400);
        const body = req.body || {};
        const updated = db.updateBooking(id, {
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          service: body.service,
          eventDate: body.eventDate,
          notes: body.notes,
        });
        res.json(updated);
        return;
      }

      if (req.method === 'DELETE') {
        requireAdminApi(req);
        if (!id) throw new HttpError('id is required.', 400);
        const result = db.deleteBooking(id);
        res.json({ id, result });
        return;
      }

      throw new HttpError('Method not allowed.', 405);
    })
  );

  router.all(
    ['/payment_initiate.php', '/payment_initiate'],
    handleApi((req, res) => {
      if (req.method !== 'POST') throw new HttpError('Method not allowed.', 405);
      const body = req.body || {};
      const bookingId = String(body.bookingId ?? '').trim();
      const phone = String(body.phone ?? '').trim();
      const { transactionId, msisdn } = getDb().initiatePayment(bookingId, phone);
      res.json({
        transactionId,
        status: 'PENDING',
        message: `UAT payment prompt sent to 0${msisdn}. Waiting for PIN confirmation.`,
      });
    })
  );

  router.all(
    ['/payment_status.php', '/payment_status'],
    handleApi((req, res) => {
      const id = String(req.query.id ?? '').trim();
      if (!id) throw new HttpError('Unknown transaction id.', 404);
      const status = getDb().checkAndSettlePayment(id, false);
      res.json({ transactionId: id, status });
    })
  );

  return router;
}
