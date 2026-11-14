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
    if (attrs && (typeof attrs !== 'object' || Array.isArray(attrs))) { children = attrs; attrs = null; }
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') node.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
      else node.setAttribute(k, v);
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

  function $(sel, root) { return (root || document).querySelector(sel); }

  /* ------------------------------------------------------------- feedback */

  function toast(msg, kind) {
    var host = $('#toasts');
    var t = h('div.toast' + (kind ? '.is-' + kind : ''), { text: msg });
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateX(14px)';
      setTimeout(function () { t.remove(); }, 260);
    }, kind === 'bad' ? 5200 : 2800);
  }

  /* modal({title, body, actions:[{label, kind, onClick}], wide}) -> close fn */
  function modal(opts) {
    var backdrop = h('.modal-backdrop');
    var box = h('.modal');
    var close = function () { backdrop.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    box.appendChild(h('.modal-head', [
      h('h3', { text: opts.title || '' }),
      h('.spacer'),
      h('button.btn.btn-ghost.btn-sm', { text: 'Close', onclick: close })
    ]));
    var body = h('.modal-body');
    append(body, opts.body);
    box.appendChild(body);

    if (opts.actions && opts.actions.length) {
      box.appendChild(h('.modal-foot', opts.actions.map(function (a) {
        return h('button.btn' + (a.kind ? '.btn-' + a.kind : ''), {
          text: a.label,
          onclick: function () { if (!a.onClick || a.onClick() !== false) close(); }
        });
      })));
    }
    backdrop.appendChild(box);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
    return close;
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      var answered = false;
      modal({
        title: opts.title,
        body: h('p', { text: opts.message }),
        actions: [
          { label: opts.cancelLabel || 'Cancel', onClick: function () { answered = true; resolve(false); } },
          { label: opts.confirmLabel || 'Confirm', kind: opts.danger ? 'danger' : 'primary',
            onClick: function () { answered = true; resolve(true); } }
        ]
      });
      // Closing by backdrop or Escape counts as "no".
      var obs = setInterval(function () {
        if (!document.querySelector('.modal-backdrop')) {
          clearInterval(obs);
          if (!answered) resolve(false);
        }
      }, 180);
    });
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
    h: h, clear: clear, $: $, append: append,
    toast: toast, modal: modal, confirm: confirm,
    todayKey: todayKey, parseKey: parseKey, addDays: addDays,
    prettyDate: prettyDate, shortDate: shortDate, weekKey: weekKey,
    daysBetween: daysBetween, DAY_NAMES: DAY_NAMES, MONTHS: MONTHS, esc: esc
  };

}(window));
