/* views4.js — body measurements, progress analytics, profile & data. */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, C = global.Charts;
  var DG = global.DietGen, PG = global.PlanGen, EXD = global.ExerciseData, FD = global.FoodData;
  var Views = global.Views, VI = global.ViewsInternal;
  var redraw = function () { global.App.render(); };

  var MEASURES = [
    { id: 'weightKg', label: 'Weight', unit: 'kg', step: 0.1 },
    { id: 'bodyFat',  label: 'Body fat', unit: '%', step: 0.1 },
    { id: 'waist',    label: 'Waist', unit: 'cm', step: 0.5 },
    { id: 'chest',    label: 'Chest', unit: 'cm', step: 0.5 },
    { id: 'arm',      label: 'Arm', unit: 'cm', step: 0.5 },
    { id: 'thigh',    label: 'Thigh', unit: 'cm', step: 0.5 },
    { id: 'hip',      label: 'Hip', unit: 'cm', step: 0.5 }
  ];

  /* ================================ BODY ================================ */

  Views.body = function (root) {
    UI.clear(root);
    var st = S.get();
    var w = S.currentWeight(), bmi = S.currentBMI(), band = DG.bmiBand(bmi);

    root.appendChild(h('.grid.grid-4', [
      VI.stat('Current weight', w ? C.fmt(w, 1) : '—', w ? ' kg' : '', null, 'var(--series-1)'),
      VI.stat('BMI', bmi ? C.fmt(bmi, 1) : '—', '',
        [h('span.chip.chip-' + (band.tone === 'good' ? 'good' : band.tone === 'bad' ? 'bad' : 'warn'), { text: band.label })],
        'var(--series-7)'),
      VI.stat('Goal weight', st.profile.targetWeightKg || '—', st.profile.targetWeightKg ? ' kg' : '',
        w && st.profile.targetWeightKg
          ? [h('span', { text: C.fmt(Math.abs(w - st.profile.targetWeightKg), 1) + ' kg to go' })] : null,
        'var(--series-3)'),
      VI.stat('Weigh-ins', Object.keys(st.body).length, '', [h('span', { text: 'recorded' })], 'var(--series-4)')
    ]));

    root.appendChild(h('.card', { style: { marginTop: '16px' } }, [
      h('.card-head', [
        h('h3', { text: 'Record a measurement' }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-primary', { text: '+ New entry', onclick: function () { openBodyLogger(); } })
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
        })).concat([h('th', { text: 'BMI' }), h('th', { text: '' })])
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
              h('td', [h('button.btn.btn-sm.btn-ghost', { text: '✎', onclick: function () { openBodyLogger(k); } })])
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
    var date = h('input', { type: 'date', value: key });
    var inputs = {};
    var fields = MEASURES.map(function (m) {
      inputs[m.id] = h('input', { type: 'number', step: m.step, min: 0, value: existing[m.id] || '' });
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
          var entry = { notes: notes.value };
          var any = false;
          MEASURES.forEach(function (m) {
            var v = inputs[m.id].value;
            if (v !== '') { entry[m.id] = Number(v); any = true; }
          });
          if (!any) { UI.toast('Enter at least one measurement.', 'bad'); return false; }
          if (editKey && date.value !== key) delete st.body[key];
          st.body[date.value] = entry;
          S.save(); redraw();
          UI.toast('Measurement saved.', 'good');
        } }
      ].filter(Boolean)
    });
  }

  function accountCard() {
    var sy = global.Sync.status();
    var card = h('.card', [
      h('.card-head', [
        h('h3', { text: 'Account & sync' }),
        h('span.card-sub', { text: 'so your phone and laptop show the same thing' })
      ])
    ]);

    if (!sy.enabled) {
      card.appendChild(h('.banner.is-warn', { html:
        '<div><b>Sync is not configured yet.</b> Everything works and is saved on this ' +
        'device, but it will not follow you to another one. Add your project key in ' +
        '<code>src/config.js</code> and run <code>supabase/schema.sql</code> once.</div>' }));
      return card;
    }

    if (sy.signedIn) {
      var tone = sy.state === 'synced' ? 'is-good' : sy.state === 'error' ? 'is-bad' : 'is-warn';
      card.appendChild(h('.banner' + (tone === 'is-good' ? '' : '.' + tone), { html:
        '<div><b>Signed in as ' + UI.esc(sy.email) + '.</b><br>' +
        (sy.state === 'synced'
          ? 'Everything is saved to your account. Open this site on your phone, sign in with the same email, and your history is there.'
          : sy.state === 'offline'
            ? 'Offline. Changes are being kept on this device and will go up when you reconnect.'
            : sy.state === 'syncing' ? 'Syncing…'
            : UI.esc(sy.message || 'Something went wrong syncing.')) +
        (sy.lastSync ? '<br><span class="hint">Last synced ' + new Date(sy.lastSync).toLocaleTimeString() + '.</span>' : '') +
        '</div>' }));
      card.appendChild(h('.card-head', { style: { marginBottom: 0 } }, [
        h('button.btn.btn-sm', { text: '↻ Sync now', onclick: function () {
          global.Sync.push(S.get()).then(function (ok) {
            UI.toast(ok ? 'Synced.' : 'Could not reach your account — saved here for now.', ok ? 'good' : 'bad');
            redraw();
          });
        } }),
        h('button.btn.btn-sm', { text: '⬇ Pull from account', onclick: function () {
          UI.confirm({ title: 'Replace this device\u2019s data?',
            message: 'This loads the copy from your account and overwrites what is on this device.',
            confirmLabel: 'Load it', danger: true }).then(function (ok) {
            if (!ok) return;
            global.Sync.pull().then(function (remote) {
              if (!remote) { UI.toast('Nothing stored in your account yet.', 'bad'); return; }
              S.set(S.normalise(remote.data));
              global.Store.save(S.get());
              redraw();
              UI.toast('Loaded from your account.', 'good');
            }).catch(function (e) { UI.toast(e.message, 'bad'); });
          });
        } }),
        h('.spacer'),
        h('button.btn.btn-sm.btn-ghost', { text: 'Sign out', onclick: function () {
          UI.confirm({ title: 'Sign out?',
            message: 'Your data stays on this device and in your account. You can sign back in any time.',
            confirmLabel: 'Sign out' }).then(function (ok) {
            if (ok) global.Sync.signOut().then(function () { redraw(); });
          });
        } })
      ]));
      return card;
    }

    /* signed out — one form doing both jobs */
    var email = h('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'username' });
    var pass = h('input', { type: 'password', placeholder: 'at least 6 characters', autocomplete: 'current-password' });
    var note = h('.hint');

    function attempt(fn, label) {
      var e = email.value.trim(), pw = pass.value;
      if (!e || !pw) { note.textContent = 'Enter an email and a password.'; return; }
      note.textContent = label + '…';
      fn(e, pw).then(function (res) {
        if (res && res.confirmed === false) {
          note.textContent = 'Account created. Check your email for the confirmation link, then sign in.';
          redraw();
          return;
        }
        // Signing in on a device that already has data is the moment to decide
        // which copy wins, so push the question through the same path boot uses.
        return global.Sync.pull().then(function (remote) {
          if (remote && remote.data) {
            return UI.confirm({
              title: 'Your account already has data',
              message: 'Load what is in your account and replace this device, or keep this device and overwrite the account?',
              confirmLabel: 'Load from account', cancelLabel: 'Keep this device'
            }).then(function (useCloud) {
              if (useCloud) { S.set(S.normalise(remote.data)); global.Store.save(S.get()); }
              else { global.Sync.push(S.get()); }
            });
          }
          return global.Sync.push(S.get());
        }).then(function () {
          redraw();
          UI.toast('Signed in — syncing from here on.', 'good');
        });
      }).catch(function (err) {
        note.textContent = err.message;
      });
    }

    card.appendChild(h('p', { text:
      'Create an account, or sign in on a second device with the same email, and your ' +
      'plan, logs and records follow you. Without one everything still works — it just ' +
      'stays on this device.' }));
    card.appendChild(h('.field-row', [
      h('div', [h('label', { text: 'Email' }), email]),
      h('div', [h('label', { text: 'Password' }), pass])
    ]));
    card.appendChild(h('.card-head', { style: { marginBottom: '6px' } }, [
      h('button.btn.btn-primary', { text: 'Sign in',
        onclick: function () { attempt(global.Sync.signIn, 'Signing in'); } }),
      h('button.btn', { text: 'Create an account',
        onclick: function () { attempt(global.Sync.signUp, 'Creating your account'); } })
    ]));
    card.appendChild(note);
    card.appendChild(h('.hint', { text:
      'Your password is sent to your own Supabase project and nowhere else. This app has ' +
      'no server of its own, and nothing about your training leaves your account.' }));
    return card;
  }

  /* ============================== PROGRESS ============================== */

  Views.progress = function (root) {
    UI.clear(root);
    var st = S.get(), today = UI.todayKey();

    var sessions = Object.keys(st.workouts).filter(function (k) { return st.workouts[k].completed; });
    var totalVolume = sessions.reduce(function (a, k) { return a + S.sessionVolume(st.workouts[k]); }, 0);
    var last30 = sessions.filter(function (k) { return UI.daysBetween(k, today) <= 30; });

    root.appendChild(h('.grid.grid-4', [
      VI.stat('Sessions', sessions.length, '', [h('span', { text: last30.length + ' in the last 30 days' })], 'var(--series-1)'),
      VI.stat('Total volume', Math.round(totalVolume / 1000), ' t', [h('span', { text: 'weight × reps, all time' })], 'var(--series-2)'),
      VI.stat('Current streak', S.streak(), ' days', null, 'var(--series-4)'),
      VI.stat('Records', Object.keys(st.maxes).length, '', [h('span', { text: 'exercises with a logged max' })], 'var(--series-3)')
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
      C.bar(host, { height: 250, unit: ' kcal', bars: bars, target: t.kcal, targetLabel: 'target',
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

    /* per-exercise strength */
    var exIds = Object.keys(st.maxes).filter(function (id) { return st.maxes[id].records.length > 1; });
    if (exIds.length) {
      var select = h('select', { style: { maxWidth: '240px' } }, exIds.map(function (id) {
        return h('option', { value: id, text: st.maxes[id].name });
      }));
      var host = h('.chart-host');
      function draw() {
        var recs = st.maxes[select.value].records;
        C.line(host, {
          height: 260, unit: ' kg', dp: 1, area: true,
          series: [{ name: st.maxes[select.value].name, points: recs.map(function (r) {
            return { x: UI.shortDate(r.date), y: r.e1rm || S.e1rm(r.weight, r.reps) };
          }) }]
        });
      }
      select.addEventListener('change', draw);
      root.appendChild(h('.card', [
        h('.card-head', [h('h3', { text: 'Strength curve' }),
                         h('span.card-sub', { text: 'estimated one-rep max' }), h('.spacer'), select]),
        host
      ]));
      setTimeout(draw, 0);
    }
  };

  /* ========================== PROFILE & DATA ============================ */

  Views.profile = function (root) {
    UI.clear(root);
    var st = S.get(), p = st.profile;

    /* ---- account & sync, first because it is the thing that matters most */
    root.appendChild(accountCard());

    /* ---- backup: a file you own, nothing more clever than that */
    var backupCard = h('.card', [
      h('.card-head', [
        h('h3', { text: 'Backup' }),
        h('span.card-sub', { text: 'a JSON file you keep yourself' })
      ]),
      h('p', { text:
        'Your data lives on this device and, when you are signed in, in your account. ' +
        'An exported file is a third copy that depends on neither — worth taking now and ' +
        'again, since a free Supabase project pauses after about a week of no use.' })
    ]);

    var st2 = global.Store.status();
    if (st2.lastError) {
      backupCard.appendChild(h('.banner.is-bad', { html:
        '<div><b>This device could not save.</b> ' + UI.esc(st2.lastError) +
        '<br>Export a copy now, and check you are not in a private window.</div>' }));
    }

    var importInput = h('input', { type: 'file', accept: '.json', hidden: true });
    importInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      global.Store.importFile(file).then(function (data) {
        UI.confirm({ title: 'Replace everything?',
          message: 'Importing ' + file.name + ' replaces all the data currently open, on this ' +
                   'device and in your account. Export first if you want to keep it.',
          confirmLabel: 'Replace', danger: true }).then(function (ok) {
          if (!ok) return;
          S.set(S.normalise(data));
          S.save();
          redraw();
          UI.toast('Data imported.', 'good');
        });
      }).catch(function () { UI.toast('That file could not be read as JSON.', 'bad'); });
    });

    backupCard.appendChild(h('.card-head', { style: { marginBottom: 0 } }, [
      h('button.btn', { text: '⬇ Export JSON', onclick: function () {
        global.Store.exportFile(st); UI.toast('Exported.', 'good');
      } }),
      h('button.btn', { text: '⬆ Import JSON', onclick: function () { importInput.click(); } }),
      importInput
    ]));
    root.appendChild(backupCard);

    /* ---- about you */
    var f = {};
    function field(id, label, node) { f[id] = node; return h('div', [h('label', { text: label }), node]); }

    root.appendChild(h('.card', [
      h('.card-head', [h('h3', { text: 'About you' }),
                       h('span.card-sub', { text: 'changing these updates your targets' })]),
      h('.field-row', [
        field('name', 'Name', h('input', { value: p.name || '', placeholder: 'optional' })),
        field('sex', 'Sex', h('select', [
          h('option', { value: 'male', selected: p.sex === 'male', text: 'Male' }),
          h('option', { value: 'female', selected: p.sex === 'female', text: 'Female' }),
          h('option', { value: '', selected: !p.sex, text: 'Prefer not to say' })
        ])),
        field('age', 'Age', h('input', { type: 'number', min: 13, max: 100, value: p.age || '' })),
        field('heightCm', 'Height (cm)', h('input', { type: 'number', min: 100, max: 230, value: p.heightCm || '' })),
        field('weightKg', 'Weight (kg)', h('input', { type: 'number', step: 0.1, min: 25, max: 300, value: p.weightKg || '' })),
        field('targetWeightKg', 'Goal weight (kg)', h('input', { type: 'number', step: 0.1, value: p.targetWeightKg || '' }))
      ]),
      h('.hint', { text: 'Sex is used only for the Mifflin-St Jeor equation, which has different constants for male and female bodies. Leave it unanswered and the midpoint is used. Nothing else in the app reads it.' })
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
      h('.field', [
        h('label', { text: 'Anything to go easy on?' }),
        h('.check-grid', EXD.AVOID_OPTIONS.map(function (o) {
          var on = (p.avoid || []).indexOf(o.id) !== -1;
          var box = h('input', { type: 'checkbox', checked: on });
          var pill = h('label.check-pill' + (on ? '.is-on' : ''), [box, h('span', { text: o.label })]);
          box.addEventListener('change', function () {
            var list = p.avoid || [];
            if (box.checked) list.push(o.id); else list = list.filter(function (x) { return x !== o.id; });
            p.avoid = list; pill.classList.toggle('is-on', box.checked); S.save();
          });
          return pill;
        })),
        h('.hint', { text: 'Movements that load these joints are left out of generated plans and swap lists. This is a convenience, not medical advice — see a professional about an actual injury.' })
      ]),
      h('.field', [
        h('label', { text: 'Injuries, conditions or limitations (optional)' }),
        h('textarea', { value: p.healthNotes || '', placeholder: 'Anything worth remembering before you train — a dodgy shoulder, a recent surgery, something your physio said.',
          onchange: function (e) { p.healthNotes = e.target.value; S.save(); } }),
        h('.hint', { text: 'Kept on your machine as a note to yourself. Nothing reads it and nothing is sent anywhere. If you have a medical condition, pain that persists, are pregnant, or have a history of disordered eating, take the plan to a professional before following it.' })
      ])
    ]));

    /* Energy: show the working, and let the user overrule it. */
    var t = S.targets();
    var tdeeInput = h('input', { type: 'number', min: 800, max: 6000, step: 10,
      value: p.tdeeOverride || '', placeholder: String(t.tdee) });
    f.tdeeOverride = tdeeInput;
    var estimateLine = h('.hint');
    function refreshEstimate() {
      var override = Number(tdeeInput.value);
      var using = override >= 800 && override <= 6000;
      var preview = DG.targets(Object.assign({}, p, {
        weightKg: S.currentWeight() || p.weightKg,
        tdeeOverride: using ? override : null
      }));
      estimateLine.textContent =
        'Working from ' + (using ? 'your figure' : 'the estimate') + ' of ' + preview.tdee +
        ' kcal maintenance: ' + preview.kcal + ' kcal a day, ' + preview.protein +
        ' g protein, ' + preview.carbs + ' g carbs, ' + preview.fat + ' g fat.';
    }
    tdeeInput.addEventListener('input', refreshEstimate);

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
          h('label', { text: 'How the estimate is reached' }),
          h('p', { style: { margin: 0, fontSize: '.82rem', color: 'var(--ink-2)' },
            html: 'Mifflin-St Jeor BMR <b>' + t.bmr + ' kcal</b><br>' +
                  '× activity factor → <b>' + t.tdee + ' kcal</b> maintenance<br>' +
                  'then adjusted for your goal → <b>' + t.kcal + ' kcal</b>' })
        ])
      ]),
      estimateLine,
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

    root.appendChild(h('.card', [
      h('.card-head', { style: { marginBottom: 0 } }, [
        h('button.btn.btn-primary', { text: 'Save changes', onclick: function () {
          Object.keys(f).forEach(function (k) {
            var v = f[k].value;
            p[k] = (f[k].type === 'number') ? (v === '' ? null : Number(v)) : v;
          });
          p.daysPerWeek = Number(p.daysPerWeek);
          S.save(); redraw();
          UI.toast('Saved. Regenerate your plans to apply the new numbers.', 'good');
        } }),
        h('button.btn', { text: 'Save and rebuild both plans', onclick: function () {
          Object.keys(f).forEach(function (k) {
            var v = f[k].value;
            p[k] = (f[k].type === 'number') ? (v === '' ? null : Number(v)) : v;
          });
          p.daysPerWeek = Number(p.daysPerWeek);
          S.save();
          Views.regeneratePlan(); Views.regenerateDiet(true);
          UI.toast('Both plans rebuilt from your new answers.', 'good');
        } }),
        h('.spacer'),
        h('button.btn.btn-danger', { text: 'Reset everything', onclick: function () {
          UI.confirm({ title: 'Delete all your data?',
            message: 'This clears your profile, plans, logs and records from this browser and disconnects the folder. Files already written to disk are not deleted. This cannot be undone.',
            confirmLabel: 'Delete everything', danger: true }).then(function (ok) {
            if (!ok) return;
            global.Store.wipe().then(function () {
              S.set(S.blank()); S.save();
              location.reload();
            });
          });
        } })
      ])
    ]));
  };

  global.Views = Views;

}(window));
