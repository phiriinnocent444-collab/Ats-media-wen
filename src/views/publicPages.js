import { daysUntil, h, money, moneyWhole, niceDate, todayLusakaYmd } from '../security.js';
import { csrfField, routeUrl } from './layout.js';

const DEFAULT_DESCRIPTIONS = {
  wedding: 'Full-day coverage of your ceremony and reception, edited highlight gallery.',
  corporate: 'Headshots, office and event photography for your business or team.',
  event: 'Parties, launches and celebrations, delivered within 48 hours.',
  family: 'A relaxed studio or outdoor session for the whole family.',
  graduation: 'Shoot your graduation memories with us — gown, cap and all.',
};

export function renderHomePage(opts) {
  const {
    services,
    investmentPlans = [],
    siteSettings = {},
    formValues,
    errors,
    csrfToken,
    paymentStatus,
    createdBooking,
    activeTxnId,
    paymentPaid,
  } = opts;
  const todayYmd = todayLusakaYmd();
  const siteName = siteSettings.site_name || 'ATS media house & Capital';

  let waHref = '#';
  if (createdBooking) {
    const waText =
      `Hello ATS media house, ${paymentPaid ? 'I have paid for' : 'I have made'} a booking.\n` +
      `Reference: ${createdBooking.id}\n` +
      `Name: ${createdBooking.fullName}\n` +
      `Package: ${createdBooking.serviceLabel} (K${Math.round(Number(createdBooking.amount))})\n` +
      `Date: ${createdBooking.eventDate}`;
    waHref = `https://wa.me/260772300053?text=${encodeURIComponent(waText)}`;
  }

  const serviceCards = services
    .map((svc, idx) => {
      const frameNo = String(idx + 1).padStart(2, '0');
      const desc =
        svc.description ||
        DEFAULT_DESCRIPTIONS[svc.code] ||
        `${svc.label} photography session with edited digital delivery.`;
      return `<a href="?service=${encodeURIComponent(svc.code)}#book" class="frame-card" data-package-code="${h(svc.code)}">
        <div>
          <span class="frame-no">${h(frameNo)}</span>
          <h3>${h(svc.label)}</h3>
          <p>${h(desc)}</p>
        </div>
        <p class="price">${h(moneyWhole(svc.price))}</p>
      </a>`;
    })
    .join('\n');

  const serviceOptions = services
    .map(
      (svc) =>
        `<option value="${h(svc.code)}" ${formValues.service === svc.code ? 'selected' : ''}>${h(svc.label)} &mdash; ${h(moneyWhole(svc.price))}</option>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="ATS media house - Wedding, Corporate, Family and Event photography in Lusaka, Zambia. Book online and pay securely with Airtel Money.">
  <meta property="og:title" content="ATS media house | Lusaka, Zambia">
  <meta property="og:description" content="Wedding, Corporate, Family and Event photography in Lusaka, Zambia. Book online and pay securely with Airtel Money.">
  <meta property="og:type" content="website">
  <title>ATS media house | Lusaka, Zambia</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Work+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <div class="frame">
      <a href="#top" class="brand">
        <span class="brand-mark" aria-hidden="true">◎</span>
        <span class="brand-text">ATS <em>media house</em></span>
      </a>
      <nav aria-label="Primary">
        <a href="#services">Services</a>
        <a href="#invest">Invest</a>
        <a href="/app/index.php?r=page/gallery">Gallery</a>
        <a href="/app/index.php?r=member/login">Client Portal</a>
        <a href="/app/index.php?r=auth/login">Admin</a>
      </nav>
      <div class="header-actions">
        <a class="btn btn-ghost header-cta" href="https://wa.me/260772300053" target="_blank" rel="noopener">WhatsApp us</a>
        <details class="mobile-nav">
          <summary aria-label="Open navigation menu">Menu</summary>
          <div class="mobile-nav-drawer">
            <a href="#services">Services</a>
            <a href="#invest">Invest</a>
            <a href="/app/index.php?r=page/gallery">Gallery</a>
            <a href="/app/index.php?r=member/login">Client Portal</a>
            <a href="/app/index.php?r=auth/login">Admin</a>
            <a class="btn btn-solid btn-block" href="https://wa.me/260772300053" target="_blank" rel="noopener">WhatsApp us</a>
          </div>
        </details>
      </div>
    </div>
  </header>

  <main id="top">
    <section class="hero">
      <div class="frame">
        <div class="hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">Photographer &middot; Lusaka, Zambia &middot; Always open</p>
            <h1>Your moments,<br>held in <em>frame</em>.</h1>
            <p class="lede">We invest noteworthy energy in Wedding Photography, Corporate, Family and Event pictures &mdash; the kind you&rsquo;ll still be looking at in twenty years.</p>
            <div class="hero-actions">
              <a href="#book" class="btn btn-solid">Book a session</a>
              <a href="#services" class="btn btn-outline">See packages</a>
            </div>
          </div>
        </div>

        <ul class="hero-stats" aria-label="Studio stats">
          <li><strong>4.4K</strong><span>followers</span></li>
          <li><strong>259</strong><span>posts</span></li>
          <li><strong>Kwacha</strong><span>ZMW pricing</span></li>
          <li><strong>24/7</strong><span>always open</span></li>
        </ul>
      </div>
    </section>

    <div class="filmstrip" aria-hidden="true"></div>

    <section id="services" class="section">
      <div class="frame">
        <p class="eyebrow">Contact sheet</p>
        <h2>Choose your frame</h2>
        <p class="section-lede">Every package includes edited digital delivery. Prices are in Zambian Kwacha (ZMW). Select a frame below to pre-fill your booking.</p>
        <div class="sheet-grid">
          ${serviceCards}
        </div>
      </div>
    </section>

    <div class="filmstrip" aria-hidden="true"></div>

    <section id="invest" class="section">
      <div class="frame">
        <div class="invest-header">
          <div>
            <p class="eyebrow">Studio Capital &amp; Yield Plans</p>
            <h2>Fund productions, earn ZMW returns</h2>
            <p class="section-lede">Back Lusaka wedding shoots, commercial reels, and cinema camera upgrades through Daily, Weekly, and Monthly plans inside your verified ATS wallet. Earn ${h(siteSettings.referral_l1_percent || '5')}% Level-1 and ${h(siteSettings.referral_l2_percent || '2')}% Level-2 referral rewards.</p>
          </div>
          <div class="invest-cta-group">
            <a href="/app/index.php?r=member/register" class="btn btn-solid">Open Client Wallet</a>
            <a href="/app/index.php?r=member/login" class="btn btn-outline">Client Sign In</a>
          </div>
        </div>
        <div class="plans-grid">
          ${investmentPlans
            .map(
              (p) => `<div class="portal-card plan-card">
                <div class="portal-card-head">
                  <div>
                    <span class="portal-kicker">${h(p.cadence)} yield &middot; ${Number(p.duration_days)} days</span>
                    <h3>${h(p.name)}</h3>
                  </div>
                  <strong class="plan-roi">${Number(p.roi_percent)}%</strong>
                </div>
                <p class="portal-sub">${h(p.description)}</p>
                <div class="plan-limits">
                  <span>Min: <strong>${h(moneyWhole(p.min_amount))}</strong></span>
                  <span>Max: <strong>${h(moneyWhole(p.max_amount))}</strong></span>
                </div>
                <a href="/app/index.php?r=member/invest" class="btn btn-outline btn-block btn-sm">Invest via Wallet</a>
              </div>`
            )
            .join('\n')}
        </div>
      </div>
    </section>

    <div class="filmstrip" aria-hidden="true"></div>

    <section id="about" class="section section-dark">
      <div class="frame about-grid">
        <div>
          <p class="eyebrow">About the studio</p>
          <h2>ATS media house</h2>
          <p class="section-lede">We invest noteworthy energy in Wedding Photography, Corporate, Family and Event pictures. Based in Lusaka, always open, and followed by a growing circle of Zambian couples, families and businesses.</p>
          <ul class="about-facts">
            <li><span>Category</span>Photographer</li>
            <li><span>Location</span>Lusaka, Zambia</li>
            <li><span>Hours</span>Always open</li>
            <li><span>Currency</span>Kwacha (ZMW)</li>
            <li><span>Instagram</span>@atsmedia79</li>
          </ul>
        </div>

        <blockquote class="latest-post">
          <p class="eyebrow">Latest pinned post &middot; Sep 24, 2022</p>
          <p>&ldquo;Shoot your Graduation Memories with us.&rdquo;</p>
        </blockquote>
      </div>
    </section>

    <div class="filmstrip" aria-hidden="true"></div>

    <section id="book" class="section">
      <div class="frame book-grid">
        <div class="book-copy">
          <p class="eyebrow">Reserve your date</p>
          <h2>Book &amp; pay with Airtel Money</h2>
          <p class="section-lede">Fill in your details, pick a package, then confirm payment straight from your phone &mdash; no cash, no queue.</p>
          <ol class="pay-steps">
            <li>Submit the booking form.</li>
            <li>We send a payment prompt to your Airtel Money line.</li>
            <li>Enter your Airtel Money PIN on your phone to confirm.</li>
            <li>Send your booking reference on WhatsApp to <strong>0772 300 053</strong>. All booking transactions are handled there.</li>
          </ol>
          <p class="portal-note">
            <a href="/app/index.php?r=page/book">Open standalone sticky booking page</a> &middot;
            <a href="/app/index.php?r=page/status">Check booking status</a>
          </p>
        </div>

        <div class="card">
          <form id="booking-form" method="post" action="/index.php#book" class="form-stack" novalidate>
            ${csrfField(csrfToken)}
            <input type="hidden" name="action" value="book">

            <div class="field">
              <label for="fullName">Full name</label>
              <input type="text" id="fullName" name="fullName" required value="${h(formValues.fullName)}" placeholder="e.g. Chanda Mwansa">
              <p class="error" id="err-fullName">${h(errors.fullName ?? '')}</p>
            </div>

            <div class="field">
              <label for="phone">Airtel Money number</label>
              <input type="tel" id="phone" name="phone" required value="${h(formValues.phone)}" placeholder="e.g. 0972971151">
              <p class="error" id="err-phone">${h(errors.phone ?? '')}</p>
            </div>

            <div class="field">
              <label for="email">Email <span class="optional">(optional)</span></label>
              <input type="email" id="email" name="email" value="${h(formValues.email)}" placeholder="you@example.com">
              <p class="error" id="err-email">${h(errors.email ?? '')}</p>
            </div>

            <div class="field">
              <label for="service">Package</label>
              <select id="service" name="service" required>
                <option value="">Choose a package&hellip;</option>
                ${serviceOptions}
              </select>
              <p class="error" id="err-service">${h(errors.service ?? '')}</p>
            </div>

            <div class="field">
              <label for="eventDate">Preferred date</label>
              <input type="date" id="eventDate" name="eventDate" required min="${h(todayYmd)}" value="${h(formValues.eventDate)}">
              <p class="error" id="err-eventDate">${h(errors.eventDate ?? '')}</p>
            </div>

            <div class="field">
              <label for="notes">Notes <span class="optional">(optional)</span></label>
              <textarea id="notes" name="notes" rows="3" maxlength="1000" placeholder="Venue, number of guests, style references...">${h(formValues.notes)}</textarea>
              <p class="error" id="err-notes">${h(errors.notes ?? '')}</p>
            </div>

            <button type="submit" id="submit-btn" class="btn btn-solid btn-block">Book &amp; pay with Airtel Money</button>
          </form>

          <div id="payment-status" class="payment-status${paymentStatus ? ` show ${h(paymentStatus.type)}` : ''}" role="status" aria-live="polite">
            ${
              paymentStatus
                ? `<p>${h(paymentStatus.message)}</p>` +
                  (activeTxnId && createdBooking
                    ? `<form method="post" action="/index.php#book" class="pin-confirm-form">
                         ${csrfField(csrfToken)}
                         <input type="hidden" name="action" value="confirm_pin">
                         <input type="hidden" name="transactionId" value="${h(activeTxnId)}">
                         <input type="hidden" name="bookingId" value="${h(createdBooking.id)}">
                         <button type="submit" class="btn btn-outline btn-sm">Confirm Airtel Money PIN</button>
                       </form>`
                    : '')
                : ''
            }
          </div>

          <a id="wa-confirm" class="btn btn-outline btn-block" href="${h(waHref)}" target="_blank" rel="noopener"${createdBooking ? '' : ' style="display:none"'}>Send booking details on WhatsApp</a>
        </div>
      </div>
    </section>

    <div class="filmstrip" aria-hidden="true"></div>

    <footer id="contact" class="section section-dark footer">
      <div class="frame footer-grid">
        <div>
          <p class="brand-text footer-brand">ATS <em>media house</em></p>
          <p class="section-lede">Lusaka, Zambia &middot; Always open</p>
          <p class="footer-links">
            <a href="/app/index.php?r=page/book">Book</a> &middot;
            <a href="/app/index.php?r=page/status">Status</a> &middot;
            <a href="/app/index.php?r=page/gallery">Gallery</a> &middot;
            <a href="/app/index.php?r=member/login">Client Portal</a> &middot;
            <a href="/app/index.php?r=auth/login">Admin</a>
          </p>
        </div>
        <address>
          <a href="tel:+260972971151">+260 972 971 151</a>
          <a href="https://wa.me/260772300053" target="_blank" rel="noopener">WhatsApp (bookings): +260 772 300 053</a>
          <a href="mailto:alinanits287@gmail.com">alinanits287@gmail.com</a>
          <a href="https://instagram.com/atsmedia79" target="_blank" rel="noopener">Instagram &commat;atsmedia79</a>
        </address>
        <p class="fine-print">&copy; 2026 ${h(siteName)}. Payments processed via Airtel Money, Bank &amp; Wallet.</p>
      </div>
    </footer>
  </main>
  <script src="/js/script.js"></script>
</body>
</html>`;
}

export function renderBookingFormPartial(opts) {
  const { services, values, errors, action, submitLabel, csrfToken, adminToken = '' } = opts;
  const todayYmd = todayLusakaYmd();
  const v = (k) => h(values[k] ?? '');
  const err = (k) => (errors[k] ? `<p class="error">${h(errors[k])}</p>` : '');

  const options = services
    .map(
      (s) =>
        `<option value="${h(s.code)}" data-price="${h(s.price)}" ${values.service === s.code ? 'selected' : ''}>${h(s.label)} — ${h(money(s.price))}</option>`
    )
    .join('\n');

  return `<form method="post" action="${h(action)}" class="card" novalidate>
    ${csrfField(csrfToken, adminToken)}
    ${errors.form ? `<p class="flash err">${h(errors.form)}</p>` : ''}
    <div class="field"><label for="fullName">Full name</label><input id="fullName" name="fullName" value="${v('fullName')}" placeholder="e.g. Chanda Mwansa">${err('fullName')}</div>
    <div class="field"><label for="phone">Phone number</label><input id="phone" name="phone" type="tel" value="${v('phone')}" placeholder="e.g. 0972971151">${err('phone')}</div>
    <div class="field"><label for="email">Email <span class="optional">(optional)</span></label><input id="email" name="email" type="email" value="${v('email')}">${err('email')}</div>
    <div class="field"><label for="service">Package</label>
      <select id="service" name="service" class="js-price-source">
        <option value="">Choose a package…</option>
        ${options}
      </select>${err('service')}
      <p class="price" id="price-preview" aria-live="polite"></p>
    </div>
    <div class="field"><label for="eventDate">Preferred date</label><input id="eventDate" name="eventDate" type="date" min="${h(todayYmd)}" value="${v('eventDate')}">${err('eventDate')}</div>
    <div class="field"><label for="notes">Notes <span class="optional">(optional)</span></label><textarea id="notes" name="notes" rows="3" maxlength="1000" data-counter="notes-count">${v('notes')}</textarea><small id="notes-count"></small>${err('notes')}</div>
    <button class="btn btn-solid btn-block" type="submit">${h(submitLabel)}</button>
  </form>`;
}

export function renderBookPage(opts) {
  const isNew = opts.submitLabel === 'Save booking';
  return `<p class="eyebrow">Reserve your date</p>
<h2>${isNew ? 'Book a photography session' : 'Edit booking'}</h2>
${
  isNew
    ? `<p class="section-lede">Select Wedding Photography, Corporate Shoot, Event Coverage, Family Portrait, or Graduation Shoot, enter your details and preferred date, and save directly to our studio calendar. Confirm payment via WhatsApp (0772 300 053) or Airtel Money on the <a href="/#book">main booking page</a>.</p>`
    : ''
}
<div style="max-width:560px">${renderBookingFormPartial(opts)}</div>`;
}

export function renderThanksPage(b) {
  const d = daysUntil(b.eventDate);
  const when = d === 0 ? 'today' : d > 0 ? `in ${d} days` : `${Math.abs(d)} days ago`;
  const wa =
    'https://wa.me/260772300053?text=' +
    encodeURIComponent(
      `Hello ATS media house, booking ${b.id} (${b.serviceLabel}, ${money(b.amount)}) on ${b.eventDate}. I am ${b.fullName}.`
    );
  return `<p class="eyebrow">Confirmation</p>
<h2>Booking saved</h2>
<div class="card" style="max-width:560px">
  <p><strong>${h(b.id)}</strong> &middot; ${h(b.serviceLabel)} &middot; ${h(money(b.amount))}</p>
  <p>Date: ${h(niceDate(b.eventDate))} (${h(when)})</p>
  <p>Status: <span class="status-label ${h(b.status)}">${h(b.status)}</span></p>
  <a class="btn btn-solid btn-block" target="_blank" rel="noopener" href="${h(wa)}">Confirm on WhatsApp</a>
  <a class="btn btn-outline btn-block" href="${h(routeUrl('page/status', { q: b.id }))}">View status / Pay online</a>
</div>`;
}

export function renderStatusPage(q, rows, csrfToken) {
  const rowsHtml = rows
    .map((b) => {
      const paymentsHtml =
        b.payments && b.payments.length > 0
          ? b.payments
              .map(
                (p) =>
                  `<div><small>${h(p.transaction_id)} &middot; <span class="status-label ${h(p.status)}">${h(p.status)}</span></small></div>`
              )
              .join('')
          : '<small>No payments yet</small>';

      let actionsHtml = '<small>Closed</small>';
      if (b.status === 'pending_payment') {
        const actionUrl = h(routeUrl('page/status', { q }));
        actionsHtml = `
          <form method="post" action="${actionUrl}" class="inline">
            ${csrfField(csrfToken)}
            <input type="hidden" name="id" value="${h(b.id)}">
            <input type="hidden" name="q" value="${h(q)}">
            <input type="hidden" name="do" value="pay">
            <button class="btn btn-solid btn-sm" type="submit">Pay now (UAT)</button>
          </form>
          <form method="post" action="${actionUrl}" class="inline" data-confirm="Cancel this booking?">
            ${csrfField(csrfToken)}
            <input type="hidden" name="id" value="${h(b.id)}">
            <input type="hidden" name="q" value="${h(q)}">
            <input type="hidden" name="do" value="cancel">
            <button class="btn btn-outline btn-sm" type="submit">Cancel</button>
          </form>`;
      } else if (b.status === 'paid') {
        const wa =
          'https://wa.me/260772300053?text=' +
          encodeURIComponent(
            `Hello ATS media house, my paid booking ${b.id} (${b.serviceLabel}) is on ${b.eventDate}.`
          );
        actionsHtml = `<a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${h(wa)}">WhatsApp</a>`;
      }

      return `<tr>
        <td><small>${h(b.id)}</small></td>
        <td>${h(b.fullName)}<br><small>0${h(b.phone)}</small></td>
        <td>${h(b.serviceLabel)}</td>
        <td>${h(niceDate(b.eventDate))}</td>
        <td>${h(money(b.amount))}</td>
        <td><span class="status-label ${h(b.status)}">${h(b.status)}</span></td>
        <td>${paymentsHtml}</td>
        <td class="actions">${actionsHtml}</td>
      </tr>`;
    })
    .join('\n');

  return `<p class="eyebrow">Booking lookup</p>
<h2>Check booking status &amp; payments</h2>
<p class="section-lede">Enter your booking reference (e.g. <code>BK...</code>) or phone number (e.g. <code>0972971151</code>) to view your session status, confirm Airtel Money payment, or cancel an unpaid booking.</p>

<form method="get" action="/app/index.php" class="filters" style="max-width:560px">
  <input type="hidden" name="r" value="page/status">
  <input name="q" value="${h(q)}" placeholder="Booking reference or phone number…" aria-label="Booking reference or phone" required>
  <button class="btn btn-solid" type="submit">Find booking</button>
</form>

${q !== '' && rows.length === 0 ? `<p class="flash err">No booking found matching <strong>${h(q)}</strong>.</p>` : ''}

${
  rows.length > 0
    ? `<div class="scroll">
        <table class="table">
          <tr><th>Ref</th><th>Client</th><th>Package</th><th>Event Date</th><th>Amount</th><th>Status</th><th>Payments</th><th>Actions</th></tr>
          ${rowsHtml}
        </table>
      </div>`
    : ''
}`;
}

export function renderGalleryPage(photos) {
  const cards = photos
    .map(
      (p) => `<a href="#photo-${p.photo_id}" class="photo-card">
        <img src="/uploads/thumbs/${h(p.thumb)}" alt="${h(p.title)}" loading="lazy">
        <div class="photo-card-body">
          <span class="photo-card-title">${h(p.title)}</span>
          <small>View frame</small>
        </div>
      </a>`
    )
    .join('\n');

  const lightboxes = photos
    .map(
      (p) => `<div id="photo-${p.photo_id}" class="lightbox" role="dialog" aria-label="${h(p.title)}">
        <div class="lightbox-inner">
          <img src="/uploads/gallery/${h(p.filename)}" alt="${h(p.title)}">
          <div class="lightbox-bar">
            <span>${h(p.title)}</span>
            <a href="#top" class="lightbox-close">Close &times;</a>
          </div>
        </div>
      </div>`
    )
    .join('\n');

  return `<p class="eyebrow">Portfolio</p>
<h2>Gallery</h2>
<p class="section-lede">Selected frames from weddings, portraits, graduations, and corporate commissions in Lusaka.</p>
${photos.length === 0 ? '<p>No photos yet. An admin can upload some.</p>' : ''}
<div class="grid-photos">
  ${cards}
</div>
${lightboxes}`;
}

export function renderNotFoundPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 | ATS media house</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main class="section">
    <div class="frame">
      <h1>404 Not found</h1>
      <p><a class="btn btn-outline" href="/">Return home</a></p>
    </div>
  </main>
</body>
</html>`;
}
