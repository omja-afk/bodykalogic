/* views2.js — the remaining tabs, plus the import and meal-entry modals.
 * Extends the Views object created in views.js. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var PG = global.PlanGen, DG = global.DietGen;
  var EXD = global.ExerciseData, FD = global.FoodData;
  var MP = global.MealPhoto, PP = global.PlanParse;
  var Views = global.Views;
  var VI = global.ViewsInternal;
  var redraw = function () { global.App.render(); };

  /* ============================== DIET PLAN ============================== */

  Views.diet = function (root) {
    UI.clear(root);
    var st = S.get();

    if (!st.diet) {
      root.appendChild(dietSourceCard());
      root.appendChild(VI.emptyState('No diet plan yet',
        'Seven days of meals built to hit your calorie and protein targets, with every meal swappable.',
        'Build me a meal plan', function () { regenerateDiet(); }));
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
          h('label', { text: 'What do you eat?' }),
          h('.seg-group', FD.DIET_PREFS.map(function (d) {
            return h('button.seg-btn' + (diet.dietPref === d.id ? '.is-active' : ''), {
              text: d.label, onclick: function () {
                st.profile.dietPref = d.id; regenerateDiet(true);
              }
            });
          }))
        ]),
        h('div', [
          h('label', { text: 'Which cuisine?' }),
          h('.seg-group', FD.CUISINES.map(function (c) {
            return h('button.seg-btn' + (diet.cuisine === c.id ? '.is-active' : ''), {
              text: c.label, onclick: function () {
                st.profile.cuisine = c.id; regenerateDiet(true);
              }
            });
          }))
        ])
      ]),
      h('.card-head', { style: { marginTop: '14px', marginBottom: '0' } }, [
        h('button.btn.btn-sm', { text: '↻ Regenerate week', onclick: function () { regenerateDiet(); } }),
        h('button.btn.btn-sm', { text: '⬆ Import a diet', onclick: function () { Views.openDietImport(); } }),
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
    var avgP = Math.round(diet.days.reduce(function (a, d) { return a + d.totals.p; }, 0) / 7);
    if (avgP < t.protein * 0.9) {
      root.appendChild(h('.banner.is-warn', { style: { marginTop: '16px' }, html:
        '<b>This week averages ' + avgP + ' g of protein against a ' + t.protein + ' g target.</b> ' +
        'That is the honest ceiling for these meals at your calorie level — the narrower the diet and cuisine, ' +
        'the fewer protein-dense options there are. Widening the cuisine, or adding a shake, closes the gap.' }));
    }

    diet.days.forEach(function (day, di) {
      var card = h('.card', [
        h('.card-head', [
          h('h3', { text: 'Day ' + (di + 1) }),
          h('.spacer'),
          VI.macroPills(day.totals)
        ])
      ]);
      day.meals.forEach(function (meal, mi) {
        card.appendChild(mealRow(diet, day, di, meal, mi));
      });
      root.appendChild(card);
    });
  };

  function mealRow(diet, day, di, meal, mi) {
    var detail = h('div', { hidden: true });
    meal.items.forEach(function (item, ii) {
      var f = FD.food(item.food);
      if (!f) return;
      detail.appendChild(h('.item-line', [
        h('span.item-name', { text: f.name }),
        h('input', { type: 'number', value: item.qty, min: 0, step: f.unit === 'piece' ? 1 : 5,
          onchange: function (e) {
            item.qty = Number(e.target.value) || 0;
            DG.recalcDay(day); S.save(); redraw();
          } }),
        h('span.item-unit', { text: f.unit === 'piece' ? '×' : f.unit })
      ]));
    });

    var row = h('.meal-row', [
      h('.meal-main', [
        h('.meal-name', { text: FD.SLOT_LABEL[meal.slot] + ' — ' + meal.title }),
        h('.meal-meta', { text: meal.items.map(function (i) {
          var f = FD.food(i.food);
          return f ? f.name + ' ' + i.qty + (f.unit === 'piece' ? '' : f.unit) : '';
        }).filter(Boolean).join(' · ') })
      ]),
      VI.macroPills(meal.macros),
      h('button.btn.btn-sm', { text: '⇄ Swap', onclick: function () { openMealSwap(diet, di, mi); } }),
      h('button.btn.btn-sm.btn-ghost', { text: '✎', title: 'Adjust portions', onclick: function () {
        detail.hidden = !detail.hidden;
      } })
    ]);
    return h('div', [row, h('div', { style: { padding: '0 10px 10px' } }, [detail])]);
  }

  function openMealSwap(diet, dayIdx, slotIdx) {
    var meal = diet.days[dayIdx].meals[slotIdx];
    var alts = DG.alternativesForMeal(diet, dayIdx, slotIdx);
    var search = h('input', { placeholder: 'Filter ' + alts.length + ' options…' });
    var listHost = h('div');

    function render() {
      UI.clear(listHost);
      var q = search.value.trim().toLowerCase();
      var shown = q ? alts.filter(function (a) { return a.title.toLowerCase().indexOf(q) !== -1; }) : alts;
      if (!shown.length) { listHost.appendChild(h('.chart-empty', { text: 'Nothing matches.' })); return; }
      listHost.appendChild(h('.swap-list', shown.map(function (alt) {
        return h('button.swap-item', {
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
        h('p', { text: alts.length + ' other ' + meal.slot + ' options fit your preferences, ' +
                       'sorted by how close they are to this meal’s calories.' }),
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
          h('h4', { text: '📷 From a photo' }),
          h('p', { style: { fontSize: '.82rem' }, text: 'A photo of the diet chart you were given. Text is read in the browser; you correct it before saving.' }),
          h('button.btn.btn-sm', { text: 'Import from photo', onclick: function () { Views.openDietImport('photo'); } })
        ]),
        h('.day-card', [
          h('h4', { text: '📄 From a file' }),
          h('p', { style: { fontSize: '.82rem' }, text: 'A Forge export, or a plain text file with lines like "Breakfast: 3 eggs, 2 toast".' }),
          h('button.btn.btn-sm', { text: 'Import from file', onclick: function () { Views.openDietImport('file'); } })
        ]),
        h('.day-card', [
          h('h4', { text: '✨ Recommend one' }),
          h('p', { style: { fontSize: '.82rem' }, text: 'Seven different days built to your calorie and protein targets, in the cuisine you choose.' }),
          h('button.btn.btn-sm.btn-primary', { text: 'Build me a meal plan', onclick: function () { regenerateDiet(); } })
        ])
      ])
    ]);
  }

  function regenerateDiet(quiet) {
    var st = S.get(), p = st.profile;
    if (!p.age || !p.heightCm || !p.weightKg) {
      UI.toast('Fill in your age, height and weight in Profile first.', 'bad');
      global.App.go('profile');
      return;
    }
    var w = S.currentWeight();
    st.diet = DG.generate(Object.assign({}, p, { weightKg: w || p.weightKg }),
      { dietPref: p.dietPref, cuisine: p.cuisine, dislikes: p.dislikes || [] });
    S.save(); redraw();
    if (!quiet) UI.toast('Seven days of meals built.', 'good');
  }
  Views.regenerateDiet = regenerateDiet;

  /* ============================ IMPORT MODALS =========================== */

  function importModal(opts) {
    var textarea = h('textarea', { placeholder: opts.placeholder, rows: 12 });
    var preview = h('div');
    var status = h('.hint');
    var fileInput = h('input', { type: 'file', accept: opts.accept, hidden: true });
    var photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });

    function handleFile(file) {
      status.textContent = 'Reading ' + file.name + '…';
      PP.readFile(file).then(function (res) {
        if (res.kind === 'json') {
          opts.onJson(res.data, close);
          return;
        }
        if (res.kind === 'text') {
          textarea.value = res.text;
          status.textContent = 'Loaded ' + file.name + '. Check it below, then import.';
          return;
        }
        // image
        UI.clear(preview);
        preview.appendChild(h('img.photo-preview', { src: res.photo.dataUrl, alt: 'the plan you uploaded' }));
        status.textContent = 'Reading the text out of the photo… the OCR engine downloads once (about 10 MB) and the image never leaves this machine.';
        PP.ocr(res.photo.dataUrl, function (p, st) {
          status.textContent = (st || 'working') + ' — ' + Math.round(p * 100) + '%';
        }).then(function (text) {
          textarea.value = text;
          status.textContent = text.trim()
            ? 'Text read from the photo. OCR makes mistakes — fix anything wrong below before importing.'
            : 'No text could be read from that photo. Type the plan in from the image above.';
        }).catch(function (e) {
          status.textContent = e.message;
        });
      }).catch(function (e) { status.textContent = e.message; });
    }

    fileInput.addEventListener('change', function (e) { if (e.target.files[0]) handleFile(e.target.files[0]); });
    photoInput.addEventListener('change', function (e) { if (e.target.files[0]) handleFile(e.target.files[0]); });

    var close = UI.modal({
      title: opts.title,
      body: [
        h('.card-head', { style: { marginBottom: '12px' } }, [
          h('button.btn.btn-sm', { text: '📷 Choose a photo', onclick: function () { photoInput.click(); } }),
          h('button.btn.btn-sm', { text: '📄 Choose a file', onclick: function () { fileInput.click(); } }),
          fileInput, photoInput
        ]),
        preview,
        h('.field', [h('label', { text: opts.label }), textarea]),
        status,
        h('.hint', { text: opts.hint })
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
    importModal({
      title: 'Import a workout plan',
      autoOpen: autoOpen,
      accept: '.json,.txt,.md,.csv,text/*,image/*',
      label: 'Plan text',
      placeholder: 'Day 1 — Push\nBench Press 4x8 60kg\nIncline DB Press 3x10\n\nDay 2 — Pull\nDeadlift 4x5 100kg\n...',
      hint: 'Day headers and set notation (4x8, 3 x 10-12, @60kg) are understood. Anything that cannot be read is kept as a note on the day rather than dropped.',
      onJson: function (data, close) {
        if (data.plan) {
          S.get().plan = data.plan; S.save(); redraw();
          UI.toast('Plan imported from the export.', 'good'); close();
        } else UI.toast('That JSON has no plan in it.', 'bad');
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
        UI.toast('Imported ' + parsed.stats.days + ' days, ' + parsed.stats.exercises + ' exercises — ' +
                 parsed.stats.matched + ' matched to the library.', 'good');
        close();
      }
    });
  };

  Views.openDietImport = function (autoOpen) {
    importModal({
      title: 'Import a diet plan',
      autoOpen: autoOpen,
      accept: '.json,.txt,.md,.csv,text/*,image/*',
      label: 'Diet text',
      placeholder: 'Breakfast: 3 eggs, 2 slices bread, 1 banana\nLunch: 2 roti, 1 katori dal, 150g chicken\nSnack: whey shake\nDinner: 3 roti, paneer sabzi',
      hint: 'Lines starting with a meal name are read as that meal. Quantities understand household portions — rotis, katoris, a glass of milk — and grams.',
      onJson: function (data, close) {
        if (data.diet) {
          S.get().diet = data.diet; S.save(); redraw();
          UI.toast('Diet plan imported from the export.', 'good'); close();
        } else UI.toast('That JSON has no diet plan in it.', 'bad');
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
            return { day: i, meals: meals.map(function (m) { return JSON.parse(JSON.stringify(m)); }), totals: totals };
          }),
          source: 'imported', updatedAt: Date.now()
        };
        S.save(); redraw();
        UI.toast('Imported ' + meals.length + ' meals' +
                 (parsed.unmatched.length ? ' — ' + parsed.unmatched.length + ' items were not recognised' : '') + '.',
                 parsed.unmatched.length ? 'bad' : 'good');
        close();
      }
    });
  };

  /* ========================== TODAY'S SESSION =========================== */

  Views.log = function (root) {
    UI.clear(root);
    var st = S.get();
    if (!st.plan) {
      root.appendChild(VI.emptyState('No plan to log against',
        'Build or import a workout plan first and the day’s session appears here.',
        'Go to workout plan', function () { global.App.go('plan'); }));
      return;
    }

    var dateKey = global.App.logDate || UI.todayKey();
    var session = S.sessionFor(dateKey, true);

    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: session.dayName }),
        h('span.card-sub', { text: UI.prettyDate(dateKey) }),
        h('.spacer'),
        h('button.btn.btn-sm', { text: '‹ Previous day', onclick: function () {
          global.App.logDate = UI.addDays(dateKey, -1); redraw();
        } }),
        h('button.btn.btn-sm', { text: 'Next day ›', disabled: dateKey >= UI.todayKey(), onclick: function () {
          global.App.logDate = UI.addDays(dateKey, 1); redraw();
        } }),
        h('select', { style: { maxWidth: '190px' }, onchange: function (e) {
          var idx = Number(e.target.value);
          session.dayIndex = idx;
          session.dayName = st.plan.days[idx].name;
          session.entries = st.plan.days[idx].slots.map(function (slot) {
            var prior = session.entries.filter(function (en) { return en.name === slot.name; })[0];
            return prior || { exId: slot.exId, name: slot.name, pattern: slot.pattern,
                              targetSets: slot.sets, targetReps: slot.reps, sets: [] };
          });
          S.save(); redraw();
        } }, st.plan.days.map(function (d, i) {
          return h('option', { value: i, selected: i === session.dayIndex, text: d.name });
        }))
      ]),
      h('.card-sub', { text: 'Volume so far: ' + Math.round(S.sessionVolume(session)).toLocaleString() + ' kg' })
    ]));

    session.entries.forEach(function (entry, ei) {
      var card = h('.card');
      var lastTime = lastPerformance(entry.name, dateKey);
      card.appendChild(h('.card-head', [
        h('h3', { text: entry.name }),
        h('span.card-sub', { text: 'target ' + entry.targetSets + ' × ' + entry.targetReps +
          (lastTime ? ' · last time ' + lastTime : '') }),
        h('.spacer'),
        h('button.btn.btn-sm', { text: '+ Add set', onclick: function () {
          var prev = entry.sets[entry.sets.length - 1];
          entry.sets.push({ reps: prev ? prev.reps : parseInt(entry.targetReps, 10) || 8,
                            weight: prev ? prev.weight : '', rpe: '' });
          S.save(); redraw();
        } })
      ]));

      if (!entry.sets.length) {
        card.appendChild(h('.hint', { text: 'No sets logged yet.' }));
      } else {
        var table = h('table.table', [h('thead', [h('tr', [
          h('th', { text: 'Set' }), h('th', { text: 'Weight (kg)' }),
          h('th', { text: 'Reps' }), h('th', { text: 'RPE' }),
          h('th.num', { text: 'Volume' }), h('th', { text: '' })
        ])])]);
        var tbody = h('tbody');
        entry.sets.forEach(function (set, si) {
          tbody.appendChild(h('tr', [
            h('td', { text: si + 1 }),
            h('td', [h('input', { type: 'number', value: set.weight, step: 0.5, min: 0, style: { width: '96px' },
              onchange: function (e) { set.weight = e.target.value; S.save(); redraw(); } })]),
            h('td', [h('input', { type: 'number', value: set.reps, min: 0, style: { width: '82px' },
              onchange: function (e) { set.reps = e.target.value; S.save(); redraw(); } })]),
            h('td', [h('input', { type: 'number', value: set.rpe, min: 1, max: 10, step: 0.5, style: { width: '72px' },
              onchange: function (e) { set.rpe = e.target.value; S.save(); } })]),
            h('td.num', { text: Math.round((Number(set.weight) || 0) * (Number(set.reps) || 0)).toLocaleString() }),
            h('td', [h('button.btn.btn-sm.btn-ghost.btn-danger', { text: '✕', onclick: function () {
              entry.sets.splice(si, 1); S.save(); redraw();
            } })])
          ]));
        });
        table.appendChild(tbody);
        card.appendChild(h('.table-wrap', [table]));
      }
      root.appendChild(card);
    });

    root.appendChild(h('.card', [
      h('.field', [
        h('label', { text: 'Session notes' }),
        h('textarea', { value: session.notes || '', placeholder: 'How it felt, niggles, anything to remember next time…',
          onchange: function (e) { session.notes = e.target.value; S.save(); } })
      ]),
      h('.card-head', { style: { marginBottom: 0 } }, [
        h('.spacer'),
        h('button.btn' + (session.completed ? '' : '.btn-primary'), {
          text: session.completed ? '✓ Completed — reopen' : 'Mark session complete',
          onclick: function () {
            session.completed = !session.completed;
            if (session.completed) {
              var prs = S.harvestMaxes(session);
              S.save(); redraw();
              UI.toast(prs.length
                ? 'Session done — ' + prs.length + ' new personal record' + (prs.length > 1 ? 's' : '') + ' logged.'
                : 'Session marked complete.', 'good');
            } else { S.save(); redraw(); }
          }
        })
      ])
    ]));
  };

  function lastPerformance(name, beforeKey) {
    var st = S.get();
    var keys = Object.keys(st.workouts).filter(function (k) { return k < beforeKey; }).sort().reverse();
    for (var i = 0; i < keys.length; i++) {
      var e = st.workouts[keys[i]].entries.filter(function (en) { return en.name === name; })[0];
      if (e && e.sets.length) {
        var best = e.sets.reduce(function (a, b) {
          return (Number(b.weight) || 0) > (Number(a.weight) || 0) ? b : a;
        });
        return best.weight + 'kg × ' + best.reps;
      }
    }
    return null;
  }

  global.Views = Views;

}(window));
