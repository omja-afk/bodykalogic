/* views.js — one renderer per tab. Each takes the view's root element, clears it
 * and rebuilds; there is no diffing, because the data is small and a full redraw
 * is simpler to reason about than partial updates. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var PG = global.PlanGen, DG = global.DietGen;
  var EXD = global.ExerciseData, FD = global.FoodData;

  var Views = {};
  var redraw = function () { global.App.render(); };

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
    setTimeout(function () {
      build(host);
      var svg = host.querySelector('svg');
      if (svg) svg.setAttribute('aria-label', title + (sub ? ' — ' + sub : ''));
    }, 0);
    return card;
  }

  function emptyState(title, msg, btnLabel, onClick) {
    return h('.card', [h('.empty-state', [
      h('h3', { text: title }),
      h('p', { text: msg }),
      btnLabel ? h('button.btn.btn-primary', { type: 'button', text: btnLabel, onclick: onClick }) : null
    ])]);
  }

  /* ================================ HOME ================================ */

  /* The first thing after signing in. It opens on something you can read:
   * setting up is one card inside it rather than a wizard standing in front of
   * it. Before there is a profile it leads with quick setup and shows the shape
   * of the dashboard behind it; afterwards it IS the dashboard.
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
    root.appendChild(trendGrid());
  };

  function heroCard(ready) {
    var st = S.get(), p = st.profile;
    // Morning 5:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59, and
    // night from 21:00 through the small hours — 2 a.m. is not morning to
    // anyone still awake at 2 a.m.
    var hour = new Date().getHours();
    var greeting = hour >= 5 && hour < 12 ? 'Good morning'
                 : hour >= 12 && hour < 17 ? 'Good afternoon'
                 : hour >= 17 && hour < 21 ? 'Good evening'
                 : 'Good night';
    var streak = S.streak();
    var goal = (PG.GOALS.filter(function (g) { return g.id === p.goal; })[0] || {}).label;

    return h('.card.hero', [
      h('.card-head', { style: { marginBottom: '6px' } }, [
        h('div', [
          h('.stat-label', { text: ready ? 'Overview' : 'Welcome' }),
          h('h2', { text: ready ? greeting + (p.name ? ', ' + p.name : '') : 'Welcome to BodyKaLogic' }),
          h('p', { style: { margin: '6px 0 0' }, text: ready
            ? UI.prettyDate(UI.todayKey()) + (streak ? ' · ' + streak + '-day streak' : '')
            : 'Fitness backed by data, not guesswork. It works out your numbers from your body and your goal, shows how it got there, and tracks whether they are working.' })
        ]),
        h('.spacer'),
        ready && goal ? h('span.chip.chip-accent', { text: goal }) : null
      ]),
      quoteLine()
    ]);
  }

  /* A new line from the quote library on every page load. */
  function quoteLine() {
    var q = global.Quotes.current();
    return h('.quote', [
      h('span.quote-mark', { text: '\u201C' }),
      h('span.quote-text', { text: q.text }),
      q.by ? h('span.quote-by', { text: '— ' + q.by }) : null
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

    // Change in weight: against the reading from about a month ago when there
    // is one, otherwise against the first weigh-in on record.
    var weighIns = S.weighInKeys();
    var monthAgo = UI.addDays(today, -30);
    var past = weighIns.filter(function (k) { return k <= monthAgo; }).pop();
    var since = 'in 30 days';
    if (!past && weighIns.length > 1) { past = weighIns[0]; since = 'since ' + UI.shortDate(past); }
    var delta = (past && w) ? Math.round((w - Number(st.body[past].weightKg)) * 10) / 10 : null;
    // Whether a change is good news depends on what the goal is. For goals that
    // are not about the scale it is neither, and is shown without a verdict.
    var want = st.profile.goal === 'fat_loss' ? -1
             : (st.profile.goal === 'muscle' || st.profile.goal === 'strength') ? 1 : 0;
    var deltaCls = !delta || !want ? 'delta-flat' : ((delta > 0) === (want > 0) ? 'delta-up' : 'delta-down');

    return h('.grid.grid-4', { style: { marginTop: '16px' } }, [
      stat('Weight', w ? C.fmt(w, 1) : '—', w ? ' kg' : '',
        delta != null
          ? [h('span.' + deltaCls, { text: delta === 0 ? 'No change' : (delta > 0 ? '+' : '\u2212') + C.fmt(Math.abs(delta), 1) + ' kg' }),
             h('span', { text: since })]
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
        h('button.btn.btn-sm.btn-ghost', { type: 'button', text: 'Walk me through it instead', onclick: function () {
          global.App.guidedSetup();
        } })
      ]),
      h('.field-row', [
        fld('name', 'Name (optional)', h('input', { value: p.name || '', placeholder: 'optional' })),
        fld('sex', 'Sex', h('select', [
          h('option', { value: 'male', selected: p.sex === 'male', text: 'Male' }),
          h('option', { value: 'female', selected: p.sex === 'female', text: 'Female' })
        ])),
        fld('age', 'Age', h('input', { type: 'number', inputmode: 'numeric', min: 13, max: 100, value: p.age || '', placeholder: 'years' })),
        fld('heightCm', 'Height', h('input', { type: 'number', inputmode: 'decimal', min: 100, max: 230, value: p.heightCm || '', placeholder: 'cm' })),
        fld('weightKg', 'Weight', h('input', { type: 'number', inputmode: 'decimal', step: 0.1, min: 25, max: 300, value: p.weightKg || '', placeholder: 'kg' }))
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
        h('button.btn.btn-primary', { type: 'button', text: 'Build my plan', onclick: function () {
          var age = Number(f.age.value), hgt = Number(f.heightCm.value), wgt = Number(f.weightKg.value);
          var problem = S.vitalsProblem(age, hgt, wgt);
          if (problem) {
            UI.toast(problem, 'bad');
            (!age || age < 13 || age > 100 ? f.age
              : !hgt || hgt < 100 || hgt > 230 ? f.heightCm : f.weightKg).focus();
            return;
          }
          completeSetup({
            name: f.name.value.trim(), sex: f.sex.value,
            age: age, heightCm: hgt, weightKg: wgt,
            goal: f.goal.value, experience: f.experience.value,
            daysPerWeek: Number(f.daysPerWeek.value), activity: f.activity.value,
            equipment: f.equipment.value, dietPref: f.dietPref.value, cuisine: f.cuisine.value
          });
          redraw();
          UI.toast('Your plan and meals are ready.', 'good');
        } }),
        h('.spacer'),
        h('span.card-sub', { text: 'Saved to your account as you go.' })
      ])
    ]);
    return card;
  }

  /* Apply the answers from either setup route and build what they ask for.
   * A plan or a week of meals that is already there — imported before setting
   * up, say — is left alone: answering questions about yourself should never
   * throw away something you brought with you. */
  function completeSetup(answers) {
    var st = S.get();
    Object.assign(st.profile, answers);
    st.settings.onboarded = true;
    // The weight given here is also the first weigh-in, so the trend starts
    // today rather than whenever they next remember to record one.
    if (!S.weighInKeys().length) S.logWeight(UI.todayKey(), st.profile.weightKg, 'starting weight');
    if (!st.plan) st.plan = PG.generate(st.profile);
    if (!st.diet) {
      st.diet = DG.generate(st.profile, {
        dietPref: st.profile.dietPref, cuisine: st.profile.cuisine, dislikes: st.profile.dislikes || []
      });
    }
    S.save();
  }
  Views.completeSetup = completeSetup;

  function whatYouGetCard() {
    return h('.grid.grid-3', { style: { marginTop: '16px' } }, [
      h('.card', [
        h('h3', { text: 'A plan you can actually change' }),
        h('p', { style: { fontSize: '.86rem', marginTop: '8px' },
          text: EXD.EXERCISES.length + ' movements, with a gym / home-dumbbells / bodyweight switch. ' +
                'Every exercise has a swap list — 60 to 120 alternatives in a gym, 40+ on bodyweight alone.' }),
        h('button.btn.btn-sm', { type: 'button', text: 'Import a plan I already have',
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
        h('h3', { text: 'On every device' }),
        h('p', { style: { fontSize: '.86rem', marginTop: '8px' },
          text: 'Sign in on your phone with the same email and your plan and history are ' +
                'there. It keeps working with no signal: changes are saved on the device ' +
                'and sync when you reconnect.' }),
        h('button.btn.btn-sm', { text: 'Account settings',
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
        UI.button('.btn-sm', 'plus', 'Weigh in', { onclick: function () { global.App.go('body'); } })
      ]),
      host,
      h('.hint', { style: { marginTop: '10px' }, text: healthyLow
        ? 'At ' + st.profile.heightCm + ' cm, a healthy BMI corresponds to about ' +
          C.fmt(healthyLow, 1) + '–' + C.fmt(healthyHigh, 1) + ' kg' +
          (w ? ' — you are at ' + C.fmt(w, 1) + ' kg.' : '.') +
          ' BMI is a rough screening measure: it does not know muscle from fat, so a heavily trained person reads high.'
        : 'Add your height in Profile to see your range.' }),
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
    } else if (planned && planned.rest) {
      sessionCard.appendChild(h('.banner', { html:
        '<div><b>Rest day.</b> Nothing is scheduled for ' +
        UI.DAY_NAMES[UI.parseKey(today).getDay()] + '. Recovery is part of the plan — ' +
        'open the log if you want to train anyway.</div>' }));
    } else if (planned && planned.day) {
      sessionCard.appendChild(h('.day-head', [
        h('h4', { text: planned.day.name }),
        h('span.card-sub', { text: dayWhen(planned.day) + (planned.day.focus ? ' · ' + planned.day.focus : '') })
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
      var dietDay = S.dietDayFor(today);
      if (dietDay) {
        foodCard.appendChild(h('.card-sub', { style: { marginTop: '12px' },
          text: 'Planned for ' + UI.DAY_NAMES[UI.parseKey(today).getDay()] + ': ' +
                dietDay.meals.map(function (m) { return m.title; }).join(' · ') }));
      }
    }
    grid.appendChild(foodCard);
    return grid;
  }

  /* Weight and BMI side by side. Two charts rather than two lines: a BMI of 26
   * plotted under a weight of 82 is a flat line along the bottom. */
  function trendGrid() {
    var grid = h('.grid.grid-2', { style: { marginTop: '16px' } });
    grid.appendChild(weightTrendCard());
    grid.appendChild(bmiTrendCard());
    return grid;
  }

  function bmiTrendCard() {
    var st = S.get(), today = UI.todayKey();
    return chartCard('BMI trend', 'last 90 days', function (host) {
      var pts = [];
      for (var i = 89; i >= 0; i--) {
        var k = UI.addDays(today, -i);
        var b = st.body[k];
        var v = (b && b.weightKg && st.profile.heightCm)
          ? DG.bmi(b.weightKg, st.profile.heightCm) : null;
        pts.push({ x: UI.shortDate(k), y: v });
      }
      var any = pts.some(function (p) { return p.y != null; });
      C.line(host, {
        series: any ? [{ name: 'BMI', points: carryForward(pts) }] : [],
        dp: 1, area: true, height: 250,
        target: 24.9, targetLabel: 'healthy ceiling',
        empty: 'Add your height and a weigh-in and this fills in.'
      });
    });
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
      return;
    }

    var plan = st.plan;

    /* equipment switch — the gym / home question, kept at the top */
    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: 'Training setup' }),
        h('.spacer'),
        h('span.card-sub', { text: (plan.source === 'imported' ? 'Imported plan' : 'Built for you') + ' · ' +
          plan.days.length + ' day' + (plan.days.length === 1 ? '' : 's') + ' a week' })
      ]),
      h('.field-row', [
        h('div', [
          h('.field-title', { text: 'Where are you training?' }),
          h('.seg-group', Object.keys(EXD.EQUIPMENT_PROFILES).map(function (id) {
            var p = EXD.EQUIPMENT_PROFILES[id];
            return h('button.seg-btn' + (plan.equipment === id ? '.is-active' : ''), {
              type: 'button', text: p.label, 'aria-pressed': plan.equipment === id ? 'true' : 'false',
              onclick: function () {
                if (plan.equipment === id) return;
                PG.reequip(plan, id, st.profile.avoid || []);
                st.profile.equipment = id;
                S.save(); redraw();
                UI.toast('Plan switched to ' + p.label.toLowerCase() + ' — movements swapped to what you have.');
              }
            });
          }))
        ]),
        h('div', [
          h('.field-title', { text: 'Movements available here' }),
          h('p', { style: { margin: 0, fontSize: '.84rem' },
            text: EXD.pool(plan.equipment, st.profile.avoid || []).length + ' of ' +
                  EXD.EXERCISES.length + ' movements' })
        ])
      ]),
      h('.card-head', { style: { marginTop: '14px', marginBottom: 0 } }, [
        UI.button('.btn-sm', 'refresh', 'Rebuild plan', { onclick: function () { regeneratePlan(); } }),
        UI.button('.btn-sm', 'upload', 'Import a plan', { onclick: function () { Views.openPlanImport(); } }),
        UI.button('.btn-sm', 'plus', 'Add day', { onclick: function () {
          plan.days.push({ name: 'Day ' + (plan.days.length + 1), focus: '', slots: [], notes: '', weekday: null });
          S.save(); redraw();
        } })
      ])
    ]));

    plan.days.forEach(function (day, di) {
      var card = h('.card', [
        h('.card-head', [
          h('input.day-name', { value: day.name || '', 'aria-label': 'Day name',
            onchange: function (e) { day.name = e.target.value.trim() || ('Day ' + (di + 1)); S.save(); redraw(); } }),
          h('input.day-focus', { value: day.focus || '', placeholder: 'focus (optional)', 'aria-label': 'Focus',
            onchange: function (e) { day.focus = e.target.value; S.save(); } }),
          h('select.day-weekday', { 'aria-label': 'Day of the week',
            title: 'Which day of the week this session falls on',
            onchange: function (e) {
              day.weekday = e.target.value === '' ? null : Number(e.target.value);
              S.save(); redraw();
            } },
            [h('option', { value: '', selected: day.weekday == null, text: 'Any day' })].concat(
              [1, 2, 3, 4, 5, 6, 0].map(function (d) {
                return h('option', { value: d, selected: day.weekday === d, text: UI.DAY_NAMES[d] });
              }))),
          h('.spacer'),
          h('span.card-sub', { text: day.slots.length + ' exercise' + (day.slots.length === 1 ? '' : 's') }),
          UI.button('.btn-sm.btn-ghost.btn-danger', 'trash', null, { title: 'Remove this day', onclick: function () {
            UI.confirm({ title: 'Remove ' + day.name + '?', message: 'This removes the day from your plan. Sessions you have already logged are not affected.', danger: true, confirmLabel: 'Remove day' })
              .then(function (ok) { if (ok) { plan.days.splice(di, 1); S.save(); redraw(); } });
          } })
        ])
      ]);

      day.slots.forEach(function (slot, si) {
        card.appendChild(exerciseRow(plan, day, di, slot, si));
      });

      card.appendChild(h('.card-head', { style: { marginTop: '10px', marginBottom: 0 } }, [
        UI.button('.btn-sm', 'plus', 'Add exercise', { onclick: function () {
          openSwapModal(plan, di, null, 'Add an exercise to ' + day.name);
        } })
      ]));
      if (day.notes) card.appendChild(h('.hint', { text: day.notes }));
      root.appendChild(card);
    });
  };

  /* "Mon" / "any day" — what a plan day is called in the week. */
  function dayWhen(day) {
    return day.weekday == null ? 'any day' : UI.DAY_NAMES[day.weekday];
  }

  function exerciseRow(plan, day, di, slot, si) {
    var best = slot.exId ? S.bestMax(slot.exId) : null;
    return h('.ex-row', [
      h('.ex-main', [
        h('.ex-name', { text: slot.name }),
        h('.ex-meta', { text: slot.sets + ' × ' + slot.reps +
          (slot.rest ? ' · ' + slot.rest + 's rest' : '') +
          (slot.weight ? ' · ' + slot.weight + (slot.weightUnit || 'kg') : '') +
          (best ? ' · best ' + best.weight + ' kg × ' + best.reps : '') +
          (slot.importedAs ? ' · imported as "' + slot.importedAs + '"' : '') })
      ]),
      slot.exId ? h('span.ex-pattern', { text: EXD.PATTERN_LABEL[slot.pattern] || slot.pattern }) : null,
      UI.button('.btn-sm', 'swap', 'Swap', {
        title: 'Show alternatives for this exercise',
        onclick: function () { openSwapModal(plan, di, si); }
      }),
      UI.button('.btn-sm.btn-ghost', 'edit', null, { title: 'Edit sets and reps for ' + slot.name, onclick: function () {
        editSlot(plan, slot);
      } }),
      UI.button('.btn-sm.btn-ghost.btn-danger', 'x', null, { title: 'Remove ' + slot.name, onclick: function () {
        day.slots.splice(si, 1); S.save(); redraw();
      } })
    ]);
  }

  function editSlot(plan, slot) {
    var sets = h('input', { type: 'number', inputmode: 'numeric', value: slot.sets, min: 1, max: 12 });
    var reps = h('input', { value: slot.reps, placeholder: 'e.g. 8-12' });
    var rest = h('input', { type: 'number', inputmode: 'numeric', value: slot.rest == null ? 90 : slot.rest, min: 0, max: 600, step: 15 });
    UI.modal({
      title: slot.name,
      body: h('.field-row', [
        h('div', [h('label', { text: 'Sets' }), sets]),
        h('div', [h('label', { text: 'Reps' }), reps]),
        h('div', [h('label', { text: 'Rest (seconds)' }), rest])
      ]),
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: function () {
        slot.sets = Math.min(12, Math.max(1, Math.round(Number(sets.value)) || slot.sets));
        slot.reps = reps.value.trim() || slot.reps;
        slot.rest = Math.min(600, Math.max(0, Number(rest.value) || 0));
        S.save(); redraw();
      } }]
    });
  }

  /* The swap list: every alternative for the slot, grouped by how close it is. */
  function openSwapModal(plan, dayIdx, slotIdx, title) {
    var st = S.get();
    var day = plan.days[dayIdx];
    var avoid = st.profile.avoid || [];
    var alts, current = null, known = true;

    if (slotIdx == null) {
      alts = EXD.pool(plan.equipment, avoid).map(function (e) {
        var c = Object.create(e); c.tier = 'direct'; return c;
      });
    } else {
      current = day.slots[slotIdx];
      known = !!(EXD.byId(current.exId) || EXD.byName(current.name));
      alts = PG.alternativesForSlot(plan, dayIdx, slotIdx, avoid);
    }

    var search = h('input', { type: 'search', placeholder: 'Search ' + alts.length + ' movements…',
                              'aria-label': 'Search movements' });
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
        ['direct', (slotIdx == null || !known) ? 'All movements you can do here' : 'Same movement pattern'],
        ['muscle', 'Same muscle, different pattern'],
        ['related', 'Related — same muscle group']
      ];
      tiers.forEach(function (t) {
        var group = shown.filter(function (a) { return a.tier === t[0]; });
        if (!group.length) return;
        listHost.appendChild(h('.swap-tier', { text: t[1] + ' · ' + group.length }));
        listHost.appendChild(h('.swap-list', group.map(function (alt) {
          return h('button.swap-item', {
            type: 'button',
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
          : !known
            ? 'This one is not in the library, so here is everything your setup allows.'
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
          h('h4', [UI.icon('sparkle'), 'Build one for me']),
          h('p', { text: 'Built from your goal, experience, days a week and the equipment you actually have.' }),
          h('button.btn.btn-sm.btn-primary', { type: 'button', text: 'Build my plan', onclick: function () { regeneratePlan(); } })
        ]),
        h('.day-card', [
          h('h4', [UI.icon('camera'), 'From a photo']),
          h('p', { text: 'Snap the sheet your trainer gave you. The text is read on this device and you correct it before it is saved.' }),
          h('button.btn.btn-sm', { type: 'button', text: 'Import from photo', onclick: function () { Views.openPlanImport('photo'); } })
        ]),
        h('.day-card', [
          h('h4', [UI.icon('file'), 'From a file']),
          h('p', { text: 'A BodyKaLogic export, or a plain .txt / .md / .csv roughly in the shape of a plan.' }),
          h('button.btn.btn-sm', { type: 'button', text: 'Import from file', onclick: function () { Views.openPlanImport('file'); } })
        ])
      ])
    ]);
  }

  /* Build the plan from the profile. Replacing a plan that already exists
   * throws away every swap and edit made to it, so that is asked first —
   * `opts.sure` skips the question for a caller that has already asked. */
  function regeneratePlan(opts) {
    opts = opts || {};
    var st = S.get();
    var p = st.profile;
    if (!profileReady(p)) {
      UI.toast('Add your age, height and weight on Home first.', 'bad');
      global.App.go('home');
      return Promise.resolve(false);
    }
    var ask = (st.plan && !opts.sure) ? UI.confirm({
      title: 'Rebuild your workout plan?',
      message: 'This replaces your current plan, including any swaps and edits you have made. Sessions you have already logged are not affected.',
      confirmLabel: 'Rebuild plan'
    }) : Promise.resolve(true);
    return ask.then(function (ok) {
      if (!ok) return false;
      st.plan = PG.generate(p);
      S.save(); redraw();
      if (!opts.quiet) {
        UI.toast('New ' + st.plan.daysPerWeek + '-day plan built for ' +
                 EXD.EQUIPMENT_PROFILES[st.plan.equipment].label.toLowerCase() + '.', 'good');
      }
      return true;
    });
  }

  Views.regeneratePlan = regeneratePlan;

  global.Views = Views;
  global.ViewsInternal = { stat: stat, macroPills: macroPills, chartCard: chartCard,
                           emptyState: emptyState };

}(window));
