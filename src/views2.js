/* views2.js — the remaining tabs, plus the import and meal-entry modals.
 * Extends the Views object created in views.js. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var DG = global.DietGen, FD = global.FoodData;
  var PP = global.PlanParse;
  var Views = global.Views;
  var VI = global.ViewsInternal;
  var redraw = function () { global.App.render(); };

  /* ============================== DIET PLAN ============================== */

  Views.diet = function (root) {
    UI.clear(root);
    var st = S.get();

    if (!st.diet) {
      root.appendChild(dietSourceCard());
      return;
    }

    var diet = st.diet, t = S.targets();

    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: 'Food preferences' }),
        h('.spacer'),
        h('span.card-sub', { text: 'targets recalculate from your latest weigh-in' })
      ]),
      h('.field-row', [
        h('div', [
          h('.field-title', { text: 'What do you eat?' }),
          h('.seg-group', FD.DIET_PREFS.map(function (d) {
            return h('button.seg-btn' + (diet.dietPref === d.id ? '.is-active' : ''), {
              type: 'button', text: d.label, 'aria-pressed': diet.dietPref === d.id ? 'true' : 'false',
              onclick: function () {
                if (diet.dietPref === d.id) return;
                changePreference('dietPref', d.id);
              }
            });
          }))
        ]),
        h('div', [
          h('.field-title', { text: 'Which cuisine?' }),
          h('.seg-group', FD.CUISINES.map(function (c) {
            return h('button.seg-btn' + (diet.cuisine === c.id ? '.is-active' : ''), {
              type: 'button', text: c.label, 'aria-pressed': diet.cuisine === c.id ? 'true' : 'false',
              onclick: function () {
                if (diet.cuisine === c.id) return;
                changePreference('cuisine', c.id);
              }
            });
          }))
        ])
      ]),
      h('.card-head', { style: { marginTop: '14px', marginBottom: '0' } }, [
        UI.button('.btn-sm', 'refresh', 'Rebuild week', { onclick: function () { regenerateDiet(); } }),
        UI.button('.btn-sm', 'upload', 'Import a diet', { onclick: function () { Views.openDietImport(); } }),
        h('.spacer'),
        h('span.card-sub', { text: FD.SLOTS.map(function (s) {
          return FD.mealPool(s, { dietPref: diet.dietPref, cuisine: diet.cuisine, dislikes: diet.dislikes }).length +
                 ' ' + s;
        }).join(' · ') + ' options available' })
      ])
    ]));

    /* daily targets */
    root.appendChild(h('.grid.grid-4', { style: { marginTop: '16px' } }, [
      VI.stat('Calories', t.kcal, ' kcal', [h('span', { text: 'BMR ' + t.bmr + ' · TDEE ' + t.tdee })], 'var(--series-1)'),
      VI.stat('Protein', t.protein, ' g', [h('span', { text: Math.round(t.protein * 4 / t.kcal * 100) + '% of calories' })], 'var(--series-3)'),
      VI.stat('Carbs', t.carbs, ' g', null, 'var(--series-4)'),
      VI.stat('Fat', t.fat, ' g', [h('span', { text: 'water ' + (t.waterMl / 1000).toFixed(1) + ' L/day' })], 'var(--series-5)')
    ]));

    /* honest note when the pool cannot reach the protein target */
    var avgP = Math.round(diet.days.reduce(function (a, d) { return a + d.totals.p; }, 0) / diet.days.length);
    if (avgP < t.protein * 0.9) {
      root.appendChild(h('.banner.is-warn', { style: { marginTop: '16px' } }, [h('div', [
        h('b', { text: 'This week averages ' + avgP + ' g of protein against a ' + t.protein + ' g target.' }),
        ' That is the ceiling for these meals at your calorie level — the narrower the diet and cuisine, ' +
        'the fewer protein-dense options there are. Widening the cuisine, or adding a shake, closes the gap.'
      ])]));
    }

    var todayIdx = S.dietDayIndexFor(UI.todayKey());
    diet.days.forEach(function (day, di) {
      // Day 1 is Monday, so the week on screen is the week you are living in.
      var weekday = UI.DAY_NAMES[(di + 1) % 7];
      var isToday = di === todayIdx;
      var totals = h('span', [VI.macroPills(day.totals)]);
      var card = h('.card', [
        h('.card-head', [
          h('h3', { text: weekday }),
          h('span.card-sub', { text: 'Day ' + (di + 1) + ' of ' + diet.days.length }),
          isToday ? h('span.chip.chip-accent', { text: 'Today' }) : null,
          h('.spacer'),
          totals
        ])
      ]);
      day.meals.forEach(function (meal, mi) {
        card.appendChild(mealRow(diet, day, di, meal, mi, function () {
          UI.clear(totals).appendChild(VI.macroPills(day.totals));
        }));
      });
      root.appendChild(card);
    });
  };

  function describeItems(items) {
    return items.map(function (i) {
      var f = FD.food(i.food);
      return f ? f.name + ' ' + i.qty + (f.unit === 'piece' ? '' : ' ' + f.unit) : '';
    }).filter(Boolean).join(' · ');
  }
  Views.describeItems = describeItems;

  /* One meal, with its portions editable underneath. A portion change updates
   * the numbers in place rather than redrawing the tab: a redraw would close
   * the editor and take the cursor with it after every single field. */
  function mealRow(diet, day, di, meal, mi, onTotals) {
    var pills = h('span', [VI.macroPills(meal.macros)]);
    var meta = h('.meal-meta', { text: describeItems(meal.items) });
    var detail = h('.meal-detail', { hidden: true });
    meal.items.forEach(function (item) {
      var f = FD.food(item.food);
      if (!f) return;
      detail.appendChild(h('.item-line', [
        h('span.item-name', { text: f.name }),
        h('input', { type: 'number', inputmode: 'decimal', value: item.qty, min: 0, step: f.unit === 'piece' ? 1 : 5,
          'aria-label': f.name + ' quantity',
          onchange: function (e) {
            item.qty = Math.max(0, Number(e.target.value) || 0);
            DG.recalcDay(day);
            diet.source = diet.source === 'generated' ? 'generated+edited' : diet.source;
            S.save();
            UI.clear(pills).appendChild(VI.macroPills(meal.macros));
            meta.textContent = describeItems(meal.items);
            onTotals();
          } }),
        h('span.item-unit', { text: f.unit === 'piece' ? '×' : f.unit })
      ]));
    });

    var toggle = UI.button('.btn-sm.btn-ghost', 'edit', null, {
      title: 'Adjust portions for ' + meal.title, 'aria-expanded': 'false',
      onclick: function () {
        detail.hidden = !detail.hidden;
        toggle.setAttribute('aria-expanded', detail.hidden ? 'false' : 'true');
      }
    });
    var row = h('.meal-row', [
      h('.meal-main', [
        h('.meal-name', { text: (FD.SLOT_LABEL[meal.slot] || 'Meal') + ' — ' + meal.title }),
        meta
      ]),
      pills,
      UI.button('.btn-sm', 'swap', 'Swap', { onclick: function () { openMealSwap(diet, di, mi); } }),
      toggle
    ]);
    return h('div', [row, detail]);
  }

  function openMealSwap(diet, dayIdx, slotIdx) {
    var meal = diet.days[dayIdx].meals[slotIdx];
    var alts = DG.alternativesForMeal(diet, dayIdx, slotIdx);
    var search = h('input', { type: 'search', placeholder: 'Search ' + alts.length + ' options…',
                              'aria-label': 'Search meals' });
    var listHost = h('div');

    function render() {
      UI.clear(listHost);
      var q = search.value.trim().toLowerCase();
      var shown = q ? alts.filter(function (a) { return a.title.toLowerCase().indexOf(q) !== -1; }) : alts;
      if (!shown.length) { listHost.appendChild(h('.chart-empty', { text: 'Nothing matches.' })); return; }
      listHost.appendChild(h('.swap-list', shown.map(function (alt) {
        return h('button.swap-item', {
          type: 'button',
          onclick: function () {
            DG.applyMealSwap(diet, dayIdx, slotIdx, alt);
            S.save(); redraw();
            UI.toast('Swapped to ' + alt.title, 'good');
            close();
          }
        }, [
          h('span', { text: alt.title }),
          h('small', { text: alt.macros.kcal + ' kcal · P ' + C.fmt(alt.macros.p, 0) + 'g · C ' +
                             C.fmt(alt.macros.c, 0) + 'g · F ' + C.fmt(alt.macros.f, 0) + 'g' })
        ]);
      })));
    }
    search.addEventListener('input', render);

    var close = UI.modal({
      title: 'Alternatives for ' + meal.title,
      body: [
        h('p', { text: alts.length
          ? alts.length + ' other ' + meal.slot + ' options fit your preferences, ' +
            'sorted by how close they are to this meal’s calories.'
          : 'Nothing else fits your current diet and cuisine for this meal. Widen the cuisine to see more.' }),
        h('.field', [search]), listHost
      ]
    });
    render();
  }

  function dietSourceCard() {
    return h('.card', [
      h('.card-head', [h('h3', { text: 'Where should your meal plan come from?' })]),
      h('.grid.grid-3', [
        h('.day-card', [
          h('h4', [UI.icon('sparkle'), 'Build one for me']),
          h('p', { text: 'Seven different days built to your calorie and protein targets, in the cuisine you choose.' }),
          h('button.btn.btn-sm.btn-primary', { type: 'button', text: 'Build my meal plan', onclick: function () { regenerateDiet(); } })
        ]),
        h('.day-card', [
          h('h4', [UI.icon('camera'), 'From a photo']),
          h('p', { text: 'A photo of the diet chart you were given. The text is read on this device and you correct it before saving.' }),
          h('button.btn.btn-sm', { type: 'button', text: 'Import from photo', onclick: function () { Views.openDietImport('photo'); } })
        ]),
        h('.day-card', [
          h('h4', [UI.icon('file'), 'From a file']),
          h('p', { text: 'A BodyKaLogic export, or a plain text file with lines like "Breakfast: 3 eggs, 2 toast".' }),
          h('button.btn.btn-sm', { type: 'button', text: 'Import from file', onclick: function () { Views.openDietImport('file'); } })
        ])
      ])
    ]);
  }

  /* Build the week from the profile. Replacing a week that already exists
   * throws away every swap and portion change made to it, so that is asked
   * first — `opts.sure` skips the question for a caller that has already asked. */
  function regenerateDiet(opts) {
    opts = opts || {};
    var st = S.get(), p = st.profile;
    if (!Views.profileReady(p)) {
      UI.toast('Add your age, height and weight on Home first.', 'bad');
      global.App.go('home');
      return Promise.resolve(false);
    }
    var ask = (st.diet && !opts.sure) ? UI.confirm({
      title: 'Rebuild your week of meals?',
      message: 'This replaces all seven days, including any swaps and portion changes you have made. Meals you have already logged are not affected.',
      confirmLabel: 'Rebuild week'
    }) : Promise.resolve(true);
    return ask.then(function (ok) {
      if (!ok) return false;
      var w = S.currentWeight();
      st.diet = DG.generate(Object.assign({}, p, { weightKg: w || p.weightKg }),
        { dietPref: p.dietPref, cuisine: p.cuisine, dislikes: p.dislikes || [] });
      S.save(); redraw();
      if (!opts.quiet) UI.toast('Seven days of meals built.', 'good');
      return true;
    });
  }
  Views.regenerateDiet = regenerateDiet;

  /* Switching diet or cuisine means a different week. On a week that has been
   * imported or hand-edited that is a loss worth a question; on one that is
   * exactly as generated it is just the control doing its job. */
  function changePreference(key, value) {
    var st = S.get();
    var untouched = st.diet && st.diet.source === 'generated';
    var before = st.profile[key];
    st.profile[key] = value;
    regenerateDiet({ sure: untouched, quiet: true }).then(function (done) {
      if (!done) st.profile[key] = before;
    });
  }

  /* ============================ IMPORT MODALS =========================== */

  function importModal(opts) {
    var textarea = h('textarea', { placeholder: opts.placeholder, rows: 12 });
    var preview = h('div');
    var status = h('.hint', { role: 'status' });
    var fileInput = h('input', { type: 'file', accept: opts.accept, hidden: true });
    // No `capture`: with it a phone goes straight to the camera and a photo
    // already in the library cannot be chosen at all.
    var photoInput = h('input', { type: 'file', accept: 'image/*', hidden: true });

    function handleFile(file) {
      status.textContent = 'Reading ' + file.name + '…';
      PP.readFile(file).then(function (res) {
        if (res.kind === 'json') {
          status.textContent = opts.onJson(res.data, close) || '';
          return;
        }
        if (res.kind === 'text') {
          textarea.value = res.text;
          status.textContent = 'Loaded ' + file.name + '. Check it below, then import.';
          return;
        }
        // image
        UI.clear(preview);
        preview.appendChild(h('img.photo-preview', { src: res.photo.dataUrl, alt: 'The photo you chose' }));
        status.textContent = 'Reading the text out of the photo… The text reader downloads once (about 10 MB); the photo itself stays on this device.';
        PP.ocr(res.photo.dataUrl, function (p, st) {
          status.textContent = (st ? st.charAt(0).toUpperCase() + st.slice(1) : 'Working') + ' — ' + Math.round(p * 100) + '%';
        }).then(function (text) {
          textarea.value = text;
          status.textContent = text.trim()
            ? 'Text read from the photo. It will have mistakes — fix anything wrong below before importing.'
            : 'No text could be read from that photo. Type it in from the image above.';
        }).catch(function (e) {
          status.textContent = e.message;
        });
      }).catch(function (e) {
        status.textContent = /json/i.test(String(e && e.message)) || (e && e.name === 'SyntaxError')
          ? 'That file is not valid JSON.'
          : ((e && e.message) || 'That file could not be read.');
      });
    }

    function picked(e) {
      if (e.target.files[0]) handleFile(e.target.files[0]);
      e.target.value = '';      // so choosing the same file twice still fires
    }
    fileInput.addEventListener('change', picked);
    photoInput.addEventListener('change', picked);

    var close = UI.modal({
      title: opts.title,
      body: [
        h('.card-head', { style: { marginBottom: '12px' } }, [
          UI.button('.btn-sm', 'camera', 'Choose a photo', { onclick: function () { photoInput.click(); } }),
          UI.button('.btn-sm', 'file', 'Choose a file', { onclick: function () { fileInput.click(); } }),
          fileInput, photoInput
        ]),
        preview,
        h('.field', [h('label', { text: opts.label }), textarea]),
        status,
        h('.hint', { text: opts.hint }),
        opts.replaces ? h('.hint', { text: opts.replaces }) : null
      ],
      actions: [
        { label: 'Cancel' },
        { label: 'Import', kind: 'primary', onClick: function () {
          if (!textarea.value.trim()) { UI.toast('Nothing to import yet.', 'bad'); return false; }
          return opts.onText(textarea.value, close);
        } }
      ]
    });

    if (opts.autoOpen === 'photo') setTimeout(function () { photoInput.click(); }, 150);
    if (opts.autoOpen === 'file') setTimeout(function () { fileInput.click(); }, 150);
    return close;
  }

  Views.openPlanImport = function (autoOpen) {
    var st = S.get();
    importModal({
      title: 'Import a workout plan',
      autoOpen: autoOpen,
      accept: '.json,.txt,.md,.csv,text/*,image/*',
      label: 'Plan text',
      placeholder: 'Day 1 — Push\nBench Press 4x8 60kg\nIncline DB Press 3x10\n\nDay 2 — Pull\nDeadlift 4x5 100kg\n...',
      hint: 'Day headers and set notation (4x8, 3 x 10-12, @60kg) are understood. Anything that cannot be read is kept as a note on the day rather than dropped.',
      replaces: st.plan ? 'Importing replaces your current plan. Sessions you have already logged are kept.' : null,
      onJson: function (data, close) {
        var plan = data && data.plan;
        if (!plan || !Array.isArray(plan.days) || !plan.days.length) return 'That file has no workout plan in it.';
        S.get().plan = S.normalise({ plan: plan }).plan;
        S.save(); redraw();
        UI.toast('Plan imported.', 'good'); close();
      },
      onText: function (text, close) {
        var parsed = PP.parsePlanText(text);
        if (!parsed.days.length) { UI.toast('No days could be read from that.', 'bad'); return false; }
        var st = S.get();
        st.plan = {
          equipment: st.profile.equipment, goal: st.profile.goal,
          experience: st.profile.experience, daysPerWeek: parsed.days.length,
          days: parsed.days, source: 'imported', updatedAt: Date.now()
        };
        S.save(); redraw();
        UI.toast('Imported ' + parsed.stats.days + ' day' + (parsed.stats.days === 1 ? '' : 's') + ', ' +
                 parsed.stats.exercises + ' exercises — ' +
                 parsed.stats.matched + ' matched to the library.', 'good');
        close();
      }
    });
  };

  Views.openDietImport = function (autoOpen) {
    var st = S.get();
    importModal({
      title: 'Import a diet plan',
      autoOpen: autoOpen,
      accept: '.json,.txt,.md,.csv,text/*,image/*',
      label: 'Diet text',
      placeholder: 'Breakfast: 3 eggs, 2 slices bread, 1 banana\nLunch: 2 roti, 1 katori dal, 150g chicken\nSnack: whey shake\nDinner: 3 roti, paneer sabzi',
      hint: 'Lines starting with a meal name are read as that meal. Quantities understand household portions — rotis, katoris, a glass of milk — and grams.',
      replaces: st.diet ? 'Importing replaces your current week of meals. Meals you have already logged are kept.' : null,
      onJson: function (data, close) {
        var diet = data && S.normalise({ diet: data.diet }).diet;
        if (!diet) return 'That file has no diet plan in it.';
        S.get().diet = diet; S.save(); redraw();
        UI.toast('Diet plan imported.', 'good'); close();
      },
      onText: function (text, close) {
        var parsed = PP.parseDietText(text);
        if (!parsed.meals.length) { UI.toast('No meals could be read from that.', 'bad'); return false; }
        var st = S.get();
        var t = S.targets();
        var meals = parsed.meals.map(function (m) {
          return { templateId: null, title: m.title, slot: m.slot, items: m.items,
                   macros: DG.roundMacros(DG.sumMacros(m.items)) };
        });
        var totals = DG.roundMacros(DG.sumMacros(meals.reduce(function (a, m) { return a.concat(m.items); }, [])));
        // One imported day, repeated across the week — the source is usually a
        // single chart, and each day stays individually swappable afterwards.
        st.diet = {
          dietPref: st.profile.dietPref, cuisine: st.profile.cuisine, dislikes: [],
          targets: t,
          days: Array.from({ length: 7 }, function (_, i) {
            return { day: i, meals: JSON.parse(JSON.stringify(meals)), totals: Object.assign({}, totals) };
          }),
          source: 'imported', updatedAt: Date.now()
        };
        S.save(); redraw();
        UI.toast('Imported ' + meals.length + ' meal' + (meals.length === 1 ? '' : 's') +
                 (parsed.unmatched.length ? ' — ' + parsed.unmatched.length + ' item' +
                   (parsed.unmatched.length === 1 ? ' was' : 's were') + ' not recognised' : '') + '.',
                 parsed.unmatched.length ? 'bad' : 'good');
        close();
      }
    });
  };

  /* ========================== TODAY'S SESSION =========================== */

  // Bodyweight movements whose "added weight" column has been asked for, by
  // date and name. Not saved: once a weight is typed in, the set itself says so.
  var addedWeight = {};

  Views.log = function (root) {
    UI.clear(root);
    var st = S.get();
    if (!st.plan) {
      root.appendChild(VI.emptyState('No plan to log against',
        'Build or import a workout plan first and the day’s session appears here.',
        'Go to workout plan', function () { global.App.go('plan'); }));
      return;
    }

    var today = UI.todayKey();
    var dateKey = global.App.logDate || today;
    if (dateKey > today) dateKey = today;
    var weekday = UI.DAY_NAMES[UI.parseKey(dateKey).getDay()];

    // A day that has nothing logged on it is laid out from the plan but not
    // stored. keep() is what turns it into a record, the first time something
    // is actually entered.
    var session = S.sessionFor(dateKey);
    function keep() { S.keepSession(session); S.save(); }

    // Everything on this tab that is worked out from the sets. Typing in a row
    // refreshes these in place — redrawing the tab would drop the cursor.
    var volumeLine = h('.card-sub');
    function liveStat(label, accent) {
      var value = h('.stat-value'), meta = h('.stat-meta');
      return {
        node: h('.stat', { style: { '--stat-accent': accent } }, [h('.stat-label', { text: label }), value, meta]),
        set: function (text, unit, note) {
          UI.clear(value);
          value.appendChild(document.createTextNode(text));
          if (unit) value.appendChild(h('small', { text: unit }));
          meta.textContent = note || '';
        }
      };
    }
    var sumTime = liveStat('Time', 'var(--series-4)');
    var sumKcal = liveStat('Calories burnt', 'var(--series-1)');
    var sumVolume = liveStat('Volume', 'var(--series-2)');
    var sumSets = liveStat('Logged', 'var(--series-3)');
    var lengthRow = h('.field');

    function refreshSummary() {
      var b = S.sessionBurn(session);
      var volume = Math.round(S.sessionVolume(session)).toLocaleString();
      var kcal = b.kcal != null ? b.kcal.toLocaleString() : null;
      // The time is a guess only where lifting had to be timed from its sets.
      var guessed = b.sets > 0 && !b.entered;

      volumeLine.textContent = 'Volume so far: ' + volume + ' kg' + (b.logged
        ? (kcal ? ' · ≈ ' + kcal + ' kcal burnt' : '') + ' · ' + (guessed ? 'about ' : '') + b.minutes + ' min'
        : '');

      sumTime.set(b.logged ? (guessed ? '≈ ' : '') + b.minutes : '—', b.logged ? ' min' : '',
        !b.logged ? 'nothing logged yet'
          : b.short ? 'your conditioning alone runs longer than the length entered'
          : b.entered ? 'the length you entered'
          : b.sets ? 'estimated from your sets and rests' : 'conditioning, as logged');
      sumKcal.set(b.logged && kcal ? '≈ ' + kcal : '—', b.logged && kcal ? ' kcal' : '',
        !b.logged ? 'log a set and this fills in'
          : kcal ? 'estimate, at ' + C.fmt(b.weightKg, 1) + ' kg bodyweight' : 'needs your weight — add it on Home');
      sumVolume.set(volume, ' kg', 'weight × reps on loaded lifts');
      sumSets.set(String(b.sets), b.sets === 1 ? ' set' : ' sets',
        b.cardioMinutes ? 'plus ' + b.cardioMinutes + ' min of conditioning' : 'no conditioning logged');
      // Only lifting needs a length: conditioning is already logged in minutes.
      lengthRow.hidden = !b.sets;
    }

    function go(key) { global.App.logDate = key === today ? null : key; redraw(); }

    // The picker always has an entry for what is showing. Without one, a rest
    // day displayed the first session as if it were selected — and choosing
    // that same session then did nothing, because nothing had changed.
    var listed = session.dayIndex != null && !!st.plan.days[session.dayIndex];
    var picker = h('select.session-picker', {
      'aria-label': 'Which session to log',
      onchange: function (e) {
        if (e.target.value === '') return;
        var idx = Number(e.target.value);
        var before = session.entries;
        var next = st.plan.days[idx].slots.map(function (slot) {
          return before.filter(function (en) { return en.name === slot.name; })[0] || S.entryFor(slot);
        });
        // Anything already logged stays, even if the new session does not include it.
        before.forEach(function (en) {
          if (en.sets.length && next.indexOf(en) === -1) next.push(en);
        });
        session.dayIndex = idx;
        session.dayName = st.plan.days[idx].name;
        session.entries = next;
        keep(); redraw();
      }
    }, [
      listed ? null : h('option', { value: '', selected: true,
        text: session.entries.length ? session.dayName : 'Rest day — choose a session' })
    ].concat(st.plan.days.map(function (d, i) {
      return h('option', { value: i, selected: listed && i === session.dayIndex, text: d.name });
    })));

    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: session.dayName }),
        h('span.card-sub', { text: (dateKey === today ? 'Today · ' : '') + weekday + ' ' + UI.shortDate(dateKey) }),
        session.completed ? h('span.chip.chip-good', { text: 'Completed' }) : null,
        h('.spacer'),
        h('button.btn.btn-sm', { type: 'button', text: '‹ Previous day', onclick: function () { go(UI.addDays(dateKey, -1)); } }),
        dateKey < today ? h('button.btn.btn-sm', { type: 'button', text: 'Next day ›', onclick: function () { go(UI.addDays(dateKey, 1)); } }) : null,
        dateKey < today ? h('button.btn.btn-sm', { type: 'button', text: 'Today', onclick: function () { go(today); } }) : null,
        h('input.log-date', { type: 'date', value: dateKey, max: today, 'aria-label': 'Go to a date',
          onchange: function (e) { if (UI.validPastKey(e.target.value)) go(e.target.value); } }),
        picker
      ]),
      volumeLine,
      h('details.rpe-help', [
        h('summary', { text: 'What is RPE?' }),
        h('p', { text: 'RPE (rate of perceived exertion) is how hard a set felt, from 1 to 10. ' +
          '10 means you could not have done another rep; 9 means one more was left; 8 means about two. ' +
          'It is optional, but it shows whether a weight is getting easier over time.' })
      ])
    ]));

    if (!session.entries.length) {
      root.appendChild(h('.card', [h('.banner', { style: { marginBottom: 0 } }, [h('div', [
        h('b', { text: 'Nothing scheduled for ' + weekday + '.' }),
        ' Rest is part of the plan. If you want to train anyway, choose a session from the list above and it will load here.'
      ])])]));
    }

    function num(v) { return v === '' ? '' : Math.max(0, Number(v) || 0); }
    function setVolume(set) {
      return Math.round((Number(set.weight) || 0) * (Number(set.reps) || 0)).toLocaleString();
    }

    session.entries.forEach(function (entry, ei) {
      // How this movement is measured decides the columns. A loaded lift is
      // weight × reps. A push-up is reps — extra load is there if you ask for
      // it. A band is reps alone, a plank is seconds, and a walk is minutes,
      // with a distance where it covers ground so the pace can be worked out.
      var kind = global.ExerciseData.kindOf(entry);
      var cardio = kind.measure === 'cardio';
      var weightKey = dateKey + '|' + entry.name;
      var showWeight = kind.load === 'weight' || (kind.load === 'bodyweight' &&
        (addedWeight[weightKey] || entry.sets.some(function (s) { return Number(s.weight) > 0; })));
      var showVolume = kind.load === 'weight' && kind.measure === 'reps';
      var weightLabel = kind.load === 'bodyweight' ? 'Added weight (kg)' : 'Weight (kg)';
      var countLabel = kind.timed ? 'Seconds' : 'Reps';
      var kindChip = cardio ? 'Cardio' : kind.timed ? 'Timed hold'
                   : kind.load === 'bodyweight' ? 'Bodyweight' : kind.load === 'band' ? 'Band' : null;
      var target = cardio && Number(entry.targetSets) === 1
        ? entry.targetReps : entry.targetSets + ' × ' + entry.targetReps;

      var card = h('.card', { 'data-entry': ei });
      var lastTime = lastPerformance(entry, dateKey);
      // Shown until a distance is typed in, which is what it is asking for.
      var distanceHint = kind.dist ? h('.hint', { text: kind.dist === 'foot'
        ? 'Add the distance and your pace is worked out — and the calories follow that pace instead of an average.'
        : 'Add the distance to see your average speed.' }) : null;
      function refreshHint() {
        if (distanceHint) distanceHint.hidden = entry.sets.some(function (s) { return Number(s.km) > 0; });
      }
      card.appendChild(h('.card-head', [
        h('h3', { text: entry.name }),
        kindChip ? h('span.chip', { text: kindChip }) : null,
        h('span.card-sub', { text: 'target ' + target + (lastTime ? ' · last time ' + lastTime : '') }),
        h('.spacer'),
        kind.load === 'bodyweight' && !showWeight
          ? UI.button('.btn-sm.btn-ghost', 'plus', 'Added weight', {
              title: 'Wearing a vest, a belt or a pack? Add a column for the extra load.',
              onclick: function () { addedWeight[weightKey] = true; redraw(); } })
          : null,
        UI.button('.btn-sm', 'plus', cardio ? 'Add time' : 'Add set', { onclick: function () {
          var prev = entry.sets[entry.sets.length - 1];
          var planned = parseInt(entry.targetReps, 10);
          entry.sets.push(cardio
            ? { minutes: prev ? prev.minutes : planned || 10, km: '' }
            : { reps: prev ? prev.reps : planned || (kind.timed ? 30 : 8),
                weight: prev ? prev.weight : '', rpe: '' });
          keep(); redraw();
          // Straight into the new row, so logging a set is: tap, type, tab.
          var field = root.querySelector('[data-entry="' + ei + '"] tbody tr:last-child input');
          if (field) { field.focus(); field.select(); }
        } })
      ]));

      function removeCell(si) {
        return h('td', [UI.button('.btn-sm.btn-ghost.btn-danger', 'x', null, {
          title: 'Remove ' + (cardio ? 'entry ' : 'set ') + (si + 1),
          onclick: function () { entry.sets.splice(si, 1); keep(); redraw(); }
        })]);
      }

      /* Minutes, and a distance where there is one. Pace and calories are
       * worked out, not typed. */
      function cardioRow(set, si) {
        var label = entry.name + ', entry ' + (si + 1);
        var pace = kind.dist ? h('td.num') : null;
        var kcal = h('td.num');
        function show() {
          if (pace) pace.textContent = S.paceText(set.minutes, set.km, kind.dist) || '—';
          var burnt = S.cardioKcal(session, entry, set);
          kcal.textContent = burnt != null ? '≈ ' + burnt.toLocaleString() + ' kcal' : '—';
        }
        function changed() { show(); refreshHint(); refreshSummary(); keep(); }
        show();
        return h('tr', [
          h('td', { text: si + 1 }),
          h('td', [h('input', { type: 'number', inputmode: 'decimal', value: set.minutes, min: 0, step: 'any',
            'aria-label': label + ', minutes',
            onchange: function (e) { set.minutes = num(e.target.value); changed(); } })]),
          kind.dist ? h('td', [h('input', { type: 'number', inputmode: 'decimal', value: set.km, min: 0, step: 'any',
            placeholder: 'optional',
            'aria-label': label + ', distance in kilometres',
            onchange: function (e) { set.km = num(e.target.value); changed(); } })]) : null,
          pace, kcal, removeCell(si)
        ]);
      }

      function setRow(set, si) {
        var volume = showVolume ? h('td.num', { text: setVolume(set) }) : null;
        var label = entry.name + ', set ' + (si + 1);
        function changed() { if (volume) volume.textContent = setVolume(set); refreshSummary(); keep(); }
        return h('tr', [
          h('td', { text: si + 1 }),
          showWeight ? h('td', [h('input', { type: 'number', inputmode: 'decimal', value: set.weight, step: 0.5, min: 0,
            placeholder: kind.load === 'weight' ? '' : 'optional',
            'aria-label': label + ', ' + weightLabel.toLowerCase(),
            onchange: function (e) { set.weight = num(e.target.value); changed(); } })]) : null,
          h('td', [h('input', { type: 'number', inputmode: 'numeric', value: set.reps, min: 0,
            'aria-label': label + ', ' + countLabel.toLowerCase(),
            onchange: function (e) { set.reps = num(e.target.value); changed(); } })]),
          h('td', [h('input', { type: 'number', inputmode: 'decimal', value: set.rpe, min: 1, max: 10, step: 0.5,
            placeholder: '1–10',
            'aria-label': label + ', effort out of ten',
            onchange: function (e) {
              set.rpe = e.target.value === '' ? '' : Math.min(10, Math.max(1, Number(e.target.value) || 1));
              e.target.value = set.rpe;
              changed();
            } })]),
          volume, removeCell(si)
        ]);
      }

      if (!entry.sets.length) {
        card.appendChild(h('.hint', { text: cardio ? 'Nothing logged yet.' : 'No sets logged yet.' }));
      } else {
        var head = cardio ? [
          h('th', { text: '#' }),
          h('th', { text: 'Minutes' }),
          kind.dist ? h('th', { text: 'Distance (km)' }) : null,
          kind.dist ? h('th.num', { text: kind.dist === 'speed' ? 'Speed' : 'Pace' }) : null,
          h('th.num', { text: 'Calories' })
        ] : [
          h('th', { text: 'Set' }),
          showWeight ? h('th', { text: weightLabel }) : null,
          h('th', { text: countLabel }),
          h('th', [h('abbr', { title: 'Rate of perceived exertion: how hard the set felt, 1–10', text: 'RPE' })]),
          showVolume ? h('th.num', { text: 'Volume' }) : null
        ];
        var table = h('table.table.set-table', [h('thead', [h('tr',
          head.concat([h('th', [h('span.sr-only', { text: 'Remove' })])]))])]);
        // These rows update in place. Redrawing the tab on every field would
        // drop the cursor each time you moved from one box to the next.
        table.appendChild(h('tbody', entry.sets.map(cardio ? cardioRow : setRow)));
        card.appendChild(h('.table-wrap', [table]));
        if (distanceHint) { refreshHint(); card.appendChild(distanceHint); }
      }
      root.appendChild(card);
    });

    /* what the session came to */
    root.appendChild(h('.grid.grid-4', { style: { marginTop: '16px' } },
      [sumTime.node, sumKcal.node, sumVolume.node, sumSets.node]));

    UI.append(lengthRow, [
      h('label', { text: 'Session length in minutes (optional)' }),
      h('input.session-length', { type: 'number', inputmode: 'numeric', min: 0, max: 600, step: 1,
        value: session.durationMin || '', placeholder: 'estimated',
        onchange: function (e) {
          var v = Math.min(600, Math.max(0, Math.round(Number(e.target.value) || 0)));
          session.durationMin = v || null;
          e.target.value = v || '';
          keep(); refreshSummary();
        } }),
      h('.hint', { text: 'Left blank, the time is estimated from your sets and the rests in your plan. ' +
        'If you timed the session, enter it here and the calories are worked out from that.' })
    ]);

    root.appendChild(h('.card', [
      lengthRow,
      h('.field', [
        h('label', { text: 'Session notes' }),
        h('textarea', { value: session.notes || '', placeholder: 'How it felt, niggles, anything to remember next time…',
          onchange: function (e) { session.notes = e.target.value; keep(); } })
      ]),
      h('details.rpe-help', { style: { marginTop: 0, marginBottom: '13px' } }, [
        h('summary', { text: 'How are the calories estimated?' }),
        h('p', { text: 'Calories = MET × your bodyweight in kg × hours. A MET is how much energy an activity ' +
          'costs compared with sitting still, taken from the Compendium of Physical Activities. ' +
          'Conditioning uses the minutes you log — and for walking and running, your pace, so a jog counts ' +
          'for more than a stroll. Lifting uses the session time (your sets plus the rests in your plan, ' +
          'unless you enter the length) at the rate for resistance training, a little higher when your RPE is high.' }),
        h('p', { text: 'It is an estimate: expect it to be within about a fifth of the real figure either way. ' +
          'Your daily calorie target already allows for training through your activity level, ' +
          'so these are not extra calories to eat back.' })
      ]),
      h('.card-head', { style: { marginBottom: 0 } }, [
        h('.spacer'),
        UI.button(session.completed ? '' : '.btn-primary', session.completed ? 'check' : null,
          session.completed ? 'Completed — reopen' : 'Mark session complete', {
            onclick: function () {
              session.completed = !session.completed;
              var prs = session.completed ? S.newRecords(session) : [];
              keep(); redraw();
              if (session.completed) {
                var b = S.sessionBurn(session);
                UI.toast((prs.length
                  ? 'Session done — new best on ' + prs.join(', ') + '.'
                  : 'Session marked complete.') +
                  (b.logged && b.kcal ? ' About ' + b.kcal.toLocaleString() + ' kcal burnt in ' + b.minutes + ' min.' : ''),
                  'good');
              }
            }
          })
      ])
    ]));

    refreshSummary();
  };

  /* The best set from the most recent earlier day this was logged: heaviest
   * for a loaded lift, most reps or longest hold otherwise. */
  function lastPerformance(entry, beforeKey) {
    var st = S.get();
    var kind = global.ExerciseData.kindOf(entry);
    var cardio = kind.measure === 'cardio';
    var field = cardio ? 'minutes' : (kind.load === 'weight' && !kind.timed) ? 'weight' : 'reps';
    var keys = Object.keys(st.workouts).filter(function (k) { return k < beforeKey; }).sort().reverse();
    for (var i = 0; i < keys.length; i++) {
      var e = st.workouts[keys[i]].entries.filter(function (en) { return en.name === entry.name; })[0];
      if (e && e.sets.length) {
        var best = e.sets.reduce(function (a, b) {
          return (Number(b[field]) || 0) > (Number(a[field]) || 0) ? b : a;
        });
        return cardio ? S.describeCardio(best, kind.dist) : S.describeSet(best, kind.timed);
      }
    }
    return null;
  }

  global.Views = Views;

}(window));
