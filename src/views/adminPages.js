import { daysUntil, h, money, niceDate, todayLusakaYmd } from '../security.js';
import { csrfField, renderStatRing, routeUrl } from './layout.js';

export function renderLoginPage(error, rememberedUsername, csrfToken) {
  return `<p class="eyebrow">Studio &amp; Capital Portal</p>
<h2>Admin login</h2>
<form method="post" action="${h(routeUrl('auth/login'))}" class="card" style="max-width:400px">
  ${csrfField(csrfToken)}
  ${error ? `<p class="flash err">${h(error)}</p>` : ''}
  <div class="field"><label for="username">Username</label><input id="username" name="username" value="${h(rememberedUsername)}" autocomplete="username" required></div>
  <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
  <button class="btn btn-solid btn-block" type="submit">Log in</button>
</form>`;
}

export function renderDashboardPage(summary, upcoming, adminToken) {
  const { bookingStats } = summary;
  const u = (r, q = {}) => routeUrl(r, q, adminToken);

  const userPct = summary.usersTotal > 0 ? Math.round((summary.usersActive / summary.usersTotal) * 100) : 0;
  const invPct = summary.investmentsTotal > 0 ? Math.round((summary.investmentsActive / summary.investmentsTotal) * 100) : 0;
  const depDone = Math.max(0, summary.depositCount - summary.depositPending);
  const depPct = summary.depositCount > 0 ? Math.round((depDone / summary.depositCount) * 100) : 0;

  const upRows = upcoming
    .map(
      (b) =>
        `<tr>
          <td>${h(niceDate(b.eventDate))} <small>(${daysUntil(b.eventDate)}d)</small></td>
          <td>${h(b.fullName)}</td>
          <td>${h(b.serviceLabel)}</td>
          <td>${h(money(b.amount))}</td>
          <td><span class="status-label ${h(b.status)}">${h(b.status)}</span></td>
        </tr>`
    )
    .join('\n');

  return `<div class="portal-summary-grid">
    <section class="portal-card">
      <div class="portal-card-head">
        <div>
          <h3>Statistics Summary</h3>
          <p class="portal-sub">Statistics of the system &middot; Clients, Investments &amp; Deposits</p>
        </div>
      </div>
      <div class="stat-rings-grid">
        ${renderStatRing(summary.usersTotal, 'Users', `Active: ${summary.usersActive}`, `KYC Pending: ${summary.kycPending}`, userPct, '#F97316')}
        ${renderStatRing(summary.investmentsTotal, 'Investments', `Active: ${summary.investmentsActive}`, `Inactive: ${summary.investmentsInactive}`, invPct, '#22C55E')}
        ${renderStatRing(summary.depositCount, 'Deposits', `Settled: ${depDone}`, `Pending: ${summary.depositPending}`, depPct, '#EC4899')}
      </div>
    </section>

    <section class="portal-card">
      <div class="portal-card-head">
        <div>
          <h3>Balance Summary</h3>
          <p class="portal-sub">Capital pool &amp; photography studio financials</p>
        </div>
        <a href="${h(u('admin/reports'))}" class="btn btn-outline btn-sm">Reports</a>
      </div>
      <div class="balance-grid">
        <div class="balance-item">
          <span>Investments Volume</span>
          <strong>${h(money(summary.investedVolume))}</strong>
        </div>
        <div class="balance-item">
          <span>Withdrawals (${summary.withdrawalPending} pending)</span>
          <strong>${h(money(summary.withdrawalsTotal))}</strong>
        </div>
        <div class="balance-item">
          <span>Total Deposits</span>
          <strong>${h(money(summary.depositsTotal))}</strong>
        </div>
        <div class="balance-item">
          <span>Studio Paid Bookings (${Number(bookingStats.paid)}/${Number(bookingStats.total)})</span>
          <strong>${h(money(bookingStats.revenue))}</strong>
        </div>
      </div>
    </section>
  </div>

  <section class="portal-card">
    <div class="portal-card-head">
      <div>
        <h3>Next Studio Shoots</h3>
        <p class="portal-sub">${Number(bookingStats.pending)} awaiting payment &middot; ${Number(bookingStats.paid)} paid shoots scheduled</p>
      </div>
      <a class="btn btn-outline btn-sm" href="${h(u('admin/bookings', { timing: 'upcoming' }))}">View all upcoming events</a>
    </div>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>When</th><th>Client</th><th>Package</th><th>Amount</th><th>Status</th></tr>
        ${upRows || '<tr><td colspan="5">No upcoming bookings.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderAdminBookingsPage(opts) {
  const { rows, q, status, timing, services, csrfToken, adminToken } = opts;
  const todayYmd = todayLusakaYmd();
  const u = (r, extra = {}) => routeUrl(r, extra, adminToken);

  const serviceOpts = services
    .map((s) => `<option value="${h(s.code)}">${h(s.label)} &mdash; ${h(money(s.price))}</option>`)
    .join('\n');

  const statusOpts = ['pending_payment', 'paid', 'cancelled']
    .map((st) => `<option value="${st}" ${status === st ? 'selected' : ''}>${st}</option>`)
    .join('');

  const tableRows = rows
    .map((b) => {
      const d = daysUntil(b.eventDate);
      const when = d === 0 ? 'today' : d > 0 ? `in ${d}d` : `${Math.abs(d)}d ago`;

      const editBtn =
        b.status === 'pending_payment'
          ? `<a class="btn btn-outline" href="${h(u('admin/booking_edit', { id: b.id }))}" aria-label="Edit booking ${h(b.id)}">Edit</a>`
          : '';

      const actionBtns =
        b.status === 'pending_payment'
          ? `<form method="post" action="${h(u('admin/booking_action'))}" class="inline">${csrfField(csrfToken, adminToken)}<input type="hidden" name="id" value="${h(b.id)}"><input type="hidden" name="do" value="paid"><button class="btn btn-outline" type="submit" aria-label="Mark paid booking ${h(b.id)}">Mark paid</button></form>
             <form method="post" action="${h(u('admin/booking_action'))}" class="inline">${csrfField(csrfToken, adminToken)}<input type="hidden" name="id" value="${h(b.id)}"><input type="hidden" name="do" value="cancel"><button class="btn btn-outline" type="submit" aria-label="Cancel booking ${h(b.id)}">Cancel</button></form>`
          : '';

      const deleteBtn =
        b.status !== 'paid'
          ? `<form method="post" action="${h(u('admin/booking_action'))}" class="inline" data-confirm="Delete this booking?">${csrfField(csrfToken, adminToken)}<input type="hidden" name="id" value="${h(b.id)}"><input type="hidden" name="do" value="delete"><button class="btn btn-outline" type="submit" aria-label="Delete booking ${h(b.id)}">Delete</button></form>`
          : '';

      return `<tr>
        <td><small>${h(b.id)}</small></td>
        <td>${h(b.fullName)}<br><small>0${h(b.phone)}${b.email ? ` &middot; ${h(b.email)}` : ''}</small></td>
        <td>${h(b.serviceLabel)}</td>
        <td>${h(niceDate(b.eventDate))}<br><small>${h(when)}</small></td>
        <td>${h(money(b.amount))}</td>
        <td><span class="status-label ${h(b.status)}">${h(b.status)}</span></td>
        <td class="actions">${editBtn} ${actionBtns} ${deleteBtn}</td>
      </tr>`;
    })
    .join('\n');

  return `<section class="portal-card">
    <div class="portal-card-head">
      <div>
        <h3>Bookings &amp; upcoming events</h3>
        <p class="portal-sub">Manage photography session bookings, walk-ins, and payment confirmations.</p>
      </div>
    </div>

    <details class="new-booking-panel">
      <summary class="btn btn-outline btn-sm">+ New booking (walk-in / phone)</summary>
      <form method="post" action="${h(u('admin/booking_create'))}" class="card" style="max-width:680px; margin-top:12px;">
        ${csrfField(csrfToken, adminToken)}
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
          <div class="field"><label for="newFullName">Full name</label><input id="newFullName" name="fullName" required placeholder="e.g. Chanda Mwansa"></div>
          <div class="field"><label for="newPhone">Phone number</label><input id="newPhone" name="phone" type="tel" required placeholder="e.g. 0972971151"></div>
          <div class="field"><label for="newEmail">Email <span class="optional">(optional)</span></label><input id="newEmail" name="email" type="email" placeholder="client@example.com"></div>
          <div class="field"><label for="newService">Package</label>
            <select id="newService" name="service" required>
              <option value="">Choose a package&hellip;</option>
              ${serviceOpts}
            </select>
          </div>
          <div class="field"><label for="newEventDate">Preferred date</label><input id="newEventDate" name="eventDate" type="date" min="${h(todayYmd)}" required></div>
          <div class="field"><label for="newNotes">Notes <span class="optional">(optional)</span></label><input id="newNotes" name="notes" maxlength="1000" placeholder="Venue, shoot details..."></div>
        </div>
        <div><button class="btn btn-solid" type="submit">Create booking</button></div>
      </form>
    </details>

    <form method="get" action="/app/index.php" class="filters">
      <input type="hidden" name="r" value="admin/bookings">
      ${adminToken ? `<input type="hidden" name="_at" value="${h(adminToken)}">` : ''}
      <input name="q" value="${h(q)}" placeholder="Search name, reference or notes…" aria-label="Search">
      <select name="status" aria-label="Status">
        <option value="">All statuses</option>
        ${statusOpts}
      </select>
      <select name="timing" aria-label="Schedule">
        <option value="">All dates</option>
        <option value="upcoming" ${timing === 'upcoming' ? 'selected' : ''}>Upcoming events</option>
      </select>
      <button class="btn btn-solid" type="submit">Filter</button>
    </form>

    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Ref</th><th>Client</th><th>Package</th><th>Event Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
        ${tableRows || '<tr><td colspan="7">No bookings found.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderAdminUsersPage(members, q, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const rows = members
    .map(
      (m) => `<tr>
        <td><small>#${m.user_id}</small></td>
        <td><strong>${h(m.full_name)}</strong><br><small>${h(m.email)} &middot; 0${h(m.phone)}</small><br><small>Code: <code>${h(m.referral_code)}</code></small></td>
        <td><strong>${h(money(m.wallet_balance))}</strong><br><small>${Number(m.active_investments)} active plans</small></td>
        <td><span class="status-label ${h(m.kyc_status === 'verified' ? 'paid' : m.kyc_status === 'rejected' ? 'cancelled' : 'pending_payment')}">${h(m.kyc_status)}</span>${m.kyc_id_number ? `<br><small>${h(m.kyc_id_type)}: ${h(m.kyc_id_number)}</small>` : ''}</td>
        <td><span class="status-label ${m.is_active ? 'paid' : 'cancelled'}">${m.is_active ? 'active' : 'suspended'}</span><br><small>2FA: ${m.two_fa_enabled ? 'On' : 'Off'}</small></td>
        <td class="actions">
          ${
            m.kyc_status === 'pending' || m.kyc_status === 'unverified'
              ? `<form method="post" action="${h(u('admin/users'))}" class="inline">${csrfField(csrfToken, adminToken)}<input type="hidden" name="userId" value="${m.user_id}"><input type="hidden" name="do" value="kyc_verify"><button class="btn btn-solid btn-sm" type="submit">Verify KYC</button></form>`
              : ''
          }
          ${
            m.kyc_status === 'pending'
              ? `<form method="post" action="${h(u('admin/users'))}" class="inline">${csrfField(csrfToken, adminToken)}<input type="hidden" name="userId" value="${m.user_id}"><input type="hidden" name="do" value="kyc_reject"><button class="btn btn-outline btn-sm" type="submit">Reject KYC</button></form>`
              : ''
          }
          <form method="post" action="${h(u('admin/users'))}" class="inline">
            ${csrfField(csrfToken, adminToken)}
            <input type="hidden" name="userId" value="${m.user_id}">
            <input type="hidden" name="do" value="toggle_active">
            <button class="btn btn-outline btn-sm" type="submit">${m.is_active ? 'Suspend' : 'Activate'}</button>
          </form>
          <form method="post" action="${h(u('admin/users'))}" class="inline" style="margin-top:4px">
            ${csrfField(csrfToken, adminToken)}
            <input type="hidden" name="userId" value="${m.user_id}">
            <input type="hidden" name="do" value="credit_wallet">
            <input type="number" name="amount" min="1" step="0.01" placeholder="ZMW" style="width:82px;display:inline-block;padding:4px 6px;font-size:12px" required>
            <button class="btn btn-outline btn-sm" type="submit">+ Credit</button>
          </form>
        </td>
      </tr>`
    )
    .join('\n');

  return `<section class="portal-card">
    <div class="portal-card-head">
      <div>
        <h3>Manage Clients &amp; KYC Verification</h3>
        <p class="portal-sub">Verify identity documents, manage client wallet balances, and control account status.</p>
      </div>
    </div>
    <form method="get" action="/app/index.php" class="filters">
      <input type="hidden" name="r" value="admin/users">
      ${adminToken ? `<input type="hidden" name="_at" value="${h(adminToken)}">` : ''}
      <input name="q" value="${h(q)}" placeholder="Search client name, email, or phone...">
      <button class="btn btn-solid" type="submit">Search Users</button>
    </form>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>ID</th><th>Client</th><th>Wallet &amp; Plans</th><th>KYC Verification</th><th>Status</th><th>Actions</th></tr>
        ${rows || '<tr><td colspan="6">No registered client accounts found.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderAdminAdminsPage(admins, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const rows = admins
    .map(
      (a) => `<tr>
        <td>#${a.admin_id}</td>
        <td><strong>${h(a.username)}</strong></td>
        <td><small>${h(a.created_at)}</small></td>
        <td class="actions">
          ${
            a.username === 'admin'
              ? '<small>Primary SuperAdmin</small>'
              : `<form method="post" action="${h(u('admin/admins'))}" class="inline" data-confirm="Remove admin?">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="do" value="delete">
                   <input type="hidden" name="adminId" value="${a.admin_id}">
                   <button class="btn btn-outline btn-sm" type="submit">Remove</button>
                 </form>`
          }
        </td>
      </tr>`
    )
    .join('\n');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Create Administrator</h3>
      <p class="portal-sub">Provision additional admin operators with scrypt-hashed passwords.</p>
      <form method="post" action="${h(u('admin/admins'))}" class="form-stack">
        ${csrfField(csrfToken, adminToken)}
        <input type="hidden" name="do" value="create">
        <div class="field"><label for="username">Username</label><input id="username" name="username" required placeholder="e.g. studio_manager"></div>
        <div class="field"><label for="password">Password (min 6 chars)</label><input id="password" name="password" type="password" required minlength="6"></div>
        <button class="btn btn-solid btn-block" type="submit">Create Admin Account</button>
      </form>
    </section>

    <section class="portal-card">
      <h3>Active Administrators</h3>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>ID</th><th>Username</th><th>Created</th><th>Action</th></tr>
          ${rows}
        </table>
      </div>
    </section>
  </div>`;
}

export function renderAdminPlansPage(plans, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const rows = plans
    .map(
      (p) => `<tr>
        <td><code>${h(p.code)}</code></td>
        <td><strong>${h(p.name)}</strong><br><small>${h(p.description)}</small></td>
        <td>${h(p.cadence)}</td>
        <td>${Number(p.roi_percent)}% / ${Number(p.duration_days)}d</td>
        <td>${h(money(p.min_amount))} &ndash; ${h(money(p.max_amount))}</td>
        <td><span class="status-label ${p.status === 'active' ? 'paid' : 'pending_payment'}">${h(p.status)}</span></td>
        <td class="actions">
          <form method="post" action="${h(u('admin/plans'))}" class="inline">
            ${csrfField(csrfToken, adminToken)}
            <input type="hidden" name="do" value="toggle">
            <input type="hidden" name="planId" value="${p.plan_id}">
            <button class="btn btn-outline btn-sm" type="submit">${p.status === 'active' ? 'Pause Plan' : 'Resume Plan'}</button>
          </form>
          <form method="post" action="${h(u('admin/plans'))}" class="inline" data-confirm="Delete this plan?">
            ${csrfField(csrfToken, adminToken)}
            <input type="hidden" name="do" value="delete">
            <input type="hidden" name="planId" value="${p.plan_id}">
            <button class="btn btn-outline btn-sm" type="submit">Delete</button>
          </form>
        </td>
      </tr>`
    )
    .join('\n');

  return `<section class="portal-card" style="margin-bottom:20px">
    <h3>Create Investment Plan</h3>
    <p class="portal-sub">Add Daily, Weekly, or Monthly Studio Production Investment Plans and pause/resume plans at any time.</p>
    <form method="post" action="${h(u('admin/plans'))}" class="form-stack">
      ${csrfField(csrfToken, adminToken)}
      <input type="hidden" name="do" value="save">
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
        <div class="field"><label for="code">Plan Code</label><input id="code" name="code" required placeholder="e.g. drone_pool"></div>
        <div class="field"><label for="name">Plan Name</label><input id="name" name="name" required placeholder="e.g. Lusaka Drone Fleet Pool"></div>
        <div class="field"><label for="cadence">Cadence</label><select id="cadence" name="cadence"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
        <div class="field"><label for="roiPercent">ROI % per cycle</label><input id="roiPercent" name="roiPercent" type="number" step="0.1" min="0.1" required placeholder="e.g. 5.5"></div>
        <div class="field"><label for="durationDays">Duration (days)</label><input id="durationDays" name="durationDays" type="number" min="1" required placeholder="e.g. 30"></div>
        <div class="field"><label for="minAmount">Min Capital (ZMW)</label><input id="minAmount" name="minAmount" type="number" min="50" required placeholder="e.g. 500"></div>
        <div class="field"><label for="maxAmount">Max Capital (ZMW)</label><input id="maxAmount" name="maxAmount" type="number" min="50" required placeholder="e.g. 50000"></div>
      </div>
      <div class="field"><label for="description">Description</label><input id="description" name="description" placeholder="How capital supports studio shoots or equipment..."></div>
      <div><button class="btn btn-solid" type="submit">Create Investment Plan</button></div>
    </form>
  </section>

  <section class="portal-card">
    <h3>Configured Investment Plans</h3>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Code</th><th>Plan</th><th>Cadence</th><th>ROI / Days</th><th>Limits</th><th>Status</th><th>Actions</th></tr>
        ${rows}
      </table>
    </div>
  </section>`;
}

export function renderAdminInvestmentsPage(investments, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const rows = investments
    .map(
      (i) => `<tr>
        <td><small>${h(i.investment_id)}</small></td>
        <td><strong>${h(i.full_name)}</strong><br><small>${h(i.email)}</small></td>
        <td>${h(i.plan_name)}<br><small>${h(i.cadence)} &middot; ${Number(i.roi_percent)}%</small></td>
        <td>${h(money(i.amount))}</td>
        <td>${h(money(i.credited_return))} / ${h(money(i.expected_return))}</td>
        <td>${h(niceDate(i.matures_at))}</td>
        <td><span class="status-label ${i.status === 'active' ? 'paid' : i.status === 'completed' ? 'SUCCESS' : 'pending_payment'}">${h(i.status)}</span></td>
        <td class="actions">
          ${
            i.status === 'active'
              ? `<form method="post" action="${h(u('admin/investments'))}" class="inline">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="do" value="payout">
                   <input type="hidden" name="investmentId" value="${h(i.investment_id)}">
                   <button class="btn btn-solid btn-sm" type="submit">Credit Cycle Yield</button>
                 </form>`
              : ''
          }
          ${
            i.status !== 'completed'
              ? `<form method="post" action="${h(u('admin/investments'))}" class="inline">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="do" value="toggle">
                   <input type="hidden" name="investmentId" value="${h(i.investment_id)}">
                   <button class="btn btn-outline btn-sm" type="submit">${i.status === 'active' ? 'Pause' : 'Resume'}</button>
                 </form>`
              : '<small>Completed</small>'
          }
        </td>
      </tr>`
    )
    .join('\n');

  return `<section class="portal-card">
    <h3>Manage User Investments</h3>
    <p class="portal-sub">Credit periodic ROI yield payouts atomically to client wallets or pause active positions.</p>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Ref</th><th>Investor</th><th>Plan</th><th>Capital</th><th>Credited / Target</th><th>Matures</th><th>Status</th><th>Actions</th></tr>
        ${rows || '<tr><td colspan="8">No active investments yet.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderAdminDepositsPage(deposits, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const rows = deposits
    .map(
      (d) => `<tr>
        <td><small>${h(d.wtx_id)}</small></td>
        <td><strong>${h(d.full_name)}</strong><br><small>${h(d.email)} &middot; 0${h(d.phone)}</small></td>
        <td>${h(d.method.replace('_', ' '))}</td>
        <td><code>${h(d.reference)}</code></td>
        <td>${h(money(d.amount))}</td>
        <td><span class="status-label ${h(d.status)}">${h(d.status)}</span></td>
        <td><small>${h(d.created_at.slice(0, 16).replace('T', ' '))}</small></td>
        <td class="actions">
          ${
            d.status === 'PENDING'
              ? `<form method="post" action="${h(u('admin/deposits'))}" class="inline">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="wtxId" value="${h(d.wtx_id)}">
                   <input type="hidden" name="outcome" value="COMPLETED">
                   <button class="btn btn-solid btn-sm" type="submit">Approve &amp; Credit</button>
                 </form>
                 <form method="post" action="${h(u('admin/deposits'))}" class="inline">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="wtxId" value="${h(d.wtx_id)}">
                   <input type="hidden" name="outcome" value="REJECTED">
                   <button class="btn btn-outline btn-sm" type="submit">Reject</button>
                 </form>`
              : '<small>Processed</small>'
          }
        </td>
      </tr>`
    )
    .join('\n');

  return `<section class="portal-card">
    <h3>User Deposit Management</h3>
    <p class="portal-sub">Approving a pending Bank or Bitcoin deposit credits the client's wallet and distributes configured multi-level referral bonuses atomically.</p>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Ref</th><th>Client</th><th>Method</th><th>Gateway Ref</th><th>Amount</th><th>Status</th><th>Timestamp</th><th>Actions</th></tr>
        ${rows || '<tr><td colspan="8">No deposits recorded yet.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderAdminWithdrawalsPage(withdrawals, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const rows = withdrawals
    .map(
      (w) => `<tr>
        <td><small>${h(w.wtx_id)}</small></td>
        <td><strong>${h(w.full_name)}</strong><br><small>${h(w.email)}</small></td>
        <td>${h(w.method.replace('_', ' '))}</td>
        <td><code>${h(w.reference)}</code></td>
        <td>${h(money(w.amount))}</td>
        <td><span class="status-label ${h(w.status)}">${h(w.status)}</span></td>
        <td><small>${h(w.created_at.slice(0, 16).replace('T', ' '))}</small></td>
        <td class="actions">
          ${
            w.status === 'PENDING'
              ? `<form method="post" action="${h(u('admin/withdrawals'))}" class="inline">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="wtxId" value="${h(w.wtx_id)}">
                   <input type="hidden" name="outcome" value="COMPLETED">
                   <button class="btn btn-solid btn-sm" type="submit">Mark Paid</button>
                 </form>
                 <form method="post" action="${h(u('admin/withdrawals'))}" class="inline">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="wtxId" value="${h(w.wtx_id)}">
                   <input type="hidden" name="outcome" value="REJECTED">
                   <button class="btn btn-outline btn-sm" type="submit">Reject &amp; Refund</button>
                 </form>`
              : '<small>Processed</small>'
          }
        </td>
      </tr>`
    )
    .join('\n');

  return `<section class="portal-card">
    <h3>User Withdrawal Management</h3>
    <p class="portal-sub">Approve outgoing Airtel Money / Bank payouts or reject to automatically refund the reserved ZMW balance back to the client's wallet.</p>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Ref</th><th>Client</th><th>Channel</th><th>Destination</th><th>Amount</th><th>Status</th><th>Timestamp</th><th>Actions</th></tr>
        ${rows || '<tr><td colspan="8">No withdrawal requests yet.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderAdminServicesPage(rows, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const allRows = [...rows, { id: 0, code: '', label: '', price: '', is_active: 1 }];

  const htmlRows = allRows
    .map((r) => {
      const f = `svc${r.id}`;
      const isNew = !r.id;
      return `<tr>
        <td>
          <form id="${f}" method="post" action="${h(u('admin/service_save'))}" class="inline">
            ${csrfField(csrfToken, adminToken)}
            <input type="hidden" name="id" value="${r.id}">
          </form>
          <input form="${f}" name="code" value="${h(r.code)}" placeholder="${isNew ? 'new_code' : ''}" aria-label="Code for ${isNew ? 'new package' : h(r.code)}">
        </td>
        <td><input form="${f}" name="label" value="${h(r.label)}" placeholder="${isNew ? 'New package' : ''}" aria-label="Label for ${isNew ? 'new package' : h(r.code)}"></td>
        <td><input form="${f}" name="price" value="${h(r.price)}" size="6" placeholder="${isNew ? '0.00' : ''}" aria-label="Price for ${isNew ? 'new package' : h(r.code)}"></td>
        <td><input form="${f}" type="checkbox" name="is_active" value="1" ${r.is_active ? 'checked' : ''} aria-label="Active status for ${isNew ? 'new package' : h(r.code)}"></td>
        <td class="actions">
          <button form="${f}" class="btn ${isNew ? 'btn-solid' : 'btn-outline'}" type="submit" aria-label="${isNew ? 'Add new package' : `Save package ${h(r.code)}`}">${isNew ? 'Add' : 'Save'}</button>
          ${
            !isNew
              ? `<form method="post" action="${h(u('admin/service_delete'))}" class="inline" data-confirm="Delete this package?">
                   ${csrfField(csrfToken, adminToken)}
                   <input type="hidden" name="id" value="${r.id}">
                   <button class="btn btn-outline" type="submit" aria-label="Delete package ${h(r.code)}">Delete</button>
                 </form>`
              : ''
          }
        </td>
      </tr>`;
    })
    .join('\n');

  return `<section class="portal-card">
    <h3>Studio Photography Packages</h3>
    <p class="portal-sub">Create, edit, or delete studio photography packages. Packages with existing bookings are safely deactivated to preserve history.</p>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Code</th><th>Label</th><th>Price (ZMW)</th><th>Active</th><th>Actions</th></tr>
        ${htmlRows}
      </table>
    </div>
  </section>`;
}

export function renderAdminTransactionsPage(rows, csrfToken, adminToken) {
  const actionUrl = h(routeUrl('admin/transaction_action', {}, adminToken));

  const htmlRows = rows
    .map((t) => {
      const actions =
        t.status === 'PENDING'
          ? `<form method="post" action="${actionUrl}" class="inline">
               ${csrfField(csrfToken, adminToken)}
               <input type="hidden" name="id" value="${h(t.transaction_id)}">
               <input type="hidden" name="outcome" value="SUCCESS">
               <button class="btn btn-solid btn-sm" type="submit" aria-label="Confirm ${h(t.transaction_id)} paid">Confirm (Paid)</button>
             </form>
             <form method="post" action="${actionUrl}" class="inline">
               ${csrfField(csrfToken, adminToken)}
               <input type="hidden" name="id" value="${h(t.transaction_id)}">
               <input type="hidden" name="outcome" value="FAILED">
               <button class="btn btn-outline btn-sm" type="submit" aria-label="Mark ${h(t.transaction_id)} failed">Mark Failed</button>
             </form>`
          : '<small>Settled</small>';

      return `<tr>
        <td><small>${h(t.transaction_id)}</small></td>
        <td><small>${h(t.booking_id)}</small><br><small>${h(niceDate(t.event_date ?? ''))}</small></td>
        <td>${h(t.full_name ?? '')}<br><small>0${h(t.msisdn)}</small></td>
        <td>${h(t.service_label ?? '')}</td>
        <td>${h(money(t.amount))}</td>
        <td><span class="status-label ${h(t.status)}">${h(t.status)}</span></td>
        <td><span class="status-label ${h(t.booking_status ?? '')}">${h(t.booking_status ?? '')}</span></td>
        <td><small>${h(t.created_at)}</small>${t.error ? `<br><small>${h(t.error)}</small>` : ''}</td>
        <td class="actions">${actions}</td>
      </tr>`;
    })
    .join('\n');

  return `<section class="portal-card">
    <h3>Studio Booking Payment Ledger</h3>
    <p class="portal-sub">Every Airtel Money booking payment initiates an atomic ACID transaction. Pending transactions can be settled below.</p>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Txn Ref</th><th>Booking</th><th>Client</th><th>Package</th><th>Amount</th><th>Txn Status</th><th>Booking Status</th><th>Timestamp</th><th>Actions</th></tr>
        ${htmlRows || '<tr><td colspan="9">No payment transactions recorded yet.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderAdminGalleryPage(photos, csrfToken, adminToken) {
  const uploadUrl = h(routeUrl('admin/gallery_upload', {}, adminToken));
  const deleteUrl = h(routeUrl('admin/gallery_delete', {}, adminToken));

  const cards = photos
    .map(
      (p) => `<div class="photo-card">
        <img src="/uploads/thumbs/${h(p.thumb)}" alt="${h(p.title)}">
        <div class="photo-card-body">
          <span class="photo-card-title">${h(p.title)}</span>
          <form method="post" action="${deleteUrl}" data-confirm="Delete this photo?" class="inline">
            ${csrfField(csrfToken, adminToken)}
            <input type="hidden" name="id" value="${p.photo_id}">
            <button class="btn btn-outline btn-sm" type="submit" aria-label="Delete photo ${h(p.title)}">Delete</button>
          </form>
        </div>
      </div>`
    )
    .join('\n');

  return `<section class="portal-card" style="margin-bottom:20px">
    <h3>Upload Portfolio Frame</h3>
    <form method="post" enctype="multipart/form-data" action="${uploadUrl}" class="form-stack" style="max-width:480px">
      ${csrfField(csrfToken, adminToken)}
      <div class="field"><label for="title">Title</label><input id="title" name="title" required></div>
      <div class="field"><label for="photo">Image (JPG, PNG or WEBP, max 3 MB)</label><input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></div>
      <button class="btn btn-solid" type="submit">Upload</button>
    </form>
  </section>
  <div class="grid-photos">
    ${cards}
  </div>`;
}

export function renderAdminNotificationsPage(tickets, notifications, members, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  const memberOpts = members.map((m) => `<option value="${m.user_id}">${h(m.full_name)} (${h(m.email)})</option>`).join('');

  const ticketHtml = tickets
    .map((t) => {
      const msgs = (t.messages || [])
        .map(
          (m) => `<div class="ticket-msg ${m.sender_role === 'admin' ? 'from-admin' : 'from-user'}">
            <small><strong>${h(m.sender_name)}</strong> (${h(m.sender_role)}) &middot; ${h(m.created_at.slice(0, 16).replace('T', ' '))}</small>
            <p>${h(m.body)}</p>
          </div>`
        )
        .join('');
      return `<div class="portal-card" style="margin-bottom:14px">
        <div class="portal-card-head">
          <div>
            <strong>${h(t.ticket_id)} &middot; ${h(t.subject)}</strong>
            <p class="portal-sub">Client: ${h(t.full_name)} (${h(t.email)}) &middot; Status: <span class="status-label ${h(t.status === 'closed' ? 'cancelled' : t.status === 'answered' ? 'paid' : 'pending_payment')}">${h(t.status)}</span></p>
          </div>
        </div>
        <div class="ticket-thread">${msgs}</div>
        <form method="post" action="${h(u('admin/notifications'))}" class="filters" style="margin-top:10px;margin-bottom:0">
          ${csrfField(csrfToken, adminToken)}
          <input type="hidden" name="do" value="reply_ticket">
          <input type="hidden" name="ticketId" value="${h(t.ticket_id)}">
          <input name="body" placeholder="Write admin reply...">
          <button class="btn btn-solid btn-sm" type="submit">Reply</button>
          ${t.status !== 'closed' ? '<button class="btn btn-outline btn-sm" type="submit" name="closeTicket" value="1">Close Ticket</button>' : ''}
        </form>
      </div>`;
    })
    .join('\n');

  const noticeRows = notifications
    .map((n) => `<tr><td><strong>${h(n.title)}</strong><br><small>${h(n.body)}</small></td><td>${n.recipient_name ? h(n.recipient_name) : 'All Clients (Broadcast)'}</td><td><small>${h(n.created_at.slice(0, 16).replace('T', ' '))}</small></td></tr>`)
    .join('');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Mass Notification Broadcaster</h3>
      <form method="post" action="${h(u('admin/notifications'))}" class="form-stack">
        ${csrfField(csrfToken, adminToken)}
        <input type="hidden" name="do" value="send_notice">
        <div class="field">
          <label for="userId">Audience</label>
          <select id="userId" name="userId">
            <option value="">All Registered Clients (Mass Notification)</option>
            ${memberOpts}
          </select>
        </div>
        <div class="field"><label for="title">Notice Title</label><input id="title" name="title" required placeholder="e.g. Weekend Shoot Availability &amp; Yield Payout"></div>
        <div class="field"><label for="body">Message</label><textarea id="body" name="body" rows="3" required placeholder="Announcement text..."></textarea></div>
        <button class="btn btn-solid btn-block" type="submit">Send Notification</button>
      </form>
    </section>

    <section class="portal-card">
      <h3>Sent Notifications</h3>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>Notice</th><th>Recipient</th><th>Sent</th></tr>
          ${noticeRows || '<tr><td colspan="3">No notifications sent yet.</td></tr>'}
        </table>
      </div>
    </section>
  </div>

  <section style="margin-top:20px">
    <h3 style="margin-bottom:12px">Internal Support Tickets Desk</h3>
    ${ticketHtml || '<div class="portal-card"><p>No support tickets submitted yet.</p></div>'}
  </section>`;
}

export function renderAdminSettingsPage(settings, csrfToken, adminToken) {
  const u = (r) => routeUrl(r, {}, adminToken);
  return `<section class="portal-card" style="max-width:680px">
    <h3>Website Configuration &amp; System Controls</h3>
    <p class="portal-sub">Control platform branding, public registration, withdrawal availability, referral commission tiers, and SMTP mail configuration.</p>
    <form method="post" action="${h(u('admin/settings'))}" class="form-stack">
      ${csrfField(csrfToken, adminToken)}
      <div class="field"><label for="site_name">Platform Name</label><input id="site_name" name="site_name" value="${h(settings.site_name)}" required></div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;">
        <div class="field"><label for="referral_l1_percent">Level-1 Referral Bonus (%)</label><input id="referral_l1_percent" name="referral_l1_percent" type="number" step="0.5" min="0" max="50" value="${h(settings.referral_l1_percent)}" required></div>
        <div class="field"><label for="referral_l2_percent">Level-2 Referral Bonus (%)</label><input id="referral_l2_percent" name="referral_l2_percent" type="number" step="0.5" min="0" max="50" value="${h(settings.referral_l2_percent)}" required></div>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;">
        <div class="field"><label for="smtp_host">SMTP Mail Host</label><input id="smtp_host" name="smtp_host" value="${h(settings.smtp_host)}" required></div>
        <div class="field"><label for="smtp_from">SMTP Sender Email</label><input id="smtp_from" name="smtp_from" type="email" value="${h(settings.smtp_from)}" required></div>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" name="registration_enabled" value="1" ${settings.registration_enabled === '1' ? 'checked' : ''} style="width:auto">
        <span>Enable Public Client Registration</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" name="withdrawals_enabled" value="1" ${settings.withdrawals_enabled === '1' ? 'checked' : ''} style="width:auto">
        <span>Enable Client Wallet Withdrawals</span>
      </label>
      <button class="btn btn-solid" type="submit">Save Website Configuration</button>
    </form>
  </section>`;
}

export function renderAdminReportsPage(svc, month, top, invReports) {
  const svcRows = svc
    .map((r) => `<tr><td>${h(r.label)}</td><td>${Number(r.bookings)}</td><td>${h(money(r.revenue))}</td></tr>`)
    .join('');
  const monthRows = month
    .map((r) => `<tr><td>${h(r.month)}</td><td>${Number(r.bookings)}</td><td>${h(money(r.value))}</td></tr>`)
    .join('');
  const topRows = top
    .map((r) => `<tr><td>${h(r.full_name)}</td><td>${Number(r.bookings)}</td><td>${h(money(r.value))}</td></tr>`)
    .join('');
  const planRows = (invReports?.byPlan || [])
    .map((p) => `<tr><td>${h(p.name)} (${h(p.cadence)})</td><td>${Number(p.roi_percent)}%</td><td>${Number(p.subscriptions)}</td><td>${h(money(p.capital))}</td><td>${h(money(p.payouts))}</td></tr>`)
    .join('');
  const wtxRows = (invReports?.byWalletType || [])
    .map((w) => `<tr><td>${h(w.type.replace('_', ' '))}</td><td><span class="status-label ${h(w.status)}">${h(w.status)}</span></td><td>${Number(w.tx_count)}</td><td>${h(money(w.total_amount))}</td></tr>`)
    .join('');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Revenue by studio package <small>(JOIN + GROUP BY)</small></h3>
      <div class="scroll" style="margin:0"><table class="table"><tr><th>Package</th><th>Bookings</th><th>Paid revenue</th></tr>${svcRows}</table></div>
    </section>
    <section class="portal-card">
      <h3>Investment plans performance <small>(JOIN + GROUP BY)</small></h3>
      <div class="scroll" style="margin:0"><table class="table"><tr><th>Plan</th><th>ROI</th><th>Subs</th><th>Capital</th><th>Credited</th></tr>${planRows}</table></div>
    </section>
  </div>

  <div class="portal-two-col" style="margin-top:20px">
    <section class="portal-card">
      <h3>Bookings by month <small>(GROUP BY + HAVING)</small></h3>
      <div class="scroll" style="margin:0"><table class="table"><tr><th>Month</th><th>Bookings</th><th>Value</th></tr>${monthRows}</table></div>
    </section>
    <section class="portal-card">
      <h3>Wallet &amp; Cashflow Breakdown</h3>
      <div class="scroll" style="margin:0"><table class="table"><tr><th>Type</th><th>Status</th><th>Count</th><th>Total ZMW</th></tr>${wtxRows}</table></div>
    </section>
  </div>

  <section class="portal-card" style="margin-top:20px">
    <h3>Top Studio Customers</h3>
    <div class="scroll" style="margin:0"><table class="table"><tr><th>Name</th><th>Bookings</th><th>Value</th></tr>${topRows}</table></div>
  </section>`;
}
