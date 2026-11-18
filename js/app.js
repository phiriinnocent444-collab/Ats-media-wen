// Unit 9: JavaScript + DOM for the PHP pages (live price preview, character counter, table filter, inline confirmation)
document.addEventListener('DOMContentLoaded', function () {
  // 9.6 Interacting with HTML forms: live price preview when a package is chosen
  var select = document.querySelector('.js-price-source');
  var preview = document.getElementById('price-preview');
  function showPrice() {
    if (!select || !preview) return;
    var opt = select.options[select.selectedIndex];
    var price = opt && opt.dataset.price;
    preview.textContent = price
      ? 'Amount due: K' + Number(price).toLocaleString('en-ZM', { minimumFractionDigits: 2 })
      : '';
  }
  if (select) {
    select.addEventListener('change', showPrice);
    showPrice();
  }

  // 9.4 DOM: character counter for any textarea with data-counter
  document.querySelectorAll('textarea[data-counter]').forEach(function (ta) {
    var out = document.getElementById(ta.dataset.counter);
    if (!out) return;
    function update() {
      out.textContent = ta.value.length + ' / ' + ta.maxLength;
    }
    ta.addEventListener('input', update);
    update();
  });

  // 9.5 Functions: filter table rows as you type
  document.querySelectorAll('input[data-filter]').forEach(function (box) {
    box.addEventListener('input', function () {
      var term = box.value.toLowerCase();
      document.querySelectorAll('#' + box.dataset.filter + ' tr').forEach(function (row, i) {
        if (i === 0) return;
        row.style.display = row.textContent.toLowerCase().indexOf(term) === -1 ? 'none' : '';
      });
    });
  });

  // Accessible inline two-step confirmation for delete forms (avoids window.confirm inside iframe)
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    var btn = f.querySelector('button[type="submit"]');
    if (!btn) return;
    var armed = false;
    var originalLabel = btn.textContent;
    f.addEventListener('submit', function (e) {
      if (!armed) {
        e.preventDefault();
        armed = true;
        btn.textContent = 'Confirm delete';
        btn.classList.add('btn-danger');
        setTimeout(function () {
          armed = false;
          btn.textContent = originalLabel;
        }, 4000);
      }
    });
  });

  // Portal responsive sidebar drawer toggle
  var menuBtn = document.getElementById('portal-menu-toggle');
  var sidebar = document.getElementById('portal-sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        sidebar.classList.remove('open');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') sidebar.classList.remove('open');
    });
  }

  // Live ROI return preview for investment plan inputs
  document.querySelectorAll('.js-roi-input').forEach(function (input) {
    var field = input.closest('.field');
    var out = field ? field.querySelector('.js-roi-preview') : null;
    if (!out) return;
    function updateRoi() {
      var amount = Number(input.value || 0);
      var roi = Number(input.dataset.roiPercent || 0);
      var duration = Number(input.dataset.duration || 0);
      var cadence = input.dataset.cadence || 'cycle';
      if (!amount || amount <= 0 || !roi) {
        out.textContent = '';
        return;
      }
      var profit = amount * (roi / 100);
      var totalReturn = amount + profit;
      out.textContent =
        'Projected yield: +K' +
        profit.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        ' (' +
        cadence +
        ', ' +
        duration +
        'd) · Maturity total: K' +
        totalReturn.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    input.addEventListener('input', updateRoi);
    input.addEventListener('change', updateRoi);
    updateRoi();
  });
});

