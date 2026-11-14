/* views3.js — nutrition log and strength maxes. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var DG = global.DietGen, EXD = global.ExerciseData, FD = global.FoodData;
  var PHOTO_EDGE = 640;   // long edge of a stored meal photo, in pixels
  var MP = global.MealPhoto;
  var Views = global.Views, VI = global.ViewsInternal;
  var redraw = function () { global.App.render(); };

  /* ============================ NUTRITION LOG =========================== */

  Views.nutrition = function (root) {
    UI.clear(root);
    var st = S.get();
    if (!Views.profileReady(st.profile)) {
      root.appendChild(VI.emptyState('Set up your profile first',
        'Your calorie and protein targets are worked out from your age, height and weight. Add them on Home and this page fills in.',
        'Go to Home', function () { global.App.go('home'); }));
      return;
    }

    var today = UI.todayKey();
    var dateKey = global.App.foodDate || today;
    if (dateKey > today) dateKey = today;
    var weekday = UI.DAY_NAMES[UI.parseKey(dateKey).getDay()];
    // Not stored until a meal goes into it; keep() stores it, or drops it again
    // once the last meal is removed.
    var day = S.nutritionFor(dateKey);
    function keep() { S.keepNutrition(day); S.save(); }
    function go(key) { global.App.foodDate = key === today ? null : key; redraw(); }
    var t = S.targets();
    var totals = S.nutritionTotals(dateKey);

    var ringRow = h('.ring-row');
    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: UI.prettyDate(dateKey) }),
        dateKey === today ? h('span.chip.chip-accent', { text: 'Today' }) : null,
        h('.spacer'),
        h('button.btn.btn-sm', { type: 'button', text: '‹ Previous', onclick: function () { go(UI.addDays(dateKey, -1)); } }),
        dateKey < today ? h('button.btn.btn-sm', { type: 'button', text: 'Next ›', onclick: function () { go(UI.addDays(dateKey, 1)); } }) : null,
        dateKey < today ? h('button.btn.btn-sm', { type: 'button', text: 'Today', onclick: function () { go(today); } }) : null,
        UI.button('.btn-sm.btn-primary', 'plus', 'Log a meal', { onclick: function () { openMealLogger(dateKey); } })
      ]),
      ringRow
    ]));
    [['Calories', totals.kcal, t.kcal, '', 'var(--series-1)'],
     ['Protein', totals.p, t.protein, 'g', 'var(--series-3)'],
     ['Carbs', totals.c, t.carbs, 'g', 'var(--series-4)'],
     ['Fat', totals.f, t.fat, 'g', 'var(--series-5)']].forEach(function (r) {
      var cell = h('.ring-cell');
      ringRow.appendChild(cell);
      setTimeout(function () {
        C.ring(cell, { value: r[1], max: r[2], unit: r[3], label: r[0], color: r[4], size: 110, dp: 0 });
      }, 0);
    });

    function fromPlan(m) {
      return { title: m.title, slot: m.slot, items: JSON.parse(JSON.stringify(m.items)),
               macros: Object.assign({}, m.macros), source: 'plan', photo: null, time: Date.now() };
    }

    /* add the day's planned meals in one tap */
    var planned = st.diet ? S.dietDayFor(dateKey) : null;
    if (planned && planned.meals.length) {
      var isLogged = function (m) { return day.meals.some(function (lm) { return lm.title === m.title; }); };
      var remaining = planned.meals.filter(function (m) { return !isLogged(m); });
      var card = h('.card', [h('.card-head', [
        h('h3', { text: 'Planned for ' + weekday }),
        h('.spacer'),
        remaining.length ? h('button.btn.btn-sm', { type: 'button',
          text: remaining.length === planned.meals.length ? 'Add all planned meals' : 'Add the rest',
          onclick: function () {
            remaining.forEach(function (m) { day.meals.push(fromPlan(m)); });
            keep(); redraw(); UI.toast('Added the planned meals.', 'good');
          } }) : null
      ])]);
      planned.meals.forEach(function (m) {
        card.appendChild(h('.meal-row', [
          h('.meal-main', [
            h('.meal-name', { text: (FD.SLOT_LABEL[m.slot] || 'Meal') + ' — ' + m.title }),
            h('.meal-meta', { text: m.macros.kcal + ' kcal · P ' + C.fmt(m.macros.p, 0) + 'g' })
          ]),
          isLogged(m) ? h('span.chip.chip-good', { text: 'Logged' })
                      : UI.button('.btn-sm', 'plus', 'Eaten', { onclick: function () {
                          day.meals.push(fromPlan(m)); keep(); redraw();
                        } })
        ]));
      });
      root.appendChild(card);
    }

    /* what was actually eaten */
    var logCard = h('.card', [h('.card-head', [
      h('h3', { text: dateKey === today ? 'Eaten today' : 'Eaten on ' + UI.prettyDate(dateKey) }), h('.spacer'),
      h('span.card-sub', { text: day.meals.length + (day.meals.length === 1 ? ' entry' : ' entries') })
    ])]);
    if (!day.meals.length) {
      logCard.appendChild(h('.chart-empty', { text: 'Nothing logged yet. Use “Log a meal” — tap portions, type the plate, or add a photo.' }));
    }
    day.meals.forEach(function (meal, mi) {
      logCard.appendChild(h('.meal-row', [
        meal.photo ? h('img.meal-thumb', { src: meal.photo, alt: 'Photo of ' + meal.title, loading: 'lazy' }) : null,
        h('.meal-main', [
          h('.meal-name', { text: meal.title }),
          h('.meal-meta', { text: Views.describeItems(meal.items) || '—' })
        ]),
        VI.macroPills(meal.macros),
        UI.button('.btn-sm.btn-ghost', 'edit', null, { title: 'Edit ' + meal.title,
          onclick: function () { openMealLogger(dateKey, mi); } }),
        UI.button('.btn-sm.btn-ghost.btn-danger', 'x', null, { title: 'Remove ' + meal.title,
          onclick: function () { day.meals.splice(mi, 1); keep(); redraw(); } })
      ]));
    });
    root.appendChild(logCard);

    /* macro split */
    root.appendChild(VI.chartCard('Macro split', 'share of calories', function (host) {
      C.stack(host, [
        { name: 'Protein', value: totals.p * 4, color: 'var(--series-3)' },
        { name: 'Carbs', value: totals.c * 4, color: 'var(--series-4)' },
        { name: 'Fat', value: totals.f * 9, color: 'var(--series-5)' }
      ], { unit: ' kcal', empty: 'Log a meal to see the split.' });
    }));
  };

  /* The meal entry sheet: a photo, household portions, or typed text —
   * all three feed the same editable item list, which is what gets saved. */
  function openMealLogger(dateKey, editIndex) {
    var day = S.nutritionFor(dateKey);
    var existing = editIndex != null ? day.meals[editIndex] : null;

    var items = existing ? JSON.parse(JSON.stringify(existing.items)) : [];
    var photo = existing ? existing.photo : null;
    var title = h('input', { value: existing ? existing.title : '', placeholder: 'e.g. Lunch at home' });
    var slot = h('select', FD.SLOTS.map(function (s) {
      return h('option', { value: s, selected: existing && existing.slot === s, text: FD.SLOT_LABEL[s] });
    }));
    var photoHost = h('div');
    var itemsHost = h('div');
    var totalHost = h('div');
    var quickHost = h('.check-grid');
    var typed = h('input', { placeholder: 'e.g. 2 roti, 1 katori dal, 150g chicken' });
    // No `capture`: with it a phone goes straight to the camera and a photo
    // already taken cannot be chosen.
    var photoInput = h('input', { type: 'file', accept: 'image/*', hidden: true });

    function renderPhoto() {
      UI.clear(photoHost);
      if (!photo) return;
      photoHost.appendChild(h('img.photo-preview', { src: photo, alt: 'The meal you photographed' }));
      photoHost.appendChild(h('button.btn.btn-sm.btn-ghost.btn-danger', {
        type: 'button', text: 'Remove photo', onclick: function () { photo = null; renderPhoto(); }
      }));
    }

    function renderItems() {
      UI.clear(itemsHost);
      if (!items.length) {
        itemsHost.appendChild(h('.chart-empty', { text: 'Nothing on the plate yet — tap a portion below or type it.' }));
      }
      items.forEach(function (item, i) {
        var f = FD.food(item.food);
        if (!f) return;
        itemsHost.appendChild(h('.item-line', [
          h('span.item-name', { text: f.name }),
          h('input', { type: 'number', inputmode: 'decimal', value: item.qty, min: 0, step: f.unit === 'piece' ? 1 : 5,
            'aria-label': f.name + ' quantity',
            onchange: function (e) { item.qty = Math.max(0, Number(e.target.value) || 0); renderTotal(); } }),
          h('span.item-unit', { text: f.unit === 'piece' ? '×' : f.unit }),
          UI.button('.btn-sm.btn-ghost.btn-danger', 'x', null, { title: 'Remove ' + f.name, onclick: function () {
            items.splice(i, 1); renderItems();
          } })
        ]));
      });
      renderTotal();
    }

    function renderTotal() {
      UI.clear(totalHost);
      var m = MP.macrosFor(items);
      var t = S.targets();
      totalHost.appendChild(h('.banner', [
        h('div', [
          h('div', { html: '<b>' + m.kcal + ' kcal</b> · protein <b>' + C.fmt(m.p, 0) + ' g</b> · carbs ' +
                           C.fmt(m.c, 0) + ' g · fat ' + C.fmt(m.f, 0) + ' g' }),
          h('.hint', { text: 'That is ' + (t.protein ? Math.round(m.p / t.protein * 100) : 0) + '% of your daily protein target.' })
        ])
      ]));
    }

    function addItem(foodId, qty) {
      var found = items.filter(function (i) { return i.food === foodId; })[0];
      if (found) found.qty = DG.roundQty(foodId, found.qty + qty);
      else items.push({ food: foodId, qty: qty });
      renderItems();
    }

    MP.QUICK.forEach(function (q) {
      quickHost.appendChild(h('button.check-pill', {
        type: 'button',
        onclick: function () { addItem(q.food, q.step); },
        title: 'Adds one ' + q.unitLabel
      }, [h('span', { text: '+ ' + q.label }), h('small', { text: q.unitLabel })]));
    });

    photoInput.addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      e.target.value = '';
      MP.readPhoto(f, PHOTO_EDGE).then(function (p) {
        photo = p.dataUrl; renderPhoto();
      }).catch(function (err) { UI.toast(err.message, 'bad'); });
    });

    function applyTyped() {
      var r = MP.parsePortions(typed.value);
      r.items.forEach(function (it) { addItem(it.food, it.qty); });
      if (r.unmatched.length) {
        UI.toast('Not recognised: ' + r.unmatched.join(', ') + '. Add it from the portions below.', 'bad');
      }
      // Leave behind only what could not be read, so it can be corrected
      // rather than typed again.
      typed.value = r.unmatched.join(', ');
    }
    typed.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyTyped(); } });

    UI.modal({
      title: existing ? 'Edit meal' : 'Log a meal',
      body: [
        h('.field-row', [
          h('div', [h('label', { text: 'Name' }), title]),
          h('div', [h('label', { text: 'Which meal' }), slot])
        ]),

        h('.field', [
          h('.field-title', { text: 'Photo of the meal (optional)' }),
          h('.card-head', { style: { marginBottom: '8px' } }, [
            UI.button('.btn-sm', 'camera', photo ? 'Change photo' : 'Add a photo', { onclick: function () { photoInput.click(); } }),
            photoInput
          ]),
          photoHost,
          h('.hint', { text: 'The photo is kept with the entry as a record of the meal. Calories and macros come from the portions below, so set those to match what is on the plate.' })
        ]),

        h('.field', [
          h('label', { text: 'Type the plate' }),
          h('.card-head', { style: { marginBottom: 0, gap: '8px' } }, [
            typed,
            h('button.btn.btn-sm', { type: 'button', text: 'Add', onclick: applyTyped })
          ]),
          h('.hint', { text: 'Understands rotis, katoris, glasses, pieces and grams — "2 roti, 1 katori dal, 150g chicken".' })
        ]),

        h('.field', [h('.field-title', { text: 'On the plate' }), itemsHost]),
        totalHost,
        h('.field', [
          h('.field-title', { text: 'Common portions' }),
          quickHost
        ])
      ],
      actions: [
        { label: 'Cancel' },
        { label: existing ? 'Save changes' : 'Log it', kind: 'primary', onClick: function () {
          if (!items.length) { UI.toast('Add at least one thing to the plate.', 'bad'); return false; }
          var meal = {
            title: title.value.trim() || FD.SLOT_LABEL[slot.value],
            slot: slot.value, items: items, macros: MP.macrosFor(items),
            photo: photo, source: 'manual', time: existing ? existing.time : Date.now()
          };
          if (existing) day.meals[editIndex] = meal; else day.meals.push(meal);
          S.keepNutrition(day); S.save(); redraw();
          UI.toast(existing ? 'Meal updated.' : C.fmt(meal.macros.p, 0) + ' g of protein logged.', 'good');
        } }
      ]
    });
    renderPhoto(); renderItems();
  }

  /* =========================== STRENGTH MAXES =========================== */

  Views.maxes = function (root) {
    UI.clear(root);
    var st = S.get();
    var ids = Object.keys(st.maxes).filter(function (id) { return st.maxes[id].records.length; });
    function est(rec) { return Number(rec.e1rm) || S.e1rm(rec.weight, rec.reps) || 0; }

    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: 'Personal records' }),
        h('.spacer'),
        UI.button('.btn-sm.btn-primary', 'plus', 'Log a max', { onclick: function () { openMaxLogger(); } })
      ]),
      h('p', { text: 'Anything you log in a session that beats your stored best is added here automatically when you mark the session complete. You can also record a one-rep max or an AMRAP set directly.' })
    ]));

    if (!ids.length) {
      root.appendChild(VI.emptyState('No maxes recorded yet',
        'Log a heavy single, an AMRAP set, or just complete a session — new bests are picked up from your sets.',
        'Log a max', function () { openMaxLogger(); }));
      return;
    }

    /* best-per-exercise table */
    var rows = ids.map(function (id) {
      var m = st.maxes[id];
      var best = S.bestMax(id);
      var maxReps = m.records.reduce(function (a, r) { return Math.max(a, Number(r.reps) || 0); }, 0);
      var maxWeight = m.records.reduce(function (a, r) { return Math.max(a, Number(r.weight) || 0); }, 0);
      return { id: id, name: m.name, best: best, maxReps: maxReps, maxWeight: maxWeight, count: m.records.length };
    }).sort(function (a, b) { return est(b.best) - est(a.best); });

    var table = h('table.table', [h('thead', [h('tr', [
      h('th', { text: 'Exercise' }),
      h('th.num', { text: 'Max weight' }),
      h('th.num', { text: 'Max reps' }),
      h('th.num', { text: 'Best set' }),
      h('th.num', { text: 'Est. 1RM' }),
      h('th', { text: 'Set on' }), h('th', [h('span.sr-only', { text: 'History' })])
    ])])]);
    var tbody = h('tbody');
    rows.forEach(function (r) {
      tbody.appendChild(h('tr', [
        h('td', { text: r.name }),
        h('td.num', { text: r.maxWeight ? r.maxWeight + ' kg' : '—' }),
        h('td.num', { text: r.maxReps || '—' }),
        h('td.num', { text: r.best.weight + ' kg × ' + r.best.reps }),
        h('td.num', [h('b', { text: C.fmt(est(r.best), 1) + ' kg' })]),
        h('td', { text: UI.shortDate(r.best.date) }),
        h('td', [UI.button('.btn-sm', 'clock', 'History', { onclick: function () { openMaxHistory(r.id); } })])
      ]));
    });
    table.appendChild(tbody);
    root.appendChild(h('.card', [h('.table-wrap', [table])]));

    /* strength curves for the four most-tracked lifts */
    var top = rows.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 4);
    if (top.length) {
      root.appendChild(VI.chartCard('Estimated 1RM over time', 'your four most-tracked lifts', function (host) {
        var allDates = [];
        top.forEach(function (r) {
          st.maxes[r.id].records.forEach(function (rec) {
            if (allDates.indexOf(rec.date) === -1) allDates.push(rec.date);
          });
        });
        allDates.sort();
        C.line(host, {
          height: 300,
          unit: ' kg', dp: 1,
          series: top.map(function (r) {
            var byDate = {};
            st.maxes[r.id].records.forEach(function (rec) {
              var v = est(rec);
              if (!byDate[rec.date] || v > byDate[rec.date]) byDate[rec.date] = v;
            });
            var running = null;
            return {
              name: r.name,
              points: allDates.map(function (d) {
                if (byDate[d] != null) running = byDate[d];
                return { x: UI.shortDate(d), y: running };
              })
            };
          })
        });
      }));
    }
  };

  function openMaxLogger() {
    var st = S.get();
    // Everything the current setup allows, plus whatever is in the plan — an
    // imported plan can hold movements the equipment filter would hide.
    var seen = {};
    var pool = EXD.pool(st.plan ? st.plan.equipment : st.profile.equipment, []).slice();
    pool.forEach(function (e) { seen[e.id] = 1; });
    (st.plan ? st.plan.days : []).forEach(function (d) {
      d.slots.forEach(function (slot) {
        var e = slot.exId && EXD.byId(slot.exId);
        if (e && !seen[e.id]) { seen[e.id] = 1; pool.push(e); }
      });
    });
    pool = pool.filter(function (e) { return e.pattern !== 'cardio'; })
               .sort(function (a, b) { return a.name.localeCompare(b.name); });

    var select = h('select', pool.map(function (e) { return h('option', { value: e.id, text: e.name }); }));
    var weight = h('input', { type: 'number', inputmode: 'decimal', step: 0.5, min: 0, placeholder: 'kg' });
    var reps = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 100, value: 1 });
    var date = h('input', { type: 'date', value: UI.todayKey(), max: UI.todayKey() });
    var note = h('input', { placeholder: 'belt, spotter, felt easy…' });
    var preview = h('.hint');

    function updatePreview() {
      var e = S.e1rm(weight.value, reps.value);
      preview.textContent = e ? 'Estimated one-rep max: ' + C.fmt(e, 1) + ' kg (Epley).' : '';
    }
    weight.addEventListener('input', updatePreview);
    reps.addEventListener('input', updatePreview);

    UI.modal({
      title: 'Log a max',
      body: [
        h('.field', [h('label', { text: 'Exercise' }), select]),
        h('.field-row', [
          h('div', [h('label', { text: 'Weight (kg)' }), weight]),
          h('div', [h('label', { text: 'Reps' }), reps]),
          h('div', [h('label', { text: 'Date' }), date])
        ]),
        preview,
        h('.field', [h('label', { text: 'Note (optional)' }), note]),
        h('.hint', { text: 'For a max-reps set, enter the weight and how many you got — the estimated one-rep max is worked out from both, so heavy singles and rep-outs sit on the same scale.' })
      ],
      actions: [
        { label: 'Cancel' },
        { label: 'Save', kind: 'primary', onClick: function () {
          var w = Number(weight.value), r = Math.round(Number(reps.value));
          if (!(w > 0) || !(r > 0)) { UI.toast('Enter both a weight and a rep count.', 'bad'); return false; }
          if (r > 100) { UI.toast('That is a lot of reps — enter 100 or fewer.', 'bad'); return false; }
          if (!UI.validPastKey(date.value)) { UI.toast('Choose a date that is today or earlier.', 'bad'); return false; }
          var ex = EXD.byId(select.value);
          if (!ex) return false;
          S.recordMax(ex.id, ex.name, { date: date.value, weight: w, reps: r,
                                        e1rm: S.e1rm(w, r), note: note.value.trim(), source: 'manual' });
          S.save(); redraw();
          UI.toast('Max logged for ' + ex.name + '.', 'good');
        } }
      ]
    });
    updatePreview();
  }

  function openMaxHistory(exId) {
    var m = S.get().maxes[exId];
    if (!m) return;
    var host = h('.table-wrap');
    var close;

    // Redrawn in place after a delete. The list used to stay as it was, so the
    // removed row was still on screen and the next ✕ took out the wrong record.
    function draw() {
      UI.clear(host);
      var table = h('table.table', [h('thead', [h('tr', [
        h('th', { text: 'Date' }), h('th.num', { text: 'Weight' }), h('th.num', { text: 'Reps' }),
        h('th.num', { text: 'Est. 1RM' }), h('th', { text: 'Source' }), h('th', [h('span.sr-only', { text: 'Remove' })])
      ])])]);
      var tbody = h('tbody');
      m.records.slice().reverse().forEach(function (r, i) {
        var realIndex = m.records.length - 1 - i;
        tbody.appendChild(h('tr', [
          h('td', { text: UI.shortDate(r.date) }),
          h('td.num', { text: r.weight + ' kg' }),
          h('td.num', { text: r.reps }),
          h('td.num', { text: C.fmt(Number(r.e1rm) || S.e1rm(r.weight, r.reps), 1) + ' kg' }),
          h('td', { text: r.source === 'session' ? 'From a session' : 'Entered' + (r.note ? ' — ' + r.note : '') }),
          h('td', [UI.button('.btn-sm.btn-ghost.btn-danger', 'x', null, { title: 'Remove this record', onclick: function () {
            S.removeMax(exId, realIndex); S.save(); redraw();
            if (S.get().maxes[exId]) draw(); else close();
          } })])
        ]));
      });
      table.appendChild(tbody);
      host.appendChild(table);
    }

    draw();
    close = UI.modal({ title: m.name + ' — history', body: host });
  }

  global.Views = Views;

}(window));
