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
  var redraw = function () {};
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

  /* ============================== DASHBOARD ============================== */

  Views.dashboard = function (root) {
    UI.clear(root);
    var st = S.get(), today = UI.todayKey();
    var t = S.targets();
    var w = S.currentWeight(), bmi = S.currentBMI();
    var band = DG.bmiBand(bmi);
    var totals = S.nutritionTotals(today);
    var session = st.workouts[today];
    var planned = S.plannedDayFor(today);

    // weight delta over the last 30 days
    var bodyKeys = Object.keys(st.body).sort();
    var monthAgo = UI.addDays(today, -30);
    var past = bodyKeys.filter(function (k) { return k <= monthAgo; }).pop();
    var delta = (past && w) ? Math.round((w - st.body[past].weightKg) * 10) / 10 : null;
    var goalDown = st.profile.goal === 'fat_loss';
    var deltaCls = delta == null ? 'delta-flat'
      : (delta === 0 ? 'delta-flat' : ((delta < 0) === goalDown ? 'delta-up' : 'delta-down'));

    root.appendChild(h('.grid.grid-4', [
      stat('Weight', w ? C.fmt(w, 1) : '—', w ? ' kg' : '',
           delta != null ? [h('span.' + deltaCls, { text: (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '◆ ') + C.fmt(delta, 1) + ' kg' }),
                            h('span', { text: 'in 30 days' })] : [h('span', { text: 'log a weigh-in to track this' })],
           'var(--series-1)'),
      stat('BMI', bmi ? C.fmt(bmi, 1) : '—', '',
           [h('span.chip.chip-' + (band.tone === 'good' ? 'good' : band.tone === 'bad' ? 'bad' : 'warn'), { text: band.label })],
           'var(--series-7)'),
      stat('Protein today', C.fmt(totals.p, 0), ' g',
           [h('span', { text: 'target ' + t.protein + ' g' }),
            totals.p >= t.protein ? h('span.chip.chip-good', { text: 'hit' }) : null], 'var(--series-3)'),
      stat('Streak', S.streak(), ' days', [h('span', { text: 'tracked in a row' })], 'var(--series-4)')
    ]));

    var grid = h('.grid.grid-2', { style: { marginTop: '16px' } });

    /* today's session */
    var sessionCard = h('.card', [
      h('.card-head', [
        h('h3', { text: "Today's session" }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-primary', { text: session && session.completed ? 'Review' : 'Open log',
          onclick: function () { global.App.go('log'); } })
      ])
    ]);
    if (!st.plan) {
      sessionCard.appendChild(h('p', { text: 'No workout plan yet. Build one in the Workout plan tab.' }));
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
          logged && logged.length ? h('span.chip.chip-good', { text: logged.length + ' set' + (logged.length > 1 ? 's' : '') }) : null
        ]));
      });
      if (planned.day.slots.length > 6) {
        sessionCard.appendChild(h('.card-sub', { text: '+ ' + (planned.day.slots.length - 6) + ' more' }));
      }
    }
    grid.appendChild(sessionCard);

    /* today's food */
    var dietDay = st.diet ? st.diet.days[(UI.daysBetween(UI.todayKey(st.createdAt ? new Date(st.createdAt) : new Date()), today) % 7 + 7) % 7] : null;
    var foodCard = h('.card', [
      h('.card-head', [
        h('h3', { text: "Today's food" }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-primary', { text: 'Log a meal', onclick: function () { global.App.go('nutrition'); } })
      ])
    ]);
    if (!st.diet) {
      foodCard.appendChild(h('p', { text: 'No diet plan yet. Build one in the Diet plan tab.' }));
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
      if (dietDay) {
        foodCard.appendChild(h('.card-sub', { style: { marginTop: '12px' },
          text: 'Planned today: ' + dietDay.meals.map(function (m) { return m.title; }).join(' · ') }));
      }
    }
    grid.appendChild(foodCard);
    root.appendChild(grid);

    /* weight trend */
    root.appendChild(chartCard('Weight trend', 'last 90 days', function (host) {
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
    }));
  };

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
