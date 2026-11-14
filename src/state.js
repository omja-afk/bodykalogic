/* state.js — the data model, and every mutation that touches it.
 *
 * One object, serialised to JSON, written to the info path. Views read it and
 * call these helpers to change it; nothing else writes. Every mutation ends in
 * save(), which mirrors to localStorage immediately and debounces the disk write.
 */
(function (global) {
  'use strict';

  var UI = global.UI, DG = global.DietGen;
  var SCHEMA = 1;

  var state = null;
  var subscribers = [];

  function blank() {
    return {
      schema: SCHEMA,
      createdAt: Date.now(),
      profile: {
        name: '', sex: 'male', age: null, heightCm: null, weightKg: null,
        activity: 'moderate', goal: 'muscle', experience: 'beginner',
        daysPerWeek: 4, equipment: 'gym', avoid: [],
        dietPref: 'veg', cuisine: 'indian', dislikes: [],
        targetWeightKg: null
      },
      plan: null,
      diet: null,
      workouts: {},     // dateKey -> session
      nutrition: {},    // dateKey -> { meals: [] }
      body: {},         // dateKey -> measurements
      maxes: {},        // exId -> [records]
      settings: { theme: 'dark', onboarded: false }
    };
  }

  /* Bring any older or partial file up to the current shape. A file written by a
   * future version keeps its unknown keys — merging rather than replacing means
   * opening an old build never silently drops data it does not understand. */
  function normalise(raw) {
    var s = blank();
    if (!raw || typeof raw !== 'object') return s;
    var out = Object.assign({}, raw);
    out.schema = SCHEMA;
    out.profile = Object.assign({}, s.profile, raw.profile || {});
    out.settings = Object.assign({}, s.settings, raw.settings || {});
    ['workouts', 'nutrition', 'body', 'maxes'].forEach(function (k) {
      out[k] = (raw[k] && typeof raw[k] === 'object') ? raw[k] : {};
    });
    out.plan = raw.plan || null;
    out.diet = raw.diet || null;
    out.createdAt = raw.createdAt || Date.now();
    return out;
  }

  function save() {
    if (!state) return;
    state.updatedAt = Date.now();
    global.Store.save(state);
    subscribers.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  /* ----------------------------------------------------------- derivations */

  function latestBodyKey() {
    var keys = Object.keys(state.body).sort();
    return keys.length ? keys[keys.length - 1] : null;
  }

  function currentWeight() {
    var k = latestBodyKey();
    if (k && state.body[k].weightKg) return Number(state.body[k].weightKg);
    return Number(state.profile.weightKg) || null;
  }

  function currentBMI() {
    var w = currentWeight(), h = state.profile.heightCm;
    return (w && h) ? DG.bmi(w, h) : null;
  }

  /* Targets follow the latest weighing, not the weight typed at sign-up. */
  function targets() {
    var p = Object.assign({}, state.profile);
    var w = currentWeight();
    if (w) p.weightKg = w;
    return DG.targets(p);
  }

  /* Which planned session belongs to a date. The plan is a rotation, not a
   * calendar: day N is the Nth training day since the plan was created, so a
   * missed day shifts the rotation rather than skipping a session. */
  function plannedDayFor(dateKey) {
    if (!state.plan || !state.plan.days.length) return null;
    var done = Object.keys(state.workouts)
      .filter(function (k) { return k < dateKey && state.workouts[k].completed; })
      .length;
    var existing = state.workouts[dateKey];
    var idx = existing && existing.dayIndex != null
      ? existing.dayIndex
      : done % state.plan.days.length;
    return { index: idx, day: state.plan.days[idx] };
  }

  function sessionFor(dateKey, create) {
    var s = state.workouts[dateKey];
    if (s) return s;
    if (!create) return null;
    var planned = plannedDayFor(dateKey);
    s = {
      date: dateKey,
      dayIndex: planned ? planned.index : null,
      dayName: planned ? planned.day.name : 'Session',
      entries: planned ? planned.day.slots.map(function (slot) {
        return {
          exId: slot.exId, name: slot.name, pattern: slot.pattern,
          targetSets: slot.sets, targetReps: slot.reps,
          sets: []
        };
      }) : [],
      notes: '', completed: false
    };
    state.workouts[dateKey] = s;
    return s;
  }

  function nutritionFor(dateKey, create) {
    var n = state.nutrition[dateKey];
    if (n) return n;
    if (!create) return null;
    n = { date: dateKey, meals: [] };
    state.nutrition[dateKey] = n;
    return n;
  }

  /* Epley. Accurate enough under about 10 reps, which is where maxes live. */
  function e1rm(weight, reps) {
    if (!weight || !reps) return null;
    if (reps === 1) return Number(weight);
    return Math.round(Number(weight) * (1 + Number(reps) / 30) * 10) / 10;
  }

  function recordMax(exId, name, rec) {
    if (!state.maxes[exId]) state.maxes[exId] = { name: name, records: [] };
    state.maxes[exId].name = name || state.maxes[exId].name;
    state.maxes[exId].records.push(rec);
    state.maxes[exId].records.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function bestMax(exId) {
    var m = state.maxes[exId];
    if (!m || !m.records.length) return null;
    return m.records.reduce(function (best, r) {
      var v = r.e1rm || e1rm(r.weight, r.reps) || 0;
      var bv = best ? (best.e1rm || e1rm(best.weight, best.reps) || 0) : -1;
      return v > bv ? r : best;
    }, null);
  }

  /* After a session is marked done, promote any set that beats the stored best
   * into the maxes log, so PRs do not need entering twice. */
  function harvestMaxes(session) {
    var found = [];
    session.entries.forEach(function (entry) {
      if (!entry.exId) return;
      entry.sets.forEach(function (st) {
        if (!st.weight || !st.reps) return;
        var est = e1rm(st.weight, st.reps);
        var best = bestMax(entry.exId);
        var bestEst = best ? (best.e1rm || e1rm(best.weight, best.reps) || 0) : 0;
        if (est > bestEst) {
          recordMax(entry.exId, entry.name, {
            date: session.date, weight: Number(st.weight), reps: Number(st.reps),
            e1rm: est, source: 'session'
          });
          found.push({ name: entry.name, weight: st.weight, reps: st.reps, e1rm: est });
        }
      });
    });
    return found;
  }

  function sessionVolume(session) {
    return session.entries.reduce(function (total, e) {
      return total + e.sets.reduce(function (t, s) {
        return t + ((Number(s.weight) || 0) * (Number(s.reps) || 0));
      }, 0);
    }, 0);
  }

  function nutritionTotals(dateKey) {
    var n = state.nutrition[dateKey];
    if (!n) return { kcal: 0, p: 0, c: 0, f: 0 };
    return DG.roundMacros(n.meals.reduce(function (a, m) {
      a.kcal += m.macros.kcal; a.p += m.macros.p; a.c += m.macros.c; a.f += m.macros.f;
      return a;
    }, { kcal: 0, p: 0, c: 0, f: 0 }));
  }

  /* Consecutive days back from today with either a completed session or a
   * logged meal — a streak should survive a rest day that was still tracked. */
  function streak() {
    var key = UI.todayKey(), n = 0;
    for (var i = 0; i < 400; i++) {
      var w = state.workouts[key], f = state.nutrition[key];
      var active = (w && w.completed) || (f && f.meals.length);
      if (!active) { if (i === 0) { key = UI.addDays(key, -1); continue; } break; }
      n++;
      key = UI.addDays(key, -1);
    }
    return n;
  }

  global.State = {
    SCHEMA: SCHEMA,
    blank: blank,
    normalise: normalise,
    get: function () { return state; },
    set: function (s) { state = s; },
    save: save,
    subscribe: function (fn) { subscribers.push(fn); },
    latestBodyKey: latestBodyKey,
    currentWeight: currentWeight,
    currentBMI: currentBMI,
    targets: targets,
    plannedDayFor: plannedDayFor,
    sessionFor: sessionFor,
    nutritionFor: nutritionFor,
    e1rm: e1rm,
    recordMax: recordMax,
    bestMax: bestMax,
    harvestMaxes: harvestMaxes,
    sessionVolume: sessionVolume,
    nutritionTotals: nutritionTotals,
    streak: streak
  };

}(window));
