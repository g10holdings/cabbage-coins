// Consign vs. auction calculator on /collectorservices/.
// Cabbage Coins tiers are set by the whole sale price (not stepped like tax brackets).
// Auction side assumes the winner pays the coin's value in total, so hammer = value / (1 + buyer's fee).
// No auction house is named or prefilled: the buttons are just common percentages.
(function () {
  var root = document.getElementById('calculator');
  if (!root) return;

  var MIN = 2000;
  var TIERS = [ // [up to and including, rate]
    [5000, 0.10], [10000, 0.08], [15000, 0.07], [25000, 0.06], [50000, 0.05], [Infinity, 0.03]
  ];

  var valueIn = root.querySelector('#cs-value');
  var feeIn = root.querySelector('#cs-fee');
  var otherIn = root.querySelector('#cs-other');
  var pills = root.querySelectorAll('.cs-pill');
  var empty = root.querySelector('.cs-empty');
  var small = root.querySelector('.cs-small');
  var results = root.querySelector('.cs-results');
  var fee = null;

  function num(s) {
    var n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : NaN;
  }
  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(r) {
    return (Math.round(r * 1000) / 10) + '%';
  }
  function out(key, text) {
    root.querySelector('[data-out="' + key + '"]').textContent = text;
  }
  function rateFor(v) {
    for (var i = 0; i < TIERS.length; i++) if (v <= TIERS[i][0]) return TIERS[i][1];
  }

  function update() {
    var v = num(valueIn.value);
    var other = num(otherIn.value) || 0;
    var hasValue = v > 0;

    small.hidden = !(hasValue && v < MIN);
    if (!hasValue || v < MIN || fee === null) {
      results.hidden = true;
      empty.hidden = hasValue && v < MIN;
      return;
    }
    empty.hidden = true;
    results.hidden = false;

    var rate = rateFor(v);
    var usFee = v * rate;
    var usNet = v - usFee;
    var hammer = v / (1 + fee / 100);
    var auNet = hammer - other;

    out('usPrice', money(v));
    out('usRate', pct(rate));
    out('usFee', '− ' + money(usFee));
    out('usNet', money(usNet));
    out('auHammer', money(hammer));
    out('auRate', fee + '%');
    out('auBp', money(v - hammer));
    out('auOther', '− ' + money(other));
    root.querySelector('[data-row="other"]').hidden = other <= 0;
    out('auNet', money(Math.max(auNet, 0)));

    var diff = usNet - auNet;
    var d = root.querySelector('[data-out="diff"]');
    d.classList.toggle('is-behind', diff < 0);
    d.textContent = diff >= 0
      ? 'You could keep about ' + money(diff) + ' more by consigning with Cabbage Coins, and get paid weeks sooner.'
      : 'On these numbers the auction comes out about ' + money(-diff) + ' ahead, though you would still wait weeks longer for payment. Call Tony to talk it through.';
  }

  function setFee(f, fromPill) {
    fee = f;
    pills.forEach(function (p) {
      p.setAttribute('aria-pressed', String(fromPill === p));
    });
    if (fromPill) feeIn.value = '';
    update();
  }

  pills.forEach(function (p) {
    p.addEventListener('click', function () { setFee(parseFloat(p.dataset.fee), p); });
  });
  feeIn.addEventListener('input', function () {
    var f = num(feeIn.value);
    setFee(f >= 0 && f < 100 ? f : null, null);
  });
  [valueIn, otherIn].forEach(function (el) {
    el.addEventListener('input', update);
    el.addEventListener('blur', function () {
      var n = num(el.value);
      if (n > 0) el.value = Math.round(n).toLocaleString('en-US');
    });
  });
})();
