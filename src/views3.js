/* views3.js — nutrition log and the read-only strength tab. */
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

  /* ============================== STRENGTH ============================== */

  /* Read-only. Everything here is worked out from the sets logged in the
   * workout log — there is nothing to enter on this tab, and correcting a set
   * on any day corrects every number and chart here with it. */

  var selectedLift = null;   // which exercise the detail chart shows; kept across redraws

  function kg(v) { return C.fmt(v, 1) + ' kg'; }
  function setText(best, lift) { return S.describeSet(best, lift.timed); }

  Views.maxes = function (root) {
    UI.clear(root);
    var lifts = S.strength();
    var today = UI.todayKey();

    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: 'Your strength' }),
        h('span.card-sub', { text: 'from every set in your workout log' })
      ]),
      h('p', { style: { marginBottom: 0 } }, [
        'Nothing to fill in here. Log your sets in the ', h('b', { text: 'Workout log' }),
        ' and your bests and progress are worked out for you. ',
        h('b', { text: 'Estimated 1RM' }),
        ' (one-rep max) is the heaviest weight you could probably lift for a single rep, ' +
        'calculated from your best set — so a set of 8 and a heavy single can be compared on the same scale. ' +
        'Bodyweight exercises are tracked by reps, and holds like planks by seconds.'
      ])
    ]));

    if (!lifts.length) {
      root.appendChild(VI.emptyState('No sets logged yet',
        'Log a session in the workout log — weight and reps for each set — and your strength charts appear here.',
        'Open the workout log', function () { global.App.go('log'); }));
      return;
    }

    var weighted = lifts.filter(function (l) { return l.weighted; });
    var monthAgo = UI.addDays(today, -30);
    var recent = lifts.filter(function (l) {
      // a best set in the last 30 days that beat everything before it
      if (l.bestDate < monthAgo) return false;
      return l.days.some(function (d) { return d.date < l.bestDate; });
    });
    var strongest = weighted.slice().sort(function (a, b) { return b.e1rm - a.e1rm; })[0];

    root.appendChild(h('.grid.grid-3', { style: { marginTop: '16px' } }, [
      VI.stat('Exercises tracked', lifts.length, '', [h('span', { text: 'with sets logged' })], 'var(--series-1)'),
      VI.stat('New bests', recent.length, '', [h('span', { text: 'in the last 30 days' })], 'var(--series-3)'),
      VI.stat('Strongest lift', strongest ? C.fmt(strongest.e1rm, 1) : '—', strongest ? ' kg' : '',
        [h('span', { text: strongest ? strongest.name + ', estimated 1RM' : 'log a weighted set' })], 'var(--series-4)')
    ]));

    /* the most-logged weighted lifts, together */
    var top = weighted.slice().sort(function (a, b) { return b.days.length - a.days.length; }).slice(0, 4);
    if (top.length) {
      root.appendChild(VI.chartCard('Estimated 1RM over time',
        'your ' + (top.length === 1 ? 'most-logged lift' : top.length + ' most-logged lifts'), function (host) {
        var dates = [];
        top.forEach(function (l) { l.days.forEach(function (d) { if (dates.indexOf(d.date) === -1) dates.push(d.date); }); });
        dates.sort();
        C.line(host, {
          height: 300, unit: ' kg', dp: 1,
          series: top.map(function (l) {
            var byDate = {};
            l.days.forEach(function (d) { byDate[d.date] = d.e1rm; });
            return { name: l.name, points: dates.map(function (d) {
              return { x: UI.shortDate(d), y: byDate[d] != null ? byDate[d] : null };
            }) };
          })
        });
      }));
    }

    /* one exercise in detail */
    var ordered = lifts.slice().sort(function (a, b) { return b.lastDate < a.lastDate ? -1 : b.lastDate > a.lastDate ? 1 : 0; });
    if (!selectedLift || !lifts.some(function (l) { return l.key === selectedLift; })) selectedLift = ordered[0].key;
    var select = h('select', { 'aria-label': 'Exercise', style: { maxWidth: '260px' },
      onchange: function (e) { selectedLift = e.target.value; drawDetail(); } },
      ordered.map(function (l) { return h('option', { value: l.key, selected: l.key === selectedLift, text: l.name }); }));
    var detailHost = h('.chart-host');
    var detailNote = h('.hint');
    function drawDetail() {
      var l = lifts.filter(function (x) { return x.key === selectedLift; })[0];
      var labels = l.days.map(function (d) { return UI.shortDate(d.date); });
      if (l.weighted) {
        C.line(detailHost, { height: 260, unit: ' kg', dp: 1, series: [
          { name: 'Estimated 1RM', points: l.days.map(function (d, i) { return { x: labels[i], y: d.e1rm || null }; }) },
          { name: 'Heaviest set', points: l.days.map(function (d, i) { return { x: labels[i], y: d.topWeight || null }; }) }
        ] });
        detailNote.textContent = 'Best: ' + setText(l.best, l) + ' on ' + UI.prettyDate(l.bestDate) +
          ' — an estimated 1RM of ' + kg(l.e1rm) + '. Logged on ' + l.days.length + ' day' + (l.days.length === 1 ? '' : 's') + '.';
      } else {
        C.line(detailHost, { height: 260, unit: l.timed ? ' s' : ' reps', dp: 0, area: true, series: [
          { name: l.timed ? 'Longest hold' : 'Most reps in a set',
            points: l.days.map(function (d, i) { return { x: labels[i], y: d.maxReps }; }) }
        ] });
        detailNote.textContent = (l.timed ? 'Timed hold — tracked by seconds. Best: ' + l.maxReps + ' s'
            : (l.load === 'band' ? 'Band' : 'Bodyweight') + ' — tracked by reps. Best: ' + l.maxReps + ' reps') + ' on ' +
          UI.prettyDate(l.bestDate) + '. Logged on ' + l.days.length + ' day' + (l.days.length === 1 ? '' : 's') + '.';
      }
    }
    root.appendChild(h('.card', [
      h('.card-head', [h('h3', { text: 'Exercise progress' }), h('.spacer'), select]),
      detailHost,
      detailNote
    ]));
    setTimeout(drawDetail, 0);

    /* every exercise's bests */
    var rows = lifts.slice().sort(function (a, b) {
      return (b.weighted - a.weighted) || (b.e1rm - a.e1rm) || (b.maxReps - a.maxReps);
    });
    var table = h('table.table', [h('thead', [h('tr', [
      h('th', { text: 'Exercise' }),
      h('th.num', { text: 'Heaviest' }),
      h('th.num', { text: 'Most reps / time' }),
      h('th.num', { text: 'Best set' }),
      h('th.num', { text: 'Est. 1RM' }),
      h('th', { text: 'Best on' }),
      h('th.num', { text: 'Days logged' })
    ])])]);
    var tbody = h('tbody');
    rows.forEach(function (l) {
      var tr = h('tr.is-clickable', { tabindex: '0', title: 'Show ' + l.name + ' in the chart above' }, [
        h('td', { text: l.name }),
        h('td.num', { text: l.topWeight ? (l.load === 'bodyweight' ? '+' : '') + kg(l.topWeight) : '—' }),
        h('td.num', { text: l.timed ? l.maxReps + ' s' : l.maxReps }),
        h('td.num', { text: setText(l.best, l) }),
        h('td.num', [l.weighted ? h('b', { text: kg(l.e1rm) }) : '—']),
        h('td', { text: UI.shortDate(l.bestDate) }),
        h('td.num', { text: l.days.length })
      ]);
      function pick() {
        selectedLift = l.key; select.value = l.key; drawDetail();
        detailHost.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') pick(); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(h('.card', [
      h('.card-head', [h('h3', { text: 'All your bests' }), h('span.card-sub', { text: 'select a row to chart it' })]),
      h('.table-wrap', [table])
    ]));
  };

  global.Views = Views;

}(window));
