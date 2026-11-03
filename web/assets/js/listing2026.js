// Coin listing page (2026 look): zoom viewer, phone photo carousel, Share menu, inquiry reply-to.
(function () {
  // ---------- Zoom viewer: click any photo for the full-size file, arrows/keys page through ----------
  var links = Array.prototype.slice.call(document.querySelectorAll('[data-zoom]'));
  if (links.length) {
    var box = document.createElement('div');
    box.className = 'cc26-zoom';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Photo viewer');
    box.innerHTML =
      '<button type="button" class="cc26-zoom__close cc26-iconbtn" aria-label="Close">&times;</button>' +
      '<button type="button" class="cc26-zoom__prev cc26-iconbtn" aria-label="Previous photo">&#8249;</button>' +
      '<figure class="cc26-zoom__fig"><img alt=""><figcaption></figcaption></figure>' +
      '<button type="button" class="cc26-zoom__next cc26-iconbtn" aria-label="Next photo">&#8250;</button>';
    document.body.appendChild(box);
    var img = box.querySelector('img');
    var cap = box.querySelector('figcaption');
    var at = 0, opener = null;

    function show(i) {
      at = (i + links.length) % links.length;
      var thumb = links[at].querySelector('img');
      img.src = links[at].getAttribute('href');
      img.alt = thumb ? thumb.alt : '';
      cap.textContent = 'Image ' + (at + 1) + ' of ' + links.length;
    }
    function open(i) { opener = document.activeElement; show(i); box.hidden = false; document.body.style.overflow = 'hidden'; box.querySelector('.cc26-zoom__close').focus(); }
    function close() { box.hidden = true; document.body.style.overflow = ''; if (opener) opener.focus(); }

    links.forEach(function (a, i) {
      a.addEventListener('click', function (e) { e.preventDefault(); open(i); });
    });
    box.querySelector('.cc26-zoom__close').addEventListener('click', close);
    box.querySelector('.cc26-zoom__prev').addEventListener('click', function () { show(at - 1); });
    box.querySelector('.cc26-zoom__next').addEventListener('click', function () { show(at + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(at - 1);
      if (e.key === 'ArrowRight') show(at + 1);
    });
    if (links.length < 2) { box.querySelector('.cc26-zoom__prev').hidden = true; box.querySelector('.cc26-zoom__next').hidden = true; }
  }

  // ---------- Phone carousel (the CSS makes the photo track a swipe strip under 900px) ----------
  var track = document.querySelector('[data-carousel-track]');
  var nav = document.querySelector('[data-carousel-nav]');
  if (track && nav) {
    var slides = track.children;
    var marks = nav.querySelectorAll('[data-goto]');
    var step = function () { var gap = parseFloat(getComputedStyle(track).columnGap) || 0; return slides[0].getBoundingClientRect().width + gap; };
    var sync = function () {
      var s = step(); var i = s ? Math.round(track.scrollLeft / s) : 0;
      for (var n = 0; n < marks.length; n++) marks[n].classList.toggle('is-active', n === i);
    };
    Array.prototype.forEach.call(marks, function (m) {
      m.addEventListener('click', function () {
        // On desktop the thumbs are hidden; on phones they scroll the strip without moving the page.
        track.scrollTo({ left: Number(m.getAttribute('data-goto')) * step(), behavior: 'smooth' });
      });
    });
    var raf;
    track.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = null; sync(); }); });
    window.addEventListener('resize', sync);
    sync();
  }

  // ---------- Share: the phone's own share sheet where there is one, otherwise a small menu ----------
  var share = document.querySelector('[data-share]');
  if (share) {
    var toggle = share.querySelector('[data-share-toggle]');
    var menu = share.querySelector('[data-share-menu]');
    var copy = share.querySelector('[data-share-copy]');
    var url = location.origin + location.pathname;
    var title = share.getAttribute('data-title');
    var enc = encodeURIComponent;
    var to = {
      facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + enc(url),
      x: 'https://twitter.com/intent/tweet?url=' + enc(url) + '&text=' + enc(title),
      email: 'mailto:?subject=' + enc(title) + '&body=' + enc(url)
    };
    share.querySelectorAll('[data-share-to]').forEach(function (a) { a.href = to[a.getAttribute('data-share-to')]; });
    var setOpen = function (open) { menu.hidden = !open; toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    toggle.addEventListener('click', function () {
      // Touch screens only: Windows has a share sheet too, but it doesn't offer Facebook.
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
      setOpen(menu.hidden);
    });
    copy.addEventListener('click', function () {
      var label = copy.querySelector('span');
      navigator.clipboard.writeText(url).then(function () {
        label.textContent = 'Link copied!';
        setTimeout(function () { label.textContent = 'Copy link'; setOpen(false); }, 1500);
      });
    });
    document.addEventListener('click', function (e) { if (!share.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }

  // ---------- Inquiry: Formspree reply-to = the buyer's email, so Tony can just hit Reply ----------
  document.querySelectorAll('form[data-replyto]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var input = form.querySelector('input[name="_replyto"]') || document.createElement('input');
      input.type = 'hidden'; input.name = '_replyto'; input.value = form.querySelector('input[name="email"]').value;
      form.appendChild(input);
    });
  });
})();
