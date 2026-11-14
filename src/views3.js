/* views3.js — nutrition log, strength maxes, body, progress, profile. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var DG = global.DietGen, EXD = global.ExerciseData, FD = global.FoodData;
  var MP = global.MealPhoto;
  var Views = global.Views, VI = global.ViewsInternal;
  var redraw = function () { global.App.render(); };

  /* ============================ NUTRITION LOG =========================== */

  Views.nutrition = function (root) {
    UI.clear(root);
    var st = S.get();
    var dateKey = global.App.foodDate || UI.todayKey();
    var day = S.nutritionFor(dateKey, true);
    var t = S.targets();
    var totals = S.nutritionTotals(dateKey);

    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: UI.prettyDate(dateKey) }),
        h('.spacer'),
        h('button.btn.btn-sm', { text: '‹ Previous', onclick: function () {
          global.App.foodDate = UI.addDays(dateKey, -1); redraw();
        } }),
        h('button.btn.btn-sm', { text: 'Next ›', disabled: dateKey >= UI.todayKey(), onclick: function () {
          global.App.foodDate = UI.addDays(dateKey, 1); redraw();
        } }),
        h('button.btn.btn-sm.btn-primary', { text: '+ Log a meal', onclick: function () { openMealLogger(dateKey); } })
      ]),
      h('.ring-row', [])
    ]));
    var ringRow = root.querySelector('.ring-row');
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

    /* add the day's planned meals in one tap */
    if (st.diet) {
      var planIdx = ((UI.daysBetween(UI.todayKey(new Date(st.createdAt)), dateKey) % 7) + 7) % 7;
      var planned = st.diet.days[planIdx];
      var card = h('.card', [h('.card-head', [
        h('h3', { text: 'Planned for this day' }),
        h('.spacer'),
        h('button.btn.btn-sm', { text: 'Add all planned meals', onclick: function () {
          planned.meals.forEach(function (m) {
            day.meals.push({ title: m.title, slot: m.slot, items: JSON.parse(JSON.stringify(m.items)),
                             macros: m.macros, source: 'plan', photo: null, time: Date.now() });
          });
          S.save(); redraw(); UI.toast('Added the planned day.', 'good');
        } })
      ])]);
      planned.meals.forEach(function (m) {
        var already = day.meals.some(function (lm) { return lm.title === m.title; });
        card.appendChild(h('.meal-row', [
          h('.meal-main', [
            h('.meal-name', { text: FD.SLOT_LABEL[m.slot] + ' — ' + m.title }),
            h('.meal-meta', { text: m.macros.kcal + ' kcal · P ' + C.fmt(m.macros.p, 0) + 'g' })
          ]),
          already ? h('span.chip.chip-good', { text: 'logged' })
                  : h('button.btn.btn-sm', { text: '+ Eaten', onclick: function () {
                      day.meals.push({ title: m.title, slot: m.slot, items: JSON.parse(JSON.stringify(m.items)),
                                       macros: m.macros, source: 'plan', photo: null, time: Date.now() });
                      S.save(); redraw();
                    } })
        ]));
      });
      root.appendChild(card);
    }

    /* what was actually eaten */
    var logCard = h('.card', [h('.card-head', [
      h('h3', { text: 'Eaten today' }), h('.spacer'),
      h('span.card-sub', { text: day.meals.length + ' entries' })
    ])]);
    if (!day.meals.length) {
      logCard.appendChild(h('.chart-empty', { text: 'Nothing logged yet. Use "Log a meal" — photo, portions, or typed.' }));
    }
    day.meals.forEach(function (meal, mi) {
      logCard.appendChild(h('.meal-row', [
        meal.photo ? h('img', { src: meal.photo, alt: 'photo of ' + meal.title,
          style: { width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', flex: 'none' } }) : null,
        h('.meal-main', [
          h('.meal-name', { text: meal.title }),
          h('.meal-meta', { text: meal.items.map(function (i) {
            var f = FD.food(i.food);
            return f ? f.name + ' ' + i.qty + (f.unit === 'piece' ? '' : f.unit) : '';
          }).filter(Boolean).join(' · ') || '—' })
        ]),
        VI.macroPills(meal.macros),
        h('button.btn.btn-sm.btn-ghost', { text: '✎', onclick: function () { openMealLogger(dateKey, mi); } }),
        h('button.btn.btn-sm.btn-ghost.btn-danger', { text: '✕', onclick: function () {
          day.meals.splice(mi, 1); S.save(); redraw();
        } })
      ]));
    });
    root.appendChild(logCard);

    /* macro split */
    root.appendChild(VI.chartCard('Macro split today', null, function (host) {
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
    var day = S.nutritionFor(dateKey, true);
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
    var quickHost = h('div');
    var typed = h('input', { placeholder: 'e.g. 2 roti, 1 katori dal, 150g chicken' });
    var photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });

    function renderPhoto() {
      UI.clear(photoHost);
      if (!photo) return;
      photoHost.appendChild(h('img.photo-preview', { src: photo, alt: 'the meal you photographed' }));
      photoHost.appendChild(h('button.btn.btn-sm.btn-ghost.btn-danger', {
        text: 'Remove photo', onclick: function () { photo = null; renderPhoto(); }
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
          h('input', { type: 'number', value: item.qty, min: 0, step: f.unit === 'piece' ? 1 : 5,
            onchange: function (e) { item.qty = Number(e.target.value) || 0; renderTotal(); } }),
          h('span.item-unit', { text: f.unit === 'piece' ? '×' : f.unit }),
          h('button.btn.btn-sm.btn-ghost.btn-danger', { text: '✕', onclick: function () {
            items.splice(i, 1); renderItems(); renderTotal();
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
          h('.hint', { text: 'That is ' + Math.round(m.p / t.protein * 100) + '% of your daily protein target.' })
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
        onclick: function () { addItem(q.food, q.step); },
        title: 'Adds one ' + q.unitLabel
      }, [h('span', { text: '+ ' + q.label }), h('small', { style: { color: 'var(--ink-muted)' }, text: q.unitLabel })]));
    });

    photoInput.addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      MP.readPhoto(f, 900).then(function (p) {
        photo = p.dataUrl; renderPhoto();
      }).catch(function (err) { UI.toast(err.message, 'bad'); });
    });

    function applyTyped() {
      var r = MP.parsePortions(typed.value);
      r.items.forEach(function (it) { addItem(it.food, it.qty); });
      if (r.unmatched.length) {
        UI.toast('Could not place: ' + r.unmatched.join(', ') + '. Add it from the portions below.', 'bad');
      }
      typed.value = '';
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
          h('label', { text: 'Photo of the meal' }),
          h('.card-head', { style: { marginBottom: '8px' } }, [
            h('button.btn.btn-sm', { text: '📷 Add a photo', onclick: function () { photoInput.click(); } }),
            photoInput
          ]),
          photoHost,
          h('.hint', { text: 'The photo is saved with the entry as a record of the meal. Nothing in this app is sent anywhere, so the portions below are what the macros are calculated from — set them to match what is on the plate.' })
        ]),

        h('.field', [
          h('label', { text: 'Type the plate' }),
          h('.card-head', { style: { marginBottom: 0, gap: '8px' } }, [
            typed,
            h('button.btn.btn-sm', { text: 'Add', onclick: applyTyped })
          ]),
          h('.hint', { text: 'Understands rotis, katoris, glasses, pieces and grams — "2 roti, 1 katori dal, 150g chicken".' })
        ]),

        h('.field', [h('label', { text: 'On the plate' }), itemsHost]),
        totalHost,
        h('.field', [
          h('label', { text: 'Common portions' }),
          h('.check-grid', [quickHost])
        ])
      ],
      actions: [
        { label: 'Cancel' },
        { label: existing ? 'Save changes' : 'Log it', kind: 'primary', onClick: function () {
          if (!items.length) { UI.toast('Add at least one thing to the plate.', 'bad'); return false; }
          var meal = {
            title: title.value.trim() || FD.SLOT_LABEL[slot.value],
            slot: slot.value, items: items, macros: MP.macrosFor(items),
            photo: photo, source: 'manual', time: Date.now()
          };
          if (existing) day.meals[editIndex] = meal; else day.meals.push(meal);
          S.save(); redraw();
          UI.toast(meal.macros.p + ' g protein logged.', 'good');
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

    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: 'Personal records' }),
        h('span.card-sub', { text: 'max weight and max reps per exercise' }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-primary', { text: '+ Log a max', onclick: function () { openMaxLogger(); } })
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
    }).sort(function (a, b) { return (b.best.e1rm || 0) - (a.best.e1rm || 0); });

    var table = h('table.table', [h('thead', [h('tr', [
      h('th', { text: 'Exercise' }),
      h('th.num', { text: 'Max weight' }),
      h('th.num', { text: 'Max reps' }),
      h('th.num', { text: 'Best set' }),
      h('th.num', { text: 'Est. 1RM' }),
      h('th', { text: 'Last' }), h('th', { text: '' })
    ])])]);
    var tbody = h('tbody');
    rows.forEach(function (r) {
      tbody.appendChild(h('tr', [
        h('td', { text: r.name }),
        h('td.num', { text: r.maxWeight ? r.maxWeight + ' kg' : '—' }),
        h('td.num', { text: r.maxReps || '—' }),
        h('td.num', { text: r.best.weight + ' kg × ' + r.best.reps }),
        h('td.num', { html: '<b>' + C.fmt(r.best.e1rm, 1) + ' kg</b>' }),
        h('td', { text: UI.shortDate(r.best.date) }),
        h('td', [h('button.btn.btn-sm', { text: 'History', onclick: function () { openMaxHistory(r.id); } })])
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
              var v = rec.e1rm || S.e1rm(rec.weight, rec.reps);
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

  function openMaxLogger(presetExId) {
    var st = S.get();
    var pool = EXD.pool(st.plan ? st.plan.equipment : 'gym', []);
    var select = h('select', pool.map(function (e) {
      return h('option', { value: e.id, selected: e.id === presetExId, text: e.name });
    }));
    var weight = h('input', { type: 'number', step: 0.5, min: 0, placeholder: 'kg' });
    var reps = h('input', { type: 'number', min: 1, max: 30, value: 1 });
    var date = h('input', { type: 'date', value: UI.todayKey() });
    var note = h('input', { placeholder: 'belt, spotter, felt easy…' });
    var preview = h('.hint');

    function updatePreview() {
      var e = S.e1rm(Number(weight.value), Number(reps.value));
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
        h('.field', [h('label', { text: 'Note' }), note]),
        h('.hint', { text: 'For a max-reps set, enter the weight and how many you got — the estimated one-rep max is worked out from both, so bodyweight AMRAPs and heavy singles sit on the same scale.' })
      ],
      actions: [
        { label: 'Cancel' },
        { label: 'Save', kind: 'primary', onClick: function () {
          var w = Number(weight.value), r = Number(reps.value);
          if (!w || !r) { UI.toast('Enter both a weight and a rep count.', 'bad'); return false; }
          var ex = EXD.byId(select.value);
          S.recordMax(ex.id, ex.name, { date: date.value, weight: w, reps: r,
                                        e1rm: S.e1rm(w, r), note: note.value, source: 'manual' });
          S.save(); redraw();
          UI.toast('Max logged for ' + ex.name + '.', 'good');
        } }
      ]
    });
    updatePreview();
  }

  function openMaxHistory(exId) {
    var m = S.get().maxes[exId];
    var table = h('table.table', [h('thead', [h('tr', [
      h('th', { text: 'Date' }), h('th.num', { text: 'Weight' }), h('th.num', { text: 'Reps' }),
      h('th.num', { text: 'Est. 1RM' }), h('th', { text: 'Source' }), h('th', { text: '' })
    ])])]);
    var tbody = h('tbody');
    m.records.slice().reverse().forEach(function (r, i) {
      var realIndex = m.records.length - 1 - i;
      tbody.appendChild(h('tr', [
        h('td', { text: UI.shortDate(r.date) }),
        h('td.num', { text: r.weight + ' kg' }),
        h('td.num', { text: r.reps }),
        h('td.num', { text: C.fmt(r.e1rm || S.e1rm(r.weight, r.reps), 1) + ' kg' }),
        h('td', { text: r.source === 'session' ? 'from a session' : 'entered' }),
        h('td', [h('button.btn.btn-sm.btn-ghost.btn-danger', { text: '✕', onclick: function () {
          m.records.splice(realIndex, 1); S.save(); redraw();
        } })])
      ]));
    });
    table.appendChild(tbody);
    UI.modal({ title: m.name + ' — history', body: h('.table-wrap', [table]) });
  }

  global.Views = Views;

}(window));
