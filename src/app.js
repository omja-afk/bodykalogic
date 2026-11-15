/* app.js — boot sequence, routing, and the guided setup.
 *
 * Boot order, and why it is this order:
 *   1. read this device's local copy — instant, and works with no network
 *   2. if a session is stored, pull the account's copy
 *   3. decide which copy opens. Almost always that needs no question: either
 *      this device has nothing unsent (the account's copy wins) or the account
 *      has not moved since this device last agreed with it (this device's
 *      wins). Only when both have changed is the user asked
 *   4. signed in, the app opens — offline too, from the local copy. Signed out,
 *      the sign-in screen is the whole page
 */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var S = global.State, Views = global.Views;
  var Sync = global.Sync, Store = global.Store;

  var THEME_KEY = 'bkl.theme';

  var VIEWS = {
    home:      { title: 'Home',            icon: 'home',      sub: 'where everything stands today' },
    plan:      { title: 'Workout plan',    icon: 'dumbbell',  sub: 'your split, and every alternative for it' },
    diet:      { title: 'Diet plan',       icon: 'utensils',  sub: 'seven days built to your targets' },
    log:       { title: "Today's session", icon: 'clipboard', sub: 'log sets, reps and weight' },
    nutrition: { title: 'Nutrition log',   icon: 'flame',     sub: 'what you actually ate' },
    maxes:     { title: 'Strength maxes',  icon: 'trending',  sub: 'max weight and max reps per exercise' },
    body:      { title: 'Body',            icon: 'scale',     sub: 'weight, BMI and measurements' },
    progress:  { title: 'Progress',        icon: 'chart',     sub: 'trends, volume and consistency' },
    profile:   { title: 'Profile',         icon: 'user',      sub: 'your details, your targets and your account' }
  };

  var appOpen = false;       // the app itself is on screen — not boot, not the sign-in screen
  var wizardOpen = false;    // the guided setup is standing in front of it

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
      window.scrollTo(0, 0);
    },

    render: function () {
      Object.keys(VIEWS).forEach(function (name) {
        var el = document.getElementById('view-' + name);
        if (!el) return;
        var active = name === App.current;
        el.classList.toggle('is-active', active);
        if (active && Views[name]) {
          try { Views[name](el); UI.linkLabels(el); }
          catch (err) {
            console.error('[' + name + ']', err);
            UI.clear(el).appendChild(h('.banner.is-bad', [h('div', [
              h('b', { text: 'This page could not be shown.' }),
              ' Your data is safe. Reload the page, and if it keeps happening, export a backup from Profile.'
            ])]));
          }
        }
      });
      document.querySelectorAll('.nav-item').forEach(function (b) {
        var on = b.dataset.view === App.current;
        b.classList.toggle('is-active', on);
        if (on) {
          b.setAttribute('aria-current', 'page');
          // On a phone the nav is a strip that scrolls sideways; keep the
          // current tab in view rather than somewhere off the edge.
          var strip = b.parentNode;
          if (strip && strip.scrollWidth > strip.clientWidth) {
            strip.scrollLeft = b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2;
          }
        } else b.removeAttribute('aria-current');
      });
      var meta = VIEWS[App.current];
      document.getElementById('view-title').textContent = meta.title;
      document.getElementById('view-sub').textContent = meta.sub;
      document.title = meta.title + ' · BodyKaLogic';
      renderSyncChip();
    }
  };

  /* ---------------------------------------------------------------- theme */

  /* The theme belongs to the device, not the account: a phone in a dark gym and
   * a laptop by a window want different answers. index.html applies the stored
   * choice before first paint; this keeps it and the toggle in step. */
  function applyTheme(theme, remember) {
    theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    if (remember) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f4f1' : '#0b0c0f');
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      var label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
      UI.clear(toggle).appendChild(UI.icon(theme === 'light' ? 'moon' : 'sun'));
      toggle.title = label;
      toggle.setAttribute('aria-label', label);
    }
  }

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  /* --------------------------------------------------------- sync status */

  function chipFor(sy, store) {
    // A failed local save outranks everything else. It is the one failure that
    // must never be quiet.
    if (store.lastError) {
      var safe = sy.signedIn && !sy.dirty;
      return { cls: 'chip-bad', label: safe ? 'Not saved on this device' : 'Not saving',
               hint: safe ? 'Your account still has it.' : 'Export a copy from Profile.',
               title: store.lastError };
    }
    switch (sy.state) {
      case 'synced':
        return sy.dirty ? { cls: 'chip-accent', label: 'Saving…' }
                        : { cls: 'chip-good', label: 'Synced', hint: sy.email };
      case 'syncing':    return { cls: 'chip-accent', label: 'Syncing…' };
      case 'offline':    return { cls: 'chip-warn', label: 'Offline', hint: 'Saved here. Syncs when you reconnect.' };
      case 'error':      return { cls: 'chip-bad', label: 'Sync problem', hint: sy.message };
      case 'signed-out': return { cls: 'chip-warn', label: 'Signed out' };
      default:           return { cls: 'chip-warn', label: 'This device only' };
    }
  }

  function renderSyncChip() {
    var info = chipFor(Sync.status(), Store.status());
    [['storage-chip', true], ['topbar-chip', false]].forEach(function (pair) {
      var host = document.getElementById(pair[0]);
      if (!host) return;
      UI.clear(host);
      host.appendChild(h('button.chip.' + info.cls, {
        type: 'button', text: info.label,
        title: info.title || info.hint || 'Account and sync',
        onclick: function () { App.go('profile'); }
      }));
      if (pair[1] && info.hint) host.appendChild(h('.hint.chip-hint', { text: info.hint }));
    });
  }

  /* ============================== guided setup ========================== */

  /* opts.gate: this is the first thing a new account sees, and the app stays
   * closed until it is finished. Without it, it is the optional walkthrough
   * opened from Home. */
  function runOnboarding(opts) {
    var gate = !!(opts && opts.gate);
    var root = document.getElementById('onboard-root');
    function leave() {
      wizardOpen = false;
      UI.clear(root);
      document.getElementById('app').hidden = false;
    }
    var p = S.get().profile;
    var step = 0;
    var answers = Object.assign({}, p, { avoid: (p.avoid || []).slice() });

    var STEPS = [
      {
        title: 'Welcome to BodyKaLogic',
        intro: gate
          ? 'Before you start, tell us a little about yourself. It takes about a minute, and your training plan, meal plan and daily targets are built from it. You can change any of it later in Profile.'
          : 'Fitness backed by data, not guesswork. A few questions, and your training plan, meal plan and daily targets are built for you.',
        fields: function () {
          return [
            h('.field', [h('label', { text: 'What should we call you?' }),
              h('input', { id: 'o-name', value: answers.name || '', placeholder: 'optional', autocomplete: 'given-name' })])
          ];
        },
        collect: function () { answers.name = val('o-name').trim(); return true; }
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
              h('div', [h('label', { text: 'Age' }), h('input', { id: 'o-age', type: 'number', inputmode: 'numeric', min: 13, max: 100, value: answers.age || '' })]),
              h('div', [h('label', { text: 'Height (cm)' }), h('input', { id: 'o-height', type: 'number', inputmode: 'decimal', min: 100, max: 230, value: answers.heightCm || '' })]),
              h('div', [h('label', { text: 'Weight (kg)' }), h('input', { id: 'o-weight', type: 'number', inputmode: 'decimal', step: 0.1, min: 25, max: 300, value: answers.weightKg || '' })])
            ]),
            h('.hint', { text: 'Sex is used only by the Mifflin-St Jeor energy equation, which has different constants for male and female bodies.' })
          ];
        },
        collect: function () {
          answers.sex = val('o-sex');
          answers.age = Number(val('o-age'));
          answers.heightCm = Number(val('o-height'));
          answers.weightKg = Number(val('o-weight'));
          var problem = S.vitalsProblem(answers.age, answers.heightCm, answers.weightKg);
          if (problem) { UI.toast(problem, 'bad'); return false; }
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
              h('input', { id: 'o-target', type: 'number', inputmode: 'decimal', step: 0.1, min: 25, max: 300, value: answers.targetWeightKg || '' })]),
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
            h('.field', [h('.field-title', { text: 'Gym or home?' }),
              h('.check-grid', Object.keys(EXD.EQUIPMENT_PROFILES).map(function (id) {
                var prof = EXD.EQUIPMENT_PROFILES[id];
                var on = answers.equipment === id;
                var pill = h('label.check-pill' + (on ? '.is-on' : ''), { 'data-eq': id }, [
                  h('input', { type: 'radio', name: 'eq', value: id, checked: on }),
                  h('span', { text: prof.label }),
                  h('small', { text: EXD.pool(id, []).length + ' movements' })
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
            h('.field', [h('.field-title', { text: 'Anything to go easy on?' }),
              h('.check-grid', EXD.AVOID_OPTIONS.map(function (o) {
                var on = answers.avoid.indexOf(o.id) !== -1;
                var box = h('input', { type: 'checkbox', value: o.id, checked: on });
                var pill = h('label.check-pill' + (on ? '.is-on' : ''), [box, h('span', { text: o.label })]);
                box.addEventListener('change', function () { pill.classList.toggle('is-on', box.checked); });
                return pill;
              }))]),
            h('.hint', { text: 'Movements loading those joints are left out. Not medical advice — see a professional about a real injury.' })
          ];
        },
        collect: function () {
          answers.daysPerWeek = Number(val('o-days'));
          answers.avoid = Array.prototype.slice.call(root.querySelectorAll('.check-pill input[type=checkbox]'))
            .filter(function (b) { return b.checked; })
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
      }
    ];

    function val(id) {
      var n = document.getElementById(id);
      return n ? n.value : '';
    }

    function draw() {
      UI.clear(root);
      var s = STEPS[step];
      var last = step === STEPS.length - 1;
      var card = h('.card', [
        h('.step-dots', { role: 'img', 'aria-label': 'Step ' + (step + 1) + ' of ' + STEPS.length },
          STEPS.map(function (_, i) { return h('.step-dot' + (i <= step ? '.is-done' : '')); })),
        h('h2', { text: s.title }),
        s.intro ? h('p', { style: { marginTop: '8px' }, text: s.intro }) : null,
        h('div', { style: { marginTop: '16px' } }, s.fields()),
        h('.card-head', { style: { marginTop: '22px', marginBottom: 0 } }, [
          step > 0 ? h('button.btn', { type: 'button', text: 'Back', onclick: function () { step--; draw(); } })
          : gate ? h('button.btn.btn-ghost', { type: 'button', text: 'Sign out', onclick: function () {
              Sync.signOut().then(function () { Store.wipe(); Sync.forgetLocal(); location.reload(); });
            } })
          : h('button.btn.btn-ghost', { type: 'button', text: 'Not now', onclick: function () { leave(); App.go('home'); } }),
          h('.spacer'),
          h('button.btn.btn-primary', {
            type: 'button',
            text: last ? 'Build my plans' : 'Continue',
            onclick: function () {
              if (s.collect() === false) return;
              if (last) return finish();
              step++; draw();
            }
          })
        ])
      ]);
      root.appendChild(h('.onboard', [card]));
      UI.linkLabels(root);
      window.scrollTo(0, 0);
    }

    function finish() {
      Views.completeSetup(answers);
      leave();
      appOpen = true;
      App.go('home');
      UI.toast('Your plan and meals are ready.', 'good');
    }

    wizardOpen = true;
    document.getElementById('app').hidden = true;
    draw();
  }

  /* ============================ which copy opens ======================== */

  function summarise(d) {
    if (!d) return 'nothing';
    var bits = [];
    var w = Object.keys(d.workouts || {}).length;
    var b = Object.keys(d.body || {}).length;
    var n = Object.keys(d.nutrition || {}).length;
    if (w) bits.push(w + ' session' + (w > 1 ? 's' : ''));
    if (b) bits.push(b + ' weigh-in' + (b > 1 ? 's' : ''));
    if (n) bits.push(n + ' day' + (n > 1 ? 's' : '') + ' of food');
    return bits.length ? bits.join(', ') : 'your profile and plans';
  }

  function when(stamp) {
    var d = new Date(stamp);
    return isNaN(d.getTime()) ? 'at an unknown time' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  /* Resolves { data, remote?, push? }: what to open, the account's copy if that
   * is what was chosen, and whether this device's copy now needs sending. */
  function reconcile(localRes, remote) {
    var local = localRes && localRes.data;
    var sy = Sync.status();

    if (!remote) {
      // Either a brand-new account with no row yet, or the account could not be
      // reached. Only in the first case is there somewhere to send this to.
      var reachable = sy.signedIn && sy.state === 'synced';
      return Promise.resolve({ data: local, push: reachable && S.hasContent(local) });
    }

    var verdict = Sync.decide(local, remote, S.hasContent);
    if (verdict === 'cloud') return Promise.resolve({ data: remote.data, remote: remote });
    if (verdict === 'local') return Promise.resolve({ data: local, push: true });

    // Both sides changed since they last agreed. Clocks on two devices do not
    // agree either, so "newest wins" would be a guess — and a wrong guess here
    // costs someone a workout. This is the one case worth a question.
    return UI.confirm({
      title: 'Which version do you want to keep?',
      message:
        'This device has changes that never reached your account (' + summarise(local) +
        ', last changed ' + when(Number(local.updatedAt)) + '). Your account was also changed ' +
        'from another device (' + summarise(remote.data) + ', last changed ' + when(remote.updatedAt) +
        '). Keeping one replaces the other.',
      confirmLabel: 'Use my account’s version',
      cancelLabel: 'Keep this device’s'
    }).then(function (useAccount) {
      return useAccount ? { data: remote.data, remote: remote } : { data: local, push: true };
    });
  }

  /* ============================= signed-out screen ====================== */

  function showGate(opts) {
    opts = opts || {};
    appOpen = false;
    wizardOpen = false;
    UI.closeModals();
    var root = document.getElementById('onboard-root');
    UI.clear(root);
    var mark = document.querySelector('.sidebar .brand-logo');
    var message = Sync.status().message;
    root.appendChild(Views.authScreen({
      logo: mark ? mark.getAttribute('src') : null,
      mode: opts.mode,
      notice: opts.notice || (message ? { kind: 'warn', text: message } : null)
    }));
    document.getElementById('boot').hidden = true;
    document.getElementById('app').hidden = true;
    document.title = 'Sign in · BodyKaLogic';
  }

  /* ================================= boot =============================== */

  /* Pick up what another device did while this tab sat in the background. */
  function checkAccount() {
    if (!appOpen) return;
    Sync.refresh().then(function (remote) {
      if (!remote || !appOpen) return;
      // A dialog or the setup wizard is holding references into the current
      // state; swapping it out underneath them would lose what they save.
      if (wizardOpen || document.querySelector('.modal-backdrop') || Sync.status().dirty) return;
      if (!Sync.same(S.get(), remote.data)) {
        S.set(S.normalise(remote.data));
        Store.save(S.get());
        App.render();
        UI.toast('Updated with changes from another device.');
      }
      Sync.adopt(remote);
    });
  }

  function start() {
    document.querySelectorAll('.nav-item').forEach(function (b) {
      var meta = VIEWS[b.dataset.view];
      var slot = b.querySelector('.nav-icon');
      if (meta && slot) UI.clear(slot).appendChild(UI.icon(meta.icon));
      b.addEventListener('click', function () { App.go(b.dataset.view); });
    });

    applyTheme(document.documentElement.dataset.theme, false);
    document.getElementById('theme-toggle').addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
    });

    window.addEventListener('hashchange', function () {
      var name = location.hash.replace('#', '');
      if (appOpen && VIEWS[name] && name !== App.current) App.go(name);
    });

    var storageWasBroken = false;
    Store.onChange(function (st) {
      renderSyncChip();
      var broken = !!st.lastError;
      if (broken === storageWasBroken) return;   // nothing changed; leave the DOM alone
      storageWasBroken = broken;

      if (broken && appOpen) {
        UI.toast(st.lastError + (Sync.status().signedIn
          ? ' It is still going to your account.'
          : ' Export a copy from Profile before you lose it.'), 'bad');
      }
      // The Backup card reads this at render time, so the tab has to be redrawn
      // for the warning to appear — but only on the transition, or a redraw on
      // every save would pull focus out from under anyone typing.
      if (appOpen && App.current === 'profile') App.render();
    });

    Sync.onChange(function (sy) {
      renderSyncChip();
      // A session that ends while the app is open — the refresh token was
      // revoked, or it expired — closes the app too. Carrying on would save
      // everything to this device alone, which is the split history the
      // account exists to prevent.
      if ((appOpen || wizardOpen) && sy.enabled && !sy.signedIn) showGate();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkAccount();
      else Sync.flush({ keepalive: true });
    });
    window.addEventListener('focus', checkAccount);
    window.addEventListener('pagehide', function () { Sync.flush({ keepalive: true }); });

    var arrival = null;   // set when this visit came from a link in an email
    var localRes = null;

    (Sync.status().enabled ? Sync.consumeRedirect() : Promise.resolve(null)).then(function (a) {
      arrival = a;
      return Store.boot();
    }).then(function (res) {
      localRes = res;
      return Sync.init();
    }).then(function (remote) {
      // The local copy belongs to whoever last used this browser. Someone else
      // signing in must neither see it nor have it pushed into their account.
      if (Sync.localIsForeign()) {
        Store.wipe();
        Sync.forgetLocal();
        localRes = { data: null, source: 'none' };
      }
      return reconcile(localRes, remote);
    }).then(function (res) {
      S.set(S.normalise(res.data));

      // A theme saved with the account by an older build is honoured once, for
      // a device that has not chosen its own.
      var legacy = S.get().settings.theme;
      if (!storedTheme() && (legacy === 'light' || legacy === 'dark')) applyTheme(legacy, true);

      var sy = Sync.status();
      if (sy.enabled && !sy.signedIn) {
        showGate(arrival && arrival.error ? { notice: { kind: 'bad', text: arrival.error } } : null);
        return;
      }

      if (res.remote) {
        Store.save(S.get());
        Sync.adopt(res.remote);
      } else if (sy.signedIn) {
        Sync.claimLocal();
        if (res.push) { Sync.markDirty(); Sync.push(); }
      }

      if (arrival && arrival.type === 'recovery') { showGate({ mode: 'newpass' }); return; }

      document.getElementById('boot').hidden = true;

      // A new account has no details yet, and everything in the app is worked
      // out from them. Collect them first; the app opens when they are in.
      if (!Views.profileReady(S.get().profile)) { runOnboarding({ gate: true }); return; }

      document.getElementById('app').hidden = false;
      appOpen = true;
      var hash = location.hash.replace('#', '');
      App.go(VIEWS[hash] ? hash : 'home');

      if (arrival && arrival.type === 'signup') UI.toast('Email confirmed. Welcome to BodyKaLogic.', 'good');
      else if (Store.status().lastError) UI.toast(Store.status().lastError, 'bad');
    }).catch(function (err) {
      console.error(err);
      var boot = document.getElementById('boot');
      boot.hidden = false;
      UI.clear(boot);
      boot.appendChild(h('h3', { text: 'BodyKaLogic could not start' }));
      boot.appendChild(h('p', { text: 'Reload the page to try again.' }));
      boot.appendChild(h('button.btn', { type: 'button', text: 'Reload', onclick: function () { location.reload(); } }));
    });
  }

  // Reachable from the Home card for anyone who would rather be walked through it.
  App.guidedSetup = function (opts) { runOnboarding(opts); };

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

}(window));
