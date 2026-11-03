// /inventory/ (2026 look): filter, sort and count the coin grid. One grid in the page; sorting reorders it.
(function () {
  var grid = document.querySelector('[data-inv-grid]');
  if (!grid) return;
  var cards = Array.prototype.slice.call(grid.children);
  var countEl = document.querySelector('[data-inv-count]');
  var emptyEl = document.querySelector('[data-inv-empty]');
  var sortEl = document.querySelector('[data-inv-sort]');
  var cacEl = document.querySelector('[data-inv-cac]');
  var soldEl = document.querySelector('[data-inv-sold]');
  var state = { cat: 'all', cert: 'all' };

  function num(v, fallback) { var n = parseFloat(v); return isNaN(n) ? fallback : n; }

  var sorters = {
    newest: function (a, b) { return num(a.dataset.newest, 0) - num(b.dataset.newest, 0); },
    // Same rule as the old page: coins without a PCGS catalog # go last.
    catalog: function (a, b) { return num(a.dataset.catno, 999999) - num(b.dataset.catno, 999999) || sorters.newest(a, b); },
    priceasc: function (a, b) { return num(a.dataset.price, 0) - num(b.dataset.price, 0); },
    pricedsc: function (a, b) { return num(b.dataset.price, 0) - num(a.dataset.price, 0); }
  };

  function apply() {
    var showSold = soldEl ? soldEl.checked : true;
    var cacOnly = cacEl ? cacEl.checked : false;
    var sorted = cards.slice().sort(sorters[sortEl ? sortEl.value : 'newest'] || sorters.newest);
    var visible = 0;
    sorted.forEach(function (card) {
      var d = card.dataset;
      var ok = (showSold || d.sold !== 'true') &&
        (!cacOnly || d.cac === 'true') &&
        (state.cat === 'all' || d.cat === state.cat) &&
        (state.cert === 'all' || d.cert === state.cert);
      card.hidden = !ok;
      if (ok) visible++;
      grid.appendChild(card);
    });
    if (countEl) countEl.textContent = visible + (visible === 1 ? ' item' : ' items');
    if (emptyEl) emptyEl.hidden = visible !== 0;
  }

  function wirePills(attr, key) {
    var pills = document.querySelectorAll('[' + attr + ']');
    pills.forEach(function (btn) {
      btn.addEventListener('click', function () {
        pills.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        state[key] = btn.getAttribute(attr);
        apply();
      });
    });
  }
  wirePills('data-filter-cat', 'cat');
  wirePills('data-filter-cert', 'cert');
  [sortEl, cacEl, soldEl].forEach(function (el) { if (el) el.addEventListener('change', apply); });
  apply();
})();
