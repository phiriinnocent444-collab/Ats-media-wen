import { h, money, niceDate } from '../security.js';
import { csrfField, renderStatRing, routeUrl } from './layout.js';

export function renderMemberLoginPage(error, remembered, csrfToken) {
  return `<p class="eyebrow">Client &amp; Investor Portal</p>
<h2>Sign in to your Studio &amp; Capital wallet</h2>
<p class="section-lede">Access your ZMW wallet, photography bookings, Studio Production Investment Plans, KYC verification, and referral rewards.</p>
<div class="auth-split">
  <form method="post" action="${h(routeUrl('member/login'))}" class="card">
    ${csrfField(csrfToken)}
    ${error ? `<p class="flash err">${h(error)}</p>` : ''}
    <div class="field"><label for="login">Email or Phone Number</label><input id="login" name="login" value="${h(remembered)}" placeholder="chanda@example.com or 0972971151" autocomplete="username" required></div>
    <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn btn-solid btn-block" type="submit">Log in to Wallet</button>
    <p class="portal-note" style="margin-top:4px;border-top:none;padding-top:0;">New client? <a href="${h(routeUrl('member/register'))}">Create an account</a></p>
  </form>
  <div class="card">
    <h3>Demo Client Access</h3>
    <p class="section-lede">Explore the combined investment &amp; studio wallet portal right away or register your own client profile.</p>
    <p><strong>Email:</strong> <code>chanda@example.com</code><br><strong>Phone:</strong> <code>0972971151</code><br><strong>Password:</strong> <code>client-2026</code></p>
    <p><small>Includes active wedding studio production investment, verified KYC status, referral downline, and ZMW wallet balance.</small></p>
  </div>
</div>`;
}

export function renderMemberRegisterPage(error, values, csrfToken, settings) {
  if (settings.registration_enabled !== '1') {
    return `<p class="eyebrow">Registration</p>
    <h2>Account registration paused</h2>
    <div class="card" style="max-width:480px">
      <p class="flash err">Public account registration is currently disabled by the studio administrator.</p>
      <p><a class="btn btn-outline" href="${h(routeUrl('member/login'))}">Return to Client Login</a></p>
    </div>`;
  }

  return `<p class="eyebrow">Open Studio &amp; Capital Account</p>
<h2>Create your client account</h2>
<p class="section-lede">One account for photography bookings, Airtel Money / Bank / Bitcoin wallet funding, Studio Production Plans, and multi-level referral bonuses.</p>
<form method="post" action="${h(routeUrl('member/register'))}" class="card" style="max-width:520px">
  ${csrfField(csrfToken)}
  ${error ? `<p class="flash err">${h(error)}</p>` : ''}
  <div class="field"><label for="fullName">Full name</label><input id="fullName" name="fullName" value="${h(values.fullName || '')}" required placeholder="e.g. Chanda Mwansa"></div>
  <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" value="${h(values.email || '')}" required placeholder="you@example.com"></div>
  <div class="field"><label for="phone">Phone number</label><input id="phone" name="phone" type="tel" value="${h(values.phone || '')}" required placeholder="e.g. 0972971151"></div>
  <div class="field"><label for="password">Password (min 6 characters)</label><input id="password" name="password" type="password" required minlength="6"></div>
  <div class="field"><label for="referralCode">Referral code <span class="optional">(optional)</span></label><input id="referralCode" name="referralCode" value="${h(values.referralCode || '')}" placeholder="e.g. ATS-CHANDA"></div>
  <button class="btn btn-solid btn-block" type="submit">Register account</button>
  <p class="portal-note" style="margin-top:4px;border-top:none;padding-top:0;">Already registered? <a href="${h(routeUrl('member/login'))}">Sign in</a></p>
</form>`;
}

export function renderMember2faPage(error, demoCode, csrfToken) {
  return `<p class="eyebrow">Two-Factor Authentication</p>
<h2>Enter your 2FA security code</h2>
<form method="post" action="${h(routeUrl('member/verify_2fa'))}" class="card" style="max-width:420px">
  ${csrfField(csrfToken)}
  ${error ? `<p class="flash err">${h(error)}</p>` : ''}
  <p class="flash ok">UAT 2FA Verification Code: <strong>${h(demoCode)}</strong></p>
  <div class="field"><label for="code">6-digit verification code</label><input id="code" name="code" required autocomplete="one-time-code" placeholder="Enter 6-digit code"></div>
  <button class="btn btn-solid btn-block" type="submit">Verify &amp; Continue</button>
</form>`;
}

export function renderMemberDashboardPage(summary, memberToken) {
  const { user } = summary;
  const u = (r, q = {}) => routeUrl(r, q, '', memberToken);

  const invPct = summary.investmentsTotal > 0 ? Math.round((summary.investmentsActive / summary.investmentsTotal) * 100) : 0;
  const bookPct = summary.bookingsTotal > 0 ? Math.round((summary.bookingsPaid / summary.bookingsTotal) * 100) : 0;
  const refPct = summary.referralsTotal > 0 ? Math.min(100, summary.referralsTotal * 25) : 0;

  const recentTxRows = summary.recentTx
    .map(
      (tx) => `<tr>
        <td><small>${h(tx.wtx_id)}</small></td>
        <td>${h(tx.type.replace('_', ' '))}</td>
        <td>${h(tx.method.replace('_', ' '))}</td>
        <td>${h(money(tx.amount))}</td>
        <td><span class="status-label ${h(tx.status)}">${h(tx.status)}</span></td>
      </tr>`
    )
    .join('\n');

  const bookingRows = summary.upcomingBookings
    .map(
      (b) => `<tr>
        <td><small>${h(b.id)}</small></td>
        <td>${h(b.serviceLabel)}</td>
        <td>${h(niceDate(b.eventDate))}</td>
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
          <p class="portal-sub">Real-time overview of your studio shoots &amp; yield activity</p>
        </div>
      </div>
      <div class="stat-rings-grid">
        ${renderStatRing(summary.investmentsTotal, 'Investments', `Active: ${summary.investmentsActive}`, `Done: ${summary.investmentsCompleted}`, invPct, '#2563EB')}
        ${renderStatRing(summary.bookingsTotal, 'Studio Bookings', `Paid: ${summary.bookingsPaid}`, `Pending: ${summary.bookingsTotal - summary.bookingsPaid}`, bookPct, '#C9A227')}
        ${renderStatRing(summary.referralsTotal, 'Referrals', `Level 1: ${summary.referralsL1}`, `Level 2: ${summary.referralsL2}`, refPct, '#D946EF')}
      </div>
    </section>

    <section class="portal-card">
      <div class="portal-card-head">
        <div>
          <h3>Balance Summary</h3>
          <p class="portal-sub">Available ZMW liquidity &amp; portfolio performance</p>
        </div>
        <a href="${h(u('member/deposit'))}" class="btn btn-solid btn-sm">+ Deposit</a>
      </div>
      <div class="balance-grid">
        <div class="balance-item">
          <span>Wallet Balance</span>
          <strong>${h(money(user.wallet_balance))}</strong>
        </div>
        <div class="balance-item">
          <span>Active Capital</span>
          <strong>${h(money(summary.activeCapital))}</strong>
        </div>
        <div class="balance-item">
          <span>Total Yield Credited</span>
          <strong>${h(money(summary.totalProfit))}</strong>
        </div>
        <div class="balance-item">
          <span>Deposits / Withdrawals</span>
          <strong>${h(money(summary.totalDeposits))} / ${h(money(summary.totalWithdrawals))}</strong>
        </div>
      </div>
      <div class="portal-quick-strip">
        <a href="${h(u('member/invest'))}" class="btn btn-outline btn-sm">Invest in Plan</a>
        <a href="${h(u('member/transfer'))}" class="btn btn-outline btn-sm">Transfer Funds</a>
        <a href="${h(u('member/bookings'))}" class="btn btn-outline btn-sm">My Studio Bookings</a>
      </div>
    </section>
  </div>

  <div class="portal-two-col">
    <section class="portal-card">
      <div class="portal-card-head">
        <h3>Recent Wallet Ledger</h3>
        <a href="${h(u('member/deposit'))}" class="btn btn-ghost btn-sm">View Funding</a>
      </div>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>Ref</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th></tr>
          ${recentTxRows || '<tr><td colspan="5">No wallet transactions yet.</td></tr>'}
        </table>
      </div>
    </section>

    <section class="portal-card">
      <div class="portal-card-head">
        <h3>Studio Photography Bookings</h3>
        <a href="${h(u('member/bookings'))}" class="btn btn-ghost btn-sm">Manage</a>
      </div>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>Ref</th><th>Package</th><th>Date</th><th>Fee</th><th>Status</th></tr>
          ${bookingRows || '<tr><td colspan="5">No studio bookings linked to 0' + h(user.phone) + ' yet.</td></tr>'}
        </table>
      </div>
    </section>
  </div>`;
}

export function renderMemberDepositPage(user, deposits, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);
  const rows = deposits
    .map(
      (d) => `<tr>
        <td><small>${h(d.wtx_id)}</small></td>
        <td>${h(d.method.replace('_', ' '))}</td>
        <td>${h(d.reference)}</td>
        <td>${h(money(d.amount))}</td>
        <td><span class="status-label ${h(d.status)}">${h(d.status)}</span></td>
        <td><small>${h(d.note || '')}</small></td>
      </tr>`
    )
    .join('\n');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Fund Your ZMW Wallet</h3>
      <p class="portal-sub">Current balance: <strong>${h(money(user.wallet_balance))}</strong>. Airtel Money UAT credits immediately; Bank &amp; Bitcoin deposits enter the admin verification queue.</p>
      <form method="post" action="${h(u('member/deposit'))}" class="form-stack">
        ${csrfField(csrfToken, '', memberToken)}
        <div class="field">
          <label for="method">Payment Method</label>
          <select id="method" name="method" required>
            <option value="airtel_money">Airtel Money (UAT Instant Credit)</option>
            <option value="bank_transfer">Direct Bank Deposit (Zanaco / FNB)</option>
            <option value="bitcoin">Bitcoin (BTC Deposit Gateway)</option>
          </select>
        </div>
        <div class="field">
          <label for="amount">Amount (ZMW)</label>
          <input id="amount" name="amount" type="number" step="0.01" min="50" max="1000000" required placeholder="e.g. 1500">
        </div>
        <div class="field">
          <label for="reference">Transaction / Sender Reference</label>
          <input id="reference" name="reference" required placeholder="e.g. AM-0972971151 or Bank Slip #">
        </div>
        <button class="btn btn-solid btn-block" type="submit">Submit Deposit</button>
      </form>
    </section>

    <section class="portal-card">
      <h3>Accepted Deposit Channels</h3>
      <ul class="portal-info-list">
        <li><strong>Airtel Money UAT:</strong> Instant sandbox wallet credit + automatic multi-level referral bonus trigger.</li>
        <li><strong>Direct Bank Deposit:</strong> Zanaco Lusaka Business Branch · Acct <code>0491827400123</code> (verified by studio admin).</li>
        <li><strong>Bitcoin Gateway:</strong> Submit BTC hash / UAT reference; credited in ZMW once confirmed by treasury admin.</li>
      </ul>
    </section>
  </div>

  <section class="portal-card" style="margin-top:20px">
    <h3>Deposit History</h3>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Ref</th><th>Method</th><th>Gateway Ref</th><th>Amount</th><th>Status</th><th>Notes</th></tr>
        ${rows || '<tr><td colspan="6">No deposits recorded yet.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderMemberInvestPage(user, plans, investments, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);

  const planCards = plans
    .map((p) => {
      const paused = p.status === 'paused';
      return `<div class="portal-card plan-card">
        <div class="portal-card-head">
          <div>
            <span class="portal-kicker">${h(p.cadence)} plan &middot; ${Number(p.duration_days)} days</span>
            <h3>${h(p.name)}</h3>
          </div>
          <strong class="plan-roi">${Number(p.roi_percent)}%</strong>
        </div>
        <p class="portal-sub">${h(p.description)}</p>
        <div class="plan-limits">
          <span>Min: <strong>${h(money(p.min_amount))}</strong></span>
          <span>Max: <strong>${h(money(p.max_amount))}</strong></span>
        </div>
        ${
          paused
            ? '<p class="flash err" style="margin:0">This plan is currently paused by administrator.</p>'
            : `<form method="post" action="${h(u('member/invest'))}" class="form-stack">
                 ${csrfField(csrfToken, '', memberToken)}
                 <input type="hidden" name="planId" value="${p.plan_id}">
                 <div class="field">
                   <label for="amt-${p.plan_id}">Capital Amount (ZMW)</label>
                   <input id="amt-${p.plan_id}" name="amount" type="number" step="0.01" min="${Number(p.min_amount)}" max="${Number(p.max_amount)}" value="${Number(p.min_amount)}"
                     data-roi-percent="${Number(p.roi_percent)}" data-duration="${Number(p.duration_days)}" data-cadence="${h(p.cadence)}" class="js-roi-input" required>
                   <small class="js-roi-preview"></small>
                 </div>
                 <button class="btn btn-solid btn-block" type="submit">Invest from Wallet</button>
               </form>`
        }
      </div>`;
    })
    .join('\n');

  const invRows = investments
    .map(
      (i) => `<tr>
        <td><small>${h(i.investment_id)}</small></td>
        <td>${h(i.plan_name)} <small>(${h(i.cadence)} · ${Number(i.roi_percent)}%)</small></td>
        <td>${h(money(i.amount))}</td>
        <td>${h(money(i.expected_return))}</td>
        <td>${h(money(i.credited_return))}</td>
        <td>${h(niceDate(i.matures_at))}</td>
        <td><span class="status-label ${h(i.status)}">${h(i.status)}</span></td>
      </tr>`
    )
    .join('\n');

  return `<section class="portal-card" style="margin-bottom:20px">
    <div class="portal-card-head">
      <div>
        <h3>Studio Production Investment Plans</h3>
        <p class="portal-sub">Available Wallet Balance: <strong>${h(money(user.wallet_balance))}</strong>. Returns are credited inside atomic ACID ledger transactions.</p>
      </div>
      <a href="${h(u('member/deposit'))}" class="btn btn-outline btn-sm">Add Funds</a>
    </div>
  </section>

  <div class="plans-grid">
    ${planCards}
  </div>

  <section class="portal-card" style="margin-top:20px">
    <h3>Your Active &amp; Completed Investments</h3>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Ref</th><th>Plan</th><th>Capital</th><th>Expected Return</th><th>Credited</th><th>Matures</th><th>Status</th></tr>
        ${invRows || '<tr><td colspan="7">No investments yet. Choose a Daily, Weekly, or Monthly plan above.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderMemberTransferPage(user, txs, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);
  const transferRows = txs
    .filter((t) => t.type === 'transfer_in' || t.type === 'transfer_out')
    .map(
      (t) => `<tr>
        <td><small>${h(t.reference)}</small></td>
        <td>${t.type === 'transfer_out' ? 'Sent' : 'Received'}</td>
        <td>${h(t.counterparty || '')}</td>
        <td>${h(money(t.amount))}</td>
        <td><small>${h(t.note || '')}</small></td>
        <td><span class="status-label ${h(t.status)}">${h(t.status)}</span></td>
      </tr>`
    )
    .join('\n');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Internal User-to-User Fund Transfer</h3>
      <p class="portal-sub">Send ZMW instantly to another ATS client wallet by email, phone number, or referral code. Available balance: <strong>${h(money(user.wallet_balance))}</strong>.</p>
      <form method="post" action="${h(u('member/transfer'))}" class="form-stack">
        ${csrfField(csrfToken, '', memberToken)}
        <div class="field"><label for="recipient">Recipient Email, Phone, or Referral Code</label><input id="recipient" name="recipient" required placeholder="e.g. mutale@example.com or ATS-MUTALE"></div>
        <div class="field"><label for="amount">Amount (ZMW)</label><input id="amount" name="amount" type="number" step="0.01" min="10" max="${Number(user.wallet_balance)}" required placeholder="e.g. 250"></div>
        <div class="field"><label for="note">Reference Note <span class="optional">(optional)</span></label><input id="note" name="note" maxlength="140" placeholder="e.g. Shared shoot deposit"></div>
        <button class="btn btn-solid btn-block" type="submit">Send Instant Transfer</button>
      </form>
    </section>

    <section class="portal-card">
      <h3>Internal Transfer History</h3>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>Ref</th><th>Direction</th><th>Counterparty</th><th>Amount</th><th>Note</th><th>Status</th></tr>
          ${transferRows || '<tr><td colspan="6">No internal transfers yet.</td></tr>'}
        </table>
      </div>
    </section>
  </div>`;
}

export function renderMemberWithdrawPage(user, txs, settings, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);
  const wdrRows = txs
    .filter((t) => t.type === 'withdrawal')
    .map(
      (t) => `<tr>
        <td><small>${h(t.wtx_id)}</small></td>
        <td>${h(t.method.replace('_', ' '))}</td>
        <td>${h(t.reference)}</td>
        <td>${h(money(t.amount))}</td>
        <td><span class="status-label ${h(t.status)}">${h(t.status)}</span></td>
        <td><small>${h(t.created_at.slice(0, 10))}</small></td>
      </tr>`
    )
    .join('\n');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Request Wallet Withdrawal</h3>
      <p class="portal-sub">Available balance: <strong>${h(money(user.wallet_balance))}</strong>. Funds are reserved atomically when submitted and refunded automatically if rejected.</p>
      ${
        settings.withdrawals_enabled !== '1'
          ? '<p class="flash err">Withdrawals are temporarily disabled by the studio administrator.</p>'
          : `<form method="post" action="${h(u('member/withdraw'))}" class="form-stack">
               ${csrfField(csrfToken, '', memberToken)}
               <div class="field">
                 <label for="method">Payout Channel</label>
                 <select id="method" name="method" required>
                   <option value="airtel_money">Airtel Money Mobile Wallet</option>
                   <option value="bank_transfer">Direct Bank Transfer (ZMW)</option>
                 </select>
               </div>
               <div class="field"><label for="destination">Airtel Number or Bank Account</label><input id="destination" name="destination" required value="${h('0' + user.phone)}" placeholder="e.g. 0972971151 or Zanaco Acct #"></div>
               <div class="field"><label for="amount">Withdrawal Amount (ZMW)</label><input id="amount" name="amount" type="number" step="0.01" min="50" max="${Number(user.wallet_balance)}" required placeholder="e.g. 500"></div>
               <button class="btn btn-solid btn-block" type="submit">Request Payout</button>
             </form>`
      }
    </section>

    <section class="portal-card">
      <h3>Withdrawal Requests</h3>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>Ref</th><th>Method</th><th>Destination</th><th>Amount</th><th>Status</th><th>Date</th></tr>
          ${wdrRows || '<tr><td colspan="6">No withdrawal requests yet.</td></tr>'}
        </table>
      </div>
    </section>
  </div>`;
}

export function renderMemberBookingsPage(user, bookings, services, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);
  const serviceOptions = services
    .map((s) => `<option value="${h(s.code)}">${h(s.label)} &mdash; ${h(money(s.price))}</option>`)
    .join('\n');

  const rows = bookings
    .map((b) => {
      const actionCell =
        b.status === 'pending_payment'
          ? `<form method="post" action="${h(u('member/bookings'))}" class="inline">
               ${csrfField(csrfToken, '', memberToken)}
               <input type="hidden" name="do" value="pay_wallet">
               <input type="hidden" name="bookingId" value="${h(b.id)}">
               <button class="btn btn-solid btn-sm" type="submit">Pay from Wallet</button>
             </form>`
          : `<small>${h(b.status)}</small>`;
      return `<tr>
        <td><small>${h(b.id)}</small></td>
        <td>${h(b.serviceLabel)}</td>
        <td>${h(niceDate(b.eventDate))}</td>
        <td>${h(money(b.amount))}</td>
        <td><span class="status-label ${h(b.status)}">${h(b.status)}</span></td>
        <td class="actions">${actionCell}</td>
      </tr>`;
    })
    .join('\n');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Book a Studio Shoot</h3>
      <p class="portal-sub">Create a shoot linked to your account phone (<code>0${h(user.phone)}</code>) and pay directly from your wallet balance (<strong>${h(money(user.wallet_balance))}</strong>).</p>
      <form method="post" action="${h(u('member/bookings'))}" class="form-stack">
        ${csrfField(csrfToken, '', memberToken)}
        <input type="hidden" name="do" value="create_booking">
        <div class="field"><label for="service">Photography Package</label><select id="service" name="service" required><option value="">Choose a package&hellip;</option>${serviceOptions}</select></div>
        <div class="field"><label for="eventDate">Preferred Shoot Date</label><input id="eventDate" name="eventDate" type="date" required></div>
        <div class="field"><label for="notes">Venue &amp; Creative Notes</label><textarea id="notes" name="notes" rows="2" placeholder="Lusaka venue, outfit notes..."></textarea></div>
        <button class="btn btn-solid btn-block" type="submit">Save Shoot Booking</button>
      </form>
    </section>

    <section class="portal-card">
      <h3>Your Studio Bookings</h3>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>Ref</th><th>Package</th><th>Date</th><th>Fee</th><th>Status</th><th>Action</th></tr>
          ${rows || '<tr><td colspan="6">No bookings found for your phone number.</td></tr>'}
        </table>
      </div>
    </section>
  </div>`;
}

export function renderMemberKycPage(user, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);
  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Profile &amp; KYC Verification</h3>
      <p class="portal-sub">Current KYC Status: <strong class="status-label ${h(user.kyc_status === 'verified' ? 'paid' : user.kyc_status === 'rejected' ? 'cancelled' : 'pending_payment')}">${h(user.kyc_status.toUpperCase())}</strong></p>
      <ul class="portal-info-list" style="margin-bottom:16px">
        <li><strong>Full Name:</strong> ${h(user.full_name)}</li>
        <li><strong>Email:</strong> ${h(user.email)}</li>
        <li><strong>Phone:</strong> 0${h(user.phone)}</li>
        <li><strong>Submitted Document:</strong> ${user.kyc_id_type ? `${h(user.kyc_id_type)} · ${h(user.kyc_id_number)}` : 'None submitted yet'}</li>
      </ul>
      <form method="post" action="${h(u('member/kyc'))}" class="form-stack">
        ${csrfField(csrfToken, '', memberToken)}
        <input type="hidden" name="do" value="submit_kyc">
        <div class="field">
          <label for="idType">Identity Document Type</label>
          <select id="idType" name="idType" required>
            <option value="NRC" ${user.kyc_id_type === 'NRC' ? 'selected' : ''}>Zambian NRC</option>
            <option value="Passport" ${user.kyc_id_type === 'Passport' ? 'selected' : ''}>Passport</option>
            <option value="Driver License" ${user.kyc_id_type === 'Driver License' ? 'selected' : ''}>Driver License</option>
          </select>
        </div>
        <div class="field"><label for="idNumber">Document Number</label><input id="idNumber" name="idNumber" required value="${h(user.kyc_id_number || '')}" placeholder="e.g. 248192/10/1"></div>
        <button class="btn btn-solid btn-block" type="submit">Submit KYC for Review</button>
      </form>
    </section>

    <section class="portal-card">
      <h3>2FA Security Authentication</h3>
      <p class="portal-sub">Protect logins to your ZMW investment &amp; booking wallet with Two-Factor verification codes.</p>
      <p>Status: <strong>${user.two_fa_enabled ? 'Enabled' : 'Disabled'}</strong></p>
      <form method="post" action="${h(u('member/kyc'))}">
        ${csrfField(csrfToken, '', memberToken)}
        <input type="hidden" name="do" value="toggle_2fa">
        <input type="hidden" name="enable" value="${user.two_fa_enabled ? '0' : '1'}">
        <button class="btn ${user.two_fa_enabled ? 'btn-outline' : 'btn-solid'}" type="submit">
          ${user.two_fa_enabled ? 'Disable 2FA Security' : 'Enable 2FA Security'}
        </button>
      </form>
    </section>
  </div>`;
}

export function renderMemberReferralsPage(user, refSummary, settings) {
  const l1Rows = refSummary.level1
    .map((r) => `<tr><td>Level 1 (${h(settings.referral_l1_percent)}%)</td><td>${h(r.full_name)}</td><td>${h(r.email)}</td><td><small>${h(r.created_at.slice(0, 10))}</small></td></tr>`)
    .join('');
  const l2Rows = refSummary.level2
    .map((r) => `<tr><td>Level 2 (${h(settings.referral_l2_percent)}%)</td><td>${h(r.full_name)}</td><td>${h(r.email)}</td><td><small>${h(r.created_at.slice(0, 10))}</small></td></tr>`)
    .join('');
  const bonusRows = refSummary.bonuses
    .map((b) => `<tr><td><small>${h(b.wtx_id)}</small></td><td>${h(b.counterparty || '')}</td><td>${h(b.note || '')}</td><td>${h(money(b.amount))}</td></tr>`)
    .join('');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Multi-Level Referral Code</h3>
      <p class="portal-sub">Share your personal referral code. You earn <strong>${h(settings.referral_l1_percent)}%</strong> on Level-1 deposits and <strong>${h(settings.referral_l2_percent)}%</strong> on Level-2 deposits.</p>
      <p><strong>Your Code:</strong> <code>${h(user.referral_code)}</code></p>
      <p><strong>Total Referral Commissions:</strong> <strong>${h(money(refSummary.totalEarned))}</strong></p>
    </section>

    <section class="portal-card">
      <h3>Referral Commission History</h3>
      <div class="scroll" style="margin:0">
        <table class="table">
          <tr><th>Ref</th><th>Member</th><th>Tier</th><th>Bonus</th></tr>
          ${bonusRows || '<tr><td colspan="4">No referral bonuses earned yet.</td></tr>'}
        </table>
      </div>
    </section>
  </div>

  <section class="portal-card" style="margin-top:20px">
    <h3>Downline Network (Level 1 &amp; Level 2)</h3>
    <div class="scroll" style="margin:0">
      <table class="table">
        <tr><th>Tier</th><th>Name</th><th>Email</th><th>Joined</th></tr>
        ${l1Rows + l2Rows || '<tr><td colspan="4">No referred members yet.</td></tr>'}
      </table>
    </div>
  </section>`;
}

export function renderMemberTicketsPage(tickets, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);
  const ticketCards = tickets
    .map((t) => {
      const msgs = (t.messages || [])
        .map(
          (m) => `<div class="ticket-msg ${m.sender_role === 'admin' ? 'from-admin' : 'from-user'}">
            <small><strong>${h(m.sender_name)}</strong> (${h(m.sender_role)}) &middot; ${h(m.created_at.slice(0, 16).replace('T', ' '))}</small>
            <p>${h(m.body)}</p>
          </div>`
        )
        .join('\n');
      return `<div class="portal-card" style="margin-bottom:16px">
        <div class="portal-card-head">
          <div>
            <strong>${h(t.ticket_id)} &middot; ${h(t.subject)}</strong>
            <p class="portal-sub">Category: ${h(t.category)} &middot; Status: <span class="status-label ${h(t.status === 'closed' ? 'cancelled' : t.status === 'answered' ? 'paid' : 'pending_payment')}">${h(t.status)}</span></p>
          </div>
        </div>
        <div class="ticket-thread">${msgs}</div>
        ${
          t.status !== 'closed'
            ? `<form method="post" action="${h(u('member/tickets'))}" class="filters" style="margin-top:12px;margin-bottom:0">
                 ${csrfField(csrfToken, '', memberToken)}
                 <input type="hidden" name="do" value="reply">
                 <input type="hidden" name="ticketId" value="${h(t.ticket_id)}">
                 <input name="body" required placeholder="Write a follow-up message...">
                 <button class="btn btn-outline btn-sm" type="submit">Send Reply</button>
               </form>`
            : ''
        }
      </div>`;
    })
    .join('\n');

  return `<div class="portal-two-col">
    <section class="portal-card">
      <h3>Open Internal Support Ticket</h3>
      <form method="post" action="${h(u('member/tickets'))}" class="form-stack">
        ${csrfField(csrfToken, '', memberToken)}
        <input type="hidden" name="do" value="create">
        <div class="field"><label for="subject">Subject</label><input id="subject" name="subject" required maxlength="120" placeholder="e.g. Question about wedding shoot deposit"></div>
        <div class="field">
          <label for="category">Category</label>
          <select id="category" name="category">
            <option value="bookings">Studio Bookings</option>
            <option value="deposits">Deposits &amp; Withdrawals</option>
            <option value="investments">Investment Plans</option>
            <option value="kyc">KYC &amp; Security</option>
          </select>
        </div>
        <div class="field"><label for="message">Message</label><textarea id="message" name="message" rows="3" required placeholder="Describe how our Lusaka studio or finance desk can help..."></textarea></div>
        <button class="btn btn-solid btn-block" type="submit">Submit Support Ticket</button>
      </form>
    </section>

    <div>
      ${ticketCards || '<div class="portal-card"><p>No support tickets opened yet.</p></div>'}
    </div>
  </div>`;
}

export function renderMemberNotificationsPage(notifications, csrfToken, memberToken) {
  const u = (r) => routeUrl(r, {}, '', memberToken);
  const items = notifications
    .map(
      (n) => `<div class="portal-card" style="margin-bottom:12px">
        <div class="portal-card-head">
          <strong>${h(n.title)}</strong>
          <small>${h(n.created_at.slice(0, 16).replace('T', ' '))}</small>
        </div>
        <p style="margin:6px 0 0">${h(n.body)}</p>
      </div>`
    )
    .join('\n');

  return `<div class="portal-card" style="margin-bottom:16px">
    <div class="portal-card-head">
      <div>
        <h3>Notifications &amp; Studio Broadcasts</h3>
        <p class="portal-sub">System announcements and direct messages from ATS Studio Administration.</p>
      </div>
      <form method="post" action="${h(u('member/notifications'))}">
        ${csrfField(csrfToken, '', memberToken)}
        <button class="btn btn-outline btn-sm" type="submit">Mark Personal Read</button>
      </form>
    </div>
  </div>
  ${items || '<div class="portal-card"><p>No notifications yet.</p></div>'}`;
}
