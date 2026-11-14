/* views.js — one renderer per tab. Each takes the view's root element, clears it
 * and rebuilds; there is no diffing, because the data is small and a full redraw
 * is simpler to reason about than partial updates. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var PG = global.PlanGen, DG = global.DietGen;
  var EXD = global.ExerciseData, FD = global.FoodData;
  var MP = global.MealPhoto, PP = global.PlanParse;

  var Views = {};
  /* Re-render the active tab. This defaulted to a no-op with a setRedraw() hook
   * that nothing ever called, so every redraw() in this file — the swap, the
   * regenerate, the whole of Home — silently did nothing and the page only
   * updated when something else happened to repaint it. */
  var redraw = function () { global.App.render(); };
  Views.setRedraw = function (fn) { redraw = fn; };

  /* ---------------------------------------------------------- small pieces */

  function stat(label, value, unit, meta, accent) {
    return h('.stat', { style: { '--stat-accent': accent || 'var(--series-1)' } }, [
      h('.stat-label', { text: label }),
      h('.stat-value', [String(value), unit ? h('small', { text: unit }) : null]),
      meta ? h('.stat-meta', meta) : null
    ]);
  }

  function macroPills(m) {
    return h('.macro-pills', [
      h('span.macro-pill.k', { text: Math.round(m.kcal) + ' kcal' }),
      h('span.macro-pill.p', { text: 'P ' + C.fmt(m.p, 0) + 'g' }),
      h('span.macro-pill.c', { text: 'C ' + C.fmt(m.c, 0) + 'g' }),
      h('span.macro-pill.f', { text: 'F ' + C.fmt(m.f, 0) + 'g' })
    ]);
  }

  function chartCard(title, sub, build, actions) {
    var host = h('.chart-host');
    var card = h('.card', [
      h('.card-head', [h('h3', { text: title }), sub ? h('span.card-sub', { text: sub }) : null,
                       h('.spacer'), actions || null]),
      host
    ]);
    // Build after insertion so getBoundingClientRect inside the chart is real.
    setTimeout(function () { build(host); }, 0);
    return card;
  }

  function emptyState(title, msg, btnLabel, onClick) {
    return h('.card', [h('.empty-state', [
      h('h3', { text: title }),
      h('p', { text: msg }),
      btnLabel ? h('button.btn.btn-primary', { text: btnLabel, onclick: onClick }) : null
    ])]);
  }

  /* ================================ HOME ================================ */

  /* The entrance. It is never a form: the page opens on something you can read,
   * and setting up is one card inside it rather than a wizard standing in front
   * of it. Before there is a profile it leads with quick setup and shows the
   * shape of the dashboard behind it; afterwards it IS the dashboard.
   */
  function profileReady(p) {
    return !!(p && p.age && p.heightCm && p.weightKg);
  }

  Views.home = function (root) {
    UI.clear(root);
    var st = S.get(), p = st.profile;
    var ready = profileReady(p);

    root.appendChild(heroCard(ready));
    root.appendChild(statRow(ready));

    if (!ready) {
      root.appendChild(quickSetupCard());
      root.appendChild(whatYouGetCard());
      return;
    }

    root.appendChild(bmiCard());
    root.appendChild(todayGrid());
    root.appendChild(weightTrendCard());
  };

  function heroCard(ready) {
    var st = S.get(), p = st.profile;
    var now = new Date();
    var hour = now.getHours();
    var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var goal = (PG.GOALS.filter(function (g) { return g.id === p.goal; })[0] || {}).label;

    return h('.card.hero', [
      h('.card-head', { style: { marginBottom: '6px' } }, [
        h('div', [
          h('.stat-label', { text: ready ? 'Overview' : 'Welcome' }),
          h('h2', { text: ready ? greeting + (p.name ? ', ' + p.name : '') : 'Welcome to Forge' }),
          h('p', { style: { margin: '6px 0 0' }, text: ready
            ? UI.prettyDate(UI.todayKey()) + ' · ' + S.streak() + ' day streak'
            : 'A gym and diet tracker that keeps everything on your own machine. Nothing is sent anywhere, and there is no account to make.' })
        ]),
        h('.spacer'),
        ready && goal ? h('span.chip.chip-accent', { text: goal }) : null
      ])
    ]);
  }

  function statRow(ready) {
    var st = S.get();
    var w = S.currentWeight(), bmi = S.currentBMI();
    var band = DG.bmiBand(bmi);
    var t = ready ? S.targets() : null;
    var today = UI.todayKey();
    var totals = S.nutritionTotals(today);
    var sessions = Object.keys(st.workouts).filter(function (k) { return st.workouts[k].completed; }).length;

    var bodyKeys = Object.keys(st.body).sort();
    var monthAgo = UI.addDays(today, -30);
    var past = bodyKeys.filter(function (k) { return k <= monthAgo; }).pop();
    var delta = (past && w) ? Math.round((w - st.body[past].weightKg) * 10) / 10 : null;
    var goalDown = st.profile.goal === 'fat_loss';
    var deltaCls = delta == null || delta === 0 ? 'delta-flat'
      : ((delta < 0) === goalDown ? 'delta-up' : 'delta-down');

    return h('.grid.grid-4', { style: { marginTop: '16px' } }, [
      stat('Weight', w ? C.fmt(w, 1) : '—', w ? ' kg' : '',
        delta != null
          ? [h('span.' + deltaCls, { text: (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '◆ ') + C.fmt(delta, 1) + ' kg' }),
             h('span', { text: 'in 30 days' })]
          : [h('span', { text: w ? 'first weigh-in recorded' : 'add your weight to begin' })],
        'var(--series-1)'),
      stat('BMI', bmi ? C.fmt(bmi, 1) : '—', '',
        bmi ? [h('span.chip.chip-' + (band.tone === 'good' ? 'good' : band.tone === 'bad' ? 'bad' : 'warn'),
                 { text: band.label })]
            : [h('span', { text: 'needs height and weight' })],
        'var(--series-7)'),
      stat('Protein today', ready ? C.fmt(totals.p, 0) : '—', ready ? ' g' : '',
        ready
          ? [h('span', { text: 'target ' + t.protein + ' g' }),
             totals.p >= t.protein ? h('span.chip.chip-good', { text: 'hit' }) : null]
          : [h('span', { text: 'set up to get a target' })],
        'var(--series-3)'),
      stat('Sessions', sessions, '',
        [h('span', { text: sessions ? 'completed all time' : 'none logged yet' })], 'var(--series-4)')
    ]);
  }

  /* Quick setup: the same questions the guided wizard asks, on one card, so the
   * app is usable in about twenty seconds. The wizard is still there for anyone
   * who prefers to be walked through it. */
  function quickSetupCard() {
    var st = S.get(), p = st.profile;
    var f = {};
    function fld(key, label, node) { f[key] = node; return h('div', [h('label', { text: label }), node]); }

    var card = h('.card', { style: { marginTop: '16px' } }, [
      h('.card-head', [
        h('h3', { text: 'Set yourself up' }),
        h('span.card-sub', { text: 'about twenty seconds — everything stays editable' }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-ghost', { text: 'Walk me through it instead', onclick: function () {
          global.App.guidedSetup();
        } })
      ]),
      h('.field-row', [
        fld('name', 'Name (optional)', h('input', { value: p.name || '', placeholder: 'optional' })),
        fld('sex', 'Sex', h('select', [
          h('option', { value: 'male', selected: p.sex === 'male', text: 'Male' }),
          h('option', { value: 'female', selected: p.sex === 'female', text: 'Female' })
        ])),
        fld('age', 'Age', h('input', { type: 'number', min: 13, max: 100, value: p.age || '', placeholder: 'years' })),
        fld('heightCm', 'Height', h('input', { type: 'number', min: 100, max: 230, value: p.heightCm || '', placeholder: 'cm' })),
        fld('weightKg', 'Weight', h('input', { type: 'number', step: 0.1, min: 25, max: 300, value: p.weightKg || '', placeholder: 'kg' }))
      ]),
      h('.field-row', [
        fld('goal', 'Goal', h('select', PG.GOALS.map(function (g) {
          return h('option', { value: g.id, selected: p.goal === g.id, text: g.label });
        }))),
        fld('experience', 'Experience', h('select', PG.EXPERIENCE.map(function (g) {
          return h('option', { value: g.id, selected: p.experience === g.id, text: g.label });
        }))),
        fld('daysPerWeek', 'Days a week', h('select', [2, 3, 4, 5, 6].map(function (d) {
          return h('option', { value: d, selected: Number(p.daysPerWeek) === d, text: d + ' days' });
        }))),
        fld('activity', 'Daily activity', h('select', DG.ACTIVITY.map(function (a) {
          return h('option', { value: a.id, selected: p.activity === a.id, text: a.label });
        })))
      ]),
      h('.field-row', [
        fld('equipment', 'Where you train', h('select', Object.keys(EXD.EQUIPMENT_PROFILES).map(function (id) {
          return h('option', { value: id, selected: p.equipment === id,
                               text: EXD.EQUIPMENT_PROFILES[id].label });
        }))),
        fld('dietPref', 'Diet', h('select', FD.DIET_PREFS.map(function (d) {
          return h('option', { value: d.id, selected: p.dietPref === d.id, text: d.label });
        }))),
        fld('cuisine', 'Cuisine', h('select', FD.CUISINES.map(function (c) {
          return h('option', { value: c.id, selected: p.cuisine === c.id, text: c.label });
        })))
      ]),
      h('.card-head', { style: { marginTop: '14px', marginBottom: 0 } }, [
        h('button.btn.btn-primary', { text: 'Build my plan →', onclick: function () {
          var age = Number(f.age.value), hgt = Number(f.heightCm.value), wgt = Number(f.weightKg.value);
          if (!age || !hgt || !wgt) {
            UI.toast('Age, height and weight are needed to work out your targets.', 'bad');
            (!age ? f.age : !hgt ? f.heightCm : f.weightKg).focus();
            return;
          }
          p.name = f.name.value.trim();
          p.sex = f.sex.value;
          p.age = age; p.heightCm = hgt; p.weightKg = wgt;
          p.goal = f.goal.value;
          p.experience = f.experience.value;
          p.daysPerWeek = Number(f.daysPerWeek.value);
          p.activity = f.activity.value;
          p.equipment = f.equipment.value;
          p.dietPref = f.dietPref.value;
          p.cuisine = f.cuisine.value;
          // The weight entered here is also the first weigh-in, so the trend
          // starts today rather than whenever they next remember to record one.
          if (!Object.keys(st.body).length) {
            st.body[UI.todayKey()] = { weightKg: wgt, notes: 'starting weight' };
          }
          st.plan = PG.generate(p);
          st.diet = DG.generate(p, { dietPref: p.dietPref, cuisine: p.cuisine, dislikes: [] });
          st.settings.onboarded = true;
          S.save(); redraw();
          UI.toast('Your plan and meals are ready.', 'good');
        } }),
        h('.spacer'),
        h('span.card-sub', { text: 'Nothing is sent anywhere. You choose where it is saved in Profile & data.' })
      ])
    ]);
    return card;
  }

  function whatYouGetCard() {
    return h('.grid.grid-3', { style: { marginTop: '16px' } }, [
      h('.card', [
        h('h3', { text: 'A plan you can actually change' }),
        h('p', { style: { fontSize: '.86rem', marginTop: '8px' },
          text: EXD.EXERCISES.length + ' movements, with a gym / home-dumbbells / bodyweight switch. ' +
                'Every exercise has a swap list — 60 to 120 alternatives in a gym, 40+ on bodyweight alone.' }),
        h('button.btn.btn-sm', { text: 'Import a plan I already have',
          onclick: function () { Views.openPlanImport(); } })
      ]),
      h('.card', [
        h('h3', { text: 'Meals that hit your protein' }),
        h('p', { style: { fontSize: '.86rem', marginTop: '8px' },
          text: FD.MEALS.length + ' meal templates across Indian and global cuisines, vegan through non-veg. ' +
                'Seven different days, each meal swappable for one with similar calories.' }),
        h('button.btn.btn-sm', { text: 'Import a diet chart',
          onclick: function () { Views.openDietImport(); } })
      ]),
      h('.card', [
        h('h3', { text: 'Your data, on your disk' }),
        h('p', { style: { fontSize: '.86rem', marginTop: '8px' },
          text: 'Pick a folder once and every change is written there as plain JSON, with dated backups. ' +
                'No account, no server, nothing to cancel.' }),
        h('button.btn.btn-sm', { text: 'Choose where it saves',
          onclick: function () { global.App.go('profile'); } })
      ])
    ]);
  }

  /* BMI needs its bands to mean anything, so it gets the scale, not just a number. */
  function bmiCard() {
    var st = S.get();
    var bmi = S.currentBMI(), w = S.currentWeight();
    var band = DG.bmiBand(bmi);
    var t = S.targets();

    var host = h('.chart-host');
    setTimeout(function () {
      C.gauge(host, {
        value: bmi, min: 15, max: 40,
        bands: [
          { to: 18.5, label: 'Underweight', color: 'var(--warning)' },
          { to: 25,   label: 'Healthy',     color: 'var(--good)' },
          { to: 30,   label: 'Overweight',  color: 'var(--serious)' },
          { to: 40,   label: 'Obese',       color: 'var(--critical)' }
        ]
      });
    }, 0);

    var healthyLow = st.profile.heightCm ? (18.5 * Math.pow(st.profile.heightCm / 100, 2)) : null;
    var healthyHigh = st.profile.heightCm ? (24.9 * Math.pow(st.profile.heightCm / 100, 2)) : null;

    return h('.card', { style: { marginTop: '16px' } }, [
      h('.card-head', [
        h('h3', { text: 'Body mass index' }),
        h('span.card-sub', { text: bmi ? band.label : 'add a weigh-in to see this' }),
        h('.spacer'),
        h('button.btn.btn-sm', { text: '+ Weigh in', onclick: function () { global.App.go('body'); } })
      ]),
      host,
      h('.hint', { style: { marginTop: '10px' }, text: healthyLow
        ? 'At ' + st.profile.heightCm + ' cm, the healthy BMI range is about ' +
          C.fmt(healthyLow, 1) + '–' + C.fmt(healthyHigh, 1) + ' kg' +
          (w ? ' — you are at ' + C.fmt(w, 1) + ' kg.' : '.') +
          ' BMI is a rough screening measure: it does not know muscle from fat, so a heavily trained person reads high.'
        : 'Add your height in Profile & data to see your range.' }),
      h('.hint', { text: 'Daily targets from these numbers: ' + t.kcal + ' kcal, ' + t.protein +
                         ' g protein, ' + t.carbs + ' g carbs, ' + t.fat + ' g fat, ' +
                         (t.waterMl / 1000).toFixed(1) + ' L water.' })
    ]);
  }

  function todayGrid() {
    var st = S.get(), today = UI.todayKey();
    var t = S.targets();
    var totals = S.nutritionTotals(today);
    var session = st.workouts[today];
    var planned = S.plannedDayFor(today);
    var grid = h('.grid.grid-2', { style: { marginTop: '16px' } });

    var sessionCard = h('.card', [
      h('.card-head', [
        h('h3', { text: "Today's session" }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-primary', {
          text: session && session.completed ? 'Review' : 'Open log',
          onclick: function () { global.App.go('log'); } })
      ])
    ]);
    if (!st.plan) {
      sessionCard.appendChild(h('p', { text: 'No workout plan yet.' }));
      sessionCard.appendChild(h('button.btn.btn-sm', { text: 'Build one',
        onclick: function () { global.App.go('plan'); } }));
    } else if (planned) {
      sessionCard.appendChild(h('.day-head', [
        h('h4', { text: planned.day.name }),
        h('span.card-sub', { text: planned.day.focus })
      ]));
      planned.day.slots.slice(0, 6).forEach(function (slot) {
        var logged = session && (session.entries.filter(function (e) { return e.name === slot.name; })[0] || {}).sets;
        sessionCard.appendChild(h('.ex-row', [
          h('.ex-main', [
            h('.ex-name', { text: slot.name }),
            h('.ex-meta', { text: slot.sets + ' × ' + slot.reps + (slot.rest ? ' · ' + slot.rest + 's rest' : '') })
          ]),
          logged && logged.length
            ? h('span.chip.chip-good', { text: logged.length + ' set' + (logged.length > 1 ? 's' : '') }) : null
        ]));
      });
      if (planned.day.slots.length > 6) {
        sessionCard.appendChild(h('.card-sub', { text: '+ ' + (planned.day.slots.length - 6) + ' more' }));
      }
    }
    grid.appendChild(sessionCard);

    var foodCard = h('.card', [
      h('.card-head', [
        h('h3', { text: "Today's food" }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-primary', { text: 'Log a meal',
          onclick: function () { global.App.go('nutrition'); } })
      ])
    ]);
    if (!st.diet) {
      foodCard.appendChild(h('p', { text: 'No diet plan yet.' }));
      foodCard.appendChild(h('button.btn.btn-sm', { text: 'Build one',
        onclick: function () { global.App.go('diet'); } }));
    } else {
      var ring = h('.ring-row');
      [['Calories', totals.kcal, t.kcal, '', 'var(--series-1)'],
       ['Protein', totals.p, t.protein, 'g', 'var(--series-3)'],
       ['Carbs', totals.c, t.carbs, 'g', 'var(--series-4)'],
       ['Fat', totals.f, t.fat, 'g', 'var(--series-5)']].forEach(function (r) {
        var cell = h('.ring-cell');
        ring.appendChild(cell);
        setTimeout(function () {
          C.ring(cell, { value: r[1], max: r[2], unit: r[3], label: r[0], color: r[4], size: 104, dp: 0 });
        }, 0);
      });
      foodCard.appendChild(ring);
      var planIdx = ((UI.daysBetween(UI.todayKey(new Date(st.createdAt)), today) % 7) + 7) % 7;
      var dietDay = st.diet.days[planIdx];
      if (dietDay) {
        foodCard.appendChild(h('.card-sub', { style: { marginTop: '12px' },
          text: 'Planned today: ' + dietDay.meals.map(function (m) { return m.title; }).join(' · ') }));
      }
    }
    grid.appendChild(foodCard);
    return grid;
  }

  function weightTrendCard() {
    var st = S.get(), today = UI.todayKey();
    return chartCard('Weight trend', 'last 90 days', function (host) {
      var pts = [];
      for (var i = 89; i >= 0; i--) {
        var k = UI.addDays(today, -i);
        var b = st.body[k];
        pts.push({ x: UI.shortDate(k), y: b && b.weightKg ? Number(b.weightKg) : null });
      }
      var any = pts.some(function (p) { return p.y != null; });
      C.line(host, {
        series: any ? [{ name: 'Weight', points: carryForward(pts) }] : [],
        unit: ' kg', dp: 1, area: true, height: 250,
        target: st.profile.targetWeightKg ? Number(st.profile.targetWeightKg) : null,
        targetLabel: 'goal',
        empty: 'No weigh-ins yet. Add one in the Body tab and this fills in.'
      });
    });
  }

  Views.profileReady = profileReady;

  /* A weight chart with one dot a week looks broken. Carry the last reading
   * forward so the line is continuous, but only between real readings — never
   * past the final one, which would invent a plateau. */
  function carryForward(points) {
    var last = null, lastIdx = -1;
    var out = points.map(function (p) { return { x: p.x, y: p.y }; });
    out.forEach(function (p, i) {
      if (p.y != null) { last = p.y; lastIdx = i; }
      else if (last != null) p.y = last;
    });
    for (var i = lastIdx + 1; i < out.length; i++) out[i].y = null;
    return out;
  }

  /* ============================= WORKOUT PLAN ============================ */

  Views.plan = function (root) {
    UI.clear(root);
    var st = S.get();

    if (!st.plan) {
      root.appendChild(planSourceCard());
      root.appendChild(emptyState('No workout plan yet',
        'Build one from your answers, import the plan you already follow, or write it by hand.',
        'Build me a plan', function () { regeneratePlan(); }));
      return;
    }

    var plan = st.plan;

    /* equipment switch — the gym / home question, kept at the top */
    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: 'Training setup' }),
        h('.spacer'),
        h('span.card-sub', { text: plan.source === 'imported' ? 'imported plan' : 'generated · ' + plan.daysPerWeek + ' days a week' })
      ]),
      h('.field-row', [
        h('div', [
          h('label', { text: 'Where are you training?' }),
          h('.seg-group', Object.keys(EXD.EQUIPMENT_PROFILES).map(function (id) {
            var p = EXD.EQUIPMENT_PROFILES[id];
            return h('button.seg-btn' + (plan.equipment === id ? '.is-active' : ''), {
              text: p.label,
              onclick: function () {
                PG.reequip(plan, id, st.profile.avoid || []);
                st.profile.equipment = id;
                S.save(); redraw();
                UI.toast('Plan switched to ' + p.label.toLowerCase() + ' — movements swapped to what you have.');
              }
            });
          }))
        ]),
        h('div', [
          h('label', { text: 'Pool available here' }),
          h('p', { style: { margin: 0, fontSize: '.84rem' },
            text: EXD.pool(plan.equipment, st.profile.avoid || []).length + ' of ' +
                  EXD.EXERCISES.length + ' movements' })
        ])
      ]),
      h('.card-head', { style: { marginTop: '14px', marginBottom: 0 } }, [
        h('button.btn.btn-sm', { text: '↻ Regenerate', onclick: function () { regeneratePlan(); } }),
        h('button.btn.btn-sm', { text: '⬆ Import a plan', onclick: function () { Views.openPlanImport(); } }),
        h('button.btn.btn-sm', { text: '+ Add day', onclick: function () {
          plan.days.push({ name: 'Day ' + (plan.days.length + 1), focus: '', slots: [], notes: '' });
          S.save(); redraw();
        } })
      ])
    ]));

    plan.days.forEach(function (day, di) {
      var card = h('.card', [
        h('.card-head', [
          h('input', { value: day.name, style: { fontWeight: '650', maxWidth: '220px' },
            onchange: function (e) { day.name = e.target.value; S.save(); } }),
          h('input', { value: day.focus || '', placeholder: 'focus (optional)',
            style: { maxWidth: '200px', fontSize: '.8rem' },
            onchange: function (e) { day.focus = e.target.value; S.save(); } }),
          h('.spacer'),
          h('span.card-sub', { text: day.slots.length + ' exercises' }),
          h('button.btn.btn-sm.btn-danger', { text: 'Remove day', onclick: function () {
            UI.confirm({ title: 'Remove ' + day.name + '?', message: 'This removes the day from your plan. Logged sessions are not affected.', danger: true, confirmLabel: 'Remove' })
              .then(function (ok) { if (ok) { plan.days.splice(di, 1); S.save(); redraw(); } });
          } })
        ])
      ]);

      day.slots.forEach(function (slot, si) {
        card.appendChild(exerciseRow(plan, day, di, slot, si));
      });

      card.appendChild(h('.card-head', { style: { marginTop: '10px', marginBottom: 0 } }, [
        h('button.btn.btn-sm', { text: '+ Add exercise', onclick: function () {
          openSwapModal(plan, di, null, 'Add an exercise to ' + day.name);
        } })
      ]));
      if (day.notes) card.appendChild(h('.hint', { text: day.notes }));
      root.appendChild(card);
    });
  };

  function exerciseRow(plan, day, di, slot, si) {
    var st = S.get();
    var best = slot.exId ? S.bestMax(slot.exId) : null;
    return h('.ex-row', [
      h('.ex-main', [
        h('.ex-name', { text: slot.name }),
        h('.ex-meta', { text: slot.sets + ' × ' + slot.reps +
          (slot.rest ? ' · ' + slot.rest + 's rest' : '') +
          (slot.weight ? ' · ' + slot.weight + (slot.weightUnit || 'kg') : '') +
          (best ? ' · best ' + best.weight + 'kg × ' + best.reps : '') +
          (slot.importedAs ? ' · imported as "' + slot.importedAs + '"' : '') })
      ]),
      h('span.ex-pattern', { text: EXD.PATTERN_LABEL[slot.pattern] || slot.pattern }),
      h('button.btn.btn-sm', {
        text: '⇄ Swap',
        title: 'Show alternatives for this slot',
        onclick: function () { openSwapModal(plan, di, si); }
      }),
      h('button.btn.btn-sm.btn-ghost', { text: '✎', title: 'Edit sets and reps', onclick: function () {
        editSlot(plan, slot);
      } }),
      h('button.btn.btn-sm.btn-ghost.btn-danger', { text: '✕', title: 'Remove', onclick: function () {
        day.slots.splice(si, 1); S.save(); redraw();
      } })
    ]);
  }

  function editSlot(plan, slot) {
    var sets = h('input', { type: 'number', value: slot.sets, min: 1, max: 12 });
    var reps = h('input', { value: slot.reps });
    var rest = h('input', { type: 'number', value: slot.rest || 90, min: 0, max: 600, step: 15 });
    UI.modal({
      title: slot.name,
      body: h('.field-row', [
        h('div', [h('label', { text: 'Sets' }), sets]),
        h('div', [h('label', { text: 'Reps' }), reps]),
        h('div', [h('label', { text: 'Rest (seconds)' }), rest])
      ]),
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: function () {
        slot.sets = Number(sets.value) || slot.sets;
        slot.reps = reps.value || slot.reps;
        slot.rest = Number(rest.value);
        S.save(); redraw();
      } }]
    });
  }

  /* The swap list: every alternative for the slot, grouped by how close it is. */
  function openSwapModal(plan, dayIdx, slotIdx, title) {
    var st = S.get();
    var day = plan.days[dayIdx];
    var avoid = st.profile.avoid || [];
    var alts, current = null;

    if (slotIdx == null) {
      alts = EXD.pool(plan.equipment, avoid).map(function (e) {
        var c = Object.create(e); c.tier = 'direct'; return c;
      });
    } else {
      current = day.slots[slotIdx];
      alts = PG.alternativesForSlot(plan, dayIdx, slotIdx, avoid);
    }

    var search = h('input', { placeholder: 'Filter ' + alts.length + ' movements…', autofocus: true });
    var listHost = h('div');

    function render() {
      UI.clear(listHost);
      var q = search.value.trim().toLowerCase();
      var shown = q ? alts.filter(function (a) {
        return a.name.toLowerCase().indexOf(q) !== -1 ||
               a.primary.toLowerCase().indexOf(q) !== -1;
      }) : alts;

      if (!shown.length) {
        listHost.appendChild(h('.chart-empty', { text: 'Nothing matches "' + search.value + '".' }));
        return;
      }
      var tiers = [
        ['direct', slotIdx == null ? 'All movements you can do here' : 'Same movement pattern'],
        ['muscle', 'Same muscle, different pattern'],
        ['related', 'Related — same muscle group']
      ];
      tiers.forEach(function (t) {
        var group = shown.filter(function (a) { return a.tier === t[0]; });
        if (!group.length) return;
        listHost.appendChild(h('.swap-tier', { text: t[1] + ' · ' + group.length }));
        listHost.appendChild(h('.swap-list', group.map(function (alt) {
          return h('button.swap-item', {
            onclick: function () {
              if (slotIdx == null) {
                var rx = PG.GOAL_RX[plan.goal] || PG.GOAL_RX.muscle;
                var p = alt.compound ? rx.compound : rx.iso;
                day.slots.push({ exId: alt.id, name: alt.name, pattern: alt.pattern,
                                 sets: p.sets, reps: p.reps[0] + '-' + p.reps[1], rest: p.rest, note: '' });
              } else {
                PG.applySwap(plan, dayIdx, slotIdx, alt.id);
              }
              S.save(); redraw();
              UI.toast(slotIdx == null ? alt.name + ' added' : 'Swapped to ' + alt.name, 'good');
              close();
            }
          }, [
            h('span', { text: alt.name }),
            h('small', { text: alt.primary + ' · ' + alt.equip.join('/') + (alt.compound ? ' · compound' : '') })
          ]);
        })));
      });
    }

    search.addEventListener('input', render);
    var close = UI.modal({
      title: title || ('Alternatives for ' + (current ? current.name : 'this slot')),
      body: [
        h('p', { text: slotIdx == null
          ? 'Pick anything your equipment allows.'
          : alts.length + ' alternatives available with your current setup, closest first.' }),
        h('.field', [search]),
        listHost
      ]
    });
    render();
  }

  function planSourceCard() {
    return h('.card', [
      h('.card-head', [h('h3', { text: 'Where should your plan come from?' })]),
      h('.grid.grid-3', [
        h('.day-card', [
          h('h4', { text: '📷 From a photo' }),
          h('p', { style: { fontSize: '.82rem' }, text: 'Snap the sheet your trainer gave you. Text is read out of it in the browser and you correct it before it is saved.' }),
          h('button.btn.btn-sm', { text: 'Import from photo', onclick: function () { Views.openPlanImport('photo'); } })
        ]),
        h('.day-card', [
          h('h4', { text: '📄 From a file' }),
          h('p', { style: { fontSize: '.82rem' }, text: 'A Forge export, or a plain .txt / .md / .csv roughly in the shape of a plan.' }),
          h('button.btn.btn-sm', { text: 'Import from file', onclick: function () { Views.openPlanImport('file'); } })
        ]),
        h('.day-card', [
          h('h4', { text: '✨ Recommend one' }),
          h('p', { style: { fontSize: '.82rem' }, text: 'Built from your goal, experience, days a week and the equipment you actually have.' }),
          h('button.btn.btn-sm.btn-primary', { text: 'Build me a plan', onclick: function () { regeneratePlan(); } })
        ])
      ])
    ]);
  }

  function regeneratePlan() {
    var st = S.get();
    var p = st.profile;
    if (!p.age || !p.heightCm || !p.weightKg) {
      UI.toast('Fill in your age, height and weight in Profile first.', 'bad');
      global.App.go('profile');
      return;
    }
    st.plan = PG.generate(p);
    S.save(); redraw();
    UI.toast('New ' + p.daysPerWeek + '-day plan built for ' +
             EXD.EQUIPMENT_PROFILES[p.equipment].label.toLowerCase() + '.', 'good');
  }

  Views.regeneratePlan = regeneratePlan;
  Views.openSwapModal = openSwapModal;

  global.Views = Views;
  global.ViewsInternal = { stat: stat, macroPills: macroPills, chartCard: chartCard,
                           emptyState: emptyState, carryForward: carryForward };

}(window));
