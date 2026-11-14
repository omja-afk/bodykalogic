/* app.js — boot sequence, routing, and the first-run questionnaire.
 *
 * Boot order matters and is the whole point of the "info path":
 *   1. ask the store for a remembered folder
 *   2. if one is there and still permitted, read the data file out of it
 *   3. if it is there but the permission has lapsed, serve the mirror and show
 *      a reconnect prompt rather than silently starting a second history
 *   4. if there is nothing anywhere, this is a new user — run onboarding
 */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, Views = global.Views;

  var VIEWS = {
    home:      { title: 'Home',            sub: 'where everything stands today' },
    plan:      { title: 'Workout plan',    sub: 'your split, and every alternative for it' },
    diet:      { title: 'Diet plan',       sub: 'seven days built to your targets' },
    log:       { title: "Today's session", sub: 'log sets, reps and weight' },
    nutrition: { title: 'Nutrition log',   sub: 'what you actually ate' },
    maxes:     { title: 'Strength maxes',  sub: 'max weight and max reps per exercise' },
    body:      { title: 'Body',            sub: 'weight, BMI and measurements' },
    progress:  { title: 'Progress',        sub: 'trends, volume and consistency' },
    profile:   { title: 'Profile & data',  sub: 'your answers, and where they are stored' }
  };

  var App = {
    current: 'home',
    logDate: null,
    foodDate: null,

    go: function (name) {
      if (name === 'dashboard') name = 'home';   // old links and saved hashes
      if (!VIEWS[name]) name = 'home';
      App.current = name;
      try { location.hash = name; } catch (e) {}
      App.render();
      var main = document.querySelector('.main');
      if (main) main.scrollTop = 0;
      window.scrollTo(0, 0);
    },

    render: function () {
      Object.keys(VIEWS).forEach(function (name) {
        var el = document.getElementById('view-' + name);
        if (!el) return;
        var active = name === App.current;
        el.classList.toggle('is-active', active);
        if (active && Views[name]) {
          try { Views[name](el); }
          catch (err) {
            console.error('[' + name + ']', err);
            UI.clear(el).appendChild(h('.banner.is-bad', {
              html: '<div><b>This tab failed to draw.</b><br>' + UI.esc(err.message) +
                    '<br>Your data is safe — the error is in the page, not the file.</div>'
            }));
          }
        }
      });
      document.querySelectorAll('.nav-item').forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.view === App.current);
      });
      var meta = VIEWS[App.current];
      document.getElementById('view-title').textContent = meta.title;
      document.getElementById('view-sub').textContent = meta.sub;
      renderStorageChip();
    }
  };

  function renderStorageChip() {
    var host = document.getElementById('storage-chip');
    if (!host) return;
    var st = global.Store.status();
    UI.clear(host);
    var cls = st.needsPermission ? 'chip-warn' : (st.connected ? 'chip-good' : 'chip-warn');
    var text = st.needsPermission ? 'Folder needs reconnecting'
             : st.connected ? 'Saving to ' + st.pathLabel
             : 'Browser storage only';
    host.appendChild(h('span.chip.' + cls, { text: text, title: text }));
    if (st.lastError) host.appendChild(h('.hint', { text: st.lastError }));
  }

  /* ============================== onboarding ============================ */

  function runOnboarding() {
    var root = document.getElementById('onboard-root');
    function abandon() {
      UI.clear(root);
      document.getElementById('app').hidden = false;
      App.go('home');
    }
    var p = S.get().profile;
    var step = 0;
    var answers = Object.assign({}, p);

    var STEPS = [
      {
        title: 'Welcome to BodyKaLogic',
        intro: 'Fitness backed by data, not guesswork. Track your training, your food and your body, and keep it in sync across your phone and laptop.',
        fields: function () {
          return [
            h('.field', [h('label', { text: 'What should I call you?' }),
              h('input', { id: 'o-name', value: answers.name || '', placeholder: 'optional' })]),
            h('.banner', { html: '<div>Nothing here is sent anywhere. The one thing that reaches the network is the ' +
              'optional text-recognition engine, if you choose to import a plan from a photo — and even then the photo ' +
              'is read on this machine.</div>' })
          ];
        },
        collect: function () { answers.name = val('o-name'); return true; }
      },
      {
        title: 'The basics',
        intro: 'These drive your calorie and protein targets. The equations need all four.',
        fields: function () {
          return [
            h('.field-row', [
              h('div', [h('label', { text: 'Sex' }), h('select', { id: 'o-sex' }, [
                h('option', { value: 'male', selected: answers.sex === 'male', text: 'Male' }),
                h('option', { value: 'female', selected: answers.sex === 'female', text: 'Female' })
              ])]),
              h('div', [h('label', { text: 'Age' }), h('input', { id: 'o-age', type: 'number', min: 13, max: 100, value: answers.age || '' })]),
              h('div', [h('label', { text: 'Height (cm)' }), h('input', { id: 'o-height', type: 'number', min: 100, max: 230, value: answers.heightCm || '' })]),
              h('div', [h('label', { text: 'Weight (kg)' }), h('input', { id: 'o-weight', type: 'number', step: 0.1, min: 25, max: 300, value: answers.weightKg || '' })])
            ]),
            h('.hint', { text: 'Sex is used only by the Mifflin-St Jeor energy equation, which has different constants for male and female bodies.' })
          ];
        },
        collect: function () {
          answers.sex = val('o-sex');
          answers.age = Number(val('o-age'));
          answers.heightCm = Number(val('o-height'));
          answers.weightKg = Number(val('o-weight'));
          if (!answers.age || !answers.heightCm || !answers.weightKg) {
            UI.toast('Age, height and weight are all needed to work out your targets.', 'bad');
            return false;
          }
          return true;
        }
      },
      {
        title: 'What are you training for?',
        fields: function () {
          return [
            h('.field', [h('label', { text: 'Goal' }), h('select', { id: 'o-goal' },
              global.PlanGen.GOALS.map(function (g) {
                return h('option', { value: g.id, selected: answers.goal === g.id, text: g.label });
              }))]),
            h('.field', [h('label', { text: 'Goal weight (kg) — optional' }),
              h('input', { id: 'o-target', type: 'number', step: 0.1, value: answers.targetWeightKg || '' })]),
            h('.field', [h('label', { text: 'How much training have you done?' }),
              h('select', { id: 'o-exp' }, global.PlanGen.EXPERIENCE.map(function (g) {
                return h('option', { value: g.id, selected: answers.experience === g.id, text: g.label });
              }))]),
            h('.field', [h('label', { text: 'How active are your days otherwise?' }),
              h('select', { id: 'o-activity' }, global.DietGen.ACTIVITY.map(function (a) {
                return h('option', { value: a.id, selected: answers.activity === a.id, text: a.label });
              }))])
          ];
        },
        collect: function () {
          answers.goal = val('o-goal');
          answers.experience = val('o-exp');
          answers.activity = val('o-activity');
          var t = val('o-target');
          answers.targetWeightKg = t === '' ? null : Number(t);
          return true;
        }
      },
      {
        title: 'Where will you train?',
        intro: 'This decides which movements your plan can use. You can switch it any time, and the plan re-equips itself.',
        fields: function () {
          var EXD = global.ExerciseData;
          return [
            h('.field', [h('label', { text: 'Gym or home?' }),
              h('.check-grid', Object.keys(EXD.EQUIPMENT_PROFILES).map(function (id) {
                var prof = EXD.EQUIPMENT_PROFILES[id];
                var on = answers.equipment === id;
                var pill = h('label.check-pill' + (on ? '.is-on' : ''), { 'data-eq': id }, [
                  h('input', { type: 'radio', name: 'eq', value: id, checked: on }),
                  h('span', { text: prof.label }),
                  h('small', { style: { color: 'var(--ink-muted)' },
                    text: EXD.pool(id, []).length + ' movements' })
                ]);
                pill.addEventListener('click', function () {
                  answers.equipment = id;
                  root.querySelectorAll('[data-eq]').forEach(function (n) {
                    n.classList.toggle('is-on', n.dataset.eq === id);
                  });
                });
                return pill;
              }))]),
            h('.field', [h('label', { text: 'How many days a week can you train?' }),
              h('select', { id: 'o-days' }, [2, 3, 4, 5, 6].map(function (d) {
                return h('option', { value: d, selected: Number(answers.daysPerWeek) === d,
                                     text: d + ' days' + (d <= 3 ? ' — full body' : d === 4 ? ' — upper / lower' : ' — push / pull / legs') });
              }))]),
            h('.field', [h('label', { text: 'Anything to go easy on?' }),
              h('.check-grid', global.ExerciseData.AVOID_OPTIONS.map(function (o) {
                var box = h('input', { type: 'checkbox', value: o.id });
                var pill = h('label.check-pill', [box, h('span', { text: o.label })]);
                box.addEventListener('change', function () { pill.classList.toggle('is-on', box.checked); });
                return pill;
              }))]),
            h('.hint', { text: 'Movements loading those joints are left out. Not medical advice — see a professional about a real injury.' })
          ];
        },
        collect: function () {
          answers.daysPerWeek = Number(val('o-days'));
          answers.avoid = Array.prototype.slice.call(root.querySelectorAll('.check-pill.is-on input[type=checkbox]'))
            .map(function (b) { return b.value; });
          return true;
        }
      },
      {
        title: 'And what do you eat?',
        fields: function () {
          var FD = global.FoodData;
          return [
            h('.field', [h('label', { text: 'Diet' }), h('select', { id: 'o-diet' },
              FD.DIET_PREFS.map(function (d) {
                return h('option', { value: d.id, selected: answers.dietPref === d.id, text: d.label });
              }))]),
            h('.field', [h('label', { text: 'Cuisine' }), h('select', { id: 'o-cuisine' },
              FD.CUISINES.map(function (c) {
                return h('option', { value: c.id, selected: answers.cuisine === c.id, text: c.label });
              }))]),
            h('.hint', { text: 'Meals are picked only from what this allows, and every one of them can be swapped for another afterwards.' })
          ];
        },
        collect: function () {
          answers.dietPref = val('o-diet');
          answers.cuisine = val('o-cuisine');
          return true;
        }
      },
      {
        title: 'Where should your data live?',
        intro: 'Pick a folder and BodyKaLogic writes bodykalogic-data.json into it, plus a dated snapshot in backups/. Re-opening this page finds that folder again and loads your history. You can skip this and stay in browser storage, but a folder is the safer home.',
        fields: function () {
          var st = global.Store.status();
          var out = [];
          if (st.capability === 'local') {
            out.push(h('.banner.is-warn', { html:
              '<div><b>This browser cannot write to a folder.</b> Chrome, Edge, Arc and Brave can. ' +
              'Your data will live in browser storage — use Export regularly to keep a copy.</div>' }));
          } else {
            var label = h('.hint', { text: 'No folder connected yet.' });
            out.push(h('button.btn.btn-primary', { text: '📁 Choose a folder', onclick: function () {
              global.Store.connect().then(function () {
                label.textContent = 'Saving to ' + global.Store.status().pathLabel;
                UI.toast('Folder connected.', 'good');
              }).catch(function (e) { label.textContent = e.message; });
            } }));
            out.push(label);
          }
          out.push(h('.hint', { style: { marginTop: '14px' },
            text: 'Everything after this is editable — your answers, your plan, and where it is stored.' }));
          return out;
        },
        collect: function () { return true; }
      }
    ];

    function val(id) {
      var n = document.getElementById(id);
      return n ? n.value : '';
    }

    function draw() {
      UI.clear(root);
      var s = STEPS[step];
      var card = h('.card', [
        h('.step-dots', STEPS.map(function (_, i) {
          return h('.step-dot' + (i <= step ? '.is-done' : ''));
        })),
        h('h2', { text: s.title }),
        s.intro ? h('p', { style: { marginTop: '8px' }, text: s.intro }) : null,
        h('div', { style: { marginTop: '16px' } }, s.fields()),
        h('.card-head', { style: { marginTop: '22px', marginBottom: 0 } }, [
          step > 0 ? h('button.btn', { text: '‹ Back', onclick: function () { step--; draw(); } })
                   : h('button.btn.btn-ghost', { text: '‹ Back to Home', onclick: abandon }),
          h('.spacer'),
          h('button.btn.btn-primary', {
            text: step === STEPS.length - 1 ? 'Build my plans' : 'Continue ›',
            onclick: function () {
              if (s.collect() === false) return;
              if (step === STEPS.length - 1) return finish();
              step++; draw();
            }
          })
        ])
      ]);
      root.appendChild(h('.onboard', [card]));
    }

    function finish() {
      var st = S.get();
      Object.assign(st.profile, answers);
      st.settings.onboarded = true;
      // The sign-up weight is also the first weigh-in, so the trend starts today
      // rather than at the first time they remember to record one.
      st.body[UI.todayKey()] = { weightKg: answers.weightKg, notes: 'starting weight' };
      st.plan = global.PlanGen.generate(st.profile);
      st.diet = global.DietGen.generate(st.profile, {
        dietPref: st.profile.dietPref, cuisine: st.profile.cuisine, dislikes: []
      });
      S.save();
      UI.clear(root);
      document.getElementById('app').hidden = false;
      App.go('home');
      UI.toast('Your plan and meals are ready.', 'good');
    }

    document.getElementById('app').hidden = true;
    draw();
  }

  /* ================================= boot =============================== */

  function start() {
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { App.go(b.dataset.view); });
    });

    var toggle = document.getElementById('theme-toggle');
    toggle.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      var st = S.get();
      if (st) { st.settings.theme = next; S.save(); }
      App.render();
    });

    window.addEventListener('hashchange', function () {
      var name = location.hash.replace('#', '');
      if (VIEWS[name] && name !== App.current) App.go(name);
    });

    global.Store.onChange(function () { renderStorageChip(); });

    global.Store.boot().then(function (res) {
      document.getElementById('boot').hidden = true;
      var data = res.data;

      // A first-time visitor lands on Home like everyone else. The questionnaire
      // used to stand in front of the app, which meant the first thing anyone saw
      // was a form and none of the dashboard was reachable until it was finished.
      // Setting up is now a card on Home, and the guided version is opt-in.
      S.set(S.normalise(data));
      var st = S.get();
      if (st.settings.theme) document.documentElement.dataset.theme = st.settings.theme;

      document.getElementById('app').hidden = false;
      var hash = location.hash.replace('#', '');
      App.go(VIEWS[hash] ? hash : 'home');

      var status = global.Store.status();
      if (status.needsPermission) {
        UI.toast('Your data folder needs reconnecting — open Profile & data.', 'bad');
      } else if (res.source === 'folder' || res.source === 'file') {
        UI.toast('Loaded your history from ' + status.pathLabel + '.');
      }
    }).catch(function (err) {
      console.error(err);
      document.getElementById('boot').innerHTML =
        '<h3>Could not start</h3><p>' + UI.esc(err.message) + '</p>';
    });
  }

  // Reachable from the Home card for anyone who would rather be walked through it.
  App.guidedSetup = function () { runOnboarding(); };

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

}(window));
