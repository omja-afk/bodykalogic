/* ui.js — small DOM helpers. No framework; just enough to keep views readable. */
(function (global) {
  'use strict';

  /* h('div.card', {onclick: fn}, [children]) */
  function h(spec, attrs, children) {
    var m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
    var tag = m[1] || 'div';
    var node = document.createElement(tag);
    (m[2] || '').split(/(?=[.#])/).forEach(function (tok) {
      if (!tok) return;
      if (tok[0] === '.') node.classList.add(tok.slice(1));
      else node.id = tok.slice(1);
    });
    if (attrs && (typeof attrs !== 'object' || Array.isArray(attrs) || attrs instanceof Node)) {
      children = attrs; attrs = null;
    }
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        Object.keys(v).forEach(function (p) {
          // Custom properties are not fields on the style object; assigning
          // one is silently dropped, so they have to go through setProperty.
          if (p.slice(0, 2) === '--') node.style.setProperty(p, v[p]);
          else node.style[p] = v[p];
        });
      }
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') node.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') node[k] = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /* ---------------------------------------------------------------- icons */

  /* One small stroke set, drawn on a 24px grid and coloured by the text around
   * it. Symbols from the font (arrows, pencils, emoji) render differently on
   * every platform — as colour emoji on a phone, as empty boxes on some — so
   * nothing in the interface relies on them. */
  var ICONS = {
    home:     '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
    utensils: '<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18"/><path d="M17 21V3c-2 1.6-3.2 4.2-3.2 7.2V13H17"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 13l2.5 2.5 4.5-5"/>',
    flame:    '<path d="M12 21c-3.9 0-6.5-2.7-6.5-6.2 0-2.6 1.6-4.3 3-6 .3 1.6 1 2.4 2 2.9C10.2 8.3 11.2 5 13.5 3c.2 3 1.7 4.6 3 6.3 1.2 1.5 2 3 2 5.5 0 3.5-2.6 6.2-6.5 6.2z"/>',
    trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    scale:    '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9.2a5.6 5.6 0 0 1 8 0l-2.4 2.8h-3.2z"/>',
    chart:    '<path d="M3 20h18M6 20v-8M11 20V5M16 20v-11M21 20v-5"/>',
    user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5"/>',
    refresh:  '<path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4"/>',
    upload:   '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    swap:     '<path d="M7 4 3 8l4 4M3 8h14"/><path d="M17 12l4 4-4 4M21 16H7"/>',
    edit:     '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    x:        '<path d="M6 6l12 12M18 6 6 18"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    check:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    camera:   '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    file:     '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
    sparkle:  '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15v5M16.5 17.5h5"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon:     '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    eye:      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:   '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
    logout:   '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9"/>',
    trash:    '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mail:     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>'
  };

  function icon(name, size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  /* A button with an icon in front of its label. With no label it is an
   * icon-only button, and `title` becomes its accessible name as well. */
  function button(cls, iconName, label, attrs) {
    attrs = Object.assign({ type: 'button' }, attrs || {});
    if (!label && attrs.title && !attrs['aria-label']) attrs['aria-label'] = attrs.title;
    var b = h('button.btn' + (cls || ''), attrs, [iconName ? icon(iconName) : null, label || null]);
    if (!label) b.classList.add('btn-icon');
    return b;
  }

  /* Give every label the control that follows it. The views build fields as a
   * label and an input side by side, which looks right and reads as two
   * unrelated things to a screen reader — and a tap on the label does nothing. */
  var labelSeq = 0;
  function linkLabels(root) {
    if (!root) return;
    root.querySelectorAll('label:not([for])').forEach(function (label) {
      if (label.querySelector('input, select, textarea')) return;   // wraps its control
      var next = label.nextElementSibling;
      var control = next && (/^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName) ? next
        : next.querySelector && next.querySelector('input, select, textarea'));
      if (!control) return;
      if (!control.id) control.id = 'f' + (++labelSeq);
      label.setAttribute('for', control.id);
    });
  }

  /* ------------------------------------------------------------- feedback */

  function toast(msg, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var t = h('div.toast' + (kind ? '.is-' + kind : ''), { text: msg });
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(-10px)';
      setTimeout(function () { t.remove(); }, 260);
    }, kind === 'bad' ? 5200 : 2800);
  }

  /* Open modals, oldest first. Escape closes only the one on top. */
  var stack = [];

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !stack.length) return;
    e.preventDefault();
    stack[stack.length - 1].close();
  });

  /* modal({title, body, actions:[{label, kind, onClick}], onClose}) -> close fn
   *
   * An action closes the modal unless its onClick returns false. onClose runs
   * once, however the modal went away. */
  function modal(opts) {
    var backdrop = h('.modal-backdrop');
    var box = h('.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog', tabindex: '-1' });
    var returnTo = document.activeElement;
    var closed = false;
    var entry = { close: close };

    function close() {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(entry), 1);
      backdrop.remove();
      if (!stack.length) document.body.classList.remove('has-modal');
      if (returnTo && document.contains(returnTo) && returnTo.focus) {
        try { returnTo.focus({ preventScroll: true }); } catch (e) {}
      }
      if (opts.onClose) opts.onClose();
    }

    box.appendChild(h('.modal-head', [
      h('h3', { text: opts.title || '' }),
      h('.spacer'),
      button('.btn-ghost.btn-sm', 'x', null, { title: 'Close', onclick: close })
    ]));
    var body = h('.modal-body');
    append(body, opts.body);
    box.appendChild(body);

    if (opts.actions && opts.actions.length) {
      box.appendChild(h('.modal-foot', opts.actions.map(function (a) {
        return h('button.btn' + (a.kind ? '.btn-' + a.kind : ''), {
          type: 'button', text: a.label,
          onclick: function () { if (!a.onClick || a.onClick() !== false) close(); }
        });
      })));
    }
    backdrop.appendChild(box);
    // Only a press that both starts and ends on the backdrop dismisses. A drag
    // that begins inside a text field and is released outside is not a click
    // on the backdrop, and must not throw away what was being typed.
    var downOnBackdrop = false;
    backdrop.addEventListener('mousedown', function (e) { downOnBackdrop = e.target === backdrop; });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop && downOnBackdrop) close();
    });

    // Keep Tab inside the dialog while it is open.
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var items = box.querySelectorAll('button:not([disabled]), input:not([type=hidden]):not([hidden]), select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    stack.push(entry);
    document.body.classList.add('has-modal');
    document.body.appendChild(backdrop);
    linkLabels(box);

    // Start in the first field when there is one; otherwise on the dialog
    // itself, so a stray Enter cannot confirm something destructive.
    // On a touch screen that would throw the keyboard up over the content the
    // moment anything opens, so there the dialog takes focus instead.
    var touch = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    var firstField = touch ? null
      : body.querySelector('input:not([type=file]):not([type=hidden]):not([hidden]), select, textarea');
    try { (firstField || box).focus({ preventScroll: true }); } catch (e) {}
    return close;
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      var answer = false;
      modal({
        title: opts.title,
        body: h('p', { text: opts.message }),
        actions: [
          { label: opts.cancelLabel || 'Cancel' },
          { label: opts.confirmLabel || 'Confirm', kind: opts.danger ? 'danger' : 'primary',
            onClick: function () { answer = true; } }
        ],
        // Closing by backdrop, Escape or the close button counts as "no".
        onClose: function () { resolve(answer); }
      });
    });
  }

  function closeModals() {
    stack.slice().reverse().forEach(function (m) { m.close(); });
  }

  /* ---------------------------------------------------------------- dates */

  function todayKey(d) {
    d = d || new Date();
    return [d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0')].join('-');
  }

  function parseKey(k) {
    var p = String(k).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  /* A date the app can file something under: well-formed, real, and not in the
   * future. A cleared date input hands back '', which would otherwise become a
   * record nothing can sort or display. */
  function validPastKey(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k || ''))) return false;
    var d = parseKey(k);
    return !isNaN(d.getTime()) && todayKey(d) === k && k <= todayKey();
  }

  function addDays(key, n) {
    var d = parseKey(key); d.setDate(d.getDate() + n); return todayKey(d);
  }

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function prettyDate(key) {
    var d = parseKey(key);
    return DAY_NAMES[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function shortDate(key) {
    var d = parseKey(key);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  /* ISO week key, so weekly aggregates line up across a year boundary. */
  function weekKey(key) {
    var d = parseKey(key);
    var day = (d.getDay() + 6) % 7;          // Monday = 0
    d.setDate(d.getDate() - day + 3);        // nearest Thursday
    var firstThu = new Date(d.getFullYear(), 0, 4);
    var week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
    return d.getFullYear() + '-W' + String(week).padStart(2, '0');
  }

  function daysBetween(a, b) {
    return Math.round((parseKey(b) - parseKey(a)) / 86400000);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.UI = {
    h: h, clear: clear, append: append,
    icon: icon, button: button, linkLabels: linkLabels,
    toast: toast, modal: modal, confirm: confirm, closeModals: closeModals,
    todayKey: todayKey, parseKey: parseKey, validPastKey: validPastKey, addDays: addDays,
    prettyDate: prettyDate, shortDate: shortDate, weekKey: weekKey,
    daysBetween: daysBetween, DAY_NAMES: DAY_NAMES, MONTHS: MONTHS, esc: esc
  };

}(window));
