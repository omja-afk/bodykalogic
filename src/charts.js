/* charts.js — hand-rolled SVG charts. No library, no network, no build step.
 *
 * Every chart returns an <svg> element sized by viewBox, so it scales with its
 * container. Colours come from CSS custom properties (--series-1..8, --grid,
 * --axis, --ink-*) so the whole dashboard re-themes in one place.
 *
 * House rules, applied consistently:
 *   - 2px strokes on lines, >= 8px hit targets on points
 *   - a 2px surface-coloured gap between adjacent fills, so bars and stacked
 *     segments separate without a border colour
 *   - 4px rounded data-ends on bars, anchored flat to the baseline
 *   - grid and axes recessive; labels in ink tokens, never in the series colour
 *   - a legend whenever there are two or more series
 *   - hover: a crosshair and tooltip on time series, per-mark tooltip on bars
 *   - one y-scale per chart, always
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(n);
    return n;
  }

  function svgRoot(w, h, cls) {
    var s = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      class: 'chart ' + (cls || ''),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img'
    });
    return s;
  }

  function series(i) { return 'var(--series-' + (((i % 8) + 8) % 8 + 1) + ')'; }

  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    var step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = (span / count) / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    for (var v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  function fmt(n, dp) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (dp === undefined) dp = (Math.abs(n) < 10 && n % 1 !== 0) ? 1 : 0;
    return Number(n).toFixed(dp).replace(/\.0+$/, '');
  }

  /* --------------------------------------------------------------- tooltips */

  function makeTip(host) {
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.appendChild(tip);
    return {
      show: function (html, x, y) {
        tip.innerHTML = html;
        tip.hidden = false;
        var hb = host.getBoundingClientRect();
        var tb = tip.getBoundingClientRect();
        var left = Math.min(Math.max(4, x - tb.width / 2), hb.width - tb.width - 4);
        var top = y - tb.height - 12;
        if (top < 2) top = y + 16;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  /* Map a pointer event to chart-space x, accounting for the viewBox scale. */
  function localX(svg, ev) {
    var r = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    return (ev.clientX - r.left) * (vb.width / r.width);
  }

  /* ------------------------------------------------------------- line chart */

  /* opts: { series:[{name, points:[{x(label), y}], }], yLabel, dp, area, target } */
  function lineChart(host, opts) {
    host.innerHTML = '';
    host.classList.add('chart-host');
    var sets = (opts.series || []).filter(function (s) { return s.points && s.points.length; });
    if (!sets.length) { host.appendChild(emptyNote(opts.empty)); return; }

    var W = 760, H = opts.height || 280;
    var padL = 52, padR = 16, padT = 16, padB = 34;
    var innerW = W - padL - padR, innerH = H - padT - padB;

    var n = Math.max.apply(null, sets.map(function (s) { return s.points.length; }));
    var all = [];
    sets.forEach(function (s) { s.points.forEach(function (p) { if (p.y != null) all.push(p.y); }); });
    if (opts.target != null) all.push(opts.target);
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    var ticks = niceTicks(min, max, 4);
    var yMin = ticks[0], yMax = ticks[ticks.length - 1];

    var svg = svgRoot(W, H, 'chart-line');
    var X = function (i) { return padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW); };
    var Y = function (v) { return padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH; };

    // grid + y labels
    ticks.forEach(function (t) {
      el('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), class: 'grid' }, svg);
      el('text', { x: padL - 10, y: Y(t) + 4, class: 'tick tick-y' }, svg).textContent = fmt(t, opts.dp);
    });
    el('line', { x1: padL, x2: W - padR, y1: padT + innerH, y2: padT + innerH, class: 'axis' }, svg);

    // target band
    if (opts.target != null) {
      el('line', { x1: padL, x2: W - padR, y1: Y(opts.target), y2: Y(opts.target), class: 'target-line' }, svg);
      el('text', { x: W - padR, y: Y(opts.target) - 6, class: 'tick target-label', 'text-anchor': 'end' }, svg)
        .textContent = (opts.targetLabel || 'target') + ' ' + fmt(opts.target, opts.dp);
    }

    // x labels — thinned so they never collide. The last point always gets
    // one, so a regular label that would land right beside it gives way.
    var labels = sets[0].points.map(function (p) { return p.x; });
    var every = Math.ceil(n / 8);
    labels.forEach(function (lb, i) {
      var isLast = i === n - 1;
      if (!isLast && (i % every !== 0 || (n - 1 - i) < every * 0.6)) return;
      el('text', { x: X(i), y: H - 10, class: 'tick tick-x',
                   'text-anchor': isLast && n > 1 ? 'end' : (i === 0 && n > 1 ? 'start' : 'middle') }, svg).textContent = lb;
    });

    sets.forEach(function (s, si) {
      var pts = s.points.filter(function (p) { return p.y != null; });
      if (!pts.length) return;
      var d = s.points.map(function (p, i) {
        return p.y == null ? null : (i === 0 ? 'M' : 'L') + X(i) + ' ' + Y(p.y);
      }).filter(Boolean).join(' ').replace(/^L/, 'M');

      if (opts.area && sets.length === 1) {
        var first = s.points.findIndex(function (p) { return p.y != null; });
        var last = s.points.length - 1 - s.points.slice().reverse().findIndex(function (p) { return p.y != null; });
        el('path', {
          d: d + ' L' + X(last) + ' ' + (padT + innerH) + ' L' + X(first) + ' ' + (padT + innerH) + ' Z',
          class: 'area', fill: series(si)
        }, svg);
      }
      el('path', { d: d, class: 'line', stroke: series(si) }, svg);
      s.points.forEach(function (p, i) {
        if (p.y == null) return;
        // 2px surface ring keeps overlapping markers readable
        el('circle', { cx: X(i), cy: Y(p.y), r: 4, class: 'dot', fill: series(si) }, svg);
      });
    });

    // crosshair + hover band
    var cross = el('line', { y1: padT, y2: padT + innerH, class: 'crosshair', opacity: 0 }, svg);
    host.appendChild(svg);
    var tip = makeTip(host);

    svg.addEventListener('pointermove', function (ev) {
      var x = localX(svg, ev);
      var i = n === 1 ? 0 : Math.round(((x - padL) / innerW) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
      var rows = sets.map(function (s, si) {
        var p = s.points[i];
        if (!p || p.y == null) return '';
        return '<div class="tip-row"><span class="swatch" style="background:' + series(si) + '"></span>' +
               '<span class="tip-name">' + esc(s.name) + '</span>' +
               '<b>' + fmt(p.y, opts.dp) + (opts.unit || '') + '</b></div>';
      }).join('');
      var r = svg.getBoundingClientRect();
      tip.show('<div class="tip-head">' + esc(sets[0].points[i].x) + '</div>' + rows,
               X(i) * (r.width / W), padT * (r.height / H) + 8);
    });
    svg.addEventListener('pointerleave', function () {
      cross.setAttribute('opacity', 0); tip.hide();
    });

    if (sets.length > 1) host.appendChild(legend(sets.map(function (s, i) {
      return { name: s.name, color: series(i) };
    })));
    return svg;
  }

  /* -------------------------------------------------------------- bar chart */

  /* opts: { bars:[{label, value, series?}], unit, dp, target, horizontal } */
  function barChart(host, opts) {
    host.innerHTML = '';
    host.classList.add('chart-host');
    var bars = opts.bars || [];
    if (!bars.length) { host.appendChild(emptyNote(opts.empty)); return; }

    var W = 760, H = opts.height || 260;
    var padL = 52, padR = 16, padT = 16, padB = 36;
    var innerW = W - padL - padR, innerH = H - padT - padB;

    var vals = bars.map(function (b) { return b.value || 0; });
    if (opts.target != null) vals.push(opts.target);
    var ticks = niceTicks(Math.min(0, Math.min.apply(null, vals)), Math.max.apply(null, vals), 4);
    var yMin = Math.min(0, ticks[0]), yMax = ticks[ticks.length - 1];

    var svg = svgRoot(W, H, 'chart-bar');
    var Y = function (v) { return padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH; };
    var slot = innerW / bars.length;
    var GAP = 2;                       // surface gap between adjacent bars
    var bw = Math.max(6, Math.min(44, slot - 10 - GAP));

    ticks.forEach(function (t) {
      el('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), class: 'grid' }, svg);
      el('text', { x: padL - 10, y: Y(t) + 4, class: 'tick tick-y' }, svg).textContent = fmt(t, opts.dp);
    });
    el('line', { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), class: 'axis' }, svg);

    if (opts.target != null) {
      el('line', { x1: padL, x2: W - padR, y1: Y(opts.target), y2: Y(opts.target), class: 'target-line' }, svg);
      el('text', { x: W - padR, y: Y(opts.target) - 6, class: 'tick target-label', 'text-anchor': 'end' }, svg)
        .textContent = (opts.targetLabel || 'target') + ' ' + fmt(opts.target, opts.dp);
    }

    var tip = makeTip(host);
    bars.forEach(function (b, i) {
      var cx = padL + slot * i + slot / 2;
      var v = b.value || 0;
      var y = Math.min(Y(v), Y(0)), h = Math.max(1, Math.abs(Y(v) - Y(0)));
      var color = b.color || series(b.series != null ? b.series : 0);
      var rect = el('rect', {
        x: cx - bw / 2, y: y, width: bw, height: h,
        rx: Math.min(4, bw / 2), class: 'bar', fill: color
      }, svg);
      // flatten the bottom corners so the bar sits flat on the baseline
      if (h > 4) el('rect', { x: cx - bw / 2, y: y + h - 4, width: bw, height: 4, fill: color, class: 'bar-foot' }, svg);

      var hit = el('rect', { x: cx - slot / 2, y: padT, width: slot, height: innerH, class: 'hit' }, svg);
      hit.addEventListener('pointerenter', function () {
        rect.classList.add('is-hover');
        var r = svg.getBoundingClientRect();
        tip.show('<div class="tip-head">' + esc(b.label) + '</div><div class="tip-row"><span class="swatch" style="background:' +
                 color + '"></span><b>' + fmt(v, opts.dp) + (opts.unit || '') + '</b></div>',
                 cx * (r.width / W), y * (r.height / H));
      });
      hit.addEventListener('pointerleave', function () { rect.classList.remove('is-hover'); tip.hide(); });

      if (i % Math.ceil(bars.length / 12) === 0 || bars.length <= 12) {
        el('text', { x: cx, y: H - 12, class: 'tick tick-x', 'text-anchor': 'middle' }, svg).textContent = b.label;
      }
    });

    host.appendChild(svg);
    return svg;
  }

  /* ------------------------------------------------------ stacked macro bar */

  /* segments: [{name, value, color}] — one row, used for macro splits. */
  function stackBar(host, segments, opts) {
    host.innerHTML = '';
    host.classList.add('chart-host');
    opts = opts || {};
    var total = segments.reduce(function (a, s) { return a + (s.value || 0); }, 0);
    if (!total) { host.appendChild(emptyNote(opts.empty)); return; }

    var W = 760, H = 46, GAP = 2;
    var svg = svgRoot(W, H, 'chart-stack');
    var x = 0;
    var tip = makeTip(host);
    segments.forEach(function (s, i) {
      var w = ((s.value || 0) / total) * W;
      var drawW = Math.max(0, w - (i < segments.length - 1 ? GAP : 0));
      if (drawW <= 0) { x += w; return; }
      var r = el('rect', {
        x: x, y: 8, width: drawW, height: 26, rx: 4,
        fill: s.color || series(i), class: 'seg'
      }, svg);
      r.addEventListener('pointerenter', function () {
        var b = svg.getBoundingClientRect();
        tip.show('<div class="tip-row"><span class="swatch" style="background:' + (s.color || series(i)) +
                 '"></span><span class="tip-name">' + esc(s.name) + '</span><b>' + fmt(s.value, 0) +
                 (opts.unit || '') + ' · ' + Math.round((s.value / total) * 100) + '%</b></div>',
                 (x + drawW / 2) * (b.width / W), 8 * (b.height / H));
      });
      r.addEventListener('pointerleave', tip.hide);
      x += w;
    });
    host.appendChild(svg);
    host.appendChild(legend(segments.map(function (s, i) {
      return { name: s.name, color: s.color || series(i), value: fmt(s.value, 0) + (opts.unit || '') };
    })));
  }

  /* --------------------------------------------------------- progress rings */

  function ring(host, opts) {
    host.innerHTML = '';
    var size = opts.size || 120, sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r;
    var pct = Math.max(0, Math.min(1.2, (opts.value || 0) / (opts.max || 1)));
    var svg = svgRoot(size, size, 'chart-ring');
    // A ring has a fixed size; without these it inherits .chart's width:100%
    // and inflates to the column width.
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    var g = el('g', { transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' }, svg);
    el('circle', { cx: size / 2, cy: size / 2, r: r, class: 'ring-track', 'stroke-width': sw }, g);
    el('circle', {
      cx: size / 2, cy: size / 2, r: r, class: 'ring-value', 'stroke-width': sw,
      stroke: opts.color || series(0), 'stroke-linecap': 'round',
      'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - Math.min(1, pct))
    }, g);
    el('text', { x: size / 2, y: size / 2 + 2, class: 'ring-num', 'text-anchor': 'middle' }, svg)
      .textContent = fmt(opts.value, opts.dp) + (opts.unit || '');
    el('text', { x: size / 2, y: size / 2 + 20, class: 'ring-sub', 'text-anchor': 'middle' }, svg)
      .textContent = 'of ' + fmt(opts.max, opts.dp) + (opts.unit || '');
    host.appendChild(svg);
    if (opts.label) {
      var cap = document.createElement('div');
      cap.className = 'ring-label';
      cap.textContent = opts.label;
      host.appendChild(cap);
    }
  }

  /* --------------------------------------------------------------- gauge */

  /* A banded scale with a marker — for BMI, where the number means nothing
   * without the bands around it. Ordered bands, so this is an ordinal ramp
   * rather than a categorical palette: status colours, not series colours. */
  function gauge(host, opts) {
    host.innerHTML = '';
    host.classList.add('chart-host');
    var bands = opts.bands || [];
    if (!bands.length) return;

    var W = 760, H = 86, GAP = 2;
    var min = opts.min, max = opts.max;
    var svg = svgRoot(W, H, 'chart-gauge');
    var X = function (v) { return ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * W; };

    var from = min;
    bands.forEach(function (b, i) {
      var x0 = X(from), x1 = X(b.to);
      var w = Math.max(0, x1 - x0 - (i < bands.length - 1 ? GAP : 0));
      el('rect', { x: x0, y: 30, width: w, height: 18, rx: 4, fill: b.color, 'fill-opacity': 0.9 }, svg);
      el('text', { x: x0 + w / 2, y: 64, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = b.label;
      el('text', { x: x1, y: 78, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = fmt(b.to, 1);
      from = b.to;
    });

    if (opts.value != null) {
      var x = X(opts.value);
      // marker: a pin with a surface-coloured ring so it reads on any band
      el('line', { x1: x, x2: x, y1: 24, y2: 54, class: 'gauge-pin' }, svg);
      el('circle', { cx: x, cy: 24, r: 6, class: 'gauge-dot' }, svg);
      var label = el('text', { x: x, y: 14, class: 'gauge-label', 'text-anchor': 'middle' }, svg);
      label.textContent = fmt(opts.value, 1);
      // keep the label inside the viewBox at the extremes
      if (x < 24) label.setAttribute('text-anchor', 'start');
      if (x > W - 24) label.setAttribute('text-anchor', 'end');
    }
    host.appendChild(svg);
  }

  /* ------------------------------------------------------- consistency grid */

  /* cells: [{date, value}] — a sequential one-hue ramp, light = near zero. */
  function heatmap(host, cells, opts) {
    host.innerHTML = '';
    host.classList.add('chart-host');
    opts = opts || {};
    if (!cells.length) { host.appendChild(emptyNote(opts.empty)); return; }

    var cols = Math.ceil(cells.length / 7), cell = 15, gap = 3;
    var W = cols * (cell + gap) + 30, H = 7 * (cell + gap) + 22;
    var svg = svgRoot(W, H, 'chart-heat');
    var max = Math.max.apply(null, cells.map(function (c) { return c.value || 0; })) || 1;
    var tip = makeTip(host);

    // The grid starts on a Monday, so rows 0, 2 and 4 are Monday, Wednesday
    // and Friday.
    ['M', 'W', 'F'].forEach(function (d, i) {
      el('text', { x: 14, y: 6 + (i * 2) * (cell + gap) + 12, class: 'tick tick-y' }, svg).textContent = d;
    });

    cells.forEach(function (c, i) {
      var col = Math.floor(i / 7), row = i % 7;
      var t = (c.value || 0) / max;
      var rect = el('rect', {
        x: 22 + col * (cell + gap), y: 6 + row * (cell + gap),
        width: cell, height: cell, rx: 3,
        class: 'heat-cell' + (c.value ? '' : ' is-empty'),
        'fill-opacity': c.value ? (0.22 + t * 0.78) : 1
      }, svg);
      if (c.value) rect.setAttribute('fill', 'var(--series-1)');
      rect.addEventListener('pointerenter', function () {
        var b = svg.getBoundingClientRect();
        tip.show('<div class="tip-head">' + esc(c.date) + '</div><div class="tip-row"><b>' +
                 (c.value ? fmt(c.value, 0) + (opts.unit || '') : 'rest day') + '</b></div>',
                 (22 + col * (cell + gap) + cell / 2) * (b.width / W),
                 (6 + row * (cell + gap)) * (b.height / H));
      });
      rect.addEventListener('pointerleave', tip.hide);
    });
    host.appendChild(svg);
  }

  /* ------------------------------------------------------------------ bits */

  function legend(items) {
    var w = document.createElement('div');
    w.className = 'chart-legend';
    items.forEach(function (it) {
      var s = document.createElement('span');
      s.className = 'legend-item';
      s.innerHTML = '<span class="swatch" style="background:' + it.color + '"></span>' +
                    '<span>' + esc(it.name) + '</span>' +
                    (it.value ? '<b>' + esc(it.value) + '</b>' : '');
      w.appendChild(s);
    });
    return w;
  }

  function emptyNote(msg) {
    var d = document.createElement('div');
    d.className = 'chart-empty';
    d.textContent = msg || 'Nothing logged yet — this fills in as you go.';
    return d;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.Charts = {
    line: lineChart,
    bar: barChart,
    stack: stackBar,
    ring: ring,
    heatmap: heatmap,
    gauge: gauge,
    fmt: fmt
  };

}(window));
