// Cabbage Coins 2026 look: phone menu, Join-the-list pop-up, reviews arrows.
(function () {
  // Phone menu
  var menuBtn = document.querySelector('[data-menu-toggle]');
  var mnav = document.getElementById('cc26-mnav');
  if (menuBtn && mnav) {
    menuBtn.addEventListener('click', function () {
      var open = mnav.hasAttribute('hidden');
      if (open) mnav.removeAttribute('hidden'); else mnav.setAttribute('hidden', '');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Pop-ups. [data-join-open] opens the Join-the-list form (in the layout);
  // [data-modal-open="<id>"] opens any other .cc26-modal on the page (e.g. the contact form).
  // Inside a pop-up, [data-join-close] / [data-modal-close] close it; so do Escape and the backdrop.
  var lastFocus = null;
  function openModal(modal) {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    var first = modal.querySelector('input:not([type=hidden]):not([tabindex="-1"]), textarea');
    if (first) first.focus();
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.querySelectorAll('[data-join-open]').forEach(function (b) {
    b.addEventListener('click', function () { openModal(document.getElementById('cc26-join')); });
  });
  document.querySelectorAll('[data-modal-open]').forEach(function (b) {
    b.addEventListener('click', function () { openModal(document.getElementById(b.getAttribute('data-modal-open'))); });
  });
  document.querySelectorAll('.cc26-modal').forEach(function (modal) {
    modal.querySelectorAll('[data-join-close], [data-modal-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeModal(modal); });
    });
    modal.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(modal); });
  });
  // cabbagecoins.com/#join (say it on the podcast) opens the sign-up straight away; /#contact opens a contact form.
  if (location.hash === '#join') openModal(document.getElementById('cc26-join'));
  if (location.hash === '#contact') openModal(document.getElementById('cc26-contact'));

  // Photo that swaps to a second shot on hover (About page portrait).
  document.querySelectorAll('[data-swap-src]').forEach(function (img) {
    var front = img.getAttribute('src');
    var back = img.getAttribute('data-swap-src');
    new Image().src = back;
    img.addEventListener('mouseenter', function () { img.src = back; });
    img.addEventListener('mouseleave', function () { img.src = front; });
  });

  // Podcast preview: swap the thumbnail for the playing video, in place.
  document.querySelectorAll('[data-video]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-video');
      var frame = document.createElement('iframe');
      frame.className = 'cc26-video cc26-video--playing';
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
      frame.title = btn.getAttribute('aria-label') || 'Podcast episode';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      btn.replaceWith(frame);
    });
  });

  // Reviews: arrows scroll the row one "page" at a time; phones just swipe.
  var track = document.querySelector('[data-reviews]');
  function page(dir) {
    if (!track) return;
    var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    var atStart = track.scrollLeft <= 4;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else if (dir < 0 && atStart) track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    else track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
  }
  var prev = document.querySelector('[data-rev-prev]');
  var next = document.querySelector('[data-rev-next]');
  if (prev) prev.addEventListener('click', function () { page(-1); });
  if (next) next.addEventListener('click', function () { page(1); });
})();
