/* Sell to Us photo box.
 * Shrinks each photo in the browser (longest side 2000 px, JPEG 85%) so uploads are quick on phones
 * and stay well inside Formspree's limits (10 files, 25 MB each, 30-second request).
 * The current list is written back into the real <input type=file> after every change, so the form
 * still posts to Formspree as a normal multipart form. Browsers without DataTransfer just send
 * whatever the customer picked last, unshrunk.
 */
(function () {
  var box = document.getElementById('photo-upload');
  if (!box) return;
  var MAX_FILES = 10, MAX_SIDE = 2000, QUALITY = 0.85, MAX_BYTES = 25 * 1024 * 1024;
  var input = box.querySelector('input[type=file]');
  var drop = box.querySelector('.cc26-upload__drop');
  var grid = box.querySelector('.cc26-upload__grid');
  var status = box.querySelector('.cc26-upload__status');
  var form = input.form;
  var canSet = (function () { try { return !!new DataTransfer(); } catch (e) { return false; } })();
  if (!canSet) return; // plain file input still works
  var photos = []; // { file, url, busy }

  function size (n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  function shrink (file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        if (s === 1 && file.type === 'image/jpeg' && file.size < 1.5 * 1048576) { URL.revokeObjectURL(url); return resolve(file); }
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (!b) return resolve(file);
          resolve(new File([b], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', QUALITY);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); }; // can't decode (e.g. HEIC on a PC): send as-is
      img.src = url;
    });
  }

  function sync () {
    var dt = new DataTransfer();
    photos.forEach(function (p) { if (!p.busy) dt.items.add(p.file); });
    input.files = dt.files;
  }

  function render (note) {
    grid.innerHTML = '';
    photos.forEach(function (p, i) {
      var li = document.createElement('li'); li.className = 'cc26-upload__item' + (p.busy ? ' is-busy' : '');
      var im = document.createElement('img'); im.src = p.url; im.alt = 'Photo ' + (i + 1);
      var sz = document.createElement('span'); sz.className = 'cc26-upload__size'; sz.textContent = p.busy ? 'Shrinking…' : size(p.file.size);
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'cc26-upload__rm'; rm.textContent = '×';
      rm.setAttribute('aria-label', 'Remove photo ' + (i + 1));
      rm.onclick = function () { URL.revokeObjectURL(p.url); photos.splice(photos.indexOf(p), 1); render(); };
      li.append(im, sz, rm); grid.appendChild(li);
    });
    sync();
    var total = photos.reduce(function (t, p) { return t + p.file.size; }, 0);
    status.classList.toggle('is-warn', !!note);
    status.textContent = note || (photos.length ? photos.length + ' of ' + MAX_FILES + ' photos · ' + size(total) + ' total' : '');
  }

  function add (files) {
    var list = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name); });
    var room = MAX_FILES - photos.length;
    var note = list.length > room ? (list.length - room) + ' not added (10 photo limit)' : '';
    list.slice(0, Math.max(0, room)).forEach(function (f) {
      var p = { file: f, url: URL.createObjectURL(f), busy: true };
      photos.push(p);
      shrink(f).then(function (small) {
        if (photos.indexOf(p) < 0) return; // removed while shrinking
        if (small.size > MAX_BYTES) { photos.splice(photos.indexOf(p), 1); return render(f.name + ' is too large to send (over 25 MB).'); }
        p.file = small; p.busy = false; render();
      });
    });
    render(note);
  }

  input.addEventListener('change', function () { add(input.files); });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer) add(e.dataTransfer.files); });

  form.addEventListener('submit', function (e) {
    if (photos.some(function (p) { return p.busy; })) { e.preventDefault(); render('Still preparing your photos. Try again in a moment.'); }
  });
})();
