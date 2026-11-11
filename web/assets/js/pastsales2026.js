// /past-sales/: the page is built with every sold coin; ones still inside their 10 days on Inventory are hidden
// until their data-archive-on day (so a coin shows up here the same day it leaves Inventory, without a rebuild).
(function () {
  var grid = document.querySelector('[data-past-grid]');
  if (!grid) return;
  var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
  var today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  var shown = 0;
  Array.prototype.slice.call(grid.children).forEach(function (card) {
    var on = card.getAttribute('data-archive-on');
    card.hidden = !(on && on <= today);
    if (!card.hidden) shown++;
  });
  var countEl = document.querySelector('[data-past-count]');
  if (countEl) countEl.textContent = shown + (shown === 1 ? ' coin' : ' coins');
  var emptyEl = document.querySelector('[data-past-empty]');
  if (emptyEl) emptyEl.hidden = shown !== 0;
})();
