/* views4.js — body measurements, the account card, progress, and profile. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var DG = global.DietGen, PG = global.PlanGen, EXD = global.ExerciseData, FD = global.FoodData;
  var Sync = global.Sync, Store = global.Store;
  var Views = global.Views, VI = global.ViewsInternal;
  var redraw = function () { global.App.render(); };

  var MEASURES = [
    { id: 'weightKg', label: 'Weight', unit: 'kg', step: 0.1, min: 25, max: 300 },
    { id: 'bodyFat',  label: 'Body fat', unit: '%', step: 0.1, min: 2, max: 70 },
    { id: 'waist',    label: 'Waist', unit: 'cm', step: 0.5, min: 30, max: 250 },
    { id: 'chest',    label: 'Chest', unit: 'cm', step: 0.5, min: 30, max: 250 },
    { id: 'arm',      label: 'Arm', unit: 'cm', step: 0.5, min: 10, max: 100 },
    { id: 'thigh',    label: 'Thigh', unit: 'cm', step: 0.5, min: 20, max: 150 },
    { id: 'hip',      label: 'Hip', unit: 'cm', step: 0.5, min: 30, max: 250 }
  ];

  /* ================================ BODY ================================ */

  Views.body = function (root) {
    UI.clear(root);
    var st = S.get();
    var w = S.currentWeight(), bmi = S.currentBMI(), band = DG.bmiBand(bmi);

    root.appendChild(h('.grid.grid-4', [
      VI.stat('Current weight', w ? C.fmt(w, 1) : '—', w ? ' kg' : '', null, 'var(--series-1)'),
      VI.stat('BMI', bmi ? C.fmt(bmi, 1) : '—', '',
        bmi ? [h('span.chip.chip-' + (band.tone === 'good' ? 'good' : band.tone === 'bad' ? 'bad' : 'warn'), { text: band.label })]
            : [h('span', { text: 'needs height and weight' })],
        'var(--series-7)'),
      VI.stat('Goal weight', st.profile.targetWeightKg ? C.fmt(st.profile.targetWeightKg, 1) : '—', st.profile.targetWeightKg ? ' kg' : '',
        [h('span', { text: !st.profile.targetWeightKg ? 'set one in Profile'
          : !w ? 'add a weigh-in'
          : Math.abs(w - st.profile.targetWeightKg) < 0.05 ? 'you are there'
          : C.fmt(Math.abs(w - st.profile.targetWeightKg), 1) + ' kg to go' })],
        'var(--series-3)'),
      VI.stat('Weigh-ins', S.weighInKeys().length, '', [h('span', { text: 'recorded' })], 'var(--series-4)')
    ]));

    root.appendChild(h('.card', { style: { marginTop: '16px' } }, [
      h('.card-head', [
        h('h3', { text: 'Record a measurement' }),
        h('.spacer'),
        UI.button('.btn-sm.btn-primary', 'plus', 'New entry', { onclick: function () { openBodyLogger(); } })
      ]),
      h('p', { text: 'Weight is all you need; the rest are optional. BMI is calculated for you from your height. Weekly is plenty — daily weight swings are mostly water.' })
    ]));

    /* weight + BMI, two charts rather than one dual-axis chart */
    var keys = Object.keys(st.body).sort();
    root.appendChild(VI.chartCard('Weight', 'every recorded weigh-in', function (host) {
      C.line(host, {
        series: [{ name: 'Weight', points: keys.map(function (k) {
          return { x: UI.shortDate(k), y: st.body[k].weightKg ? Number(st.body[k].weightKg) : null };
        }).filter(function (p) { return p.y != null; }) }],
        unit: ' kg', dp: 1, area: true, height: 260,
        target: st.profile.targetWeightKg ? Number(st.profile.targetWeightKg) : null, targetLabel: 'goal',
        empty: 'No weigh-ins yet.'
      });
    }));

    root.appendChild(VI.chartCard('BMI', 'calculated from your height', function (host) {
      C.line(host, {
        series: [{ name: 'BMI', points: keys.map(function (k) {
          var v = st.body[k].weightKg ? DG.bmi(st.body[k].weightKg, st.profile.heightCm) : null;
          return { x: UI.shortDate(k), y: v };
        }).filter(function (p) { return p.y != null; }) }],
        dp: 1, area: true, height: 220, target: 24.9, targetLabel: 'healthy ceiling',
        empty: 'Add your height and a weigh-in to chart BMI.'
      });
    }));

    /* tape measurements, one colour each */
    var tape = MEASURES.filter(function (m) { return m.id !== 'weightKg' && m.id !== 'bodyFat'; });
    var hasTape = keys.some(function (k) { return tape.some(function (m) { return st.body[k][m.id]; }); });
    if (hasTape) {
      root.appendChild(VI.chartCard('Tape measurements', 'centimetres', function (host) {
        C.line(host, {
          height: 270, unit: ' cm', dp: 1,
          series: tape.map(function (m) {
            return { name: m.label, points: keys.map(function (k) {
              return { x: UI.shortDate(k), y: st.body[k][m.id] ? Number(st.body[k][m.id]) : null };
            }) };
          }).filter(function (s) { return s.points.some(function (p) { return p.y != null; }); })
        });
      }));
    }

    if (keys.length) {
      var table = h('table.table', [h('thead', [h('tr',
        [h('th', { text: 'Date' })].concat(MEASURES.map(function (m) {
          return h('th.num', { text: m.label });
        })).concat([h('th.num', { text: 'BMI' }), h('th', [h('span.sr-only', { text: 'Edit' })])])
      )])]);
      var tbody = h('tbody');
      keys.slice().reverse().forEach(function (k) {
        var b = st.body[k];
        tbody.appendChild(h('tr',
          [h('td', { text: UI.shortDate(k) })]
            .concat(MEASURES.map(function (m) {
              return h('td.num', { text: b[m.id] ? C.fmt(b[m.id], 1) : '—' });
            }))
            .concat([
              h('td.num', { text: b.weightKg ? C.fmt(DG.bmi(b.weightKg, st.profile.heightCm), 1) : '—' }),
              h('td', [UI.button('.btn-sm.btn-ghost', 'edit', null, {
                title: 'Edit the entry for ' + UI.prettyDate(k), onclick: function () { openBodyLogger(k); } })])
            ])
        ));
      });
      table.appendChild(tbody);
      root.appendChild(h('.card', [
        h('.card-head', [h('h3', { text: 'All entries' })]),
        h('.table-wrap', [table])
      ]));
    }
  };

  function openBodyLogger(editKey) {
    var st = S.get();
    var key = editKey || UI.todayKey();
    var existing = st.body[key] || {};
    var date = h('input', { type: 'date', value: key, max: UI.todayKey() });
    var inputs = {};
    var fields = MEASURES.map(function (m) {
      inputs[m.id] = h('input', { type: 'number', inputmode: 'decimal', step: m.step, min: m.min, max: m.max,
                                  value: existing[m.id] || '' });
      return h('div', [h('label', { text: m.label + ' (' + m.unit + ')' }), inputs[m.id]]);
    });
    var notes = h('input', { value: existing.notes || '', placeholder: 'optional' });

    UI.modal({
      title: editKey ? 'Edit ' + UI.prettyDate(key) : 'New measurement',
      body: [
        h('.field', [h('label', { text: 'Date' }), date]),
        h('.field-row', fields),
        h('.field', [h('label', { text: 'Notes' }), notes]),
        h('.hint', { text: 'Weigh yourself at the same time of day — first thing, after the toilet, before eating — or the trend is noise.' })
      ],
      actions: [
        { label: 'Cancel' },
        editKey ? { label: 'Delete', kind: 'danger', onClick: function () {
          delete st.body[key]; S.save(); redraw();
        } } : null,
        { label: 'Save', kind: 'primary', onClick: function () {
          var entry = { notes: notes.value.trim() };
          var any = false, problem = null;
          MEASURES.forEach(function (m) {
            var v = inputs[m.id].value;
            if (v === '') return;
            var n = Number(v);
            if (!(n >= m.min && n <= m.max)) {
              problem = problem || (m.label + ' should be between ' + m.min + ' and ' + m.max + ' ' + m.unit + '.');
              return;
            }
            entry[m.id] = n; any = true;
          });
          if (problem) { UI.toast(problem, 'bad'); return false; }
          if (!any) { UI.toast('Enter at least one measurement.', 'bad'); return false; }
          if (!UI.validPastKey(date.value)) { UI.toast('Choose a date that is today or earlier.', 'bad'); return false; }
          if (editKey && date.value !== key) delete st.body[key];
          st.body[date.value] = entry;
          S.save(); redraw();
          UI.toast('Measurement saved.', 'good');
        } }
      ].filter(Boolean)
    });
  }

  /* ============================== ACCOUNT =============================== */

  function passwordInput() {
    return h('input', { type: 'password', autocomplete: 'new-password', spellcheck: 'false', autocapitalize: 'none' });
  }

  function changePassword() {
    var first = passwordInput(), second = passwordInput();
    var note = h('.hint', { role: 'status' });
    var busy = false;
    var close = UI.modal({
      title: 'Change password',
      body: [
        h('.field', [h('label', { text: 'New password' }), first]),
        h('.field', [h('label', { text: 'Confirm new password' }), second]),
        h('.hint', { text: 'At least 8 characters.' }),
        note
      ],
      actions: [
        { label: 'Cancel' },
        { label: 'Save password', kind: 'primary', onClick: function () {
          if (busy) return false;
          if (first.value.length < 8) { note.textContent = 'Use at least 8 characters.'; first.focus(); return false; }
          if (first.value !== second.value) { note.textContent = 'The two passwords don’t match.'; second.focus(); return false; }
          busy = true;
          note.textContent = 'Saving…';
          Sync.updatePassword(first.value).then(function () {
            close();
            UI.toast('Password changed.', 'good');
          }, function (e) {
            busy = false;
            note.textContent = Sync.explain(e);
          });
          return false;
        } }
      ]
    });
  }

  /* One button for both directions: send what this device has not sent, or
   * fetch what another device has. Never both, so it cannot overwrite either. */
  function syncNow() {
    if (Sync.status().dirty) {
      return Sync.push().then(function (ok) {
        UI.toast(ok ? 'Synced.' : 'Could not reach your account. Your changes are saved on this device.', ok ? 'good' : 'bad');
        redraw();
      });
    }
    return Sync.pull().then(function (remote) {
      if (!remote) return Sync.push().then(function () { UI.toast('Synced.', 'good'); });
      if (Sync.status().dirty) return;
      if (!Sync.same(S.get(), remote.data)) {
        S.set(S.normalise(remote.data));
        Store.save(S.get());
        UI.toast('Updated with changes from another device.', 'good');
      } else {
        UI.toast('Everything is up to date.', 'good');
      }
      Sync.adopt(remote);
    }).catch(function (e) {
      UI.toast(Sync.explain(e), 'bad');
    }).then(redraw);
  }

  function signOut() {
    UI.confirm({
      title: 'Sign out?',
      message: 'Your history stays in your account. Sign back in with the same email and it is all there.',
      confirmLabel: 'Sign out'
    }).then(function (ok) {
      if (!ok) return false;
      // Anything not yet sent goes first; once it has, the copy on this device
      // can be removed, so the next person at this browser finds nothing.
      return (Sync.status().dirty ? Sync.push() : Promise.resolve(true)).then(function () {
        if (!Sync.status().signedIn || !Sync.status().dirty) return true;
        return UI.confirm({
          title: 'Your latest changes are not in your account yet',
          message: 'Your account could not be reached, so your most recent changes are only on this device. ' +
                   'If you sign out now they stay here, and are sent the next time you sign in on this device.',
          confirmLabel: 'Sign out anyway', cancelLabel: 'Stay signed in'
        });
      });
    }).then(function (go) {
      if (!go) return;
      var clean = !Sync.status().dirty;
      Sync.signOut().then(function () {
        if (clean) { Store.wipe(); Sync.forgetLocal(); }
        global.location.reload();
      });
    });
  }

  function accountCard() {
    var sy = Sync.status();
    var card = h('.card', [h('.card-head', [h('h3', { text: 'Account' })])]);

    if (!sy.enabled) {
      // Only ever seen on a deployment with no backend configured.
      card.appendChild(h('.banner.is-warn', { style: { marginBottom: 0 } }, [h('div', [
        h('b', { text: 'Accounts are not set up on this deployment.' }),
        ' Everything is saved in this browser only. See “Setting up sync” in the README.'
      ])]));
      return card;
    }

    var line = sy.state === 'offline'
        ? 'You are offline. Changes are saved on this device and will sync when you reconnect.'
      : sy.state === 'error'
        ? (sy.message || 'Something went wrong while syncing.') + ' Your changes are saved on this device.'
      : (sy.state === 'syncing' || sy.dirty)
        ? 'Saving your latest changes…'
        : 'Everything is saved to your account. Sign in on any other device with this email and it is all there.';
    var tone = sy.state === 'error' ? '.is-bad' : sy.state === 'offline' ? '.is-warn' : '';

    card.appendChild(h('.banner' + tone, [h('div', [
      h('b', { text: 'Signed in as ' + (sy.email || 'your account') }),
      h('div', { text: line }),
      sy.lastSync ? h('.hint', { text: 'Last synced at ' +
        new Date(sy.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.' }) : null
    ])]));
    card.appendChild(h('.card-head', { style: { marginBottom: 0 } }, [
      UI.button('.btn-sm', 'refresh', 'Sync now', { onclick: syncNow }),
      h('button.btn.btn-sm', { type: 'button', text: 'Change password', onclick: changePassword }),
      h('.spacer'),
      UI.button('.btn-sm.btn-ghost', 'logout', 'Sign out', { onclick: signOut })
    ]));
    return card;
  }

  /* ============================== PROGRESS ============================== */

  Views.progress = function (root) {
    UI.clear(root);
    var st = S.get(), today = UI.todayKey();

    var sessions = Object.keys(st.workouts).filter(function (k) { return st.workouts[k].completed; });
    var totalVolume = sessions.reduce(function (a, k) { return a + S.sessionVolume(st.workouts[k]); }, 0);
    var last30 = sessions.filter(function (k) { return UI.daysBetween(k, today) <= 30; });
    var streak = S.streak();
    var lifts = S.strength();

    root.appendChild(h('.grid.grid-4', [
      VI.stat('Sessions', sessions.length, '', [h('span', { text: last30.length + ' in the last 30 days' })], 'var(--series-1)'),
      VI.stat('Total volume', C.fmt(totalVolume / 1000, totalVolume < 100000 ? 1 : 0), ' t', [h('span', { text: 'weight × reps, all time' })], 'var(--series-2)'),
      VI.stat('Current streak', streak, streak === 1 ? ' day' : ' days', [h('span', { text: 'days with a session or a logged meal' })], 'var(--series-4)'),
      VI.stat('Exercises', lifts.length, '',
        [h('span', { text: 'with sets logged' })], 'var(--series-3)')
    ]));

    /* Weight and BMI by week. Two charts, not two lines: on one scale a BMI of
     * 25 sitting under a weight of 78 is a flat line at the bottom that shows
     * nothing. Different units get different charts. */
    var weeks = {};
    Object.keys(st.body).sort().forEach(function (k) {
      if (!st.body[k].weightKg) return;
      var wk = UI.weekKey(k);
      (weeks[wk] = weeks[wk] || []).push({ w: Number(st.body[k].weightKg), k: k });
    });
    var order = Object.keys(weeks).sort().slice(-16);
    function weeklyAvg(wk) {
      return weeks[wk].reduce(function (a, x) { return a + x.w; }, 0) / weeks[wk].length;
    }

    var weekly = h('.grid.grid-2', { style: { marginTop: '16px' } });
    weekly.appendChild(VI.chartCard('Weight by week', 'average of each week', function (host) {
      C.line(host, {
        height: 250, dp: 1, unit: ' kg', area: true,
        target: st.profile.targetWeightKg ? Number(st.profile.targetWeightKg) : null, targetLabel: 'goal',
        series: [{ name: 'Weight', points: order.map(function (wk) {
          return { x: UI.shortDate(weeks[wk][0].k), y: Math.round(weeklyAvg(wk) * 10) / 10 };
        }) }],
        empty: 'Weigh in a few times and the weekly trend appears here.'
      });
    }));
    weekly.appendChild(VI.chartCard('BMI by week', 'from your height', function (host) {
      C.line(host, {
        height: 250, dp: 1, area: true, target: 24.9, targetLabel: 'healthy ceiling',
        series: [{ name: 'BMI', points: order.map(function (wk) {
          return { x: UI.shortDate(weeks[wk][0].k), y: DG.bmi(weeklyAvg(wk), st.profile.heightCm) };
        }).filter(function (p) { return p.y != null; }) }],
        empty: 'Add your height and some weigh-ins.'
      });
    }));
    root.appendChild(weekly);

    /* training volume per week */
    root.appendChild(VI.chartCard('Training volume by week', 'tonnes lifted', function (host) {
      var weeks = {};
      sessions.sort().forEach(function (k) {
        var wk = UI.weekKey(k);
        weeks[wk] = (weeks[wk] || 0) + S.sessionVolume(st.workouts[k]);
      });
      var order = Object.keys(weeks).sort().slice(-16);
      C.bar(host, {
        height: 260, unit: ' t', dp: 1,
        bars: order.map(function (wk, i) {
          return { label: wk.split('-W')[1] ? 'W' + wk.split('-W')[1] : wk,
                   value: Math.round(weeks[wk] / 100) / 10, series: 1 };
        }),
        empty: 'Complete a session or two and your weekly volume shows up here.'
      });
    }));

    /* calories vs target */
    root.appendChild(VI.chartCard('Calories logged', 'last 21 days against target', function (host) {
      var t = S.targets();
      var bars = [];
      for (var i = 20; i >= 0; i--) {
        var k = UI.addDays(today, -i);
        var tot = S.nutritionTotals(k);
        bars.push({ label: UI.shortDate(k), value: tot.kcal,
                    series: tot.kcal === 0 ? 7 : (tot.kcal > t.kcal * 1.1 ? 1 : 2) });
      }
      var any = bars.some(function (b) { return b.value > 0; });
      C.bar(host, { height: 250, unit: ' kcal', bars: any ? bars : [], target: t.kcal, targetLabel: 'target',
                    empty: 'Log some meals and this fills in.' });
    }));

    /* consistency */
    root.appendChild(VI.chartCard('Consistency', 'last 12 weeks — darker is more volume', function (host) {
      var cells = [];
      var start = UI.addDays(today, -83);
      // start the grid on a Monday so the rows are real weekdays
      while (UI.parseKey(start).getDay() !== 1) start = UI.addDays(start, -1);
      for (var k = start; k <= today; k = UI.addDays(k, 1)) {
        var s = st.workouts[k];
        cells.push({ date: UI.prettyDate(k), value: s && s.completed ? Math.round(S.sessionVolume(s)) : 0 });
      }
      C.heatmap(host, cells, { unit: ' kg' });
    }));

    root.appendChild(h('.card', [h('.card-head', { style: { marginBottom: 0 } }, [
      h('div', [h('h3', { text: 'Strength' }),
        h('p', { style: { margin: '4px 0 0' }, text: 'Bests and estimated one-rep max for every exercise you log.' })]),
      h('.spacer'),
      h('button.btn.btn-sm', { type: 'button', text: 'See your strength', onclick: function () { global.App.go('maxes'); } })
    ])]));
  };

  /* ============================== PROFILE =============================== */

  /* Fields whose change means the plans on file no longer match the profile. */
  var PLAN_FIELDS = ['sex', 'age', 'heightCm', 'weightKg', 'goal', 'experience', 'daysPerWeek',
                     'equipment', 'activity', 'dietPref', 'cuisine', 'tdeeOverride'];

  function deleteEverything() {
    var signedIn = Sync.status().signedIn;
    UI.confirm({
      title: 'Delete all your data?',
      message: signedIn
        ? 'This permanently deletes your profile, plans, logs and records from your account, on every device. ' +
          'Your sign-in stays, so you can start again. Export a backup first if there is any chance you will want this back. It cannot be undone.'
        : 'This permanently deletes your profile, plans, logs and records from this browser. It cannot be undone.',
      confirmLabel: 'Delete everything', danger: true
    }).then(function (ok) {
      if (!ok) return;
      var before = S.get();
      var empty = S.blank();
      empty.updatedAt = Date.now();
      S.set(empty);
      // The account's copy is the real one, so that goes first. If it cannot be
      // reached nothing is deleted anywhere, rather than leaving a device that
      // looks empty and an account that quietly restores everything.
      var sent = Promise.resolve(true);
      if (signedIn) {
        Sync.markDirty();
        sent = Sync.push().then(function (done) { return done && !Sync.status().dirty; });
      }
      sent.then(function (done) {
        if (!done) {
          S.set(before);
          UI.toast('Could not reach your account, so nothing was deleted. Try again when you are online.', 'bad');
          return;
        }
        Store.save(S.get());
        global.location.hash = 'home';
        global.location.reload();
      });
    });
  }

  Views.profile = function (root) {
    UI.clear(root);
    var st = S.get(), p = st.profile;

    root.appendChild(accountCard());

    /* ---- about you */
    var f = {};
    function field(id, label, node) { f[id] = node; return h('div', [h('label', { text: label }), node]); }
    var weightNow = S.currentWeight();

    root.appendChild(h('.card', [
      h('.card-head', [h('h3', { text: 'About you' }),
                       h('span.card-sub', { text: 'your targets are worked out from these' })]),
      h('.field-row', [
        field('name', 'Name', h('input', { value: p.name || '', placeholder: 'optional', autocomplete: 'given-name' })),
        field('sex', 'Sex', h('select', [
          h('option', { value: 'male', selected: p.sex === 'male', text: 'Male' }),
          h('option', { value: 'female', selected: p.sex === 'female', text: 'Female' }),
          h('option', { value: '', selected: !p.sex, text: 'Prefer not to say' })
        ])),
        field('age', 'Age', h('input', { type: 'number', inputmode: 'numeric', min: 13, max: 100, value: p.age || '' })),
        field('heightCm', 'Height (cm)', h('input', { type: 'number', inputmode: 'decimal', min: 100, max: 230, value: p.heightCm || '' })),
        field('weightKg', 'Current weight (kg)', h('input', { type: 'number', inputmode: 'decimal', step: 0.1, min: 25, max: 300, value: weightNow || '' })),
        field('targetWeightKg', 'Goal weight (kg)', h('input', { type: 'number', inputmode: 'decimal', step: 0.1, min: 25, max: 300, value: p.targetWeightKg || '', placeholder: 'optional' }))
      ]),
      h('.hint', { text: 'Changing your weight here records a weigh-in for today. Sex is used only by the Mifflin-St Jeor energy equation, which has different constants for male and female bodies; leave it unanswered and the midpoint is used.' })
    ]));

    root.appendChild(h('.card', [
      h('.card-head', [h('h3', { text: 'Training' })]),
      h('.field-row', [
        field('goal', 'Primary goal', h('select', PG.GOALS.map(function (g) {
          return h('option', { value: g.id, selected: p.goal === g.id,
                               text: g.label + (g.note ? ' — ' + g.note : '') });
        }))),
        field('experience', 'Experience', h('select', PG.EXPERIENCE.map(function (g) {
          return h('option', { value: g.id, selected: p.experience === g.id, text: g.label });
        }))),
        field('daysPerWeek', 'Days a week', h('select', [2, 3, 4, 5, 6].map(function (d) {
          return h('option', { value: d, selected: Number(p.daysPerWeek) === d, text: d + ' days' });
        }))),
        field('equipment', 'Equipment', h('select', Object.keys(EXD.EQUIPMENT_PROFILES).map(function (id) {
          return h('option', { value: id, selected: p.equipment === id, text: EXD.EQUIPMENT_PROFILES[id].label });
        }))),
        field('activity', 'Daily activity', h('select', DG.ACTIVITY.map(function (a) {
          return h('option', { value: a.id, selected: p.activity === a.id, text: a.label });
        })))
      ]),
      h('.field', { style: { marginTop: '13px' } }, [
        h('.field-title', { text: 'Anything to go easy on?' }),
        h('.check-grid', EXD.AVOID_OPTIONS.map(function (o) {
          var on = (p.avoid || []).indexOf(o.id) !== -1;
          var box = h('input', { type: 'checkbox', checked: on });
          var pill = h('label.check-pill' + (on ? '.is-on' : ''), [box, h('span', { text: o.label })]);
          box.addEventListener('change', function () {
            var list = (p.avoid || []).filter(function (x) { return x !== o.id; });
            if (box.checked) list.push(o.id);
            p.avoid = list; pill.classList.toggle('is-on', box.checked); S.save();
          });
          return pill;
        })),
        h('.hint', { text: 'Movements that load these joints are left out of generated plans and swap lists. This is a convenience, not medical advice — see a professional about an actual injury.' })
      ]),
      h('.field', { style: { marginBottom: 0 } }, [
        h('label', { text: 'Injuries, conditions or limitations (optional)' }),
        h('textarea', { value: p.healthNotes || '', placeholder: 'Anything worth remembering before you train — a dodgy shoulder, a recent surgery, something your physio said.',
          onchange: function (e) { p.healthNotes = e.target.value; S.save(); } }),
        h('.hint', { text: 'A private note to yourself, saved with your account. Nothing in the app acts on it. If you have a medical condition, pain that persists, are pregnant, or have a history of disordered eating, take the plan to a professional before following it.' })
      ])
    ]));

    /* Energy: show the working, and let the user overrule it. */
    var t = S.targets();
    var tdeeInput = h('input', { type: 'number', inputmode: 'numeric', min: 800, max: 6000, step: 10,
      value: p.tdeeOverride || '', placeholder: String(DG.targets(Object.assign({}, p, { weightKg: weightNow || p.weightKg, tdeeOverride: null })).tdee) });
    f.tdeeOverride = tdeeInput;
    var estimateLine = h('.hint');
    function refreshEstimate() {
      var override = Number(tdeeInput.value);
      var using = override >= 800 && override <= 6000;
      var preview = DG.targets(Object.assign({}, p, {
        weightKg: weightNow || p.weightKg,
        tdeeOverride: using ? override : null
      }));
      estimateLine.textContent =
        'Working from ' + (using ? 'your figure' : 'the estimate') + ' of ' + preview.tdee +
        ' kcal maintenance: ' + preview.kcal + ' kcal a day, ' + preview.protein +
        ' g protein, ' + preview.carbs + ' g carbs, ' + preview.fat + ' g fat.';
    }
    tdeeInput.addEventListener('input', refreshEstimate);
    refreshEstimate();

    var ready = Views.profileReady(p);
    root.appendChild(h('.card', [
      h('.card-head', [
        h('h3', { text: 'Energy' }),
        h('span.card-sub', { text: 'what your daily targets are built from' })
      ]),
      h('.field-row', [
        h('div', [
          h('label', { text: 'Maintenance calories (kcal/day)' }),
          tdeeInput,
          h('.hint', { text: 'Leave blank to use the estimate. If you have tracked your own intake for a few weeks and know your maintenance, put it here and it overrules the equation.' })
        ]),
        h('div', [
          h('.field-title', { text: 'How your target is reached' }),
          !ready
            ? h('p.working', { text: 'Add your age, height and weight above to see this.' })
            : h('p.working', t.tdeeSource === 'yours'
                ? [h('b', { text: t.tdee + ' kcal' }), ' maintenance, from your own figure', h('br'),
                   'adjusted for your goal → ', h('b', { text: t.kcal + ' kcal' })]
                : ['Mifflin-St Jeor BMR ', h('b', { text: t.bmr + ' kcal' }), h('br'),
                   '× activity factor → ', h('b', { text: t.tdee + ' kcal' }), ' maintenance', h('br'),
                   'adjusted for your goal → ', h('b', { text: t.kcal + ' kcal' })])
        ])
      ]),
      ready ? estimateLine : null,
      h('.hint', { text: 'These are ordinary starting points from a standard equation, not medical advice. Adjust after two or three weeks of real trend data — what the scale and the mirror do beats what any formula predicts.' })
    ]));

    root.appendChild(h('.card', [
      h('.card-head', [h('h3', { text: 'Food' })]),
      h('.field-row', [
        field('dietPref', 'Diet', h('select', FD.DIET_PREFS.map(function (d) {
          return h('option', { value: d.id, selected: p.dietPref === d.id, text: d.label });
        }))),
        field('cuisine', 'Cuisine', h('select', FD.CUISINES.map(function (c) {
          return h('option', { value: c.id, selected: p.cuisine === c.id, text: c.label });
        })))
      ])
    ]));

    /* Read the form into the profile. Returns null if something in it cannot
     * be saved, otherwise whether anything the plans depend on changed. */
    function applyForm() {
      var next = {};
      Object.keys(f).forEach(function (k) {
        var v = f[k].value;
        next[k] = (f[k].type === 'number') ? (v === '' ? null : Number(v)) : v;
      });
      next.name = String(next.name || '').trim();
      next.daysPerWeek = Number(next.daysPerWeek);

      var problem = S.vitalsProblem(next.age, next.heightCm, next.weightKg);
      if (!problem && next.targetWeightKg != null && (next.targetWeightKg < 25 || next.targetWeightKg > 300)) {
        problem = 'Enter a goal weight between 25 and 300 kg, or leave it blank.';
      }
      if (!problem && next.tdeeOverride != null && (next.tdeeOverride < 800 || next.tdeeOverride > 6000)) {
        problem = 'Maintenance calories should be between 800 and 6000 — or leave it blank to use the estimate.';
      }
      if (problem) { UI.toast(problem, 'bad'); return null; }

      // The weight shown is the latest weigh-in, so a different number is a new one.
      if (next.weightKg !== weightNow) S.logWeight(UI.todayKey(), next.weightKg);
      var same = function (a, b) { return (a == null ? '' : String(a)) === (b == null ? '' : String(b)); };
      var affectsPlans = PLAN_FIELDS.some(function (k) {
        return k === 'weightKg' ? next.weightKg !== weightNow : !same(next[k], p[k]);
      });
      Object.assign(p, next);
      return { affectsPlans: affectsPlans };
    }

    root.appendChild(h('.card', [
      h('.card-head', { style: { marginBottom: 0 } }, [
        h('button.btn.btn-primary', { type: 'button', text: 'Save changes', onclick: function () {
          var res = applyForm();
          if (!res) return;
          S.save(); redraw();
          UI.toast(res.affectsPlans && (st.plan || st.diet)
            ? 'Saved. Your targets are updated — rebuild your plans to match them.'
            : 'Saved.', 'good');
        } }),
        h('button.btn', { type: 'button', text: 'Save and rebuild my plans', onclick: function () {
          UI.confirm({
            title: 'Rebuild both plans?',
            message: 'This saves your changes, then replaces your workout plan and your week of meals with new ones — including any swaps and edits you have made. Sessions and meals you have already logged are not affected.',
            confirmLabel: 'Save and rebuild'
          }).then(function (ok) {
            if (!ok || !applyForm()) return;
            S.save();
            Views.regeneratePlan({ sure: true, quiet: true }).then(function () {
              return Views.regenerateDiet({ sure: true, quiet: true });
            }).then(function () {
              UI.toast('Saved. Both plans rebuilt from your answers.', 'good');
            });
          });
        } })
      ])
    ]));

    /* ---- backup: a file you own, nothing more clever than that */
    var backupCard = h('.card', [
      h('.card-head', [
        h('h3', { text: 'Backup' }),
        h('span.card-sub', { text: 'a file you keep yourself' })
      ]),
      h('p', { text:
        'Everything you log is saved to your account. An export is a copy of your own to ' +
        'keep — worth taking now and again.' })
    ]);

    var saveError = Store.status().lastError;
    if (saveError) {
      backupCard.appendChild(h('.banner.is-bad', [h('div', [
        h('b', { text: 'This device could not save.' }), ' ' + saveError,
        h('br'), 'Export a copy now, and check you are not in a private window.'
      ])]));
    }

    var importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    importInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      Store.importFile(file).then(function (data) {
        // Anything that parses is not necessarily one of ours.
        var ours = data && typeof data === 'object' && !Array.isArray(data) &&
                   data.profile && typeof data.profile === 'object' &&
                   ['workouts', 'nutrition', 'body', 'maxes'].some(function (k) { return k in data; });
        if (!ours) { UI.toast('That file is not a BodyKaLogic backup.', 'bad'); return; }
        UI.confirm({ title: 'Replace everything with this backup?',
          message: 'Restoring ' + file.name + ' replaces all the data in your account, on every device. ' +
                   'Export what you have now first if you want to keep it.',
          confirmLabel: 'Replace', danger: true }).then(function (ok) {
          if (!ok) return;
          S.set(S.normalise(data));
          S.save();
          redraw();
          UI.toast('Backup restored.', 'good');
        });
      }).catch(function () { UI.toast('That file could not be read.', 'bad'); });
    });

    backupCard.appendChild(h('.card-head', { style: { marginBottom: 0 } }, [
      UI.button('', 'download', 'Export backup', { onclick: function () {
        Store.exportFile(S.get()); UI.toast('Backup downloaded.', 'good');
      } }),
      UI.button('', 'upload', 'Restore from backup', { onclick: function () { importInput.click(); } }),
      importInput
    ]));
    root.appendChild(backupCard);

    /* ---- the one irreversible thing on the page, kept apart from the rest */
    root.appendChild(h('.card.card-danger', [
      h('.card-head', { style: { marginBottom: 0 } }, [
        h('div', [
          h('h3', { text: 'Delete your data' }),
          h('p', { style: { margin: '4px 0 0' }, text: 'Removes your profile, plans, logs and records for good. Your sign-in stays.' })
        ]),
        h('.spacer'),
        UI.button('.btn-danger', 'trash', 'Delete everything', { onclick: deleteEverything })
      ])
    ]));
  };

  global.Views = Views;

}(window));
