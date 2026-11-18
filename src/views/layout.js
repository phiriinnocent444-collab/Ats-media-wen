import { h } from '../security.js';

export function routeUrl(route, query = {}, adminToken = '', memberToken = '') {
  const params = new URLSearchParams();
  params.set('r', route);
  if (adminToken && (route.startsWith('admin/') || route === 'auth/logout') && query._at === undefined) {
    params.set('_at', adminToken);
  }
  if (
    memberToken &&
    route.startsWith('member/') &&
    !['member/login', 'member/register', 'member/verify_2fa'].includes(route) &&
    query._mt === undefined
  ) {
    params.set('_mt', memberToken);
  }
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') {
      params.set(k, String(v));
    }
  }
  return `/app/index.php?${params.toString()}`;
}

export function csrfField(csrfToken, adminToken = '', memberToken = '') {
  return (
    `<input type="hidden" name="csrf" value="${h(csrfToken)}">` +
    (adminToken ? `<input type="hidden" name="_at" value="${h(adminToken)}">` : '') +
    (memberToken ? `<input type="hidden" name="_mt" value="${h(memberToken)}">` : '')
  );
}

export function renderStatRing(value, label, sub1, sub2, percent, strokeColor = '#2563EB') {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = 40;
  const c = 2 * Math.PI * r;
  const dash = ((clamped / 100) * c).toFixed(1);
  return `<div class="stat-ring-card">
    <div class="stat-ring-svg-wrap">
      <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="#E5E9F2" stroke-width="8" />
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="${h(strokeColor)}" stroke-width="8"
          stroke-dasharray="${dash} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 50 50)" />
      </svg>
      <strong class="stat-ring-value">${h(value)}</strong>
    </div>
    <span class="stat-ring-label">${h(label)}</span>
    <span class="stat-ring-sub">${h(sub1)} &middot; ${h(sub2)}</span>
  </div>`;
}

const ICONS = {
  dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  invest: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  deposit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><polyline points="8 11 12 15 16 11"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>',
  withdraw: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3"/><polyline points="8 7 12 3 16 7"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>',
  transfer: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  camera: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  layers: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  ledger: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  report: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

export function renderAppLayout(title, bodyHtml, ctx) {
  const { admin, adminToken = '', member, memberToken = '', csrfToken, flash, currentRoute = '', siteName = 'ATS media house & Capital' } = ctx;
  const u = (r, q = {}) => routeUrl(r, q, adminToken, memberToken);

  const isPortal =
    (admin && currentRoute.startsWith('admin/')) ||
    (member && currentRoute.startsWith('member/') && !['member/login', 'member/register', 'member/verify_2fa'].includes(currentRoute));

  if (isPortal) {
    return renderPortalLayout(title, bodyHtml, ctx);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(title)} | ${h(siteName)}</title>
  <meta name="description" content="ATS media house & Capital — Studio photography, online bookings, Airtel Money payments, and studio yield investments in Lusaka, Zambia.">
  <meta property="og:title" content="${h(title)} | ${h(siteName)}">
  <meta property="og:description" content="Studio photography, online bookings, and studio capital investment plans in Lusaka, Zambia.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body class="app" id="top">
  <header class="site-header">
    <div class="frame">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">◎</span>
        <span class="brand-text">ATS <em>media house</em></span>
      </a>
      <nav aria-label="Primary">
        <a href="/">Home</a>
        <a href="${h(u('page/book'))}">Book</a>
        <a href="${h(u('page/status'))}">Status</a>
        <a href="${h(u('page/gallery'))}">Gallery</a>
        <a href="${h(u('member/login'))}">Client Portal</a>
        <a href="${h(u('auth/login'))}">Admin</a>
      </nav>
      <div class="header-actions">
        <a class="btn btn-solid btn-sm header-cta" href="${h(u('member/register'))}">Open Account</a>
        <details class="mobile-nav">
          <summary aria-label="Open navigation menu">Menu</summary>
          <div class="mobile-nav-drawer">
            <a href="/">Home</a>
            <a href="${h(u('page/book'))}">Book</a>
            <a href="${h(u('page/status'))}">Status</a>
            <a href="${h(u('page/gallery'))}">Gallery</a>
            <a href="${h(u('member/login'))}">Client Portal</a>
            <a href="${h(u('auth/login'))}">Admin</a>
            <a class="btn btn-solid btn-block" href="${h(u('member/register'))}">Open Account</a>
          </div>
        </details>
      </div>
    </div>
  </header>

  <main class="section">
    <div class="frame">
      ${flash ? `<p class="flash ${h(flash.type)}" role="status">${h(flash.message)}</p>` : ''}
      ${bodyHtml}
    </div>
  </main>

  <div class="filmstrip" aria-hidden="true"></div>
  <footer class="section section-dark footer">
    <div class="frame footer-grid">
      <div>
        <p class="brand-text footer-brand">ATS <em>media house</em></p>
        <p class="section-lede">Lusaka, Zambia &middot; Photography Studio &amp; Capital Portal</p>
      </div>
      <address>
        <a href="tel:+260972971151">+260 972 971 151</a>
        <a href="https://wa.me/260772300053" target="_blank" rel="noopener">WhatsApp: +260 772 300 053</a>
        <a href="mailto:alinanits287@gmail.com">alinanits287@gmail.com</a>
      </address>
      <p class="fine-print">&copy; 2026 ${h(siteName)}.</p>
    </div>
  </footer>
  <script src="/js/app.js"></script>
</body>
</html>`;
}

function renderPortalLayout(title, bodyHtml, ctx) {
  const {
    admin,
    adminToken = '',
    member,
    memberToken = '',
    csrfToken,
    flash,
    currentRoute = '',
    siteName = 'ATS media house & Capital',
  } = ctx;
  const isAdmin = Boolean(admin && currentRoute.startsWith('admin/'));
  const u = (r, q = {}) => routeUrl(r, q, adminToken, memberToken);

  const adminMenu = [
    ['admin/dashboard', 'Dashboard', ICONS.dashboard],
    ['admin/bookings', 'Manage Bookings', ICONS.camera],
    ['admin/users', 'Manage Users', ICONS.users],
    ['admin/admins', 'Manage Admins', ICONS.shield],
    ['admin/plans', 'Investment Plans', ICONS.layers],
    ['admin/investments', 'Manage Investments', ICONS.invest],
    ['admin/deposits', 'User Deposits', ICONS.deposit],
    ['admin/withdrawals', 'User Withdrawals', ICONS.withdraw],
    ['admin/services', 'Studio Packages', ICONS.camera],
    ['admin/transactions', 'Payment Ledger', ICONS.ledger],
    ['admin/gallery', 'Portfolio Photos', ICONS.camera],
    ['admin/notifications', 'Tickets & Notices', ICONS.bell],
    ['admin/reports', 'Advance Reports', ICONS.report],
    ['admin/settings', 'Site Settings', ICONS.settings],
  ];

  const memberMenu = [
    ['member/dashboard', 'Dashboard', ICONS.dashboard],
    ['member/deposit', 'Fund Wallet', ICONS.deposit],
    ['member/invest', 'Investment Plans', ICONS.invest],
    ['member/transfer', 'Internal Transfer', ICONS.transfer],
    ['member/withdraw', 'Withdraw Funds', ICONS.withdraw],
    ['member/bookings', 'Studio Bookings', ICONS.camera],
    ['member/referrals', 'Referral Network', ICONS.users],
    ['member/kyc', 'KYC & 2FA Security', ICONS.shield],
    ['member/tickets', 'Support Tickets', ICONS.bell],
    ['member/notifications', 'Notifications', ICONS.bell],
  ];

  const navItems = (isAdmin ? adminMenu : memberMenu)
    .map(([route, label, icon]) => {
      const active = currentRoute === route || (route === 'admin/bookings' && currentRoute === 'admin/booking_edit');
      return `<a href="${h(u(route))}" class="portal-nav-link${active ? ' active' : ''}">${icon}<span>${h(label)}</span></a>`;
    })
    .join('\n');

  const displayName = isAdmin ? admin.name : member.full_name;
  const roleLabel = isAdmin ? 'Studio SuperAdmin' : `Client Wallet · KYC: ${member.kyc_status}`;
  const logoutRoute = isAdmin ? 'auth/logout' : 'member/logout';
  const heroPrimaryBtn = isAdmin
    ? `<a href="${h(u('admin/investments'))}" class="portal-banner-btn">Investments</a>
       <a href="${h(u('admin/deposits'))}" class="portal-banner-btn primary">Deposits</a>`
    : `<a href="${h(u('member/invest'))}" class="portal-banner-btn">Invest</a>
       <a href="${h(u('member/deposit'))}" class="portal-banner-btn primary">Deposit</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(title)} | ${h(siteName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body class="portal-body" id="top">
  <div class="portal-shell">
    <aside class="portal-sidebar" id="portal-sidebar" aria-label="Portal Navigation">
      <div class="portal-brand">
        <a href="/" class="portal-brand-link">
          <span class="brand-mark" aria-hidden="true">◎</span>
          <span>ATS <em>Capital &amp; Media</em></span>
        </a>
      </div>

      <div class="portal-user-summary">
        <strong>${h(displayName)}</strong>
        <span>${h(roleLabel)}</span>
      </div>

      <nav class="portal-nav">
        ${navItems}
      </nav>

      <div class="portal-sidebar-foot">
        <a href="/" class="portal-nav-link">${ICONS.camera}<span>Public Studio Site</span></a>
        <form method="post" action="${h(u(logoutRoute))}">
          ${csrfField(csrfToken, adminToken, memberToken)}
          <button type="submit" class="portal-logout-btn">Log out (${h(displayName)})</button>
        </form>
      </div>
    </aside>

    <div class="portal-main">
      <header class="portal-topbar">
        <div class="portal-topbar-left">
          <button type="button" class="portal-menu-toggle" id="portal-menu-toggle" aria-label="Toggle sidebar">Menu</button>
          <span class="portal-breadcrumb">${isAdmin ? 'Admin' : 'Client'} &rsaquo; ${h(title)}</span>
        </div>
        <div class="portal-topbar-actions">
          ${
            isAdmin
              ? `<a href="${h(u('admin/bookings'))}" class="btn btn-outline btn-sm">Bookings</a>
                 <a href="/" class="btn btn-ghost btn-sm">View Site</a>`
              : `<a href="${h(u('member/bookings'))}" class="btn btn-outline btn-sm">Book Shoot</a>
                 <a href="${h(u('member/notifications'))}" class="btn btn-ghost btn-sm">Inbox</a>`
          }
        </div>
      </header>

      <section class="portal-welcome-banner">
        <div>
          <h1>Hi! Welcome ${h(displayName)}</h1>
          <p>${isAdmin ? 'Admin' : 'Member'} &rsaquo; ${h(title)} &middot; ${h(siteName)}</p>
        </div>
        <div class="portal-banner-actions">
          ${heroPrimaryBtn}
        </div>
      </section>

      <main class="portal-content">
        ${flash ? `<p class="flash ${h(flash.type)}" role="status">${h(flash.message)}</p>` : ''}
        ${bodyHtml}
      </main>
    </div>
  </div>
  <script src="/js/app.js"></script>
</body>
</html>`;
}
